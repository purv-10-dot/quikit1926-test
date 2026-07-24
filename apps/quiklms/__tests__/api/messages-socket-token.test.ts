/**
 * GAP_REPORT §3.2 messages, break #3 — "The socket path is dead anyway. The
 * worker rejects any handshake without a token (`worker/src/sockets/messages.ts:45-52`);
 * the client never sends one — `lib/socket.ts:7` states 'socket auth token is
 * pending the centralized auth work (do not add here)'."
 *
 * The token is now minted from the CENTRALIZED session (requireAuth → NextAuth
 * SSO). The auth module itself is untouched; this route only consumes it.
 *
 * The verification below deliberately uses the WORKER's own `jwtVerify` contract
 * (jose, HS256, same secret) rather than trusting the route's own output shape —
 * a token the worker cannot verify is worthless.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jwtVerify } from 'jose';

const h = vi.hoisted(() => ({ requireAuth: vi.fn() }));

vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/env', () => ({
  env: { JWT_SECRET: 'test-secret-at-least-16-chars' },
  optionalEnv: () => '',
}));

import { Unauthorized } from '@/lib/http';
import { GET } from '@/app/api/messages/socket-token/route';

const SECRET = new TextEncoder().encode('test-secret-at-least-16-chars');
const req = () => new Request('http://x/api/messages/socket-token') as never;

beforeEach(() => {
  h.requireAuth.mockReset();
  h.requireAuth.mockResolvedValue({ id: 'u1', orgId: 'org-1', role: 'LEARNER', email: 'a@b.test' });
});

describe('GET /api/messages/socket-token', () => {
  it('mints a token the worker can actually verify', async () => {
    const res = await GET(req(), {});
    expect(res.status).toBe(200);

    const { data } = await res.json();
    // Verified exactly as worker/src/jwt.ts does it.
    const { payload } = await jwtVerify(data.token, SECRET);
    expect(payload.sub).toBe('u1');
    expect(payload.tenantId).toBe('org-1');
    expect(payload.role).toBe('LEARNER');
  });

  it('is short-lived — a leaked token must not be usable forever', async () => {
    const res = await GET(req(), {});
    const { data } = await res.json();
    const { payload } = await jwtVerify(data.token, SECRET);

    const ttl = (payload.exp as number) - (payload.iat as number);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(15 * 60);
  });

  it('mints only for the session user — never an id from the request', async () => {
    // A caller trying to impersonate someone else via query/body has no effect:
    // the subject comes from the session alone.
    const spoof = new Request('http://x/api/messages/socket-token?userId=victim') as never;
    const res = await GET(spoof, {});
    const { data } = await res.json();
    const { payload } = await jwtVerify(data.token, SECRET);
    expect(payload.sub).toBe('u1');
  });

  it('401s without a session — requireAuth is the gate', async () => {
    h.requireAuth.mockRejectedValue(Unauthorized());
    const res = await GET(req(), {});
    expect(res.status).toBe(401);
  });

  it('403s when the session carries no org, rather than minting a token the worker will reject', async () => {
    h.requireAuth.mockResolvedValue({ id: 'u1', orgId: null, role: 'LEARNER', email: 'a@b.test' });
    const res = await GET(req(), {});
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  it('is not signed with a different secret', async () => {
    const res = await GET(req(), {});
    const { data } = await res.json();
    await expect(jwtVerify(data.token, new TextEncoder().encode('a-completely-different-key'))).rejects.toThrow();
  });
});
