/**
 * GAP_REPORT §3.2 meetings — "The Zoom webhook is still unauthenticated and
 * unsigned... Combined with findFirst({ where: { externalMeetingId } }) having
 * no orgId, an unauthenticated caller can drive meeting.ended and set
 * recordingUrls on any tenant's meeting. The migration was the moment to add
 * signature verification; it did not."
 *
 * Signature verification is BUILT here, not ported — the original checked
 * nothing. These tests are the control: they must fail the moment verification
 * is weakened, because the endpoint is public by construction and the HMAC is
 * the only thing standing between the internet and every tenant's meetings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

const h = vi.hoisted(() => ({ handleZoomWebhook: vi.fn() }));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/services/meetings-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/services/meetings-service');
  return { ...actual, handleZoomWebhook: h.handleZoomWebhook };
});

vi.mock('@/lib/db', () => ({ db: {} }));

import { POST } from '@/app/api/meetings/webhook/zoom/route';
import { verifyZoomWebhookSignature } from '@/lib/services/meetings-service';

const SECRET = 'zoom-webhook-secret';

function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  return `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
}

function req(body: unknown, opts: { signature?: string | null; timestamp?: string | null } = {}) {
  const raw = JSON.stringify(body);
  const timestamp = opts.timestamp === undefined ? String(Date.now()) : opts.timestamp;
  const signature = opts.signature === undefined ? sign(raw, timestamp as string) : opts.signature;
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('x-zm-signature', signature);
  if (timestamp) headers.set('x-zm-request-timestamp', timestamp);
  return new Request('http://x/api/meetings/webhook/zoom', { method: 'POST', headers, body: raw }) as never;
}

const ENDED = { event: 'meeting.ended', payload: { object: { id: '999' } } };

beforeEach(() => {
  h.handleZoomWebhook.mockReset();
  h.handleZoomWebhook.mockResolvedValue({ received: true });
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = SECRET;
});
afterEach(() => {
  delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
});

describe('POST /api/meetings/webhook/zoom — signature is the authentication', () => {
  it('accepts a correctly signed event', async () => {
    const res = await POST(req(ENDED), {});
    expect(res.status).toBe(200);
    expect(h.handleZoomWebhook).toHaveBeenCalledWith('meeting.ended', { object: { id: '999' } });
  });

  it('REJECTS an unsigned event — this is the hole that let anyone end any meeting', async () => {
    const res = await POST(req(ENDED, { signature: null }), {});
    expect(res.status).toBe(401);
    expect(h.handleZoomWebhook).not.toHaveBeenCalled();
  });

  it('rejects a forged signature', async () => {
    const res = await POST(req(ENDED, { signature: 'v0=deadbeef' }), {});
    expect(res.status).toBe(401);
    expect(h.handleZoomWebhook).not.toHaveBeenCalled();
  });

  it('rejects a signature made with the wrong secret', async () => {
    const raw = JSON.stringify(ENDED);
    const ts = String(Date.now());
    const res = await POST(req(ENDED, { timestamp: ts, signature: sign(raw, ts, 'attacker-secret') }), {});
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature replayed over a TAMPERED body', async () => {
    // Signature computed for the real body, then the body swapped — the classic
    // attack a naive "is the header present" check would wave through.
    const realRaw = JSON.stringify(ENDED);
    const ts = String(Date.now());
    const signature = sign(realRaw, ts);
    const tampered = JSON.stringify({ event: 'meeting.ended', payload: { object: { id: 'VICTIM-MEETING' } } });

    const r = new Request('http://x/api/meetings/webhook/zoom', {
      method: 'POST',
      headers: { 'x-zm-signature': signature, 'x-zm-request-timestamp': ts },
      body: tampered,
    }) as never;

    expect((await POST(r, {})).status).toBe(401);
    expect(h.handleZoomWebhook).not.toHaveBeenCalled();
  });

  it('rejects a stale event — replay protection', async () => {
    const old = String(Date.now() - 10 * 60_000);
    const res = await POST(req(ENDED, { timestamp: old }), {});
    expect(res.status).toBe(401);
  });

  it('rejects when no timestamp header is sent', async () => {
    const res = await POST(req(ENDED, { timestamp: null }), {});
    expect(res.status).toBe(401);
  });

  it('FAILS CLOSED when no webhook secret is configured', async () => {
    delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    const res = await POST(req(ENDED), {});
    expect(res.status).toBe(401);
    expect(h.handleZoomWebhook).not.toHaveBeenCalled();
  });

  it('answers the url_validation challenge — but only when signed', async () => {
    const body = { event: 'endpoint.url_validation', payload: { plainToken: 'abc123' } };
    const res = await POST(req(body), {});
    expect(res.status).toBe(200);

    const out = await res.json();
    expect(out.plainToken).toBe('abc123');
    expect(out.encryptedToken).toBe(createHmac('sha256', SECRET).update('abc123').digest('hex'));
  });

  it('rejects an unsigned url_validation challenge', async () => {
    const body = { event: 'endpoint.url_validation', payload: { plainToken: 'abc123' } };
    expect((await POST(req(body, { signature: null }), {})).status).toBe(401);
  });

  it('400s a signed but malformed body', async () => {
    const raw = 'not json';
    const ts = String(Date.now());
    const r = new Request('http://x/api/meetings/webhook/zoom', {
      method: 'POST',
      headers: { 'x-zm-signature': sign(raw, ts), 'x-zm-request-timestamp': ts },
      body: raw,
    }) as never;
    expect((await POST(r, {})).status).toBe(400);
  });
});

describe('verifyZoomWebhookSignature', () => {
  const raw = '{"event":"x"}';

  it('verifies Zoom’s documented v0:{timestamp}:{body} scheme', () => {
    const ts = String(Date.now());
    expect(verifyZoomWebhookSignature(raw, sign(raw, ts), ts)).toBe(true);
  });

  it('is false for a non-numeric timestamp', () => {
    expect(verifyZoomWebhookSignature(raw, sign(raw, 'abc'), 'abc')).toBe(false);
  });

  it('accepts a timestamp inside the 5-minute window', () => {
    const now = Date.now();
    const ts = String(now - 4 * 60_000);
    expect(verifyZoomWebhookSignature(raw, sign(raw, ts), ts, now)).toBe(true);
  });

  it('rejects one outside it', () => {
    const now = Date.now();
    const ts = String(now - 6 * 60_000);
    expect(verifyZoomWebhookSignature(raw, sign(raw, ts), ts, now)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on length mismatch — the guard must catch it first.
    const ts = String(Date.now());
    expect(() => verifyZoomWebhookSignature(raw, 'v0=short', ts)).not.toThrow();
    expect(verifyZoomWebhookSignature(raw, 'v0=short', ts)).toBe(false);
  });
});
