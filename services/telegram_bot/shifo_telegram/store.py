import re
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from hashlib import sha256
from typing import Literal
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

DeliveryStatus = Literal["sent", "rejected", "unknown"]
RecordedStatus = Literal["sent", "rejected"]
LinkedRole = Literal["doctor", "patient"]
_PAIR_CODE = re.compile(r"[A-Za-z0-9_-]{43}")


def telegram_pair_code_valid(value: object) -> bool:
    if not isinstance(value, str) or _PAIR_CODE.fullmatch(value) is None:
        return False
    decoded = urlsafe_b64decode(value + "=")
    return urlsafe_b64encode(decoded).decode("ascii").rstrip("=") == value


def telegram_chat_id_valid(value: object) -> bool:
    return type(value) is int and 1 <= value <= 2**52 - 1


@dataclass(frozen=True, slots=True)
class RetryAfter:
    seconds: int


DeliveryResult = DeliveryStatus | RetryAfter


@dataclass(frozen=True, slots=True)
class Notice:
    workspace_id: UUID
    doctor_id: UUID
    link_id: UUID
    flag_id: UUID
    chat_id: int


@dataclass(frozen=True, slots=True)
class TextNotice:
    kind: Literal["patient_notice", "doctor_event"]
    notice_id: UUID
    chat_id: int
    message_text: str
    focus: Literal["patient", "doctor"]
    reply_kind: str | None = None
    reply_id: str | None = None


@dataclass(frozen=True, slots=True)
class TodaySummary:
    role: LinkedRole
    text: str


class TelegramStore:
    def __init__(self, database_url: str, *, expected_env_id: str = ""):
        self._expected_env_id = expected_env_id.strip()
        self._pool = AsyncConnectionPool(
            database_url,
            kwargs={"prepare_threshold": None, "connect_timeout": 5},
            open=False,
            min_size=1,
            max_size=4,
            timeout=5,
            name="telegram-store",
        )

    async def verify_environment_identity(self) -> None:
        if not self._expected_env_id:
            raise RuntimeError("SHIFO_ENV_ID is required before opening TelegramStore.")
        async with self._pool.connection() as connection:
            cursor = await connection.execute(
                "SELECT env_id FROM public.environment_identity WHERE singleton = true LIMIT 1"
            )
            row = await cursor.fetchone()
        actual = row[0].strip() if row and isinstance(row[0], str) else ""
        if actual != self._expected_env_id:
            raise RuntimeError(
                f"Database environment mismatch: expected SHIFO_ENV_ID={self._expected_env_id!r}, got {actual!r}."
            )

    async def open(self) -> None:
        await self._pool.open(wait=True, timeout=12)
        try:
            await self.verify_environment_identity()
        except Exception:
            await self._pool.close()
            raise

    async def close(self) -> None:
        await self._pool.close()

    async def redeem_pairing(self, code: str, chat_id: int, *, sent_at: int, update_id: int) -> bool:
        if not telegram_pair_code_valid(code) or not telegram_chat_id_valid(chat_id):
            return False
        code_hash = sha256(code.encode("ascii")).hexdigest()

        async with self._pool.connection() as connection:
            candidate = await connection.execute(
                """
                SELECT workspace_id, doctor_id, redeemed_at
                FROM public.telegram_pairings
                WHERE code_hash = %s AND expires_at > clock_timestamp()
                FOR UPDATE
                """,
                (code_hash,),
            )
            row = await candidate.fetchone()
            if row is not None:
                workspace_id, doctor_id, redeemed_at = row
                if redeemed_at is not None:
                    bound = await connection.execute(
                        """
                        SELECT 1 FROM public.telegram_doctor_links
                        WHERE workspace_id = %s AND doctor_id = %s AND chat_id = %s
                        """,
                        (workspace_id, doctor_id, chat_id),
                    )
                    return await bound.fetchone() is not None

                linked = await connection.execute(
                    """
                    INSERT INTO public.telegram_doctor_links
                      (workspace_id, doctor_id, chat_id, paired_message_at, paired_update_id)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    RETURNING 1
                    """,
                    (workspace_id, doctor_id, chat_id, sent_at, update_id),
                )
                if await linked.fetchone() is None:
                    return False

                await connection.execute(
                    """
                    UPDATE public.telegram_pairings SET redeemed_at = clock_timestamp()
                    WHERE workspace_id = %s AND doctor_id = %s
                    """,
                    (workspace_id, doctor_id),
                )
                return True

            patient_candidate = await connection.execute(
                """
                SELECT workspace_id, patient_id, redeemed_at
                FROM public.telegram_patient_pairings
                WHERE code_hash = %s AND expires_at > clock_timestamp()
                FOR UPDATE
                """,
                (code_hash,),
            )
            prow = await patient_candidate.fetchone()
            if prow is None:
                return False

            workspace_id, patient_id, redeemed_at = prow
            if redeemed_at is not None:
                bound = await connection.execute(
                    """
                    SELECT 1 FROM public.telegram_patient_links
                    WHERE workspace_id = %s AND patient_id = %s AND chat_id = %s
                    """,
                    (workspace_id, patient_id, chat_id),
                )
                return await bound.fetchone() is not None

            linked = await connection.execute(
                """
                INSERT INTO public.telegram_patient_links
                  (workspace_id, patient_id, chat_id, paired_message_at, paired_update_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING 1
                """,
                (workspace_id, patient_id, chat_id, sent_at, update_id),
            )
            if await linked.fetchone() is None:
                return False

            await connection.execute(
                """
                UPDATE public.telegram_patient_pairings SET redeemed_at = clock_timestamp()
                WHERE workspace_id = %s AND patient_id = %s
                """,
                (workspace_id, patient_id),
            )
            return True

    async def get_linked_role(self, chat_id: int) -> LinkedRole | None:
        if not telegram_chat_id_valid(chat_id):
            return None
        async with self._pool.connection() as connection:
            doc = await connection.execute(
                "SELECT 1 FROM public.telegram_doctor_links WHERE chat_id = %s",
                (chat_id,),
            )
            if await doc.fetchone() is not None:
                return "doctor"
            pat = await connection.execute(
                "SELECT 1 FROM public.telegram_patient_links WHERE chat_id = %s",
                (chat_id,),
            )
            if await pat.fetchone() is not None:
                return "patient"
            return None

    async def disconnect_chat(self, chat_id: int, *, sent_at: int, update_id: int) -> bool:
        if not telegram_chat_id_valid(chat_id):
            return False
        async with self._pool.connection() as connection:
            target = await connection.execute(
                """
                SELECT link.workspace_id, link.doctor_id, link.link_id, pairing.code_hash,
                       CASE WHEN link.paired_message_at IS NULL
                            THEN date_trunc('second', link.connected_at) < to_timestamp(%s)
                            ELSE (link.paired_message_at, link.paired_update_id) < (%s, %s)
                       END AS can_disconnect
                FROM public.telegram_doctor_links AS link
                LEFT JOIN public.telegram_pairings AS pairing USING (workspace_id, doctor_id)
                WHERE link.chat_id = %s
                """,
                (sent_at, sent_at, update_id, chat_id),
            )
            row = await target.fetchone()
            if row is not None:
                workspace_id, doctor_id, link_id, code_hash, can_disconnect = row
                if not can_disconnect:
                    return False

                # Keep the web disconnect's lock order and delete only the identities read above.
                await connection.execute(
                    """
                    DELETE FROM public.telegram_pairings
                    WHERE workspace_id = %s AND doctor_id = %s AND code_hash = %s
                    """,
                    (workspace_id, doctor_id, code_hash),
                )
                removed = await connection.execute(
                    """
                    DELETE FROM public.telegram_doctor_links
                    WHERE workspace_id = %s AND doctor_id = %s AND link_id = %s
                    RETURNING 1
                    """,
                    (workspace_id, doctor_id, link_id),
                )
                return await removed.fetchone() is not None

            ptarget = await connection.execute(
                """
                SELECT link.workspace_id, link.patient_id, link.link_id, pairing.code_hash,
                       CASE WHEN link.paired_message_at IS NULL
                            THEN date_trunc('second', link.connected_at) < to_timestamp(%s)
                            ELSE (link.paired_message_at, link.paired_update_id) < (%s, %s)
                       END AS can_disconnect
                FROM public.telegram_patient_links AS link
                LEFT JOIN public.telegram_patient_pairings AS pairing USING (workspace_id, patient_id)
                WHERE link.chat_id = %s
                """,
                (sent_at, sent_at, update_id, chat_id),
            )
            prow = await ptarget.fetchone()
            if prow is None:
                return True
            workspace_id, patient_id, link_id, code_hash, can_disconnect = prow
            if not can_disconnect:
                return False

            await connection.execute(
                """
                DELETE FROM public.telegram_patient_pairings
                WHERE workspace_id = %s AND patient_id = %s AND code_hash = %s
                """,
                (workspace_id, patient_id, code_hash),
            )
            removed = await connection.execute(
                """
                DELETE FROM public.telegram_patient_links
                WHERE workspace_id = %s AND patient_id = %s AND link_id = %s
                RETURNING 1
                """,
                (workspace_id, patient_id, link_id),
            )
            return await removed.fetchone() is not None

    async def get_today_summary(self, chat_id: int) -> TodaySummary | None:
        if not telegram_chat_id_valid(chat_id):
            return None
        async with self._pool.connection() as connection:
            dcur = await connection.execute(
                """
                WITH today AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS d)
                SELECT doctor.name,
                       patient.name,
                       (SELECT count(*) FROM public.flags AS f
                        JOIN public.evidence_logs AS e ON e.workspace_id = f.workspace_id AND e.id = f.evidence_log_id
                        JOIN public.task_instances AS t ON t.workspace_id = e.workspace_id AND t.id = e.task_instance_id
                        JOIN public.plan_items AS pi ON pi.workspace_id = t.workspace_id AND pi.id = t.plan_item_id
                        JOIN public.plans AS pl ON pl.workspace_id = pi.workspace_id AND pl.id = pi.plan_id
                        WHERE pl.workspace_id = link.workspace_id AND pl.doctor_id = link.doctor_id AND f.decision IS NULL),
                       COALESCE(steps.step_count, 0),
                       COALESCE(plan.daily_step_goal, 3000)
                FROM public.telegram_doctor_links AS link
                JOIN public.doctors AS doctor ON doctor.workspace_id = link.workspace_id AND doctor.id = link.doctor_id
                LEFT JOIN public.patients AS patient ON patient.workspace_id = doctor.workspace_id AND patient.doctor_id = doctor.id
                LEFT JOIN public.plans AS plan ON plan.workspace_id = patient.workspace_id AND plan.patient_id = patient.id
                CROSS JOIN today
                LEFT JOIN public.daily_step_counts AS steps
                  ON steps.workspace_id = patient.workspace_id AND steps.patient_id = patient.id AND steps.activity_date = today.d
                WHERE link.chat_id = %s
                LIMIT 1
                """,
                (chat_id,),
            )
            drow = await dcur.fetchone()
            if drow is not None:
                doctor_name, patient_name, open_flags, steps_count, step_goal = drow
                step_mark = "Maqsad bajarildi ✓" if steps_count >= step_goal else "Jarayonda"
                lines = [
                    f"Shifokor holati · {doctor_name}",
                    f"• Bemor: {patient_name or 'Namuna bemor'}",
                    f"• Ochiq murojaatlar (dori/bosim): {open_flags}",
                    f"• Bugungi qadamlar: {steps_count} / {step_goal} ({step_mark})",
                ]
                return TodaySummary(role="doctor", text="\n".join(lines))
            return None

    async def claim_pending(self, *, chat_id: int | None = None) -> Notice | None:
        if chat_id is not None and not telegram_chat_id_valid(chat_id):
            raise ValueError("Telegram chat scope is invalid.")
        async with self._pool.connection() as connection:
            claimed = await connection.execute(
                """
                WITH eligible AS (
                  SELECT notice.workspace_id, notice.flag_id, link.chat_id
                  FROM public.telegram_flag_notices AS notice
                  JOIN public.telegram_doctor_links AS link USING (workspace_id, doctor_id, link_id)
                  JOIN public.flags AS flag ON flag.workspace_id = notice.workspace_id AND flag.id = notice.flag_id
                  WHERE notice.delivery_status = 'pending'
                    AND notice.created_at > CURRENT_TIMESTAMP - interval '1 hour'
                    AND notice.next_attempt_at <= CURRENT_TIMESTAMP
                    AND flag.decision IS NULL
                    AND (%s::bigint IS NULL OR link.chat_id = %s)
                  ORDER BY notice.created_at, notice.workspace_id, notice.flag_id
                  LIMIT 1
                  FOR UPDATE OF notice SKIP LOCKED
                )
                UPDATE public.telegram_flag_notices AS notice
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
                UPDATE public.telegram_flag_notices
                SET delivery_status = %s
                WHERE workspace_id = %s AND doctor_id = %s AND link_id = %s AND flag_id = %s
                  AND delivery_status = 'unknown'
                """,
                (status, notice.workspace_id, notice.doctor_id, notice.link_id, notice.flag_id),
            )

    async def schedule_retry(self, notice: Notice, seconds: int) -> None:
        async with self._pool.connection() as connection:
            await connection.execute(
                """
                WITH scheduled AS (SELECT clock_timestamp() + %s * interval '1 second' AS due)
                UPDATE public.telegram_flag_notices AS notice
                SET next_attempt_at = scheduled.due,
                    delivery_status = CASE WHEN scheduled.due < notice.created_at + interval '1 hour'
                                           THEN 'pending' ELSE 'rejected' END
                FROM scheduled
                WHERE workspace_id = %s AND doctor_id = %s AND link_id = %s AND flag_id = %s
                  AND delivery_status = 'unknown'
                """,
                (seconds, notice.workspace_id, notice.doctor_id, notice.link_id, notice.flag_id),
            )

    async def claim_pending_text_notice(self, *, chat_id: int | None = None) -> TextNotice | None:
        async with self._pool.connection() as connection:
            pcur = await connection.execute(
                """
                WITH eligible AS (
                  SELECT notice.id, link.chat_id,
                         CASE WHEN link.details_enabled THEN notice.message_text ELSE 'Yangi xabar bor.' END AS message_text
                  FROM public.telegram_patient_notices AS notice
                  JOIN public.telegram_patient_links AS link USING (workspace_id, patient_id, link_id)
                  WHERE notice.delivery_status = 'pending'
                    AND (%s::bigint IS NULL OR link.chat_id = %s)
                    AND notice.created_at > CURRENT_TIMESTAMP - interval '1 hour'
                    AND notice.next_attempt_at <= CURRENT_TIMESTAMP
                  ORDER BY notice.created_at, notice.id
                  LIMIT 1
                  FOR UPDATE OF notice SKIP LOCKED
                )
                UPDATE public.telegram_patient_notices AS notice
                SET delivery_status = 'unknown', attempted_at = CURRENT_TIMESTAMP
                FROM eligible WHERE notice.id = eligible.id
                RETURNING notice.id, eligible.chat_id, eligible.message_text, notice.kind, notice.ref_id
                """,
                (chat_id, chat_id),
            )
            prow = await pcur.fetchone()
            if prow is not None:
                return TextNotice("patient_notice", prow[0], prow[1], prow[2], "patient", prow[3], str(prow[4]))

            dcur = await connection.execute(
                """
                WITH eligible AS (
                  SELECT notice.id, link.chat_id, notice.message_text
                  FROM public.telegram_doctor_events AS notice
                  JOIN public.telegram_doctor_links AS link USING (workspace_id, doctor_id, link_id)
                  WHERE notice.delivery_status = 'pending'
                    AND (%s::bigint IS NULL OR link.chat_id = %s)
                    AND notice.created_at > CURRENT_TIMESTAMP - interval '1 hour'
                    AND notice.next_attempt_at <= CURRENT_TIMESTAMP
                  ORDER BY notice.created_at, notice.id
                  LIMIT 1
                  FOR UPDATE OF notice SKIP LOCKED
                )
                UPDATE public.telegram_doctor_events AS notice
                SET delivery_status = 'unknown', attempted_at = CURRENT_TIMESTAMP
                FROM eligible WHERE notice.id = eligible.id
                RETURNING notice.id, eligible.chat_id, eligible.message_text
                """,
                (chat_id, chat_id),
            )
            drow = await dcur.fetchone()
            if drow is not None:
                return TextNotice("doctor_event", drow[0], drow[1], drow[2], "doctor")
            return None

    async def record_text_delivery(self, notice: TextNotice, status: RecordedStatus) -> None:
        table = "public.telegram_patient_notices" if notice.kind == "patient_notice" else "public.telegram_doctor_events"
        async with self._pool.connection() as connection:
            await connection.execute(
                f"UPDATE {table} SET delivery_status = %s WHERE id = %s AND delivery_status = 'unknown'",
                (status, notice.notice_id),
            )

    async def schedule_text_retry(self, notice: TextNotice, seconds: int) -> None:
        table = "public.telegram_patient_notices" if notice.kind == "patient_notice" else "public.telegram_doctor_events"
        async with self._pool.connection() as connection:
            await connection.execute(
                f"""
                WITH scheduled AS (SELECT clock_timestamp() + %s * interval '1 second' AS due)
                UPDATE {table} AS notice
                SET next_attempt_at = scheduled.due,
                    delivery_status = CASE WHEN scheduled.due < notice.created_at + interval '1 hour'
                                           THEN 'pending' ELSE 'rejected' END
                FROM scheduled
                WHERE notice.id = %s AND notice.delivery_status = 'unknown'
                """,
                (seconds, notice.notice_id),
            )
