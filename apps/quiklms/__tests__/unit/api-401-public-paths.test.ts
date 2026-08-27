/**
 * `lib/api.ts` — the 401 → /login hard nav, and which routes are exempt.
 *
 * REGRESSION GUARD for the "sign out flashes the QuikLMS landing then jumps
 * to the QuikIT login page" bug.
 *
 * The server side of logout was never wrong: `globalSignOut` lands the user on
 * `/?reason=logged_out` and the marketing page HOLDS there instead of bouncing
 * an authenticated visitor onward (app/(marketing)/page.tsx). What broke it was
 * the client. The root providers hydrate identity/branding/features on mount —
 * `/api/me`, `/api/tenants/current`, `/api/tenants/current/features` — all three
 * `requireAuth`-guarded, all three 401 for the person who just signed out. This
 * module turns a 401 into `window.location.href = '/login'`, and `/login`
 * re-initiates SSO on mount, so the landing page bounced straight into
 * quikit-auth about a second after rendering. Role-independent: none of those
 * three endpoints look at role, which is why it reproduced for every role.
 *
 * Two things now stop it, and both are asserted here:
 *   1. `/` is in PUBLIC_PATHS — a 401 there is the expected answer for a
 *      signed-out visitor, not a dead session.
 *   2. app/providers.tsx only fires the three fetches once `useSession()`
 *      reports `authenticated`, so the landing makes no doomed requests at all.
 *      (Covered by the provider's own gate, not reachable from this module.)
 *
 * The protection that must NOT regress in the other direction: a 401 on a real
 * app route still has to bounce to /login, or a revoked session would sit on a
 * dashboard firing failing XHRs forever. Both directions are asserted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { api } from '@/lib/api';

let href = '';
let pathname = '/';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  href = '';
  pathname = '/';
  vi.stubGlobal('window', {
    location: {
      get pathname() {
        return pathname;
      },
      set href(v: string) {
        href = v;
      },
      get href() {
        return href;
      },
    },
    localStorage: { removeItem: vi.fn() },
  });
  vi.stubGlobal('localStorage', { removeItem: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('401 on a public route', () => {
  it('does NOT redirect from the landing page — this is the logout bug', async () => {
    pathname = '/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Not authenticated.' })));

    // The signed-out landing fires exactly these three on mount.
    await expect(api.get('/me')).rejects.toBeTruthy();
    await expect(api.get('/tenants/current')).rejects.toBeTruthy();
    await expect(api.get('/tenants/current/features')).rejects.toBeTruthy();

    // Before the fix this was '/login', which SSOs the user back into
    // quikit-auth and makes sign-out look broken.
    expect(href).toBe('');
  });

  it('still does not redirect on the other public routes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Not authenticated.' })));

    for (const p of ['/login', '/verify-certificate', '/design']) {
      pathname = p;
      await expect(api.get('/me')).rejects.toBeTruthy();
      expect(href).toBe('');
    }
  });

  it('exempts nested public paths but not lookalikes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Not authenticated.' })));

    // `/verify-certificate/<id>` is the public verification page.
    pathname = '/verify-certificate/abc123';
    await expect(api.get('/certificates/abc123')).rejects.toBeTruthy();
    expect(href).toBe('');

    // `/` must match the ROOT ONLY. A prefix match would exempt every route in
    // the app and leave revoked sessions stranded — the reason the matcher is
    // `p === x || p.startsWith(`${x}/`)` rather than a bare startsWith.
    pathname = '/logins-are-not-public';
    await api.get('/me');
    expect(href).toBe('/login');
  });
});

describe('401 on an app route', () => {
  it('still hard-navigates to /login so a revoked session re-authenticates', async () => {
    pathname = '/learner/dashboard';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Not authenticated.' })));

    await api.get('/me');

    expect(href).toBe('/login');
  });
});

describe('non-401 responses', () => {
  it('never redirects on a 403 — the app-access gate depends on this', async () => {
    // The entitlement gate throws 403, never 401, precisely so it can bounce
    // the user to `/?reason=no_app_access` without this handler racing it to
    // /login. See lib/auth/context.ts.
    pathname = '/learner/dashboard';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { message: 'No access to this app.' })));

    await expect(api.get('/me')).rejects.toBeTruthy();
    expect(href).toBe('');
  });

  it('returns the payload on success', async () => {
    pathname = '/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { data: { id: 'u1' } })));

    await expect(api.get('/me')).resolves.toEqual({ data: { id: 'u1' } });
    expect(href).toBe('');
  });
});
