from dataclasses import dataclass
from typing import Any, Literal

import aiohttp


@dataclass(frozen=True, slots=True)
class BridgeDose:
    task_id: str
    title: str
    strength: float | None
    strength_unit: str
    due_time: str
    status: Literal["pending", "taken", "missed"]
    reason: str | None
    box_done: bool


@dataclass(frozen=True, slots=True)
class BridgeVitals:
    task_id: str
    due_time: str
    status: Literal["pending", "recorded"]
    systolic: int | None
    diastolic: int | None
    chest_pain: bool
    zone_label_uz: str | None
    zone_tone: str | None


@dataclass(frozen=True, slots=True)
class BridgeSteps:
    today_count: int
    goal: int
    achieved: bool
    source: str | None
    week_total: int
    days_recorded: int


@dataclass(frozen=True, slots=True)
class BridgeMedicationStat:
    name: str
    strength: float | None
    strength_unit: str
    taken: int
    scheduled: int
    missed: int
    unanswered: int


@dataclass(frozen=True, slots=True)
class BridgeAdherence:
    today_scheduled: int
    today_completed: int
    today_answered: int
    week_scheduled: int
    week_completed: int
    week_answered: int
    by_medication: tuple[BridgeMedicationStat, ...]


@dataclass(frozen=True, slots=True)
class BridgeBrief:
    id: str
    brief_date: str
    approved_reply_uz: str
    approved_at: str


@dataclass(frozen=True, slots=True)
class BridgeDoctorReply:
    task_title: str
    decision: str
    reply: str
    reviewed_at: str


@dataclass(frozen=True, slots=True)
class BridgeExercisePlan:
    movement: str
    title_uz: str
    target_reps: int
    target_angle: int


@dataclass(frozen=True, slots=True)
class BridgeDoctorSummary:
    doctor_name: str
    patient_count: int
    open_flags: int
    open_urgent: int
    open_warning: int


@dataclass(frozen=True, slots=True)
class BridgeSnapshot:
    role: str
    patient_name: str
    details_enabled: bool
    is_demo: bool
    date: str
    doses: tuple[BridgeDose, ...]
    vitals_task: BridgeVitals | None
    steps: BridgeSteps | None
    adherence: BridgeAdherence | None
    approved_brief: BridgeBrief | None
    latest_doctor_reply: BridgeDoctorReply | None
    exercise_plan: BridgeExercisePlan | None
    doctor_summary: BridgeDoctorSummary | None = None


@dataclass(frozen=True, slots=True)
class BridgeMutationResult:
    ok: bool
    status: str
    flag_color: str | None = None
    snapshot: BridgeSnapshot | None = None
    zone_tone: str | None = None
    zone_label_uz: str | None = None
    zone_text_uz: str | None = None
    count: int | None = None
    goal: int | None = None
    achieved: bool | None = None
    details_enabled: bool | None = None
    error: str | None = None


def _parse_snapshot(data: dict[str, Any]) -> BridgeSnapshot:
    doses = tuple(
        BridgeDose(
            task_id=str(item["taskId"]),
            title=str(item["title"]),
            strength=float(item["strength"]) if item.get("strength") is not None else None,
            strength_unit=str(item.get("strengthUnit") or "mg"),
            due_time=str(item["dueTime"]),
            status=item["status"],
            reason=item.get("reason"),
            box_done=bool(item.get("boxDone")),
        )
        for item in (data.get("doses") or [])
    )

    vt_raw = data.get("vitalsTask")
    vitals = (
        BridgeVitals(
            task_id=str(vt_raw["taskId"]),
            due_time=str(vt_raw["dueTime"]),
            status=vt_raw["status"],
            systolic=vt_raw.get("systolic"),
            diastolic=vt_raw.get("diastolic"),
            chest_pain=bool(vt_raw.get("chestPain")),
            zone_label_uz=vt_raw.get("zoneLabelUz"),
            zone_tone=vt_raw.get("zoneTone"),
        )
        if isinstance(vt_raw, dict)
        else None
    )

    st_raw = data.get("steps")
    steps = (
        BridgeSteps(
            today_count=int(st_raw.get("todayCount", 0)),
            goal=int(st_raw.get("goal", 3000)),
            achieved=bool(st_raw.get("achieved")),
            source=st_raw.get("source"),
            week_total=int(st_raw.get("weekTotal", 0)),
            days_recorded=int(st_raw.get("daysRecorded", 0)),
        )
        if isinstance(st_raw, dict)
        else None
    )

    ad_raw = data.get("adherence")
    adherence = None
    if isinstance(ad_raw, dict):
        t = ad_raw.get("today") or {}
        w = ad_raw.get("week") or {}
        by_med = tuple(
            BridgeMedicationStat(
                name=str(m["medicationName"]),
                strength=float(m["strength"]) if m.get("strength") is not None else None,
                strength_unit=str(m.get("strengthUnit") or "mg"),
                taken=int((m.get("week") or {}).get("taken", 0)),
                scheduled=int((m.get("week") or {}).get("scheduled", 0)),
                missed=int((m.get("week") or {}).get("missed", 0)),
                unanswered=int((m.get("week") or {}).get("unanswered", 0)),
            )
            for m in (ad_raw.get("byMedication") or [])
        )
        adherence = BridgeAdherence(
            today_scheduled=int(t.get("scheduled", 0)),
            today_completed=int(t.get("completed", 0)),
            today_answered=int(t.get("answered", 0)),
            week_scheduled=int(w.get("scheduled", 0)),
            week_completed=int(w.get("completed", 0)),
            week_answered=int(w.get("answered", 0)),
            by_medication=by_med,
        )

    br_raw = data.get("approvedBrief")
    approved_brief = (
        BridgeBrief(
            id=str(br_raw["id"]),
            brief_date=str(br_raw["briefDate"]),
            approved_reply_uz=str(br_raw["approvedReplyUz"]),
            approved_at=str(br_raw["approvedAt"]),
        )
        if isinstance(br_raw, dict)
        else None
    )

    rep_raw = data.get("latestDoctorReply")
    latest_reply = (
        BridgeDoctorReply(
            task_title=str(rep_raw["taskTitle"]),
            decision=str(rep_raw["decision"]),
            reply=str(rep_raw["reply"]),
            reviewed_at=str(rep_raw["reviewedAt"]),
        )
        if isinstance(rep_raw, dict)
        else None
    )

    ex_raw = data.get("exercisePlan")
    ex_plan = (
        BridgeExercisePlan(
            movement=str(ex_raw["movement"]),
            title_uz=str(ex_raw["titleUz"]),
            target_reps=int(ex_raw["targetReps"]),
            target_angle=int(ex_raw["targetAngle"]),
        )
        if isinstance(ex_raw, dict)
        else None
    )

    doc_raw = data.get("doctorSummary")
    doc_summary = (
        BridgeDoctorSummary(
            doctor_name=str(doc_raw["doctorName"]),
            patient_count=int(doc_raw.get("patientCount", 0)),
            open_flags=int(doc_raw.get("openFlags", 0)),
            open_urgent=int(doc_raw.get("openUrgent", 0)),
            open_warning=int(doc_raw.get("openWarning", 0)),
        )
        if isinstance(doc_raw, dict)
        else None
    )

    return BridgeSnapshot(
        role=str(data["role"]),
        patient_name=str(data.get("patientName") or "Bemor"),
        details_enabled=bool(data.get("detailsEnabled")),
        is_demo=bool(data.get("isDemo")),
        date=str(data.get("date") or ""),
        doses=doses,
        vitals_task=vitals,
        steps=steps,
        adherence=adherence,
        approved_brief=approved_brief,
        latest_doctor_reply=latest_reply,
        exercise_plan=ex_plan,
        doctor_summary=doc_summary,
    )


class TelegramApiBridge:
    def __init__(self, base_url: str, service_secret: str) -> None:
        self._endpoint = f"{base_url.rstrip('/')}/api/telegram/bridge"
        self._service_secret = service_secret
        self._session: aiohttp.ClientSession | None = None

    async def open(self) -> None:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=5)
            self._session = aiohttp.ClientSession(timeout=timeout)

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()
        self._session = None

    def _headers(self, chat_id: int) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._service_secret}",
            "X-Telegram-Chat-Id": str(chat_id),
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, chat_id: int, payload: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
        if not self._service_secret:
            return 503, {"error": "unavailable"}
        owns_session = self._session is None or self._session.closed
        session = self._session if not owns_session else aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5))
        try:
            async with session.request(
                method,
                self._endpoint,
                headers=self._headers(chat_id),
                json=payload,
                allow_redirects=False,
            ) as resp:
                data = await resp.json(content_type=None)
                if not isinstance(data, dict):
                    return resp.status, {}
                return resp.status, data
        except Exception:
            return 503, {"error": "unavailable"}
        finally:
            if owns_session:
                await session.close()

    async def get_summary(self, chat_id: int) -> BridgeSnapshot | None:
        status, data = await self._request("GET", chat_id)
        if status == 404:
            return None
        if status != 200:
            raise RuntimeError(f"Bridge GET failed with status {status}")
        return _parse_snapshot(data)

    async def record_medication(
        self,
        chat_id: int,
        task_id: str,
        status_value: Literal["taken", "missed"],
        reason: str | None = None,
    ) -> BridgeMutationResult:
        payload: dict[str, Any] = {"action": "medication", "taskId": task_id, "status": status_value}
        if status_value == "missed" and reason:
            payload["reason"] = reason
        code, data = await self._request("POST", chat_id, payload)
        if code != 200:
            return BridgeMutationResult(ok=False, status="error", error=str(data.get("error") or "not_found"))
        snap = _parse_snapshot(data["snapshot"]) if isinstance(data.get("snapshot"), dict) else None
        return BridgeMutationResult(
            ok=True,
            status=str(data.get("status") or "saved"),
            flag_color=data.get("flagColor"),
            snapshot=snap,
        )

    async def record_vitals(
        self,
        chat_id: int,
        systolic: int,
        diastolic: int,
        chest_pain: bool = False,
    ) -> BridgeMutationResult:
        code, data = await self._request(
            "POST",
            chat_id,
            {"action": "vitals", "systolic": systolic, "diastolic": diastolic, "chestPain": chest_pain},
        )
        if code != 200:
            return BridgeMutationResult(ok=False, status="error", error=str(data.get("error") or "invalid"))
        zone = data.get("zone") or {}
        return BridgeMutationResult(
            ok=True,
            status=str(data.get("status") or "saved"),
            flag_color=data.get("flagColor"),
            zone_tone=zone.get("tone"),
            zone_label_uz=zone.get("labelUz"),
            zone_text_uz=zone.get("textUz"),
        )

    async def record_steps(self, chat_id: int, count: int) -> BridgeMutationResult:
        code, data = await self._request("POST", chat_id, {"action": "steps", "count": count})
        if code != 200:
            return BridgeMutationResult(ok=False, status="error", error=str(data.get("error") or "invalid"))
        return BridgeMutationResult(
            ok=True,
            status=str(data.get("status") or "saved"),
            count=data.get("count"),
            goal=data.get("goal"),
            achieved=data.get("achieved"),
        )

    async def set_details(self, chat_id: int, enabled: bool) -> BridgeMutationResult:
        code, data = await self._request("POST", chat_id, {"action": "set_details", "enabled": enabled})
        if code != 200:
            return BridgeMutationResult(ok=False, status="error", error=str(data.get("error") or "not_linked"))
        return BridgeMutationResult(
            ok=True,
            status=str(data.get("status") or "saved"),
            details_enabled=bool(data.get("detailsEnabled")),
        )
