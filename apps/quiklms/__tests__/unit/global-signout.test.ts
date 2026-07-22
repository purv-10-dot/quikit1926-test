/**
 * Single-logout chain.
 *
 * Clearing only quiklms's cookie is NOT a logout — the centralized session
 * survives, so the next navigation SSOs the same person straight back in. A
 * real sign-out must clear cookies on three hosts: this app, the auth host, and
 * the launcher.
 *
 * WHY THIS IS A LOCAL COPY. Every other app imports `globalSignOut` from
 * `@quikit/ui`. quiklms does not depend on that package, and `@quikit/ui` has
 * no subpath export for this helper — importing it means importing the whole
 * `index.ts` barrel, which drags in tiptap, framer-motion and canvas-confetti
 * for a 40-line function. So the behaviour is duplicated deliberately, and
 * these tests pin it against the shared implementation so the two cannot drift
 * silently.
 *
 * One deliberate DIVERGENCE from `@quikit/ui`: when `NEXT_PUBLIC_QUIKIT_URL` is
 * absent, the shared version falls back to `window.location.origin` and still
 * attempts a launcher hop — which on quiklms would hit
 * `/api/auth/signout-global`, a route this app does not have, and 404 mid
 * sign-out. This version skips the hop instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('next-auth/react', () => ({ signOut: h.signOut }));

import { globalSignOut } from '@/lib/global-signout';

const ORIGIN = 'https://quikskill.vercel.app';
const AUTH = 'https://auth.example';
const QUIKIT = 'https://launcher.example';

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
    expect(decodeURIComponent(launcher.split('callbackUrl=')[1])).toBe(`${ORIGIN}/`);
  });

  it('defaults to the landing page, NOT /login', async () => {
    // /login re-initiates SSO on mount, so landing there would sign the user
    // straight back in and the logout would appear not to work.
    await globalSignOut();
    const launcher = decodeURIComponent(href.split('callbackUrl=')[1]);
    const final = decodeURIComponent(launcher.split('callbackUrl=')[1]);
    expect(final).toBe(`${ORIGIN}/`);
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
    expect(decodeURIComponent(href.split('callbackUrl=')[1])).toBe(`${ORIGIN}/`);
  });

  it('navigates straight to the destination when neither host is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_QUIKIT_URL', '');
    await globalSignOut();
    expect(href).toBe(`${ORIGIN}/`);
  });

  it('tolerates trailing slashes on the configured hosts', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', `${AUTH}/`);
    vi.stubEnv('NEXT_PUBLIC_QUIKIT_URL', `${QUIKIT}//`);
    await globalSignOut();
    expect(href).not.toContain('//api/auth');
    expect(href.startsWith(`${AUTH}/api/auth/signout-global`)).toBe(true);
  });
});
