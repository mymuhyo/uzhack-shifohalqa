import { expect, it } from 'vitest';
import { readRequestText } from '../../src/lib/request-body';

it('cancels an oversized streaming body without a Content-Length header', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
    },
    cancel() { cancelled = true; },
  });
  const request = new Request('https://example.test/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  await expect(readRequestText(request, 'application/json', 12)).resolves.toEqual({ ok: false, status: 413 });
  expect(cancelled).toBe(true);
});
