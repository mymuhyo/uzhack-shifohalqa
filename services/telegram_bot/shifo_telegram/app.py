import asyncio
import hashlib
import hmac
import json
import logging
import re
from contextlib import suppress

from aiogram import Bot, Dispatcher, Router
from aiogram.enums import ChatType
from aiogram.exceptions import (
    ClientDecodeError, TelegramAPIError, TelegramNetworkError, TelegramRetryAfter, TelegramServerError,
)
from aiogram.filters import Filter
from aiogram.methods import AnswerCallbackQuery, SendMessage
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, Update, WebAppInfo
from aiogram.utils.serialization import deserialize_telegram_object_to_python
from aiohttp import web
from pydantic import ValidationError

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
COMMAND = re.compile(r"/(start|bugun|ilova|mashq|holat|help|stop)(?:@([A-Za-z0-9_]+))?(?:[ \t]+(\S+))?")

INVALID_PAIR = "Ulash kodi yaroqsiz. ShifoHalqa sahifasidan yangi ulash havolasini oling."
TODAY = "Bugungi vazifalarni ShifoHalqada oching."
MINI_APP = "ShifoHalqani Telegram Mini App ichida yoki brauzerda oching."
EXERCISE_APP = "Mashq tahlilini Telegram Mini App yoki brauzerda oching."
HELP = "Bugungi holat uchun /holat, ilova uchun /bugun yoki /ilova, mashq uchun /mashq, xabarlarni to‘xtatish uchun /stop buyrug‘ini yuboring."
RED_NOTICE = "ShifoHalqa tekshiruv navbatiga yangi qayd tushdi."

logger = logging.getLogger(__name__)


def _message(chat_id: int, text: str, keyboard: InlineKeyboardMarkup | None = None) -> SendMessage:
    return SendMessage(chat_id=chat_id, text=text, reply_markup=keyboard)


def _mini_app_url(config: Config, focus: str | None = None) -> str:
    return f"{config.app_url}tg?focus={focus}" if focus else f"{config.app_url}tg"


def _mini_app_keyboard(
    config: Config,
    *,
    focus: str | None = None,
    primary_label: str = "ShifoHalqa Mini App",
    include_exercise: bool = False,
    include_stop: bool = False,
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text=primary_label, web_app=WebAppInfo(url=_mini_app_url(config, focus)))],
    ]
    if include_exercise:
        rows.append([
            InlineKeyboardButton(text="Mashq tahlili", web_app=WebAppInfo(url=f"{config.app_url}demo/mashq")),
            InlineKeyboardButton(text="Brauzerda ochish", url=config.app_url),
        ])
    else:
        rows.append([InlineKeyboardButton(text="Brauzerda ochish", url=config.app_url)])
    if include_stop:
        rows.append([InlineKeyboardButton(text="Xabarlarni to‘xtatish", callback_data="stop_notices")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _mini_app_menu_keyboard(config: Config) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Bemor (Mini App)", web_app=WebAppInfo(url=_mini_app_url(config, "patient"))),
                InlineKeyboardButton(text="Shifokor (Mini App)", web_app=WebAppInfo(url=_mini_app_url(config, "doctor"))),
            ],
            [
                InlineKeyboardButton(text="Mashq tahlili", web_app=WebAppInfo(url=f"{config.app_url}demo/mashq")),
                InlineKeyboardButton(text="Brauzerda ochish", url=config.app_url),
            ],
        ]
    )


def _exercise_keyboard(config: Config) -> InlineKeyboardMarkup:
    exercise_url = f"{config.app_url}demo/mashq"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Mashq tahlilini ochish", web_app=WebAppInfo(url=exercise_url))],
            [InlineKeyboardButton(text="Brauzerda ochish", url=exercise_url)],
        ]
    )


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
        if argument and command != "start":
            return False
        return {"command": command, "argument": argument}


def _holat_keyboard(config: Config, role: str, pending_med_task_id: str | None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if role == "patient" and pending_med_task_id:
        rows.append([
            InlineKeyboardButton(text="✓ Dori ichdim", callback_data=f"med_taken:{pending_med_task_id}"),
            InlineKeyboardButton(text="Dori tugadi", callback_data=f"med_supply:{pending_med_task_id}"),
        ])
    rows.append([
        InlineKeyboardButton(
            text="ShifoHalqa Mini App" if role == "patient" else "Shifokor navbatini ochish",
            web_app=WebAppInfo(url=_mini_app_url(config, role)),
        )
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _dispatcher(config: Config, store: TelegramStore) -> Dispatcher:
    router = Router()

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
            )
            return _message(chat_id, "Telegram xabarlari ulandi." if linked else INVALID_PAIR, keyboard)
        if command == "stop":
            stopped = await store.disconnect_chat(chat_id, sent_at=sent_at, update_id=event_update.update_id)
            return _message(chat_id, "Telegram xabarlari o‘chirildi.") if stopped else None
        if command == "holat":
            summary = await store.get_today_summary(chat_id) if hasattr(store, "get_today_summary") else None
            if summary is None:
                return _message(
                    chat_id,
                    "Chat hali ulanmagan. Veb-paneldagi «Telegramni ulash» tugmasi orqali ulang yoki Mini App’ni oching.",
                    _mini_app_menu_keyboard(config),
                )
            return _message(chat_id, summary.text, _holat_keyboard(config, summary.role, summary.pending_med_task_id))
        if command == "ilova":
            return _message(chat_id, MINI_APP, _mini_app_menu_keyboard(config))
        if command == "mashq":
            return _message(chat_id, EXERCISE_APP, _exercise_keyboard(config))
        if command == "help":
            return _message(chat_id, HELP, _mini_app_keyboard(config, include_exercise=True, include_stop=True))
        return _message(
            chat_id,
            TODAY,
            _mini_app_keyboard(config, focus="patient", primary_label="ShifoHalqa Mini App", include_exercise=True),
        )

    @router.callback_query()
    async def handle_callback(callback: CallbackQuery, event_update: Update) -> AnswerCallbackQuery | None:
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
        if data == "stop_notices":
            stopped = await store.disconnect_chat(
                msg.chat.id,
                sent_at=int(msg.date.timestamp()),
                update_id=event_update.update_id,
            )
            return AnswerCallbackQuery(
                callback_query_id=callback.id,
                text="Telegram xabarlari o‘chirildi." if stopped else "Faol ulanish topilmadi.",
            )
        if (data.startswith("med_taken:") or data.startswith("med_supply:")) and hasattr(store, "record_medication_action"):
            action_key, task_id = data.split(":", 1)
            action = "taken" if action_key == "med_taken" else "supply"
            outcome = await store.record_medication_action(msg.chat.id, task_id, action)
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


async def send_red_notice(bot: Bot, config: Config, chat_id: int) -> DeliveryResult:
    return await send_text_message(bot, config, chat_id, RED_NOTICE, focus="doctor", label="Navbatni ochish (Mini App)")


async def send_text_message(
    bot: Bot,
    config: Config,
    chat_id: int,
    text: str,
    *,
    focus: str = "doctor",
    label: str = "ShifoHalqa Mini App",
) -> DeliveryResult:
    if not telegram_chat_id_valid(chat_id):
        return "rejected"
    try:
        keyboard = _mini_app_keyboard(config, focus=focus, primary_label=label)
        result = await bot(_message(chat_id, text, keyboard), request_timeout=3.5)
    except TelegramRetryAfter as error:
        return RetryAfter(max(1, error.retry_after))
    except (ClientDecodeError, TelegramNetworkError, TelegramServerError, TimeoutError):
        return "unknown"
    except TelegramAPIError:
        return "rejected"
    return "sent" if isinstance(result, Message) else "unknown"


def create_app(config: Config, store: TelegramStore, bot: Bot) -> web.Application:
    dispatcher = _dispatcher(config, store)
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
                label = "ShifoHalqa Mini App" if notice.focus == "patient" else "Navbatni ochish (Mini App)"
                try:
                    status = await send_text_message(
                        bot, config, notice.chat_id, notice.message_text, focus=notice.focus, label=label,
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
                await asyncio.sleep(0 if attempted >= 10 else 2.0)

        try:
            await store.open()
            worker = asyncio.create_task(run_delivery_worker(store, send), name="telegram-notices")
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
