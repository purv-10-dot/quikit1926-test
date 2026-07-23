/**
 * Single-logout chain.
 *
 * Clearing only quiklms's cookie is NOT a logout — the centralized session
 * survives, so the next navigation SSOs the same person straight back in. A
 * real sign-out must clear cookies on three hosts: this app, the auth host, and
 * the launcher.
 *
 * NO LONGER A LOCAL COPY. `lib/global-signout.ts` is now a thin adapter over
 * `@quikit/ui/global-signout` — the chain itself comes from the shared package.
 * These tests are kept unchanged on purpose: they were written against the
 * forked implementation, so they now serve as the contract proving the swap is
 * behaviour-preserving. If the adapter ever drifts from what the fork did,
 * these fail.
 *
 * Two behaviours remain the ADAPTER's own, both asserted below:
 *
 *  1. The final hop is this app's CANONICAL origin (NEXT_PUBLIC_QUIKLMS_URL),
 *     not `window.location.origin` — the signout endpoints allow-list the
 *     canonical host only.
 *
 *  2. When `NEXT_PUBLIC_QUIKIT_URL` is absent the shared helper would fall back
 *     to `window.location.origin` and aim a launcher hop at `/api/auth/
 *     signout-global`, a route this app does not have, 404ing mid sign-out. The
 *     adapter collapses the chain onto the auth host instead, and skips it
 *     entirely when neither host is configured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('next-auth/react', () => ({ signOut: h.signOut }));

import { globalSignOut } from '@/lib/global-signout';

const ORIGIN = 'https://quikskill.vercel.app';
const AUTH = 'https://auth.example';
const QUIKIT = 'https://launcher.example';
// The default post-logout destination. `?reason=logged_out` tells the landing
// page to HOLD instead of bouncing a still-settling session onward to the
// dashboard (→ middleware → quikit-auth) — the "flashes then jumps to login"
// bug. See lib/global-signout.ts + app/(marketing)/page.tsx.
const LANDING = `${ORIGIN}/?reason=logged_out`;

let href = '';

beforeEach(() => {
  h.signOut.mockReset().mockResolvedValue(undefined);
  href = '';
  vi.stubGlobal('window', {
    location: {
      get origin() {
        return ORIGIN;
      },
      set href(v: string) {
        href = v;
      },
      get href() {
        return href;
      },
    },
    localStorage: { clear: vi.fn() },
    sessionStorage: { clear: vi.fn() },
  });
  vi.stubEnv('NEXT_PUBLIC_AUTH_URL', AUTH);
  vi.stubEnv('NEXT_PUBLIC_QUIKIT_URL', QUIKIT);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the chain', () => {
  it('clears the local cookie before navigating away', async () => {
    await globalSignOut();
    expect(h.signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it('wipes browser storage so nothing bleeds into the next session', async () => {
    await globalSignOut();
    expect(window.localStorage.clear).toHaveBeenCalled();
    expect(window.sessionStorage.clear).toHaveBeenCalled();
  });

  it('visits the auth host FIRST, then the launcher, then the destination', async () => {
    await globalSignOut();
    // auth → (launcher → final) nested as callbackUrl.
    expect(href.startsWith(`${AUTH}/api/auth/signout-global?callbackUrl=`)).toBe(true);
    const launcher = decodeURIComponent(href.split('callbackUrl=')[1]);
    expect(launcher.startsWith(`${QUIKIT}/api/auth/signout-global?callbackUrl=`)).toBe(true);
    expect(decodeURIComponent(launcher.split('callbackUrl=')[1])).toBe(LANDING);
  });

  it('defaults to the landing page (held via reason=logged_out), NOT /login', async () => {
    // /login re-initiates SSO on mount, so landing there would sign the user
    // straight back in and the logout would appear not to work. The landing
    // page is held with reason=logged_out so it doesn't bounce onward either.
    await globalSignOut();
    const launcher = decodeURIComponent(href.split('callbackUrl=')[1]);
    const final = decodeURIComponent(launcher.split('callbackUrl=')[1]);
    expect(final).toBe(LANDING);
    expect(final).toContain('reason=logged_out');
    expect(final).not.toContain('/login');
  });

  it('honours an explicit destination — the invite-link switch-account case', async () => {
    await globalSignOut(`${ORIGIN}/login?email=a%40b.test`);
    const launcher = decodeURIComponent(href.split('callbackUrl=')[1]);
    expect(decodeURIComponent(launcher.split('callbackUrl=')[1])).toBe(`${ORIGIN}/login?email=a%40b.test`);
  });
});

describe('resilience', () => {
  it('still navigates when the local sign-out throws', async () => {
    // A failed cookie clear must not strand the user signed in on the IdP.
    h.signOut.mockRejectedValue(new Error('network'));
    await globalSignOut();
    expect(href).toContain('/api/auth/signout-global');
  });

  it('still navigates when storage access is blocked', async () => {
    (window.localStorage.clear as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('blocked by cookie policy');
    });
    await globalSignOut();
    expect(href).toContain('/api/auth/signout-global');
  });

  it('skips the launcher hop when the launcher url is unset, rather than 404ing on this app', async () => {
    vi.stubEnv('NEXT_PUBLIC_QUIKIT_URL', '');
    await globalSignOut();
    expect(href.startsWith(`${AUTH}/api/auth/signout-global?callbackUrl=`)).toBe(true);
    expect(decodeURIComponent(href.split('callbackUrl=')[1])).toBe(LANDING);
  });

  it('navigates straight to the destination when neither host is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_QUIKIT_URL', '');
    await globalSignOut();
    expect(href).toBe(LANDING);
  });

  it('tolerates trailing slashes on the configured hosts', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', `${AUTH}/`);
    vi.stubEnv('NEXT_PUBLIC_QUIKIT_URL', `${QUIKIT}//`);
    await globalSignOut();
    expect(href).not.toContain('//api/auth');
    expect(href.startsWith(`${AUTH}/api/auth/signout-global`)).toBe(true);
  });
});

describe('the destination is the CANONICAL origin, not wherever the browser is', () => {
  // Both signout-global endpoints allow-list `quikskill.vercel.app` and fall
  // back to their OWN root for anything else. Signing out from a per-deployment
  // host therefore landed the user on the QuikIT launcher. Verified live: that
  // callbackUrl returns `-> https://qukit-launcher.vercel.app/`.
  const DEPLOY_ORIGIN = 'https://quikskill-macck3n1x-rajkumar13.vercel.app';

  const onDeploymentHost = () => {
    vi.stubGlobal('window', {
      location: {
        get origin() { return DEPLOY_ORIGIN; },
        set href(x: string) { href = x; },
        get href() { return href; },
      },
      localStorage: { clear: vi.fn() },
      sessionStorage: { clear: vi.fn() },
    });
  };

  const finalHop = () => {
    const launcher = decodeURIComponent(href.split('callbackUrl=')[1]);
    return decodeURIComponent(launcher.split('callbackUrl=')[1]);
  };

  it('uses the canonical url even when served from a deployment host', async () => {
    onDeploymentHost();
    vi.stubEnv('NEXT_PUBLIC_QUIKLMS_URL', ORIGIN);
    await globalSignOut();
    expect(finalHop()).toBe(LANDING);
    expect(finalHop()).not.toContain('macck3n1x');
  });

  it('falls back to the live origin when no canonical url is configured (local dev)', async () => {
    onDeploymentHost();
    vi.stubEnv('NEXT_PUBLIC_QUIKLMS_URL', '');
    await globalSignOut();
    expect(finalHop()).toBe(`${DEPLOY_ORIGIN}/?reason=logged_out`);
  });

  it('tolerates a trailing slash on the canonical url', async () => {
    onDeploymentHost();
    vi.stubEnv('NEXT_PUBLIC_QUIKLMS_URL', `${ORIGIN}/`);
    await globalSignOut();
    expect(finalHop()).toBe(LANDING);
  });

  it('an explicit destination still wins', async () => {
    onDeploymentHost();
    vi.stubEnv('NEXT_PUBLIC_QUIKLMS_URL', ORIGIN);
    await globalSignOut(`${ORIGIN}/login?email=a%40b.test`);
    expect(finalHop()).toBe(`${ORIGIN}/login?email=a%40b.test`);
  });
});
