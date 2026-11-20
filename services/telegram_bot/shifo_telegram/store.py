import re
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from hashlib import sha256
from typing import Literal
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

DeliveryStatus = Literal["sent", "rejected", "unknown"]
RecordedStatus = Literal["sent", "rejected"]
_PAIR_CODE = re.compile(r"[A-Za-z0-9_-]{43}")


def telegram_pair_code_valid(value: object) -> bool:
    if not isinstance(value, str) or _PAIR_CODE.fullmatch(value) is None:
        return False
    decoded = urlsafe_b64decode(value + "=")
    return urlsafe_b64encode(decoded).decode("ascii").rstrip("=") == value


def telegram_chat_id_valid(value: object) -> bool:
    return type(value) is int and 1 <= value <= 2**52 - 1


@dataclass(frozen=True, slots=True)
class Notice:
    workspace_id: UUID
    doctor_id: UUID
    link_id: UUID
    flag_id: UUID
    chat_id: int


class TelegramStore:
    def __init__(self, database_url: str):
        self._pool = AsyncConnectionPool(
            database_url,
            kwargs={"prepare_threshold": None, "connect_timeout": 5},
            open=False,
            min_size=1,
            max_size=4,
            timeout=5,
            name="telegram-store",
        )

    async def open(self) -> None:
        await self._pool.open(wait=True, timeout=12)

    async def close(self) -> None:
        await self._pool.close()

    async def redeem_pairing(self, code: str, chat_id: int) -> bool:
        if not telegram_pair_code_valid(code) or not telegram_chat_id_valid(chat_id):
            return False
        code_hash = sha256(code.encode("ascii")).hexdigest()

        async with self._pool.connection() as connection:
            candidate = await connection.execute(
                """
                SELECT workspace_id, doctor_id, redeemed_at
                FROM shifohalqa.telegram_pairings
                WHERE code_hash = %s AND expires_at > clock_timestamp()
                FOR UPDATE
                """,
                (code_hash,),
            )
            row = await candidate.fetchone()
            if row is None:
                return False

            workspace_id, doctor_id, redeemed_at = row
            if redeemed_at is not None:
                bound = await connection.execute(
                    """
                    SELECT 1 FROM shifohalqa.telegram_doctor_links
                    WHERE workspace_id = %s AND doctor_id = %s AND chat_id = %s
                    """,
                    (workspace_id, doctor_id, chat_id),
                )
                return await bound.fetchone() is not None

            linked = await connection.execute(
                """
                INSERT INTO shifohalqa.telegram_doctor_links (workspace_id, doctor_id, chat_id)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING 1
                """,
                (workspace_id, doctor_id, chat_id),
            )
            if await linked.fetchone() is None:
                return False

            await connection.execute(
                """
                UPDATE shifohalqa.telegram_pairings SET redeemed_at = clock_timestamp()
                WHERE workspace_id = %s AND doctor_id = %s
                """,
                (workspace_id, doctor_id),
            )
            return True

    async def disconnect_chat(self, chat_id: int) -> None:
        if not telegram_chat_id_valid(chat_id):
            return
        async with self._pool.connection() as connection:
            await connection.execute(
                """
                DELETE FROM shifohalqa.telegram_pairings AS pairing
                USING shifohalqa.telegram_doctor_links AS link
                WHERE link.chat_id = %s AND pairing.workspace_id = link.workspace_id
                  AND pairing.doctor_id = link.doctor_id
                """,
                (chat_id,),
            )
            await connection.execute(
                "DELETE FROM shifohalqa.telegram_doctor_links WHERE chat_id = %s",
                (chat_id,),
            )

    async def claim_pending(self, *, chat_id: int | None = None) -> Notice | None:
        if chat_id is not None and not telegram_chat_id_valid(chat_id):
            raise ValueError("Telegram chat scope is invalid.")
        async with self._pool.connection() as connection:
            claimed = await connection.execute(
                """
                WITH eligible AS (
                  SELECT notice.workspace_id, notice.flag_id, link.chat_id
                  FROM shifohalqa.telegram_flag_notices AS notice
                  JOIN shifohalqa.telegram_doctor_links AS link USING (workspace_id, doctor_id, link_id)
                  JOIN shifohalqa.flags AS flag ON flag.workspace_id = notice.workspace_id AND flag.id = notice.flag_id
                  WHERE notice.delivery_status = 'pending'
                    AND notice.created_at > CURRENT_TIMESTAMP - interval '1 hour'
                    AND flag.decision IS NULL
                    AND (%s::bigint IS NULL OR link.chat_id = %s)
                  ORDER BY notice.created_at, notice.workspace_id, notice.flag_id
                  LIMIT 1
                  FOR UPDATE OF notice SKIP LOCKED
                )
                UPDATE shifohalqa.telegram_flag_notices AS notice
                SET delivery_status = 'unknown', attempted_at = CURRENT_TIMESTAMP
                FROM eligible WHERE notice.workspace_id = eligible.workspace_id AND notice.flag_id = eligible.flag_id
                RETURNING notice.workspace_id, notice.doctor_id, notice.link_id, notice.flag_id, eligible.chat_id
                """,
                (chat_id, chat_id),
            )
            row = await claimed.fetchone()
            return Notice(*row) if row is not None else None

    async def record_delivery(self, notice: Notice, status: RecordedStatus) -> None:
        async with self._pool.connection() as connection:
            await connection.execute(
                """
                UPDATE shifohalqa.telegram_flag_notices
                SET delivery_status = %s
                WHERE workspace_id = %s AND doctor_id = %s AND link_id = %s AND flag_id = %s
                  AND delivery_status = 'unknown'
                """,
                (status, notice.workspace_id, notice.doctor_id, notice.link_id, notice.flag_id),
            )
