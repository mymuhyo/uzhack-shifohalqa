import logging
import sys

from aiogram import Bot
from aiohttp import web

from .app import create_app
from .config import Config
from .store import TelegramStore


def main() -> None:
    try:
        config = Config.from_env()
    except ValueError as error:
        sys.exit(str(error))

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    app = create_app(config, TelegramStore(config.database_url, expected_env_id=config.env_id), Bot(token=config.bot_token))
    web.run_app(app, host=config.host, port=config.port, access_log=None)


if __name__ == "__main__":
    main()
