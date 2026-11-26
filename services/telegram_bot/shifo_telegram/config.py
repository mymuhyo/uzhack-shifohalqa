import os
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit, urlunsplit


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def _app_url(value: str) -> str:
    if any(character.isspace() for character in value) or "\\" in value:
        raise ValueError("TELEGRAM_APP_URL must be an HTTPS URL.")
    try:
        url = urlsplit(value)
        valid_host = bool(url.hostname) and (url.port is None or 1 <= url.port <= 65535)
        has_credentials = url.username is not None or url.password is not None
    except ValueError:
        raise ValueError("TELEGRAM_APP_URL must be an HTTPS URL.") from None
    if url.scheme != "https" or not valid_host or has_credentials or "?" in value or "#" in value:
        raise ValueError("TELEGRAM_APP_URL must be an HTTPS URL without credentials, query, or fragment.")
    path = f"{url.path.rstrip('/')}/"
    return urlunsplit((url.scheme, url.netloc, path, "", ""))


@dataclass(frozen=True)
class Config:
    bot_token: str = field(repr=False)
    webhook_secret: str = field(repr=False)
    bot_username: str
    app_url: str
    database_url: str = field(repr=False)
    host: str = "127.0.0.1"
    port: int = 8081
    env_id: str = ""
    service_secret: str = field(default="", repr=False)

    @classmethod
    def from_env(cls, *, require_database: bool = True) -> "Config":
        bot_token = _env("TELEGRAM_BOT_TOKEN")
        webhook_secret = _env("TELEGRAM_WEBHOOK_SECRET")
        bot_username = _env("TELEGRAM_BOT_USERNAME")
        app_url = _app_url(_env("TELEGRAM_APP_URL") or _env("NEXT_PUBLIC_APP_URL"))
        database_url = _env("TELEGRAM_DATABASE_URL") or _env("DATABASE_URL")
        host = _env("TELEGRAM_HOST") or "127.0.0.1"
        port = _env("TELEGRAM_PORT") or "8081"
        env_id = _env("SHIFO_ENV_ID")
        service_secret = _env("TELEGRAM_BOT_SERVICE_SECRET")

        if re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{30,128}", bot_token) is None:
            raise ValueError("Set a valid TELEGRAM_BOT_TOKEN.")
        if re.fullmatch(r"[A-Za-z0-9_-]{1,256}", webhook_secret) is None:
            raise ValueError("Set a valid TELEGRAM_WEBHOOK_SECRET.")
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}", bot_username) is None:
            raise ValueError("Set TELEGRAM_BOT_USERNAME without the @ prefix.")
        if require_database and not database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("Set TELEGRAM_DATABASE_URL or DATABASE_URL to a PostgreSQL URI.")
        if require_database and re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,63}", env_id) is None:
            raise ValueError("Set SHIFO_ENV_ID to the expected database environment identity (e.g. final-preview).")
        if re.fullmatch(r"[0-9]{1,5}", port) is None or not 1 <= int(port) <= 65535:
            raise ValueError("TELEGRAM_PORT must be between 1 and 65535.")
        if service_secret and (len(service_secret) < 32 or not service_secret.isascii() or any(c.isspace() for c in service_secret)):
            raise ValueError("Set a TELEGRAM_BOT_SERVICE_SECRET with at least 32 non-space ASCII characters.")

        return cls(bot_token, webhook_secret, bot_username, app_url, database_url, host, int(port), env_id, service_secret)
