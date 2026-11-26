import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Protocol

from .store import DeliveryResult, Notice, RecordedStatus, RetryAfter

_LOG = logging.getLogger(__name__)
Send = Callable[[int], Awaitable[DeliveryResult]]


class DeliveryStore(Protocol):
    async def claim_pending(self) -> Notice | None: ...

    async def record_delivery(self, notice: Notice, status: RecordedStatus) -> None: ...

    async def schedule_retry(self, notice: Notice, seconds: int) -> None: ...


async def _deliver_batch(store: DeliveryStore, send: Send, batch_size: int) -> int:
    attempted = 0
    for _ in range(batch_size):
        notice = await store.claim_pending()
        if notice is None:
            break
        attempted += 1
        # The claim records an uncertain attempt before making any external request.
        try:
            status = await send(notice.chat_id)
        except Exception:
            _LOG.warning("Telegram notice delivery could not be confirmed.")
            continue
        if isinstance(status, RetryAfter):
            await store.schedule_retry(notice, status.seconds)
        elif status == "sent" or status == "rejected":
            await store.record_delivery(notice, status)
    return attempted


async def run_delivery_worker(
    store: DeliveryStore,
    send: Send,
    *,
    poll_interval: float = 2.0,
    max_delay: float | None = None,
    batch_size: int = 20,
) -> None:
    if poll_interval <= 0 or batch_size <= 0:
        raise ValueError("Delivery poll interval and batch size must be positive.")

    idle_delay = poll_interval
    effective_max_delay = max(poll_interval, 10.0 if max_delay is None else max_delay)
    while True:
        try:
            attempted = await _deliver_batch(store, send, batch_size)
        except Exception:
            _LOG.warning("Telegram delivery queue could not be checked.")
            attempted = 0

        if attempted:
            idle_delay = poll_interval
        if attempted == batch_size:
            await asyncio.sleep(0)
        else:
            await asyncio.sleep(idle_delay)
            if not attempted:
                idle_delay = min(idle_delay * 2, effective_max_delay)
