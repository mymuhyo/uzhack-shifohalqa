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


@dataclass(frozen=True, slots=True)
class TodaySummary:
    role: LinkedRole
    text: str
    pending_med_task_id: str | None = None


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

    async def redeem_pairing(self, code: str, chat_id: int, *, sent_at: int, update_id: int) -> bool:
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
            if row is not None:
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
                    INSERT INTO shifohalqa.telegram_doctor_links
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
                    UPDATE shifohalqa.telegram_pairings SET redeemed_at = clock_timestamp()
                    WHERE workspace_id = %s AND doctor_id = %s
                    """,
                    (workspace_id, doctor_id),
                )
                return True

            patient_candidate = await connection.execute(
                """
                SELECT workspace_id, patient_id, redeemed_at
                FROM shifohalqa.telegram_patient_pairings
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
                    SELECT 1 FROM shifohalqa.telegram_patient_links
                    WHERE workspace_id = %s AND patient_id = %s AND chat_id = %s
                    """,
                    (workspace_id, patient_id, chat_id),
                )
                return await bound.fetchone() is not None

            linked = await connection.execute(
                """
                INSERT INTO shifohalqa.telegram_patient_links
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
                UPDATE shifohalqa.telegram_patient_pairings SET redeemed_at = clock_timestamp()
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
                "SELECT 1 FROM shifohalqa.telegram_doctor_links WHERE chat_id = %s",
                (chat_id,),
            )
            if await doc.fetchone() is not None:
                return "doctor"
            pat = await connection.execute(
                "SELECT 1 FROM shifohalqa.telegram_patient_links WHERE chat_id = %s",
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
                FROM shifohalqa.telegram_doctor_links AS link
                LEFT JOIN shifohalqa.telegram_pairings AS pairing USING (workspace_id, doctor_id)
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
                    DELETE FROM shifohalqa.telegram_pairings
                    WHERE workspace_id = %s AND doctor_id = %s AND code_hash = %s
                    """,
                    (workspace_id, doctor_id, code_hash),
                )
                removed = await connection.execute(
                    """
                    DELETE FROM shifohalqa.telegram_doctor_links
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
                FROM shifohalqa.telegram_patient_links AS link
                LEFT JOIN shifohalqa.telegram_patient_pairings AS pairing USING (workspace_id, patient_id)
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
                DELETE FROM shifohalqa.telegram_patient_pairings
                WHERE workspace_id = %s AND patient_id = %s AND code_hash = %s
                """,
                (workspace_id, patient_id, code_hash),
            )
            removed = await connection.execute(
                """
                DELETE FROM shifohalqa.telegram_patient_links
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
            pcur = await connection.execute(
                """
                WITH today AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS d)
                SELECT patient.name,
                       med_item.title,
                       med_task.id::text,
                       med_task.status,
                       vitals_task.status,
                       COALESCE(steps.step_count, 0),
                       COALESCE(plan.daily_step_goal, 3000),
                       ex_plan.movement,
                       ex_plan.target_reps,
                       (
                         SELECT flag.patient_reply
                         FROM shifohalqa.flags AS flag
                         JOIN shifohalqa.evidence_logs AS ev ON ev.workspace_id = flag.workspace_id AND ev.id = flag.evidence_log_id
                         JOIN shifohalqa.task_instances AS t ON t.workspace_id = ev.workspace_id AND t.id = ev.task_instance_id
                         JOIN shifohalqa.plan_items AS pi ON pi.workspace_id = t.workspace_id AND pi.id = t.plan_item_id
                         WHERE pi.workspace_id = plan.workspace_id AND pi.plan_id = plan.id AND flag.patient_reply IS NOT NULL
                         ORDER BY flag.reviewed_at DESC NULLS LAST LIMIT 1
                       )
                FROM shifohalqa.telegram_patient_links AS link
                JOIN shifohalqa.patients AS patient
                  ON patient.workspace_id = link.workspace_id AND patient.id = link.patient_id
                LEFT JOIN shifohalqa.plans AS plan
                  ON plan.workspace_id = patient.workspace_id AND plan.patient_id = patient.id
                CROSS JOIN today
                LEFT JOIN shifohalqa.plan_items AS med_item
                  ON med_item.workspace_id = plan.workspace_id AND med_item.plan_id = plan.id AND med_item.type = 'medication'
                LEFT JOIN shifohalqa.task_instances AS med_task
                  ON med_task.workspace_id = med_item.workspace_id AND med_task.plan_item_id = med_item.id AND med_task.scheduled_date = today.d
                LEFT JOIN shifohalqa.plan_items AS vitals_item
                  ON vitals_item.workspace_id = plan.workspace_id AND vitals_item.plan_id = plan.id AND vitals_item.type = 'vitals'
                LEFT JOIN shifohalqa.task_instances AS vitals_task
                  ON vitals_task.workspace_id = vitals_item.workspace_id AND vitals_task.plan_item_id = vitals_item.id AND vitals_task.scheduled_date = today.d
                LEFT JOIN shifohalqa.daily_step_counts AS steps
                  ON steps.workspace_id = patient.workspace_id AND steps.patient_id = patient.id AND steps.activity_date = today.d
                LEFT JOIN shifohalqa.exercise_prescriptions AS ex_plan
                  ON ex_plan.workspace_id = patient.workspace_id AND ex_plan.patient_id = patient.id
                WHERE link.chat_id = %s
                """,
                (chat_id,),
            )
            prow = await pcur.fetchone()
            if prow is not None:
                (
                    patient_name, med_title, med_task_id, med_status, vitals_status,
                    steps_count, step_goal, ex_movement, ex_reps, latest_reply,
                ) = prow
                med_label = {
                    "taken": "Ichildi ✓",
                    "missed": "Qoldirildi",
                    "pending": "Kutilmoqda",
                }.get(med_status or "", "Belgilanmagan")
                bp_label = "Kiritildi ✓" if vitals_status == "recorded" else "Kutilmoqda"
                step_mark = "Maqsad bajarildi ✓" if steps_count >= step_goal else "Jarayonda"
                lines = [f"Bugungi holat · {patient_name}"]
                if med_title:
                    lines.append(f"• Dori ({med_title}): {med_label}")
                else:
                    lines.append("• Reja hali biriktirilmagan.")
                if vitals_status is not None:
                    lines.append(f"• Qon bosimi: {bp_label}")
                lines.append(f"• Qadamlar: {steps_count} / {step_goal} ({step_mark})")
                if ex_movement:
                    lines.append(f"• Mashq: {ex_movement} ({ex_reps} takror)")
                if latest_reply:
                    lines.append(f"• Shifokor javobi: {latest_reply}")
                pending_id = med_task_id if med_status == "pending" else None
                return TodaySummary(role="patient", text="\n".join(lines), pending_med_task_id=pending_id)

            dcur = await connection.execute(
                """
                WITH today AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS d)
                SELECT doctor.name,
                       patient.name,
                       (SELECT count(*) FROM shifohalqa.flags AS f
                        JOIN shifohalqa.evidence_logs AS e ON e.workspace_id = f.workspace_id AND e.id = f.evidence_log_id
                        JOIN shifohalqa.task_instances AS t ON t.workspace_id = e.workspace_id AND t.id = e.task_instance_id
                        JOIN shifohalqa.plan_items AS pi ON pi.workspace_id = t.workspace_id AND pi.id = t.plan_item_id
                        JOIN shifohalqa.plans AS pl ON pl.workspace_id = pi.workspace_id AND pl.id = pi.plan_id
                        WHERE pl.workspace_id = link.workspace_id AND pl.doctor_id = link.doctor_id AND f.decision IS NULL),
                       COALESCE(steps.step_count, 0),
                       COALESCE(plan.daily_step_goal, 3000)
                FROM shifohalqa.telegram_doctor_links AS link
                JOIN shifohalqa.doctors AS doctor ON doctor.workspace_id = link.workspace_id AND doctor.id = link.doctor_id
                LEFT JOIN shifohalqa.patients AS patient ON patient.workspace_id = doctor.workspace_id AND patient.doctor_id = doctor.id
                LEFT JOIN shifohalqa.plans AS plan ON plan.workspace_id = patient.workspace_id AND plan.patient_id = patient.id
                CROSS JOIN today
                LEFT JOIN shifohalqa.daily_step_counts AS steps
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
                return TodaySummary(role="doctor", text="\n".join(lines), pending_med_task_id=None)
            return None

    async def record_medication_action(
        self,
        chat_id: int,
        task_id: str,
        action: Literal["taken", "supply"],
    ) -> Literal["saved_taken", "saved_supply", "already_saved", "not_found"]:
        if not telegram_chat_id_valid(chat_id):
            return "not_found"
        try:
            task_uuid = UUID(task_id)
        except ValueError:
            return "not_found"

        status = "taken" if action == "taken" else "missed"
        payload_json = '{"kind":"medication","status":"taken"}' if action == "taken" else '{"kind":"medication","status":"missed","reason":"out_of_supply"}'
        async with self._pool.connection() as connection:
            cur = await connection.execute(
                """
                WITH scoped AS (
                  SELECT task.workspace_id, task.id AS task_id, task.status AS current_status,
                         link.patient_id, plan.supply_follow_up
                  FROM shifohalqa.telegram_patient_links AS link
                  JOIN shifohalqa.plans AS plan
                    ON plan.workspace_id = link.workspace_id AND plan.patient_id = link.patient_id
                  JOIN shifohalqa.plan_items AS item
                    ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id AND item.type = 'medication'
                  JOIN shifohalqa.task_instances AS task
                    ON task.workspace_id = item.workspace_id AND task.plan_item_id = item.id
                  WHERE link.chat_id = %s
                    AND task.id = %s
                    AND task.scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
                ), added AS (
                  INSERT INTO shifohalqa.evidence_logs (workspace_id, task_instance_id, level, source, ai_mode, payload)
                  SELECT workspace_id, task_id, 0, 'self_report', 'none', %s::jsonb
                  FROM scoped
                  ON CONFLICT (workspace_id, task_instance_id, entry_kind) DO NOTHING
                  RETURNING workspace_id, id, task_instance_id
                ), updated AS (
                  UPDATE shifohalqa.task_instances AS task
                  SET status = %s
                  FROM added
                  WHERE task.workspace_id = added.workspace_id AND task.id = added.task_instance_id
                ), flagged AS (
                  INSERT INTO shifohalqa.flags (workspace_id, evidence_log_id, color, rule_key, detail)
                  SELECT added.workspace_id, added.id, 'yellow', 'medication_out_of_supply', '{}'::jsonb
                  FROM added CROSS JOIN scoped
                  WHERE %s = 'supply' AND scoped.supply_follow_up
                ), audited AS (
                  INSERT INTO shifohalqa.audit_events (workspace_id, evidence_log_id, actor_id, action)
                  SELECT added.workspace_id, added.id, scoped.patient_id, 'record_evidence'
                  FROM added CROSS JOIN scoped
                )
                SELECT CASE
                  WHEN EXISTS (SELECT 1 FROM added) THEN 'saved'
                  WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
                  ELSE 'not_found'
                END
                """,
                (chat_id, task_uuid, payload_json, status, action),
            )
            row = await cur.fetchone()
            outcome = row[0] if row else "not_found"
            if outcome == "saved":
                return "saved_taken" if action == "taken" else "saved_supply"
            if outcome == "already_saved":
                return "already_saved"
            return "not_found"

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
                    AND notice.next_attempt_at <= CURRENT_TIMESTAMP
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

    async def schedule_retry(self, notice: Notice, seconds: int) -> None:
        async with self._pool.connection() as connection:
            await connection.execute(
                """
                WITH scheduled AS (SELECT clock_timestamp() + %s * interval '1 second' AS due)
                UPDATE shifohalqa.telegram_flag_notices AS notice
                SET next_attempt_at = scheduled.due,
                    delivery_status = CASE WHEN scheduled.due < notice.created_at + interval '1 hour'
                                           THEN 'pending' ELSE 'rejected' END
                FROM scheduled
                WHERE workspace_id = %s AND doctor_id = %s AND link_id = %s AND flag_id = %s
                  AND delivery_status = 'unknown'
                """,
                (seconds, notice.workspace_id, notice.doctor_id, notice.link_id, notice.flag_id),
            )

    async def claim_pending_text_notice(self) -> TextNotice | None:
        async with self._pool.connection() as connection:
            pcur = await connection.execute(
                """
                WITH eligible AS (
                  SELECT notice.id, link.chat_id, notice.message_text
                  FROM shifohalqa.telegram_patient_notices AS notice
                  JOIN shifohalqa.telegram_patient_links AS link USING (workspace_id, patient_id, link_id)
                  WHERE notice.delivery_status = 'pending'
                    AND notice.created_at > CURRENT_TIMESTAMP - interval '1 hour'
                    AND notice.next_attempt_at <= CURRENT_TIMESTAMP
                  ORDER BY notice.created_at, notice.id
                  LIMIT 1
                  FOR UPDATE OF notice SKIP LOCKED
                )
                UPDATE shifohalqa.telegram_patient_notices AS notice
                SET delivery_status = 'unknown', attempted_at = CURRENT_TIMESTAMP
                FROM eligible WHERE notice.id = eligible.id
                RETURNING notice.id, eligible.chat_id, eligible.message_text
                """
            )
            prow = await pcur.fetchone()
            if prow is not None:
                return TextNotice("patient_notice", prow[0], prow[1], prow[2], "patient")

            dcur = await connection.execute(
                """
                WITH eligible AS (
                  SELECT notice.id, link.chat_id, notice.message_text
                  FROM shifohalqa.telegram_doctor_events AS notice
                  JOIN shifohalqa.telegram_doctor_links AS link USING (workspace_id, doctor_id, link_id)
                  WHERE notice.delivery_status = 'pending'
                    AND notice.created_at > CURRENT_TIMESTAMP - interval '1 hour'
                    AND notice.next_attempt_at <= CURRENT_TIMESTAMP
                  ORDER BY notice.created_at, notice.id
                  LIMIT 1
                  FOR UPDATE OF notice SKIP LOCKED
                )
                UPDATE shifohalqa.telegram_doctor_events AS notice
                SET delivery_status = 'unknown', attempted_at = CURRENT_TIMESTAMP
                FROM eligible WHERE notice.id = eligible.id
                RETURNING notice.id, eligible.chat_id, eligible.message_text
                """
            )
            drow = await dcur.fetchone()
            if drow is not None:
                return TextNotice("doctor_event", drow[0], drow[1], drow[2], "doctor")
            return None

    async def record_text_delivery(self, notice: TextNotice, status: RecordedStatus) -> None:
        table = "shifohalqa.telegram_patient_notices" if notice.kind == "patient_notice" else "shifohalqa.telegram_doctor_events"
        async with self._pool.connection() as connection:
            await connection.execute(
                f"UPDATE {table} SET delivery_status = %s WHERE id = %s AND delivery_status = 'unknown'",
                (status, notice.notice_id),
            )

    async def schedule_text_retry(self, notice: TextNotice, seconds: int) -> None:
        table = "shifohalqa.telegram_patient_notices" if notice.kind == "patient_notice" else "shifohalqa.telegram_doctor_events"
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
