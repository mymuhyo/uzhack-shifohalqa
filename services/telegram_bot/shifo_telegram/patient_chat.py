from urllib.parse import urlencode
from uuid import UUID

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.methods import EditMessageText
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from aiohttp import ClientError, ClientSession, ClientTimeout

from .config import Config


PRIVATE_NOTICE = "Rejangizni tekshiring. Bugungi vazifangizni ilovada ko‘ring."
UNAVAILABLE = "Saqlab bo‘lmadi. Qayta urinib ko‘ring."
REASONS = {"supply": "out_of_supply", "forgot": "forgot", "side_effects": "side_effects", "other": "other"}


class PatientBridge:
    def __init__(self, config: Config):
        self.config = config

    async def request(self, chat_id: int, action: dict | None = None) -> tuple[int, dict]:
        if not self.config.service_secret:
            return 503, {"error": "unavailable"}
        headers = {"Authorization": f"Bearer {self.config.service_secret}", "X-Telegram-Chat-Id": str(chat_id)}
        url = f"{self.config.app_url}api/telegram/bridge"
        try:
            async with ClientSession(timeout=ClientTimeout(total=4)) as client:
                async with client.request(
                    "GET" if action is None else "POST", url, json=action,
                    headers=headers, allow_redirects=False,
                ) as response:
                    result = await response.json()
                    if isinstance(result, dict):
                        return response.status, result
        except (ClientError, TimeoutError, ValueError):
            pass
        return 503, {"error": "unavailable"}


def patient_url(config: Config, **params: str) -> str:
    return f"{config.app_url}tg?{urlencode({'focus': 'patient', **params})}"


def open_patient(config: Config, text: str = "Vazifani ochish", **params: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, style="primary", web_app=WebAppInfo(url=patient_url(config, **params)))


def callback_button(text: str, action: str, task_id: str | None = None, style: str | None = None):
    return InlineKeyboardButton(
        text=text, style=style, callback_data=f"m5:{action}" + (f":{task_id}" if task_id else ""),
    )


def _dose_label(dose: dict, *, compact: bool = False) -> str:
    title = str(dose["title"])
    if compact and len(title) > 38:
        title = f"{title[:37]}…"
    if dose.get("strength") is not None and dose.get("unit"):
        title = f"{title} {dose['strength']} {dose['unit']}"
    return f"{dose['time']} · {title}"


def _dose_card(dose: dict, *, reason: bool = False) -> tuple[str, InlineKeyboardMarkup]:
    task_id = dose["id"]
    if reason:
        rows = [
            [callback_button("Unutdim", "forgot", task_id)],
            [callback_button("Nojo‘ya ta’sir sezdim", "side_effects", task_id)],
            [callback_button("Boshqa sabab", "other", task_id)],
        ]
        title = "Sababni tanlang"
    else:
        rows = [
            [callback_button("Ichdim", "taken", task_id, "success"),
             callback_button("Icha olmadim", "reason", task_id, "primary")],
            [callback_button("Dori tugadi", "supply", task_id, "danger")],
        ]
        title = "Dori qaydi"
    rows.append([callback_button("Dozalar ro‘yxati", "list")])
    return f"{title}\n{_dose_label(dose)}", InlineKeyboardMarkup(inline_keyboard=rows)


def patient_overview(config: Config, data: dict, *, list_only: bool = False) -> tuple[str, InlineKeyboardMarkup]:
    if data.get("detailsEnabled") is not True:
        return PRIVATE_NOTICE, InlineKeyboardMarkup(inline_keyboard=[
            [open_patient(config)],
            [open_patient(config, "Chat tafsilotlari", tab="privacy")],
        ])

    doses = data.get("doses", [])
    if len(doses) == 1 and not list_only:
        text, keyboard = _dose_card(doses[0])
        rows = keyboard.inline_keyboard[:-1]
    elif doses:
        text = "Bugungi dozalar\nQayd qilish uchun dozani tanlang."
        rows = [[callback_button(_dose_label(dose, compact=True), "pick", dose["id"])] for dose in doses]
    else:
        text = "Bugungi reja\nKutilayotgan doza qolmadi."
        rows = []
    adherence = data.get("adherence", [])
    if adherence:
        taken = sum(entry["week"]["taken"] for entry in adherence)
        missed = sum(entry["week"]["missed"] for entry in adherence)
        unanswered = sum(entry["week"]["unanswered"] for entry in adherence)
        text += f"\n\n7 kunlik holat\nIchilgan {taken} · Qoldirilgan {missed} · Javobsiz {unanswered}"
    brief = data.get("brief")
    if brief:
        text += f"\n\nShifokor javobi\n{brief['approvedReplyUz'][:220]}"
        rows.append([open_patient(config, "Hisobotni ochish", tab="report")])
    rows.extend([[open_patient(config)], [open_patient(config, "Chat tafsilotlari", tab="privacy")]])
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


async def _edit(bot: Bot, message: Message, text: str, keyboard: InlineKeyboardMarkup):
    try:
        await bot(EditMessageText(
            chat_id=message.chat.id, message_id=message.message_id, text=text, reply_markup=keyboard,
        ), request_timeout=3.5)
    except (TelegramAPIError, TimeoutError):
        return False
    return True


async def patient_callback(config: Config, bridge: PatientBridge, bot: Bot, message: Message, data: str) -> str | None:
    action, _, task_id = data.removeprefix("m5:").partition(":")
    chat_id = message.chat.id
    if action != "list":
        try:
            if str(UUID(task_id)) != task_id:
                return None
        except ValueError:
            return None
        if action not in {"pick", "reason", "taken", *REASONS}:
            return None
    code, snapshot = await bridge.request(chat_id)
    if code != 200:
        return "Vazifalarni ochib bo‘lmadi. /bugun buyrug‘ini qayta yuboring."
    if snapshot.get("detailsEnabled") is not True or action == "list":
        text, keyboard = patient_overview(config, snapshot, list_only=True)
        await _edit(bot, message, text, keyboard)
        return "Vazifani ilovada oching." if not snapshot.get("detailsEnabled") else None
    dose = next((item for item in snapshot.get("doses", []) if item["id"] == task_id), None)
    if dose is None:
        text = "Bu doza endi kutilmayapti."
        await _edit(bot, message, text, InlineKeyboardMarkup(inline_keyboard=[
            [callback_button("Dozalar ro‘yxati", "list")],
            [open_patient(config, task=task_id)],
        ]))
        return text
    if action in {"pick", "reason"}:
        text, keyboard = _dose_card(dose, reason=action == "reason")
        return None if await _edit(bot, message, text, keyboard) else "Karta ochilmadi. Qayta urinib ko‘ring."

    payload = {"action": "dose", "taskId": task_id, "medicationStatus": "taken" if action == "taken" else "missed"}
    if action != "taken":
        payload["reason"] = REASONS[action]
    code, result = await bridge.request(chat_id, payload)
    if code != 200:
        return UNAVAILABLE
    if result.get("status") == "already_saved":
        outcome = "Doza avval qayd qilingan."
    elif result.get("status") == "saved":
        outcome = "Doza qayd qilindi." if action == "taken" else "Qabul qilinmagani qayd qilindi."
        if action == "supply":
            outcome = "Dori tugagani qayd qilindi."
        if result.get("queued"):
            outcome += "\nXabar shifokor navbatiga qo‘shildi."
    else:
        return UNAVAILABLE
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [callback_button("Dozalar ro‘yxati", "list")], [open_patient(config, task=task_id)],
    ])
    await _edit(bot, message, f"{_dose_label(dose)}\n{outcome}", keyboard)
    return outcome
