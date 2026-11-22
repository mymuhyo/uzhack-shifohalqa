import asyncio
import json
import os
from base64 import urlsafe_b64encode
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramNetworkError, TelegramRetryAfter
from aiogram.methods import SendMessage
from aiogram.types import Message
from aiohttp.test_utils import make_mocked_request

from shifo_telegram.app import MAX_WEBHOOK_BYTES, RED_NOTICE, WEBHOOK_PATH, WEBHOOK_SECRET_HEADER, create_app, send_red_notice
from shifo_telegram.config import Config

BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz-0123456789"
SECRET = "telegram-e2e-secret"
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
        self.bot = OfflineBot()

        async def no_network_worker(store, send):
            await asyncio.Event().wait()

        self.worker_mock = patch("shifo_telegram.app.run_delivery_worker", new=no_network_worker)
        self.worker_mock.start()
        self.addCleanup(self.worker_mock.stop)
        self.app = create_app(CONFIG, self.store, self.bot)
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

    async def test_health_and_database_lifecycle(self):
        response = await self.request("GET", "/healthz")
        self.assertEqual(json.loads(response.text), {"ok": True})
        self.assertTrue(self.store.opened)
        await self.app.cleanup()
        self.assertTrue(self.store.closed)

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
                "reply_markup": {"inline_keyboard": [[{"text": "ShifoHalqani ochish", "url": APP_URL}]]},
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
                        [{"text": "ShifoHalqa Mini App", "web_app": {"url": f"{APP_URL}tg"}}],
                        [{"text": "Brauzerda ochish", "url": APP_URL}],
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
                "text": "Mashq tahlilini Telegram Mini App yoki brauzerda oching.",
                "reply_markup": {
                    "inline_keyboard": [
                        [{"text": "Mashq tahlilini ochish", "web_app": {"url": f"{APP_URL}demo/mashq"}}],
                        [{"text": "Brauzerda ochish", "url": f"{APP_URL}demo/mashq"}],
                    ]
                },
            },
        )

    async def test_valid_pairing_and_stop(self):
        linked = await self.message(f"/start {CODE}")
        self.assertEqual(json.loads(linked.text)["text"], "Telegram xabarlari ulandi.")
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
        self.assertEqual(method.reply_markup.inline_keyboard[0][0].url, APP_URL)
        self.bot.error = TelegramNetworkError
        self.assertEqual(await send_red_notice(self.bot, CONFIG, 42), "unknown")
        self.bot.error = TelegramForbiddenError
        self.assertEqual(await send_red_notice(self.bot, CONFIG, 42), "rejected")
        self.assertEqual(await send_red_notice(self.bot, CONFIG, -42), "rejected")
        self.assertEqual(len(self.bot.requests), 3)

    async def test_explicit_flood_control_returns_the_provider_delay(self):
        self.bot.error = lambda **kwargs: TelegramRetryAfter(retry_after=17, **kwargs)
        retry = await send_red_notice(self.bot, CONFIG, 42)
        self.assertEqual(retry.seconds, 17)
        self.assertEqual(len(self.bot.requests), 1)


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
        }, clear=True):
            config = Config.from_env()
        self.assertEqual(config.app_url, "https://demo.example.test/")
        self.assertEqual(config.database_url, DATABASE_URL)
        self.assertEqual(config.port, 8090)
        for secret in [BOT_TOKEN, SECRET, DATABASE_URL]:
            self.assertNotIn(secret, repr(config))

    def test_service_requires_database_while_cli_can_omit_it(self):
        with patch.dict(os.environ, {
            "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
            "TELEGRAM_WEBHOOK_SECRET": SECRET,
            "TELEGRAM_BOT_USERNAME": BOT_NAME,
            "TELEGRAM_APP_URL": APP_URL,
        }, clear=True):
            self.assertEqual(Config.from_env(require_database=False).database_url, "")
            with self.assertRaisesRegex(ValueError, "TELEGRAM_DATABASE_URL"):
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
