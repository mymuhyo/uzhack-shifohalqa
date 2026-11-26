import asyncio
import hashlib
import hmac
import json
import logging
import re
from contextlib import suppress
from typing import Literal

from aiogram import Bot, Dispatcher, Router
from aiogram.enums import ChatType
from aiogram.exceptions import (
    ClientDecodeError,
    TelegramAPIError,
    TelegramBadRequest,
    TelegramNetworkError,
    TelegramRetryAfter,
    TelegramServerError,
)
from aiogram.filters import Filter
from aiogram.methods import AnswerCallbackQuery, EditMessageText, SendMessage
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, Update, WebAppInfo
from aiogram.utils.serialization import deserialize_telegram_object_to_python
from aiohttp import web
from pydantic import ValidationError

from .bridge import BridgeDose, BridgeSnapshot, TelegramApiBridge
from .config import Config
from .store import (
    DeliveryResult,
    RetryAfter,
    TelegramStore,
    TextNotice,
    telegram_chat_id_valid,
    telegram_pair_code_valid,
)
from .worker import run_delivery_worker

WEBHOOK_PATH = "/api/telegram/webhook"
WEBHOOK_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"
MAX_WEBHOOK_BYTES = 32 * 1024
NO_STORE = {"Cache-Control": "no-store"}
COMMAND = re.compile(
    r"/(start|bugun|ilova|mashq|holat|bosim|qadam|hisobot|maxfiylik|help|stop)(?:@([A-Za-z0-9_]+))?(?:[ \t]+(.+))?"
)
BP_PATTERN = re.compile(r"^(\d{2,3})\s*[/\s-]\s*(\d{2,3})$")
STEPS_PATTERN = re.compile(r"^(\d{1,6})$")
UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

INVALID_PAIR = "Ulash kodi yaroqsiz. ShifoHalqa sahifasidan yangi ulash havolasini oling."
TODAY = "Bugungi vazifalarni ShifoHalqada oching."
MINI_APP = "ShifoHalqani Telegram Mini App ichida yoki brauzerda oching."
EXERCISE_APP = (
    "3 ta reabilitatsiya mashqi (o‘tirib-turish, qo‘lni bukish, oyoqni tekislash) "
    "uchun Telegram Mini App yoki brauzerni oching."
)
HELP = (
    "Buyruqlar: /bugun (kundalik reja), /bosim 128/82 (bosim), /qadam 4500 (qadam), "
    "/hisobot (7 kunlik xulosa), /maxfiylik (chat maxfiyligi), /mashq (3 ta mashq), "
    "/ilova (Mini App), /stop (xabarlarni o‘chirish)."
)
RED_NOTICE = "ShifoHalqa tekshiruv navbatiga yangi qayd tushdi."
UNLINKED_TEXT = (
    "Chat hali ulanmagan. Veb-paneldagi «Telegramni ulash» tugmasi orqali ulang "
    "yoki Mini App’da Demo rejimini oching."
)

MISSED_REASON_LABELS = {
    "out_of_supply": "Dori tugadi",
    "side_effects": "Nojo‘ya ta’sir",
    "forgot": "Unutdim",
    "other": "Boshqa sabab",
}
UNIT_DISPLAY = {"mg": "mg", "mcg": "mkg", "g": "g", "iu": "IU"}

logger = logging.getLogger(__name__)


def _btn(
    text: str,
    *,
    style: Literal["primary", "success", "danger"] | None = None,
    callback_data: str | None = None,
    web_app: WebAppInfo | None = None,
    url: str | None = None,
) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text=text,
        style=style,
        callback_data=callback_data,
        web_app=web_app,
        url=url,
    )


def _message(chat_id: int, text: str, keyboard: InlineKeyboardMarkup | None = None) -> SendMessage:
    return SendMessage(chat_id=chat_id, text=text, reply_markup=keyboard)


def _mini_app_url(config: Config, focus: str | None = None, tab: str | None = None) -> str:
    params: list[str] = []
    if focus:
        params.append(f"focus={focus}")
    if tab:
        params.append(f"tab={tab}")
    query = f"?{'&'.join(params)}" if params else ""
    return f"{config.app_url}tg{query}"


def _mini_app_keyboard(
    config: Config,
    *,
    focus: str | None = None,
    tab: str | None = None,
    primary_label: str = "ShifoHalqa Mini App",
    primary_style: Literal["primary", "success", "danger"] | None = "primary",
    include_exercise: bool = False,
    include_stop: bool = False,
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [_btn(primary_label, style=primary_style, web_app=WebAppInfo(url=_mini_app_url(config, focus, tab)))],
    ]
    if include_exercise:
        rows.append([
            _btn("Mashqlar (3 ta)", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "patient", "exercise"))),
            _btn("Brauzerda ochish", url=config.app_url),
        ])
    else:
        rows.append([_btn("Brauzerda ochish", url=config.app_url)])
    if include_stop:
        rows.append([_btn("Xabarlarni to‘xtatish", style="danger", callback_data="stop_notices")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _mini_app_menu_keyboard(config: Config) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                _btn("Bemor (Mini App)", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "patient"))),
                _btn("Shifokor (Mini App)", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "doctor"))),
            ],
            [
                _btn("Mashqlar (3 ta)", web_app=WebAppInfo(url=_mini_app_url(config, "patient", "exercise"))),
                _btn("Brauzerda ochish", url=config.app_url),
            ],
        ]
    )


def _exercise_keyboard(config: Config) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [_btn("3 ta mashqni ochish (Mini App)", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "patient", "exercise")))],
            [
                _btn("Demo mashq", web_app=WebAppInfo(url=f"{config.app_url}demo/mashq")),
                _btn("Brauzerda ochish", url=f"{config.app_url}demo/mashq"),
            ],
        ]
    )


def _format_dose_title(dose: BridgeDose, details_enabled: bool) -> str:
    if not details_enabled:
        return f"Dori ({dose.due_time})"
    if dose.strength is not None:
        unit = UNIT_DISPLAY.get(dose.strength_unit, dose.strength_unit)
        val = int(dose.strength) if dose.strength.is_integer() else dose.strength
        return f"{dose.due_time} · {dose.title} ({val} {unit})"
    return f"{dose.due_time} · {dose.title}"


def _format_today_text(snapshot: BridgeSnapshot) -> str:
    if snapshot.role == "doctor" and snapshot.doctor_summary is not None:
        doc = snapshot.doctor_summary
        return "\n".join([
            f"Shifokor holati · {doc.doctor_name}",
            f"• Biriktirilgan bemorlar: {doc.patient_count}",
            f"• Ochiq murojaatlar: {doc.open_flags} ta ({doc.open_urgent} shoshilinch, {doc.open_warning} kuzatuv)",
        ])

    if not snapshot.details_enabled:
        total_doses = len(snapshot.doses)
        taken_doses = sum(1 for d in snapshot.doses if d.status == "taken")
        missed_doses = sum(1 for d in snapshot.doses if d.status == "missed")
        pending_doses = sum(1 for d in snapshot.doses if d.status == "pending")
        lines = [
            "Bugungi holat · ShifoHalqa (maxfiy rejim)",
            f"• Dorilar: {taken_doses}/{total_doses} ichildi"
            + (f", {missed_doses} qoldirildi" if missed_doses else "")
            + (f", {pending_doses} kutilmoqda" if pending_doses else ""),
        ]
        if snapshot.vitals_task is not None:
            bp_done = "Kiritildi ✓" if snapshot.vitals_task.status == "recorded" else "Kutilmoqda"
            lines.append(f"• Qon bosimi: {bp_done}")
        if snapshot.steps is not None:
            mark = "Maqsad bajarildi ✓" if snapshot.steps.achieved else "Jarayonda"
            lines.append(f"• Qadamlar: {snapshot.steps.today_count} / {snapshot.steps.goal} ({mark})")
        lines.append("• Dori nomi va shifokor javoblari Mini App’da himoyalangan (/maxfiylik).")
        return "\n".join(lines)

    lines = [f"Bugungi holat · {snapshot.patient_name}"]
    if snapshot.doses:
        for dose in snapshot.doses:
            status_mark = {
                "taken": "✓ Ichildi",
                "missed": f"✕ {MISSED_REASON_LABELS.get(dose.reason or '', 'Qoldirildi')}",
                "pending": "⏳ Kutilmoqda",
            }[dose.status]
            lines.append(f"• {_format_dose_title(dose, True)} — {status_mark}")
    else:
        lines.append("• Bugungi dori rejasi hali biriktirilmagan.")

    if snapshot.vitals_task is not None:
        vt = snapshot.vitals_task
        if vt.status == "recorded" and vt.systolic is not None and vt.diastolic is not None:
            zone = f" · {vt.zone_label_uz}" if vt.zone_label_uz else ""
            lines.append(f"• Qon bosimi: {vt.systolic}/{vt.diastolic} mmHg{zone}")
        elif vt.status == "recorded":
            lines.append("• Qon bosimi: Kiritildi ✓")
        else:
            lines.append(f"• Qon bosimi ({vt.due_time}): Kutilmoqda (/bosim 128/82)")

    if snapshot.steps is not None:
        mark = "Maqsad bajarildi ✓" if snapshot.steps.achieved else "Jarayonda"
        lines.append(f"• Qadamlar: {snapshot.steps.today_count} / {snapshot.steps.goal} ({mark})")

    if snapshot.exercise_plan is not None:
        ep = snapshot.exercise_plan
        lines.append(f"• Mashq: {ep.title_uz} ({ep.target_reps} takror · {ep.target_angle}°)")

    if snapshot.approved_brief is not None:
        lines.append(f"• L4 7 kunlik xulosa: {snapshot.approved_brief.approved_reply_uz[:180]}")
    elif snapshot.latest_doctor_reply is not None:
        lines.append(f"• Shifokor javobi: {snapshot.latest_doctor_reply.reply[:180]}")

    return "\n".join(lines)


def _today_keyboard(config: Config, snapshot: BridgeSnapshot) -> InlineKeyboardMarkup:
    if snapshot.role == "doctor":
        return InlineKeyboardMarkup(
            inline_keyboard=[
                [_btn("Shifokor navbatini ochish", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "doctor")))]
            ]
        )

    rows: list[list[InlineKeyboardButton]] = []
    pending_doses = [d for d in snapshot.doses if d.status == "pending"]

    if len(pending_doses) == 1:
        dose = pending_doses[0]
        rows.append([
            _btn("✓ Ichdim", style="success", callback_data=f"dose_take:{dose.task_id}"),
            _btn("Icha olmadim", style="primary", callback_data=f"dose_miss_menu:{dose.task_id}"),
            _btn("Dori tugadi", style="danger", callback_data=f"dose_supply:{dose.task_id}"),
        ])
    elif len(pending_doses) > 1:
        for dose in pending_doses[:6]:
            label = (
                f"⏰ {dose.due_time} · {dose.title}"
                if snapshot.details_enabled
                else f"⏰ {dose.due_time} · Dori dozasi"
            )
            rows.append([_btn(label[:48], style="primary", callback_data=f"dose_pick:{dose.task_id}")])

    rows.append([
        _btn("ShifoHalqa Mini App", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "patient"))),
        _btn("7 kunlik hisobot", callback_data="report_view"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _dose_card_text_and_markup(
    config: Config,
    snapshot: BridgeSnapshot,
    dose: BridgeDose,
) -> tuple[str, InlineKeyboardMarkup]:
    title = _format_dose_title(dose, snapshot.details_enabled)
    status_line = {
        "pending": "Holat: Kutilmoqda",
        "taken": "Holat: ✓ Ichildi",
        "missed": f"Holat: ✕ {MISSED_REASON_LABELS.get(dose.reason or '', 'Qoldirildi')}",
    }[dose.status]
    text = f"Dori dozasi\n• {title}\n• {status_line}"
    rows: list[list[InlineKeyboardButton]] = []
    if dose.status == "pending":
        rows.append([
            _btn("✓ Ichdim", style="success", callback_data=f"dose_take:{dose.task_id}"),
            _btn("Dori tugadi", style="danger", callback_data=f"dose_supply:{dose.task_id}"),
        ])
        rows.append([
            _btn("Icha olmadim (sabab)", style="primary", callback_data=f"dose_miss_menu:{dose.task_id}"),
            _btn("← Ro‘yxatga", callback_data="dose_back"),
        ])
    else:
        rows.append([
            _btn("← Bugungi ro‘yxat", style="primary", callback_data="dose_back"),
            _btn("Mini App", web_app=WebAppInfo(url=_mini_app_url(config, "patient"))),
        ])
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


def _dose_miss_menu_text_and_markup(
    snapshot: BridgeSnapshot,
    dose: BridgeDose,
) -> tuple[str, InlineKeyboardMarkup]:
    title = _format_dose_title(dose, snapshot.details_enabled)
    text = f"Icha olmagan sababingizni tanlang:\n• {title}"
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                _btn("Dori tugadi", style="danger", callback_data=f"dose_miss:{dose.task_id}:out_of_supply"),
                _btn("Nojo‘ya ta’sir", style="primary", callback_data=f"dose_miss:{dose.task_id}:side_effects"),
            ],
            [
                _btn("Unutdim", callback_data=f"dose_miss:{dose.task_id}:forgot"),
                _btn("Boshqa sabab", callback_data=f"dose_miss:{dose.task_id}:other"),
            ],
            [_btn("← Orqaga", callback_data=f"dose_pick:{dose.task_id}")],
        ]
    )
    return text, markup


def _format_report_text_and_markup(
    config: Config,
    snapshot: BridgeSnapshot,
) -> tuple[str, InlineKeyboardMarkup]:
    if snapshot.role == "doctor" and snapshot.doctor_summary is not None:
        return (
            f"Shifokor hisoboti · {snapshot.doctor_summary.doctor_name}\n"
            f"Ochiq murojaatlar: {snapshot.doctor_summary.open_flags} ta. Batafsil ko‘rish uchun Mini App’ni oching.",
            InlineKeyboardMarkup(
                inline_keyboard=[
                    [_btn("Shifokor navbatini ochish", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "doctor")))]
                ]
            ),
        )

    ad = snapshot.adherence
    week_line = (
        f"• 7 kunlik ijro: {ad.week_completed}/{ad.week_scheduled} bajarildi ({ad.week_answered} tasiga javob berildi)"
        if ad
        else "• 7 kunlik ijro: ma’lumot yo‘q"
    )
    steps_line = (
        f"• 7 kunlik qadamlar: {snapshot.steps.week_total} jami ({snapshot.steps.days_recorded}/7 kun)"
        if snapshot.steps
        else "• Qadamlar: ma’lumot yo‘q"
    )

    if not snapshot.details_enabled:
        brief_status = (
            "Shifokorning L4 7 kunlik yakuniy xulosasi tayyor — matnni Mini App’da oching."
            if snapshot.approved_brief
            else "Shifokorning 7 kunlik xulosasi hali tasdiqlanmagan."
        )
        text = "\n".join([
            "7 kunlik hisobot · Maxfiy rejim",
            week_line,
            steps_line,
            f"• {brief_status}",
        ])
        markup = InlineKeyboardMarkup(
            inline_keyboard=[
                [_btn("7 kunlik hisobotni ochish", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "patient", "report")))],
                [_btn("Chatda batafsil ko‘rishni yoqish", style="success", callback_data="privacy:on")],
            ]
        )
        return text, markup

    lines = [
        f"7 kunlik hisobot · {snapshot.patient_name}",
        week_line,
        steps_line,
    ]
    if ad and ad.by_medication:
        for med in ad.by_medication:
            unit = UNIT_DISPLAY.get(med.strength_unit, med.strength_unit)
            strength = f" ({int(med.strength) if med.strength.is_integer() else med.strength} {unit})" if med.strength is not None else ""
            lines.append(
                f"  - {med.name}{strength}: {med.taken}/{med.scheduled} ichildi, {med.missed} qoldirildi"
            )
    if snapshot.approved_brief:
        lines.append(f"\nShifokor tasdiqlagan L4 xulosa:\n{snapshot.approved_brief.approved_reply_uz}")
    else:
        lines.append("\nL4 7 kunlik xulosa: shifokor tasdig‘i kutilmoqda.")

    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [_btn("Hisobotni Mini App’da ochish", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "patient", "report")))],
            [_btn("← Bugungi reja", callback_data="dose_back")],
        ]
    )
    return "\n".join(lines), markup


def _privacy_text_and_markup(config: Config, details_enabled: bool) -> tuple[str, InlineKeyboardMarkup]:
    state_label = "Yoqilgan (batafsil)" if details_enabled else "O‘chiq (maxfiy sukut)"
    desc = (
        "Chatda dori nomlari, 7 kunlik qisqa xulosa va L4 shifokor javoblari ko‘rsatiladi."
        if details_enabled
        else "Chatda dori nomlari va javob matni yashiriladi; faqat umumiy bildirishnoma va Mini App havolasi yuboriladi."
    )
    text = f"Telegram chat maxfiyligi\n• Holat: {state_label}\n• {desc}"
    toggle_btn = (
        _btn("Maxfiy rejimga o‘tkazish", style="danger", callback_data="privacy:off")
        if details_enabled
        else _btn("Batafsil xabarlarni yoqish", style="success", callback_data="privacy:on")
    )
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [toggle_btn],
            [_btn("Maxfiylik (Mini App)", style="primary", web_app=WebAppInfo(url=_mini_app_url(config, "patient", "privacy")))],
        ]
    )
    return text, markup


def _legacy_holat_keyboard(config: Config, role: str, pending_med_task_id: str | None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if role == "patient" and pending_med_task_id:
        rows.append([
            _btn("✓ Dori ichdim", style="success", callback_data=f"med_taken:{pending_med_task_id}"),
            _btn("Dori tugadi", style="danger", callback_data=f"med_supply:{pending_med_task_id}"),
        ])
    rows.append([
        _btn(
            "ShifoHalqa Mini App" if role == "patient" else "Shifokor navbatini ochish",
            style="primary",
            web_app=WebAppInfo(url=_mini_app_url(config, role)),
        )
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def _safe_edit_message(
    bot: Bot,
    chat_id: int,
    message_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    try:
        await bot(
            EditMessageText(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
            ),
            request_timeout=3.5,
        )
    except TelegramBadRequest as err:
        if "message is not modified" not in str(err).lower():
            logger.warning("Telegram editMessageText rejected: %s", err)
    except Exception:
        logger.warning("Telegram editMessageText failed.")


class PrivateCommand(Filter):
    def __init__(self, bot_username: str) -> None:
        self.bot_username = bot_username.casefold()

    async def __call__(self, message: Message) -> bool | dict[str, str | None]:
        sender = message.from_user
        if (
            message.chat.type != ChatType.PRIVATE
            or not telegram_chat_id_valid(message.chat.id)
            or sender is None
            or sender.is_bot
            or sender.id != message.chat.id
            or message.text is None
            or len(message.text) > 4096
        ):
            return False
        match = COMMAND.fullmatch(message.text.strip())
        if match is None:
            return False
        command, recipient, argument = match.groups()
        if recipient and recipient.casefold() != self.bot_username:
            return False
        if argument is not None:
            argument = argument.strip()
            if command not in ("start", "bosim", "qadam"):
                return False
            if command == "start" and any(ch.isspace() for ch in argument):
                return False
        return {"command": command, "argument": argument}


def _dispatcher(
    config: Config,
    store: TelegramStore,
    bridge: TelegramApiBridge | None,
) -> Dispatcher:
    router = Router()

    async def load_bridge_or_legacy(chat_id: int) -> BridgeSnapshot | None:
        if bridge is not None:
            try:
                return await bridge.get_summary(chat_id)
            except Exception:
                logger.warning("Bridge GET failed; falling back to legacy store summary.")
        return None

    @router.message(PrivateCommand(config.bot_username))
    async def reply(message: Message, command: str, argument: str | None, event_update: Update) -> SendMessage | None:
        chat_id = message.chat.id
        sent_at = int(message.date.timestamp())

        if command == "start" and argument:
            linked = telegram_pair_code_valid(argument) and await store.redeem_pairing(
                argument, chat_id, sent_at=sent_at, update_id=event_update.update_id,
            )
            role = (await store.get_linked_role(chat_id) if linked and hasattr(store, "get_linked_role") else None) or "doctor"
            keyboard = _mini_app_keyboard(
                config,
                focus=role,
                primary_label=(
                    ("Bemor sahifasini ochish" if role == "patient" else "Shifokor navbatini ochish")
                    if linked else "ShifoHalqani ochish"
                ),
                primary_style="success" if linked else "primary",
            )
            if linked and role == "patient":
                text = (
                    "Telegram xabarlari ulandi ✓\n"
                    "Bugungi dori va bosim uchun /bugun, 7 kunlik hisobot uchun /hisobot, "
                    "chat maxfiyligi uchun /maxfiylik buyrug‘ini yuboring."
                )
            elif linked:
                text = "Telegram xabarlari ulandi."
            else:
                text = INVALID_PAIR
            return _message(chat_id, text, keyboard)

        if command == "stop":
            stopped = await store.disconnect_chat(chat_id, sent_at=sent_at, update_id=event_update.update_id)
            return _message(chat_id, "Telegram xabarlari o‘chirildi.") if stopped else None

        if command == "ilova":
            return _message(chat_id, MINI_APP, _mini_app_menu_keyboard(config))

        if command == "mashq":
            return _message(chat_id, EXERCISE_APP, _exercise_keyboard(config))

        if command == "help":
            return _message(chat_id, HELP, _mini_app_keyboard(config, include_exercise=True, include_stop=True))

        if command in ("bugun", "holat"):
            snap = await load_bridge_or_legacy(chat_id)
            if snap is not None:
                return _message(chat_id, _format_today_text(snap), _today_keyboard(config, snap))

            summary = await store.get_today_summary(chat_id) if hasattr(store, "get_today_summary") else None
            if summary is not None:
                return _message(
                    chat_id,
                    summary.text,
                    _legacy_holat_keyboard(config, summary.role, summary.pending_med_task_id),
                )

            if command == "holat":
                return _message(chat_id, UNLINKED_TEXT, _mini_app_menu_keyboard(config))
            return _message(
                chat_id,
                TODAY,
                _mini_app_keyboard(config, focus="patient", primary_label="ShifoHalqa Mini App", include_exercise=True),
            )

        if command == "hisobot":
            snap = await load_bridge_or_legacy(chat_id)
            if snap is None:
                return _message(chat_id, UNLINKED_TEXT, _mini_app_menu_keyboard(config))
            text, markup = _format_report_text_and_markup(config, snap)
            return _message(chat_id, text, markup)

        if command == "maxfiylik":
            snap = await load_bridge_or_legacy(chat_id)
            if snap is None:
                return _message(chat_id, UNLINKED_TEXT, _mini_app_menu_keyboard(config))
            if snap.role == "doctor":
                return _message(
                    chat_id,
                    "Shifokor bildirishnomalari doimo bemor tafsilotlarisiz umumiy ko‘rinishda yuboriladi.",
                    _mini_app_keyboard(config, focus="doctor", primary_label="Shifokor navbati"),
                )
            text, markup = _privacy_text_and_markup(config, snap.details_enabled)
            return _message(chat_id, text, markup)

        if command == "bosim":
            snap = await load_bridge_or_legacy(chat_id)
            if snap is None:
                return _message(chat_id, UNLINKED_TEXT, _mini_app_menu_keyboard(config))
            if snap.role == "doctor":
                return _message(chat_id, "Bosim kiritish faqat bemor hisobi uchun.", _mini_app_keyboard(config, focus="doctor"))
            if not argument:
                return _message(
                    chat_id,
                    "Qon bosimini kiritish uchun masalan `/bosim 128/82` deb yuboring yoki Mini App’ni oching.",
                    _mini_app_keyboard(config, focus="patient", tab="today", primary_label="Bosimni Mini App’da kiritish"),
                )
            match_bp = BP_PATTERN.fullmatch(argument)
            if not match_bp:
                return _message(
                    chat_id,
                    "Format noto‘g‘ri. Masalan: /bosim 128/82",
                    _mini_app_keyboard(config, focus="patient", tab="today"),
                )
            sys_val, dia_val = int(match_bp.group(1)), int(match_bp.group(2))
            if not (50 <= sys_val <= 260 and 30 <= dia_val <= 160 and sys_val > dia_val):
                return _message(
                    chat_id,
                    "Qiymatlarni tekshiring: sistolik 50–260, diastolik 30–160, sistolik > diastolik bo‘lishi kerak.",
                )
            assert bridge is not None
            res = await bridge.record_vitals(chat_id, sys_val, dia_val)
            if not res.ok:
                return _message(
                    chat_id,
                    "Bugungi bosim vazifasi topilmadi yoki avval saqlangan. Mini App’da tekshiring.",
                    _mini_app_keyboard(config, focus="patient", tab="today"),
                )
            prefix = "Bugungi bosim avval saqlangan edi." if res.status == "already_saved" else "Qon bosimi saqlandi ✓"
            if snap.details_enabled:
                zone_info = f" · {res.zone_label_uz}" if res.zone_label_uz else ""
                body = f"{prefix}\n• Ko‘rsatkich: {sys_val}/{dia_val} mmHg{zone_info}"
            else:
                zone_info = f" ({res.zone_label_uz})" if res.zone_label_uz else ""
                body = f"{prefix}{zone_info}\n• Tafsilotlar maxfiylik sabab Mini App’da saqlanadi."
            if res.zone_tone == "urgent":
                body += "\n⚠️ Ahvolingiz og‘irlashsa yoki boshingiz aylansa darhol 103 ga qo‘ng‘iroq qiling."
            return _message(chat_id, body, _mini_app_keyboard(config, focus="patient", tab="today"))

        if command == "qadam":
            snap = await load_bridge_or_legacy(chat_id)
            if snap is None:
                return _message(chat_id, UNLINKED_TEXT, _mini_app_menu_keyboard(config))
            if snap.role == "doctor":
                return _message(chat_id, "Qadam kiritish faqat bemor hisobi uchun.", _mini_app_keyboard(config, focus="doctor"))
            if not argument:
                return _message(
                    chat_id,
                    "Bugungi qadamlarni kiritish uchun masalan `/qadam 4500` deb yuboring yoki Mini App’ni oching.",
                    _mini_app_keyboard(config, focus="patient", tab="report", primary_label="Qadamlarni Mini App’da ko‘rish"),
                )
            match_steps = STEPS_PATTERN.fullmatch(argument)
            if not match_steps:
                return _message(chat_id, "Qadam sonini 0–999999 oralig‘ida kiriting. Masalan: /qadam 4500")
            count_val = int(match_steps.group(1))
            assert bridge is not None
            res = await bridge.record_steps(chat_id, count_val)
            if not res.ok:
                return _message(chat_id, "Qadamlarni saqlab bo‘lmadi. Qayta urinib ko‘ring.")
            mark = "Maqsad bajarildi ✓" if res.achieved else "Jarayonda"
            msg_text = (
                f"Bugungi qadamlar saqlandi ✓\n• {res.count} / {res.goal} ({mark})"
                if snap.details_enabled
                else f"Bugungi qadamlar saqlandi ✓ ({mark})"
            )
            return _message(chat_id, msg_text, _mini_app_keyboard(config, focus="patient", tab="report"))

        # Bare /start
        return _message(
            chat_id,
            TODAY,
            _mini_app_keyboard(config, focus="patient", primary_label="ShifoHalqa Mini App", include_exercise=True),
        )

    @router.callback_query()
    async def handle_callback(callback: CallbackQuery, event_update: Update, bot: Bot) -> AnswerCallbackQuery | None:
        data = callback.data or ""
        msg = callback.message
        sender = callback.from_user
        if (
            not isinstance(msg, Message)
            or msg.chat.type != ChatType.PRIVATE
            or not telegram_chat_id_valid(msg.chat.id)
            or sender.is_bot
            or sender.id != msg.chat.id
        ):
            return None

        chat_id = msg.chat.id

        if data == "stop_notices":
            stopped = await store.disconnect_chat(
                chat_id,
                sent_at=int(msg.date.timestamp()),
                update_id=event_update.update_id,
            )
            return AnswerCallbackQuery(
                callback_query_id=callback.id,
                text="Telegram xabarlari o‘chirildi." if stopped else "Faol ulanish topilmadi.",
            )

        if data in ("privacy:on", "privacy:off") and bridge is not None:
            enabled = data == "privacy:on"
            res = await bridge.set_details(chat_id, enabled)
            if not res.ok:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Chat ulanmagan.")
            new_text, new_markup = _privacy_text_and_markup(config, bool(res.details_enabled))
            await _safe_edit_message(bot, chat_id, msg.message_id, new_text, new_markup)
            return AnswerCallbackQuery(
                callback_query_id=callback.id,
                text="Chatda batafsil xabarlar yoqildi ✓" if res.details_enabled else "Maxfiy rejim yoqildi ✓",
            )

        if data == "report_view" and bridge is not None:
            snap = await bridge.get_summary(chat_id)
            if snap is None:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Chat ulanmagan.")
            new_text, new_markup = _format_report_text_and_markup(config, snap)
            await _safe_edit_message(bot, chat_id, msg.message_id, new_text, new_markup)
            return AnswerCallbackQuery(callback_query_id=callback.id)

        if data == "dose_back" and bridge is not None:
            snap = await bridge.get_summary(chat_id)
            if snap is None:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Chat ulanmagan.")
            await _safe_edit_message(
                bot,
                chat_id,
                msg.message_id,
                _format_today_text(snap),
                _today_keyboard(config, snap),
            )
            return AnswerCallbackQuery(callback_query_id=callback.id)

        if data.startswith("dose_pick:") and bridge is not None:
            task_id = data.split(":", 1)[1]
            if not UUID_PATTERN.fullmatch(task_id):
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Vazifa topilmadi.")
            snap = await bridge.get_summary(chat_id)
            if snap is None:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Chat ulanmagan.")
            dose = next((d for d in snap.doses if d.task_id == task_id), None)
            if dose is None:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Vazifa topilmadi.")
            card_text, card_markup = _dose_card_text_and_markup(config, snap, dose)
            await _safe_edit_message(bot, chat_id, msg.message_id, card_text, card_markup)
            return AnswerCallbackQuery(callback_query_id=callback.id)

        if data.startswith("dose_miss_menu:") and bridge is not None:
            task_id = data.split(":", 1)[1]
            if not UUID_PATTERN.fullmatch(task_id):
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Vazifa topilmadi.")
            snap = await bridge.get_summary(chat_id)
            if snap is None:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Chat ulanmagan.")
            dose = next((d for d in snap.doses if d.task_id == task_id), None)
            if dose is None:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Vazifa topilmadi.")
            menu_text, menu_markup = _dose_miss_menu_text_and_markup(snap, dose)
            await _safe_edit_message(bot, chat_id, msg.message_id, menu_text, menu_markup)
            return AnswerCallbackQuery(callback_query_id=callback.id)

        if (
            data.startswith("dose_take:")
            or data.startswith("dose_supply:")
            or data.startswith("dose_miss:")
        ) and bridge is not None:
            parts = data.split(":")
            action_key = parts[0]
            task_id = parts[1] if len(parts) > 1 else ""
            if not UUID_PATTERN.fullmatch(task_id):
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Vazifa topilmadi.")
            if action_key == "dose_take":
                res = await bridge.record_medication(chat_id, task_id, "taken")
                saved_toast = "Dori ichildi deb saqlandi ✓"
            elif action_key == "dose_supply":
                res = await bridge.record_medication(chat_id, task_id, "missed", "out_of_supply")
                saved_toast = "Dori tugadi xabari shifokorga yuborildi ✓"
            else:
                reason = parts[2] if len(parts) > 2 else "other"
                if reason not in MISSED_REASON_LABELS:
                    reason = "other"
                res = await bridge.record_medication(chat_id, task_id, "missed", reason)
                saved_toast = (
                    "Dori tugadi xabari shifokorga yuborildi ✓"
                    if reason == "out_of_supply"
                    else f"Sabab saqlandi ({MISSED_REASON_LABELS[reason]}) ✓"
                )

            if not res.ok:
                return AnswerCallbackQuery(callback_query_id=callback.id, text="Vazifa topilmadi yoki muddati o‘tgan.")

            if res.snapshot is not None:
                await _safe_edit_message(
                    bot,
                    chat_id,
                    msg.message_id,
                    _format_today_text(res.snapshot),
                    _today_keyboard(config, res.snapshot),
                )
            toast = "Bugungi dori qaydi avval saqlangan." if res.status == "already_saved" else saved_toast
            return AnswerCallbackQuery(callback_query_id=callback.id, text=toast)

        if (data.startswith("med_taken:") or data.startswith("med_supply:")) and hasattr(store, "record_medication_action"):
            action_key, task_id = data.split(":", 1)
            action: Literal["taken", "supply"] = "taken" if action_key == "med_taken" else "supply"
            outcome = await store.record_medication_action(chat_id, task_id, action)
            reply_text = {
                "saved_taken": "Dori ichildi deb saqlandi ✓",
                "saved_supply": "Dori tugadi xabari shifokorga yuborildi ✓",
                "already_saved": "Bugungi dori qaydi avval saqlangan.",
                "not_found": "Vazifa topilmadi yoki muddati o‘tgan.",
            }[outcome]
            return AnswerCallbackQuery(callback_query_id=callback.id, text=reply_text)

        return None

    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    return dispatcher


def format_patient_notice_for_privacy(notice: TextNotice) -> tuple[str, str | None, str]:
    """Return (text, tab, button_label) respecting patient chat privacy opt-in."""
    if notice.kind != "patient_notice":
        return notice.message_text, None, "Navbatni ochish (Mini App)"

    tab = (
        "report"
        if notice.notice_kind == "brief_reply"
        else "exercise"
        if notice.notice_kind == "exercise_reply"
        else "today"
    )
    if notice.details_enabled:
        label = (
            "7 kunlik hisobotni ochish"
            if notice.notice_kind == "brief_reply"
            else "ShifoHalqa Mini App"
        )
        return notice.message_text, tab, label

    if notice.notice_kind == "brief_reply":
        return (
            "ShifoHalqa: shifokoringiz 7 kunlik hisobotingizni (L4) tasdiqladi. Javobni Mini App’da oching.",
            "report",
            "7 kunlik javobni ochish",
        )
    if notice.notice_kind == "exercise_reply":
        return (
            "ShifoHalqa: shifokoringiz mashq qaydingizga javob yozdi. Mini App’da ko‘ring.",
            "exercise",
            "Mashq javobini ochish",
        )
    return (
        "ShifoHalqa: shifokoringiz qaydingizga javob yozdi. Mini App’da oching.",
        "today",
        "ShifoHalqa Mini App",
    )


async def send_red_notice(bot: Bot, config: Config, chat_id: int) -> DeliveryResult:
    return await send_text_message(bot, config, chat_id, RED_NOTICE, focus="doctor", label="Navbatni ochish (Mini App)")


async def send_text_message(
    bot: Bot,
    config: Config,
    chat_id: int,
    text: str,
    *,
    focus: str = "doctor",
    tab: str | None = None,
    label: str = "ShifoHalqa Mini App",
) -> DeliveryResult:
    if not telegram_chat_id_valid(chat_id):
        return "rejected"
    try:
        keyboard = _mini_app_keyboard(config, focus=focus, tab=tab, primary_label=label)
        result = await bot(_message(chat_id, text, keyboard), request_timeout=3.5)
    except TelegramRetryAfter as error:
        return RetryAfter(max(1, error.retry_after))
    except (ClientDecodeError, TelegramNetworkError, TelegramServerError, TimeoutError):
        return "unknown"
    except TelegramAPIError:
        return "rejected"
    return "sent" if isinstance(result, Message) else "unknown"


def create_app(
    config: Config,
    store: TelegramStore,
    bot: Bot,
    bridge: TelegramApiBridge | None = None,
    *,
    poll_interval: float = 2.0,
    max_poll_delay: float | None = None,
) -> web.Application:
    active_bridge = bridge
    if active_bridge is None and config.bot_service_secret:
        active_bridge = TelegramApiBridge(config.api_base_url or config.app_url, config.bot_service_secret)

    dispatcher = _dispatcher(config, store, active_bridge)
    secret_digest = hashlib.sha256(config.webhook_secret.encode()).digest()
    app = web.Application(client_max_size=MAX_WEBHOOK_BYTES)

    async def database_and_worker(_: web.Application):
        async def send(chat_id: int) -> DeliveryResult:
            return await send_red_notice(bot, config, chat_id)

        async def drain_text_notices() -> int:
            if not hasattr(store, "claim_pending_text_notice"):
                return 0
            attempted = 0
            for _ in range(10):
                notice: TextNotice | None = await store.claim_pending_text_notice()
                if notice is None:
                    break
                attempted += 1
                msg_text, tab, label = format_patient_notice_for_privacy(notice)
                try:
                    status = await send_text_message(
                        bot,
                        config,
                        notice.chat_id,
                        msg_text,
                        focus=notice.focus,
                        tab=tab,
                        label=label,
                    )
                except Exception:
                    continue
                if isinstance(status, RetryAfter):
                    await store.schedule_text_retry(notice, status.seconds)
                elif status == "sent" or status == "rejected":
                    await store.record_text_delivery(notice, status)
            return attempted

        async def text_notice_loop() -> None:
            while True:
                try:
                    attempted = await drain_text_notices()
                except Exception:
                    attempted = 0
                await asyncio.sleep(0 if attempted >= 10 else poll_interval)

        try:
            await store.open()
            if active_bridge is not None:
                await active_bridge.open()
            worker_kwargs: dict[str, float] = {}
            if poll_interval != 2.0:
                worker_kwargs["poll_interval"] = poll_interval
            if max_poll_delay is not None:
                worker_kwargs["max_delay"] = max_poll_delay
            worker = asyncio.create_task(
                run_delivery_worker(store, send, **worker_kwargs),
                name="telegram-notices",
            )
            text_worker = (
                asyncio.create_task(text_notice_loop(), name="telegram-text-notices")
                if hasattr(store, "claim_pending_text_notice")
                else None
            )
            try:
                yield
            finally:
                worker.cancel()
                if text_worker is not None:
                    text_worker.cancel()
                with suppress(asyncio.CancelledError):
                    await worker
                if text_worker is not None:
                    with suppress(asyncio.CancelledError):
                        await text_worker
        finally:
            try:
                if active_bridge is not None:
                    await active_bridge.close()
            finally:
                try:
                    await store.close()
                finally:
                    await bot.session.close()

    async def health(_: web.Request) -> web.Response:
        return web.json_response({"ok": True}, headers=NO_STORE)

    async def webhook(request: web.Request) -> web.Response:
        secrets = request.headers.getall(WEBHOOK_SECRET_HEADER, [])
        if len(secrets) != 1 or not secrets[0] or len(secrets[0]) > 256:
            return web.Response(status=403, headers=NO_STORE)
        received_digest = hashlib.sha256(secrets[0].encode(errors="surrogatepass")).digest()
        if not hmac.compare_digest(secret_digest, received_digest):
            return web.Response(status=403, headers=NO_STORE)
        if request.content_type != "application/json":
            return web.Response(status=400, headers=NO_STORE)
        if request.content_length is not None and request.content_length > MAX_WEBHOOK_BYTES:
            return web.Response(status=413, headers=NO_STORE)

        try:
            data = json.loads((await request.read()).decode("utf-8"))
        except web.HTTPRequestEntityTooLarge:
            return web.Response(status=413, headers=NO_STORE)
        except (UnicodeError, ValueError, RecursionError):
            return web.Response(status=400, headers=NO_STORE)

        if not isinstance(data, dict) or type(data.get("update_id")) is not int or not 0 < data["update_id"] < 2**63:
            return web.Response(headers=NO_STORE)
        try:
            update = Update.model_validate(data, context={"bot": bot})
        except ValidationError:
            return web.Response(headers=NO_STORE)
        try:
            response = await dispatcher.feed_update(bot, update)
        except Exception:
            logger.warning("Telegram webhook command could not be processed.")
            return web.Response(status=503, headers=NO_STORE)

        if not isinstance(response, (SendMessage, AnswerCallbackQuery)):
            return web.Response(headers=NO_STORE)
        payload = deserialize_telegram_object_to_python(response, default=bot.default, include_api_method_name=True)
        return web.json_response(payload, headers=NO_STORE)

    app.cleanup_ctx.append(database_and_worker)
    app.router.add_get("/healthz", health)
    app.router.add_post(WEBHOOK_PATH, webhook)
    return app
