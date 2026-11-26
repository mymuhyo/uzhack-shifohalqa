import asyncio
import json
import os
from base64 import urlsafe_b64encode
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramNetworkError, TelegramRetryAfter
from aiogram.methods import EditMessageText, SendMessage
from aiogram.types import Message
from aiohttp.test_utils import make_mocked_request

from shifo_telegram.app import (
    MAX_WEBHOOK_BYTES,
    RED_NOTICE,
    WEBHOOK_PATH,
    WEBHOOK_SECRET_HEADER,
    create_app,
    format_patient_notice_for_privacy,
    send_red_notice,
    send_text_message,
)
from shifo_telegram.bridge import (
    BridgeAdherence,
    BridgeBrief,
    BridgeDose,
    BridgeExercisePlan,
    BridgeMedicationStat,
    BridgeMutationResult,
    BridgeSnapshot,
    BridgeSteps,
    BridgeVitals,
)
from shifo_telegram.config import Config
from shifo_telegram.store import TextNotice, TodaySummary

BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz-0123456789"
SECRET = "telegram-e2e-secret"
SERVICE_SECRET = "service-secret-at-least-thirty-two-chars-long"
BOT_NAME = "shifohalqa_test_bot"
APP_URL = "https://shifohalqa.example.test/"
DATABASE_URL = "postgresql://bot:unused@localhost/shifohalqa"
CODE = urlsafe_b64encode(b"a" * 32).decode().rstrip("=")
CONFIG = Config(BOT_TOKEN, SECRET, BOT_NAME, APP_URL, DATABASE_URL)


def telegram_update(text: str, *, chat_id: int = 42, chat_type: str = "private", user_id: int = 42):
    return {
        "update_id": 7,
        "message": {
            "message_id": 12,
            "date": 1770000000,
            "chat": {"id": chat_id, "type": chat_type},
            "from": {"id": user_id, "is_bot": False, "first_name": "Test"},
            "text": text,
        },
    }


class OfflineStore:
    def __init__(self):
        self.opened = False
        self.closed = False
        self.redeemed = []
        self.disconnected = []
        self.stop_applied = True
        self.summary = None
        self.med_actions = []

    async def open(self):
        self.opened = True

    async def close(self):
        self.closed = True

    async def redeem_pairing(self, code, chat_id, *, sent_at, update_id):
        self.redeemed.append((code, chat_id, sent_at, update_id))
        return code == CODE

    async def disconnect_chat(self, chat_id, *, sent_at, update_id):
        self.disconnected.append((chat_id, sent_at, update_id))
        return self.stop_applied

    async def get_today_summary(self, chat_id):
        return self.summary

    async def record_medication_action(self, chat_id, task_id, action):
        self.med_actions.append((chat_id, task_id, action))
        return "saved_taken" if action == "taken" else "saved_supply"


class OfflineBridge:
    def __init__(self):
        self.opened = False
        self.closed = False
        self.snapshot: BridgeSnapshot | None = None
        self.med_calls = []
        self.vitals_calls = []
        self.steps_calls = []
        self.details_calls = []
        self.already_saved_ids = set()

    async def open(self):
        self.opened = True

    async def close(self):
        self.closed = True

    async def get_summary(self, chat_id: int) -> BridgeSnapshot | None:
        return self.snapshot

    async def record_medication(self, chat_id, task_id, status_value, reason=None):
        self.med_calls.append((chat_id, task_id, status_value, reason))
        if task_id in self.already_saved_ids:
            return BridgeMutationResult(ok=True, status="already_saved", snapshot=self.snapshot)
        self.already_saved_ids.add(task_id)
        if self.snapshot is not None:
            updated_doses = tuple(
                BridgeDose(
                    task_id=d.task_id,
                    title=d.title,
                    strength=d.strength,
                    strength_unit=d.strength_unit,
                    due_time=d.due_time,
                    status=status_value if d.task_id == task_id else d.status,
                    reason=reason if d.task_id == task_id else d.reason,
                    box_done=d.box_done,
                )
                for d in self.snapshot.doses
            )
            self.snapshot = BridgeSnapshot(
                role=self.snapshot.role,
                patient_name=self.snapshot.patient_name,
                details_enabled=self.snapshot.details_enabled,
                is_demo=self.snapshot.is_demo,
                date=self.snapshot.date,
                doses=updated_doses,
                vitals_task=self.snapshot.vitals_task,
                steps=self.snapshot.steps,
                adherence=self.snapshot.adherence,
                approved_brief=self.snapshot.approved_brief,
                latest_doctor_reply=self.snapshot.latest_doctor_reply,
                exercise_plan=self.snapshot.exercise_plan,
                doctor_summary=self.snapshot.doctor_summary,
            )
        return BridgeMutationResult(ok=True, status="saved", snapshot=self.snapshot)

    async def record_vitals(self, chat_id, systolic, diastolic, chest_pain=False):
        self.vitals_calls.append((chat_id, systolic, diastolic, chest_pain))
        return BridgeMutationResult(
            ok=True,
            status="saved",
            flag_color="yellow",
            zone_tone="warn",
            zone_label_uz="Kuzatuv chegarasi",
        )

    async def record_steps(self, chat_id, count):
        self.steps_calls.append((chat_id, count))
        return BridgeMutationResult(ok=True, status="saved", count=count, goal=3000, achieved=count >= 3000)

    async def set_details(self, chat_id, enabled):
        self.details_calls.append((chat_id, enabled))
        if self.snapshot is not None:
            self.snapshot = BridgeSnapshot(
                role=self.snapshot.role,
                patient_name=self.snapshot.patient_name,
                details_enabled=enabled,
                is_demo=self.snapshot.is_demo,
                date=self.snapshot.date,
                doses=self.snapshot.doses,
                vitals_task=self.snapshot.vitals_task,
                steps=self.snapshot.steps,
                adherence=self.snapshot.adherence,
                approved_brief=self.snapshot.approved_brief,
                latest_doctor_reply=self.snapshot.latest_doctor_reply,
                exercise_plan=self.snapshot.exercise_plan,
                doctor_summary=self.snapshot.doctor_summary,
            )
        return BridgeMutationResult(ok=True, status="saved", details_enabled=enabled)


class OfflineBot(Bot):
    def __init__(self):
        super().__init__(token=BOT_TOKEN)
        self.requests = []
        self.error = None

    async def __call__(self, method, request_timeout=None):
        self.requests.append((method, request_timeout))
        if self.error:
            raise self.error(method=method, message="test failure body")
        return Message.model_validate(telegram_update("message body")["message"])


class OfflinePayload:
    def __init__(self, chunks):
        self.chunks = iter(chunks)

    def set_read_chunk_size(self, size):
        pass

    async def readany(self):
        return next(self.chunks, b"")


class TelegramAppTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = OfflineStore()
        self.bridge = OfflineBridge()
        self.bot = OfflineBot()

        async def no_network_worker(store, send, **_kwargs):
            await asyncio.Event().wait()

        self.worker_mock = patch("shifo_telegram.app.run_delivery_worker", new=no_network_worker)
        self.worker_mock.start()
        self.addCleanup(self.worker_mock.stop)
        self.app = create_app(CONFIG, self.store, self.bot, bridge=self.bridge)
        self.app.freeze()
        await self.app.startup()
        self.addAsyncCleanup(self.app.cleanup)

    async def request(self, method, path, *, headers=None, chunks=()):
        request = make_mocked_request(method, path, headers=headers, app=self.app,
                                      payload=OfflinePayload(chunks), client_max_size=MAX_WEBHOOK_BYTES)
        route = await self.app.router.resolve(request)
        return await route.handler(request)

    async def message(self, text, *, secret=SECRET, **kwargs):
        headers = {WEBHOOK_SECRET_HEADER: secret, "Content-Type": "application/json"}
        return await self.request("POST", WEBHOOK_PATH, headers=headers, chunks=[json.dumps(telegram_update(text, **kwargs)).encode()])

    async def callback(self, data, *, chat_id=42, chat_type="private", user_id=42, secret=SECRET):
        headers = {WEBHOOK_SECRET_HEADER: secret, "Content-Type": "application/json"}
        payload = {
            "update_id": 8,
            "callback_query": {
                "id": "cb-1",
                "from": {"id": user_id, "is_bot": False, "first_name": "Test"},
                "chat_instance": "ci-1",
                "data": data,
                "message": telegram_update("/help", chat_id=chat_id, chat_type=chat_type, user_id=user_id)["message"],
            },
        }
        return await self.request("POST", WEBHOOK_PATH, headers=headers, chunks=[json.dumps(payload).encode()])

    async def test_health_and_database_lifecycle(self):
        response = await self.request("GET", "/healthz")
        self.assertEqual(json.loads(response.text), {"ok": True})
        self.assertTrue(self.store.opened)
        self.assertTrue(self.bridge.opened)
        await self.app.cleanup()
        self.assertTrue(self.store.closed)
        self.assertTrue(self.bridge.closed)

    async def test_secret_checked_before_parsing_body(self):
        response = await self.request("POST", WEBHOOK_PATH, headers={WEBHOOK_SECRET_HEADER: "wrong"}, chunks=[b"bogus"])
        self.assertEqual(response.status, 403)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(self.store.redeemed, [])

    async def test_bounded_json_with_content_length_or_chunks(self):
        headers = {WEBHOOK_SECRET_HEADER: SECRET, "Content-Type": "application/json"}
        response = await self.request("POST", WEBHOOK_PATH, headers={**headers, "Content-Length": str(MAX_WEBHOOK_BYTES + 1)})
        self.assertEqual(response.status, 413)
        response = await self.request("POST", WEBHOOK_PATH, headers=headers, chunks=[b"x" * 4096] * 9)
        self.assertEqual(response.status, 413)
        response = await self.request("POST", WEBHOOK_PATH, headers=headers, chunks=[b"{"])
        self.assertEqual(response.status, 400)

    async def test_nonprivate_and_unrelated_updates_are_ignored(self):
        for text, details in [
            (f"/start {CODE}", {"chat_id": -42, "chat_type": "group"}),
            ("/stop", {"user_id": 43}),
            ("/bugun@OtherBot", {}),
            ("/bugun hello", {}),
            ("appointment details", {}),
        ]:
            response = await self.message(text, **details)
            self.assertEqual(response.status, 200)
            self.assertEqual(response.text or "", "")
        self.assertEqual(self.store.redeemed, [])
        self.assertEqual(self.store.disconnected, [])
        self.assertEqual(self.bot.requests, [])

    async def test_today_is_a_generic_inline_webhook_reply(self):
        response = await self.message(f"/bugun@{BOT_NAME.upper()}")
        self.assertEqual(
            json.loads(response.text),
            {
                "method": "sendMessage",
                "chat_id": 42,
                "text": "Bugungi vazifalarni ShifoHalqada oching.",
                "reply_markup": {
                    "inline_keyboard": [
                        [{"text": "ShifoHalqa Mini App", "style": "primary", "web_app": {"url": f"{APP_URL}tg?focus=patient"}}],
                        [
                            {"text": "Mashqlar (3 ta)", "style": "primary", "web_app": {"url": f"{APP_URL}tg?focus=patient&tab=exercise"}},
                            {"text": "Brauzerda ochish", "url": APP_URL},
                        ],
                    ]
                },
            },
        )
        self.assertEqual(self.bot.requests, [])

    async def test_ilova_and_mashq_return_mini_app_buttons(self):
        ilova = await self.message("/ilova")
        self.assertEqual(
            json.loads(ilova.text),
            {
                "method": "sendMessage",
                "chat_id": 42,
                "text": "ShifoHalqani Telegram Mini App ichida yoki brauzerda oching.",
                "reply_markup": {
                    "inline_keyboard": [
                        [
                            {"text": "Bemor (Mini App)", "style": "primary", "web_app": {"url": f"{APP_URL}tg?focus=patient"}},
                            {"text": "Shifokor (Mini App)", "style": "primary", "web_app": {"url": f"{APP_URL}tg?focus=doctor"}},
                        ],
                        [
                            {"text": "Mashqlar (3 ta)", "web_app": {"url": f"{APP_URL}tg?focus=patient&tab=exercise"}},
                            {"text": "Brauzerda ochish", "url": APP_URL},
                        ],
                    ]
                },
            },
        )
        mashq = await self.message("/mashq")
        self.assertEqual(
            json.loads(mashq.text),
            {
                "method": "sendMessage",
                "chat_id": 42,
                "text": (
                    "3 ta reabilitatsiya mashqi (o‘tirib-turish, qo‘lni bukish, oyoqni tekislash) "
                    "uchun Telegram Mini App yoki brauzerni oching."
                ),
                "reply_markup": {
                    "inline_keyboard": [
                        [{"text": "3 ta mashqni ochish (Mini App)", "style": "primary", "web_app": {"url": f"{APP_URL}tg?focus=patient&tab=exercise"}}],
                        [
                            {"text": "Demo mashq", "web_app": {"url": f"{APP_URL}demo/mashq"}},
                            {"text": "Brauzerda ochish", "url": f"{APP_URL}demo/mashq"},
                        ],
                    ]
                },
            },
        )

    async def test_help_and_stop_callback_button(self):
        help_res = await self.message("/help")
        self.assertEqual(
            json.loads(help_res.text)["reply_markup"]["inline_keyboard"][-1],
            [{"text": "Xabarlarni to‘xtatish", "style": "danger", "callback_data": "stop_notices"}],
        )
        ignored = await self.callback("stop_notices", chat_id=-42, chat_type="group")
        self.assertEqual(ignored.status, 200)
        self.assertEqual(ignored.text or "", "")
        stopped = await self.callback("stop_notices")
        self.assertEqual(
            json.loads(stopped.text),
            {
                "method": "answerCallbackQuery",
                "callback_query_id": "cb-1",
                "text": "Telegram xabarlari o‘chirildi.",
            },
        )
        self.assertEqual(self.store.disconnected, [(42, 1770000000, 8)])

    async def test_valid_pairing_and_stop(self):
        linked = await self.message(f"/start {CODE}")
        self.assertIn("Telegram xabarlari ulandi", json.loads(linked.text)["text"])
        self.assertEqual(self.store.redeemed, [(CODE, 42, 1770000000, 7)])
        invalid = await self.message("/start 0123456789")
        self.assertIn("yaroqsiz", json.loads(invalid.text)["text"])
        self.assertEqual(len(self.store.redeemed), 1)
        stopped = await self.message("/stop")
        self.assertEqual(json.loads(stopped.text), {"method": "sendMessage", "chat_id": 42, "text": "Telegram xabarlari o‘chirildi."})
        self.assertEqual(self.store.disconnected, [(42, 1770000000, 7)])

    async def test_a_stale_stop_does_not_claim_the_newer_link_was_removed(self):
        self.store.stop_applied = False
        response = await self.message("/stop")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.text or "", "")

    async def test_store_failure_is_retryable_without_exception_details(self):
        async def fail(code, chat_id, **event):
            raise RuntimeError("private postgres URL")

        with patch.object(self.store, "redeem_pairing", new=fail):
            response = await self.message(f"/start {CODE}")
        self.assertEqual(response.status, 503)
        self.assertEqual(response.text or "", "")

    async def test_outbound_status_emits_only_generic_content_and_does_not_retry(self):
        self.assertEqual(await send_red_notice(self.bot, CONFIG, 42), "sent")
        method, timeout = self.bot.requests[0]
        self.assertIsInstance(method, SendMessage)
        self.assertEqual((method.chat_id, method.text, timeout), (42, RED_NOTICE, 3.5))
        self.assertEqual(
            method.reply_markup.inline_keyboard[0][0].web_app.url,
            f"{APP_URL}tg?focus=doctor",
        )
        self.assertEqual(method.reply_markup.inline_keyboard[1][0].url, APP_URL)
        self.bot.error = TelegramNetworkError
        self.assertEqual(await send_red_notice(self.bot, CONFIG, 42), "unknown")
        self.bot.error = TelegramForbiddenError
        self.assertEqual(await send_red_notice(self.bot, CONFIG, 42), "rejected")
        self.assertEqual(await send_red_notice(self.bot, CONFIG, -42), "rejected")
        self.assertEqual(len(self.bot.requests), 3)

    async def test_legacy_holat_fallback_and_callbacks(self):
        unlinked = await self.message("/holat")
        self.assertIn("Chat hali ulanmagan", json.loads(unlinked.text)["text"])

        task_id = "f2b5ee25-b406-4732-83f9-f45ce90aeccd"
        self.store.summary = TodaySummary(
            role="patient",
            text="Bugungi holat · Anvar aka\n• Qadamlar: 3200 / 3000 (Maqsad bajarildi ✓)",
            pending_med_task_id=task_id,
        )
        linked = await self.message("/holat")
        payload = json.loads(linked.text)
        self.assertEqual(payload["method"], "sendMessage")
        self.assertIn("3200 / 3000", payload["text"])
        buttons = payload["reply_markup"]["inline_keyboard"][0]
        self.assertEqual(buttons[0]["callback_data"], f"med_taken:{task_id}")
        self.assertEqual(buttons[0]["style"], "success")
        self.assertEqual(buttons[1]["callback_data"], f"med_supply:{task_id}")
        self.assertEqual(buttons[1]["style"], "danger")

        taken = await self.callback(f"med_taken:{task_id}")
        self.assertEqual(json.loads(taken.text)["text"], "Dori ichildi deb saqlandi ✓")
        supply = await self.callback(f"med_supply:{task_id}")
        self.assertEqual(json.loads(supply.text)["text"], "Dori tugadi xabari shifokorga yuborildi ✓")
        self.assertEqual(self.store.med_actions, [(42, task_id, "taken"), (42, task_id, "supply")])

    async def test_multi_dose_bridge_flow_styled_buttons_edit_and_privacy_opt_in(self):
        task1 = "11111111-1111-4111-8111-111111111111"
        task2 = "22222222-2222-4222-8222-222222222222"
        self.bridge.snapshot = BridgeSnapshot(
            role="patient",
            patient_name="Anvar aka",
            details_enabled=False,
            is_demo=False,
            date="2026-11-26",
            doses=(
                BridgeDose(task1, "Amlodipin", 5.0, "mg", "08:00", "pending", None, False),
                BridgeDose(task2, "Metformin", 500.0, "mg", "20:00", "pending", None, False),
            ),
            vitals_task=BridgeVitals("33333333-3333-4333-8333-333333333333", "09:00", "pending", None, None, False, None, None),
            steps=BridgeSteps(1200, 3000, False, "self_report", 5400, 3),
            adherence=BridgeAdherence(3, 0, 0, 10, 7, 8, (BridgeMedicationStat("Amlodipin", 5.0, "mg", 5, 6, 1, 0),)),
            approved_brief=BridgeBrief("44444444-4444-4444-8444-444444444444", "2026-11-26", "Dorilarni o‘z vaqtida iching.", "2026-11-26T08:00:00.000Z"),
            latest_doctor_reply=None,
            exercise_plan=BridgeExercisePlan("seated_knee_ext", "O‘tirib oyoqni tekislash", 5, 160),
        )

        # Opted-out /bugun hides drug names & patient name, shows 2-dose picker with primary style
        optout_today = json.loads((await self.message("/bugun")).text)
        self.assertNotIn("Amlodipin", optout_today["text"])
        self.assertNotIn("Anvar", optout_today["text"])
        self.assertIn("0/2 ichildi", optout_today["text"])
        kb_rows = optout_today["reply_markup"]["inline_keyboard"]
        self.assertEqual(kb_rows[0][0]["callback_data"], f"dose_pick:{task1}")
        self.assertEqual(kb_rows[0][0]["style"], "primary")
        self.assertEqual(kb_rows[1][0]["callback_data"], f"dose_pick:{task2}")

        # Opted-out /hisobot hides brief body & drug names
        optout_report = json.loads((await self.message("/hisobot")).text)
        self.assertNotIn("Dorilarni o‘z vaqtida", optout_report["text"])
        self.assertIn("Mini App’da oching", optout_report["text"])

        # Opt in via /maxfiylik + privacy:on callback (edits message in-place)
        priv_msg = json.loads((await self.message("/maxfiylik")).text)
        self.assertEqual(priv_msg["reply_markup"]["inline_keyboard"][0][0]["callback_data"], "privacy:on")
        self.assertEqual(priv_msg["reply_markup"]["inline_keyboard"][0][0]["style"], "success")

        priv_cb = json.loads((await self.callback("privacy:on")).text)
        self.assertEqual(priv_cb["text"], "Chatda batafsil xabarlar yoqildi ✓")
        self.assertIsInstance(self.bot.requests[-1][0], EditMessageText)
        self.assertIn("Yoqilgan", self.bot.requests[-1][0].text)

        # Now opted-in /bugun & /hisobot show drug names and L4 approved reply
        optin_today = json.loads((await self.message("/bugun")).text)
        self.assertIn("Amlodipin (5 mg)", optin_today["text"])
        self.assertIn("Metformin (500 mg)", optin_today["text"])

        optin_report = json.loads((await self.message("/hisobot")).text)
        self.assertIn("Dorilarni o‘z vaqtida iching.", optin_report["text"])

        # Pick dose 1 -> mark taken -> EditMessageText updates list + repeat click is idempotent
        await self.callback(f"dose_pick:{task1}")
        self.assertIsInstance(self.bot.requests[-1][0], EditMessageText)
        taken_res = json.loads((await self.callback(f"dose_take:{task1}")).text)
        self.assertEqual(taken_res["text"], "Dori ichildi deb saqlandi ✓")
        self.assertEqual(self.bridge.med_calls[-1], (42, task1, "taken", None))

        dup_res = json.loads((await self.callback(f"dose_take:{task1}")).text)
        self.assertEqual(dup_res["text"], "Bugungi dori qaydi avval saqlangan.")

        # /bosim & /qadam bridge commands
        bp_res = json.loads((await self.message("/bosim 135/85")).text)
        self.assertIn("135/85 mmHg", bp_res["text"])
        self.assertEqual(self.bridge.vitals_calls, [(42, 135, 85, False)])

        bad_bp = json.loads((await self.message("/bosim 80/90")).text)
        self.assertIn("sistolik > diastolik", bad_bp["text"])

        steps_res = json.loads((await self.message("/qadam 4500")).text)
        self.assertIn("4500 / 3000", steps_res["text"])
        self.assertEqual(self.bridge.steps_calls, [(42, 4500)])

    async def test_privacy_formatting_for_outbound_patient_notices(self):
        from uuid import uuid4

        opt_out_brief = TextNotice("patient_notice", uuid4(), 42, "Shifokor javobi: Maxfiy matn", "patient", details_enabled=False, notice_kind="brief_reply")
        text_out, tab_out, _ = format_patient_notice_for_privacy(opt_out_brief)
        self.assertNotIn("Maxfiy matn", text_out)
        self.assertEqual(tab_out, "report")

        opt_in_brief = TextNotice("patient_notice", uuid4(), 42, "Shifokor javobi: Yaxshi holat", "patient", details_enabled=True, notice_kind="brief_reply")
        text_in, tab_in, _ = format_patient_notice_for_privacy(opt_in_brief)
        self.assertEqual(text_in, "Shifokor javobi: Yaxshi holat")
        self.assertEqual(tab_in, "report")

    async def test_send_text_message_delivers_patient_reply_with_patient_focus(self):
        self.assertEqual(
            await send_text_message(self.bot, CONFIG, 42, "Shifokor javobi", focus="patient", tab="report", label="ShifoHalqa Mini App"),
            "sent",
        )
        method, _ = self.bot.requests[0]
        self.assertEqual(method.text, "Shifokor javobi")
        self.assertEqual(method.reply_markup.inline_keyboard[0][0].web_app.url, f"{APP_URL}tg?focus=patient&tab=report")


class ConfigTests(TestCase):
    def test_precedence_and_configuration_repr_excludes_credentials(self):
        with patch.dict(os.environ, {
            "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
            "TELEGRAM_WEBHOOK_SECRET": SECRET,
            "TELEGRAM_BOT_USERNAME": BOT_NAME,
            "NEXT_PUBLIC_APP_URL": "https://demo.example.test",
            "DATABASE_URL": "postgresql://dev:unused@localhost/demo",
            "TELEGRAM_DATABASE_URL": DATABASE_URL,
            "TELEGRAM_PORT": "8090",
            "SHIFO_ENV_ID": "final-preview",
            "TELEGRAM_BOT_SERVICE_SECRET": SERVICE_SECRET,
            "TELEGRAM_API_BASE_URL": "http://127.0.0.1:3419",
        }, clear=True):
            config = Config.from_env()
        self.assertEqual(config.app_url, "https://demo.example.test/")
        self.assertEqual(config.api_base_url, "http://127.0.0.1:3419/")
        self.assertEqual(config.database_url, DATABASE_URL)
        self.assertEqual(config.port, 8090)
        self.assertEqual(config.env_id, "final-preview")
        for secret in [BOT_TOKEN, SECRET, DATABASE_URL, SERVICE_SECRET]:
            self.assertNotIn(secret, repr(config))

    def test_service_requires_database_env_id_and_bridge_secret_while_cli_can_omit_them(self):
        with patch.dict(os.environ, {
            "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
            "TELEGRAM_WEBHOOK_SECRET": SECRET,
            "TELEGRAM_BOT_USERNAME": BOT_NAME,
            "TELEGRAM_APP_URL": APP_URL,
        }, clear=True):
            self.assertEqual(Config.from_env(require_database=False).database_url, "")
            self.assertEqual(Config.from_env(require_database=False).env_id, "")
            with self.assertRaisesRegex(ValueError, "TELEGRAM_DATABASE_URL"):
                Config.from_env()
            with patch.dict(os.environ, {"TELEGRAM_DATABASE_URL": DATABASE_URL}):
                with self.assertRaisesRegex(ValueError, "SHIFO_ENV_ID"):
                    Config.from_env()
            with patch.dict(os.environ, {"TELEGRAM_DATABASE_URL": DATABASE_URL, "SHIFO_ENV_ID": "final-preview"}):
                with self.assertRaisesRegex(ValueError, "TELEGRAM_BOT_SERVICE_SECRET"):
                    Config.from_env()
            with patch.dict(os.environ, {
                "TELEGRAM_DATABASE_URL": DATABASE_URL,
                "SHIFO_ENV_ID": "final-preview",
                "TELEGRAM_BOT_SERVICE_SECRET": "too-short",
            }):
                with self.assertRaisesRegex(ValueError, "TELEGRAM_BOT_SERVICE_SECRET"):
                    Config.from_env()
            with patch.dict(os.environ, {"TELEGRAM_APP_URL": "https://username:password@demo.example.test/"}):
                with self.assertRaisesRegex(ValueError, "HTTPS"):
                    Config.from_env(require_database=False)
            with patch.dict(os.environ, {"TELEGRAM_APP_URL": "https://demo.example.test/subpath"}):
                self.assertEqual(
                    Config.from_env(require_database=False).app_url,
                    "https://demo.example.test/subpath/",
                )
            with patch.dict(os.environ, {"TELEGRAM_APP_URL": "https://demo.example.test"}):
                self.assertEqual(
                    Config.from_env(require_database=False).app_url,
                    "https://demo.example.test/",
                )
