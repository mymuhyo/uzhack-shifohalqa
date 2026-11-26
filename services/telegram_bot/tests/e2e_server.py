"""Run the real Telegram service without making external Telegram requests."""

from datetime import datetime, timezone
import os
from time import monotonic
from urllib.parse import parse_qs, urlsplit

from aiogram import Bot
from aiogram.client.session.base import BaseSession
from aiogram.exceptions import TelegramRetryAfter
from aiogram.methods import GetMe, SendMessage
from aiogram.types import Chat, Message, User
from aiohttp import web

from shifo_telegram.app import create_app
from shifo_telegram.config import Config
from shifo_telegram.store import TelegramStore


class OfflineTelegramSession(BaseSession):
    def __init__(self):
        super().__init__()
        self.retry_at = {}
        self.patient_notice_retry = False

    async def close(self):
        pass

    async def stream_content(self, *args, **kwargs):
        raise AssertionError("The Telegram demo cannot send media")

    async def make_request(self, bot, method, timeout=None):
        if isinstance(method, GetMe):
            return User(id=bot.id, is_bot=True, first_name="Demo", username="shifohalqa_e2e_bot")
        assert isinstance(method, SendMessage)
        assert type(method.chat_id) is int and method.chat_id > 0
        if method.chat_id == int(os.environ["SHIFO_E2E_TELEGRAM_CHAT_ID"]) + 2:
            button = method.reply_markup.inline_keyboard[0][0]
            target = parse_qs(urlsplit(button.web_app.url).query)
            assert target["kind"] == ["doctor_reply"] and target["reply"], "Notice must open the exact reply"
            if not self.patient_notice_retry:
                self.patient_notice_retry = True
                assert "Tasdiqlangan sinov javobi." in method.text
                raise TelegramRetryAfter(method=method, message="test notice retry", retry_after=8)
            assert method.text == "Yangi xabar bor.", "A retried notice must check current chat privacy"
            return Message(message_id=2, date=datetime.now(timezone.utc), chat=Chat(id=method.chat_id, type="private"))
        assert method.text == "ShifoHalqa tekshiruv navbatiga yangi qayd tushdi."
        assert method.reply_markup is not None
        buttons = method.reply_markup.inline_keyboard
        assert len(buttons) == 2 and all(len(row) == 1 for row in buttons)
        assert buttons[0][0].web_app.url == "https://shifohalqa.example.test/tg?focus=doctor"
        assert buttons[1][0].url == "https://shifohalqa.example.test/"
        if method.chat_id not in self.retry_at:
            self.retry_at[method.chat_id] = monotonic() + 2
            raise TelegramRetryAfter(method=method, message="synthetic flood control", retry_after=2)
        assert monotonic() >= self.retry_at[method.chat_id], "Retry happened before the provider delay"
        return Message(message_id=1, date=datetime.now(timezone.utc), chat=Chat(id=method.chat_id, type="private"))


class ScopedTestStore(TelegramStore):
    async def claim_pending(self):
        return await super().claim_pending(chat_id=int(os.environ["SHIFO_E2E_TELEGRAM_CHAT_ID"]))

    async def claim_pending_text_notice(self):
        return await super().claim_pending_text_notice(chat_id=int(os.environ["SHIFO_E2E_TELEGRAM_CHAT_ID"]) + 2)


def main():
    config = Config.from_env()
    bot = Bot(token=config.bot_token, session=OfflineTelegramSession())
    store = ScopedTestStore(config.database_url, expected_env_id=config.env_id)
    web.run_app(create_app(config, store, bot), host=config.host, port=config.port, access_log=None)


if __name__ == "__main__":
    main()
