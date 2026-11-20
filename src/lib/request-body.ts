type ReadFailure = { ok: false; status: 400 | 413 };

export async function readRequestText(
  request: Request, mediaType: string, maxBytes: number,
): Promise<{ ok: true; text: string } | ReadFailure> {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== mediaType || !request.body) return { ok: false, status: 400 };
  if (Number(request.headers.get('content-length')) > maxBytes) return { ok: false, status: 413 };

  const reader = request.body.getReader();
  const buffer = new Uint8Array(maxBytes);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)) };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}

export async function readRequestJson(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | ReadFailure> {
  const input = await readRequestText(request, 'application/json', maxBytes);
  if (!input.ok) return input;
  try {
    return { ok: true, body: JSON.parse(input.text) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}
