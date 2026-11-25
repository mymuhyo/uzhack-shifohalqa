import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { isSameOriginPost, readRequestText } from '../../src/lib/request-body';

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

describe('isSameOriginPost', () => {
  it('accepts direct same-origin POST requests', () => {
    const request = new NextRequest('http://127.0.0.1:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:3000',
        host: '127.0.0.1:3000',
      },
    });
    expect(isSameOriginPost(request)).toBe(true);
  });

  it('accepts HTTPS origin behind reverse proxy via x-forwarded-proto and x-forwarded-host', () => {
    const request = new NextRequest('http://internal-node:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://final-preview.shifohalqa.uz',
        host: 'internal-node:3000',
        'x-forwarded-proto': 'https, http',
        'x-forwarded-host': 'final-preview.shifohalqa.uz, internal-proxy',
      },
    });
    expect(isSameOriginPost(request)).toBe(true);
  });

  it('rejects cross-origin, missing origin, or invalid forwarded protocol', () => {
    const crossOrigin = new NextRequest('http://internal-node:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.com',
        host: 'final-preview.shifohalqa.uz',
        'x-forwarded-proto': 'https',
      },
    });
    expect(isSameOriginPost(crossOrigin)).toBe(false);

    const missingOrigin = new NextRequest('https://final-preview.shifohalqa.uz/api/auth/login', {
      method: 'POST',
      headers: { host: 'final-preview.shifohalqa.uz' },
    });
    expect(isSameOriginPost(missingOrigin)).toBe(false);

    const spoofedProto = new NextRequest('http://internal-node:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'javascript://final-preview.shifohalqa.uz',
        host: 'final-preview.shifohalqa.uz',
        'x-forwarded-proto': 'javascript',
      },
    });
    expect(isSameOriginPost(spoofedProto)).toBe(false);
  });
});
