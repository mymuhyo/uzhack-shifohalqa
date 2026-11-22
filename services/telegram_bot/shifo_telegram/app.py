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
from aiogram.methods import SendMessage
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, Update, WebAppInfo
from aiogram.utils.serialization import deserialize_telegram_object_to_python
from aiohttp import web
from pydantic import ValidationError

from .config import Config
from .store import DeliveryResult, RetryAfter, TelegramStore, telegram_chat_id_valid, telegram_pair_code_valid
from .worker import run_delivery_worker

WEBHOOK_PATH = "/api/telegram/webhook"
WEBHOOK_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"
MAX_WEBHOOK_BYTES = 32 * 1024
NO_STORE = {"Cache-Control": "no-store"}
COMMAND = re.compile(r"/(start|bugun|ilova|mashq|help|stop)(?:@([A-Za-z0-9_]+))?(?:[ \t]+(\S+))?")

INVALID_PAIR = "Ulash kodi yaroqsiz. Shifokor sahifasidan yangi ulash havolasini oling."
TODAY = "Bugungi vazifalarni ShifoHalqada oching."
MINI_APP = "ShifoHalqani Telegram Mini App ichida yoki brauzerda oching."
EXERCISE_APP = "Mashq tahlilini Telegram Mini App yoki brauzerda oching."
HELP = "Ilovani ochish uchun /bugun yoki /ilova, mashq uchun /mashq, xabarlarni to‘xtatish uchun /stop buyrug‘ini yuboring."
RED_NOTICE = "ShifoHalqa tekshiruv navbatiga yangi qayd tushdi."

logger = logging.getLogger(__name__)


def _message(chat_id: int, text: str, app_url: str | None = None) -> SendMessage:
    keyboard = None
    if app_url:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="ShifoHalqani ochish", url=app_url)]]
        )
    return SendMessage(chat_id=chat_id, text=text, reply_markup=keyboard)


def _mini_app_message(chat_id: int, text: str, web_app_label: str, web_app_url: str, fallback_url: str) -> SendMessage:
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=web_app_label, web_app=WebAppInfo(url=web_app_url))],
            [InlineKeyboardButton(text="Brauzerda ochish", url=fallback_url)],
        ]
    )
    return SendMessage(chat_id=chat_id, text=text, reply_markup=keyboard)


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
            return _message(chat_id, "Telegram xabarlari ulandi." if linked else INVALID_PAIR, config.app_url)
        if command == "stop":
            stopped = await store.disconnect_chat(chat_id, sent_at=sent_at, update_id=event_update.update_id)
            return _message(chat_id, "Telegram xabarlari o‘chirildi.") if stopped else None
        if command == "ilova":
            return _mini_app_message(
                chat_id,
                MINI_APP,
                "ShifoHalqa Mini App",
                f"{config.app_url}tg",
                config.app_url,
            )
        if command == "mashq":
            exercise_url = f"{config.app_url}demo/mashq"
            return _mini_app_message(
                chat_id,
                EXERCISE_APP,
                "Mashq tahlilini ochish",
                exercise_url,
                exercise_url,
            )
        return _message(chat_id, HELP if command == "help" else TODAY, config.app_url)

    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    return dispatcher


async def send_red_notice(bot: Bot, config: Config, chat_id: int) -> DeliveryResult:
    if not telegram_chat_id_valid(chat_id):
        return "rejected"
    try:
        result = await bot(_message(chat_id, RED_NOTICE, config.app_url), request_timeout=3.5)
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

        try:
            await store.open()
            worker = asyncio.create_task(run_delivery_worker(store, send), name="telegram-notices")
            try:
                yield
            finally:
                worker.cancel()
                with suppress(asyncio.CancelledError):
                    await worker
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

        if not isinstance(response, SendMessage):
            return web.Response(headers=NO_STORE)
        payload = deserialize_telegram_object_to_python(response, default=bot.default, include_api_method_name=True)
        return web.json_response(payload, headers=NO_STORE)

    app.cleanup_ctx.append(database_and_worker)
    app.router.add_get("/healthz", health)
    app.router.add_post(WEBHOOK_PATH, webhook)
    return app
