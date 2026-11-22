"""Inspect or explicitly register the webhook for a dedicated ShifoHalqa bot."""

import argparse
import asyncio
import os
from urllib.parse import urlsplit

from aiogram import Bot
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.exceptions import TelegramAPIError
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from .config import Config


def webhook_target() -> str:
    target = os.environ.get("TELEGRAM_WEBHOOK_URL", "").strip()
    parsed = urlsplit(target)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in (None, 443, 80, 88, 8443)
        or parsed.path != "/api/telegram/webhook"
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Set TELEGRAM_WEBHOOK_URL to the public HTTPS /api/telegram/webhook endpoint.")
    return target


async def manage_webhook(config: Config, target: str, *, register: bool) -> str:
    async with Bot(config.bot_token, session=AiohttpSession(timeout=8)) as bot:
        identity = await bot.get_me()
        if (identity.username or "").lower() != config.bot_username.lower():
            raise ValueError("The token does not belong to TELEGRAM_BOT_USERNAME.")
        current = (await bot.get_webhook_info()).url
        if current and current != target:
            raise ValueError("This bot already has a different webhook. Use a dedicated ShifoHalqa bot.")
        if not register:
            return "ShifoHalqa webhook is registered." if current == target else "This bot has no webhook."

        registered = await bot.set_webhook(
            target,
            secret_token=config.webhook_secret,
            allowed_updates=["message", "callback_query"],
        )
        if not registered:
            raise ValueError("Telegram did not confirm webhook registration.")
        await bot.set_my_commands([
            BotCommand(command="bugun", description="Bugungi vazifalarni ochish"),
            BotCommand(command="ilova", description="ShifoHalqa Mini App menyusi"),
            BotCommand(command="mashq", description="Mashq tahlilini ochish"),
            BotCommand(command="help", description="Yordam va boshqaruv"),
            BotCommand(command="stop", description="Telegram xabarlarini o‘chirish"),
        ])
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="ShifoHalqa", web_app=WebAppInfo(url=f"{config.app_url}tg")),
        )
        return "ShifoHalqa webhook registered."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--status", action="store_true", help="Inspect the current webhook (default).")
    mode.add_argument("--register", action="store_true", help="Register this service's HTTPS webhook.")
    args = parser.parse_args()
    try:
        config = Config.from_env(require_database=False)
        target = webhook_target()
        print(asyncio.run(manage_webhook(config, target, register=args.register)))
    except ValueError as error:
        raise SystemExit(str(error)) from None
    except (TelegramAPIError, TimeoutError, OSError):
        raise SystemExit("Telegram did not complete the webhook request.") from None


if __name__ == "__main__":
    main()
