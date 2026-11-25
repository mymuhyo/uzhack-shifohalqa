import asyncio
import unittest
from collections import deque
from uuid import uuid4

from shifo_telegram.store import Notice, RetryAfter, TelegramStore, telegram_chat_id_valid, telegram_pair_code_valid
from shifo_telegram.worker import _deliver_batch, run_delivery_worker


class ValidationTests(unittest.TestCase):
    def test_pairing_code_requires_canonical_base64url(self):
        self.assertTrue(telegram_pair_code_valid("A" * 43))
        self.assertFalse(telegram_pair_code_valid("A" * 42 + "B"))
        self.assertFalse(telegram_pair_code_valid("A" * 43 + "="))
        self.assertFalse(telegram_pair_code_valid("A" * 42 + "?"))

    def test_chat_id_must_be_positive_integer_in_telegram_range(self):
        for bad_id in [True, 0, -1, 2**52, 100.0, "100"]:
            self.assertFalse(telegram_chat_id_valid(bad_id))
        self.assertTrue(telegram_chat_id_valid(2**52 - 1))


def notice(chat_id: int) -> Notice:
    return Notice(workspace_id=uuid4(), doctor_id=uuid4(), link_id=uuid4(), flag_id=uuid4(), chat_id=chat_id)


class FakeStore:
    def __init__(self, notices=()):
        self.pending = deque(notices)
        self.results = []
        self.retries = []

    async def claim_pending(self):
        return self.pending.popleft() if self.pending else None

    async def record_delivery(self, job, status):
        self.results.append((job, status))

    async def schedule_retry(self, job, seconds):
        self.retries.append((job, seconds))


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_an_invalid_scoped_claim_never_uses_the_connection_pool(self):
        store = TelegramStore("postgresql://localhost/unused")
        with self.assertRaises(ValueError):
            await store.claim_pending(chat_id=0)

    async def test_environment_identity_check_requires_non_empty_and_matching_env_id(self):
        store_empty = TelegramStore("postgresql://localhost/unused")
        with self.assertRaisesRegex(RuntimeError, "SHIFO_ENV_ID"):
            await store_empty.verify_environment_identity()

        class FakeCursor:
            def __init__(self, row):
                self._row = row

            async def fetchone(self):
                return self._row

        class FakeConnection:
            def __init__(self, row):
                self._row = row

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def execute(self, query):
                self.last_query = query
                return FakeCursor(self._row)

        class FakePool:
            def __init__(self, row):
                self._row = row

            def connection(self):
                return FakeConnection(self._row)

        store_mismatch = TelegramStore("postgresql://localhost/unused", expected_env_id="final-preview")
        store_mismatch._pool = FakePool(("production-main",))
        with self.assertRaisesRegex(RuntimeError, "mismatch"):
            await store_mismatch.verify_environment_identity()

        store_ok = TelegramStore("postgresql://localhost/unused", expected_env_id="final-preview")
        store_ok._pool = FakePool(("final-preview",))
        await store_ok.verify_environment_identity()

    async def test_batches_do_not_retry_ambiguous_results(self):
        sent, unknown, failed, rejected = (notice(i) for i in range(1, 5))
        store = FakeStore([sent, unknown, failed, rejected])
        calls = []

        async def sender(chat_id):
            calls.append(chat_id)
            if chat_id == failed.chat_id:
                raise TimeoutError()
            return {sent.chat_id: "sent", unknown.chat_id: "unknown", rejected.chat_id: "rejected"}[chat_id]

        self.assertEqual(await _deliver_batch(store, sender, 2), 2)
        self.assertEqual(await _deliver_batch(store, sender, 10), 2)
        self.assertEqual(await _deliver_batch(store, sender, 10), 0)
        self.assertEqual(calls, [1, 2, 3, 4])
        self.assertEqual(store.results, [(sent, "sent"), (rejected, "rejected")])
        self.assertEqual(store.retries, [])

    async def test_provider_delay_is_persisted_without_delaying_other_jobs(self):
        throttled, sent = notice(1), notice(2)
        store = FakeStore([throttled, sent])

        async def sender(chat_id):
            return RetryAfter(17) if chat_id == throttled.chat_id else "sent"

        self.assertEqual(await _deliver_batch(store, sender, 10), 2)
        self.assertEqual(store.retries, [(throttled, 17)])
        self.assertEqual(store.results, [(sent, "sent")])

    async def test_worker_can_stop_without_waiting_for_another_poll(self):
        sent = notice(1)
        store = FakeStore([sent])
        delivery_started = asyncio.Event()

        async def sender(chat_id):
            self.assertEqual(chat_id, sent.chat_id)
            delivery_started.set()
            return "sent"

        task = asyncio.create_task(run_delivery_worker(store, sender, poll_interval=30))
        try:
            await asyncio.wait_for(delivery_started.wait(), timeout=1)
        finally:
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertEqual(store.results, [(sent, "sent")])
