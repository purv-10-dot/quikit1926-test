/**
 * `GET /api/me/apps` — backs the topbar app switcher.
 *
 * The security property that matters: the menu is built from
 * `quikit.UserAppAccess`, the platform's real grant table, scoped to
 * (userId, orgId). It must never list an app the user was not granted, and
 * never leak apps from another org the user also belongs to. Inferring the list
 * from roles, or listing every App row, would turn a convenience menu into a
 * discovery surface.
 *
 * `AuthUser.id` is the platform `User.id` and `AuthUser.orgId` the platform
 * `Org.id` — verified against live data (UserAppAccess.userId joins
 * app_quiklms.users.id), which is why this can query the grant table directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ requireAuth: vi.fn(), findMany: vi.fn() }));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { DATABASE_URL: 'x' } }));
vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/prisma', () => ({ prisma: { userAppAccess: { findMany: h.findMany } } }));

import { GET } from '@/app/api/me/apps/route';

const req = () => new Request('http://x/api/me/apps') as never;
const grant = (slug: string, name: string, baseUrl: string | null = `https://${slug}.example`) => ({
  role: 'member',
  app: { id: `app-${slug}`, name, slug, baseUrl, iconUrl: null },
});

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue({ id: 'u1', orgId: 'org-1', role: 'LEARNER' });
  h.findMany.mockResolvedValue([]);
});

describe('scoping — the switcher only shows granted apps', () => {
  it('queries grants for THIS user in THIS org', async () => {
    await GET(req(), {});
    expect(h.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1', orgId: 'org-1' });
  });

  it('returns only the granted apps', async () => {
    h.findMany.mockResolvedValue([grant('quikscale', 'QuikScale'), grant('quikcrm', 'QuikCRM')]);
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps.map((a: { slug: string }) => a.slug)).toEqual(['quikcrm', 'quikscale']);
  });

  it('returns an empty list when the user has no org rather than every app', async () => {
    h.requireAuth.mockResolvedValue({ id: 'u1', orgId: null, role: 'LEARNER' });
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps).toEqual([]);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty list when nothing is granted', async () => {
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps).toEqual([]);
  });
});

describe('shaping', () => {
  it('flags this app as current instead of hiding it', async () => {
    h.findMany.mockResolvedValue([grant('quiklms', 'QuikLMS'), grant('quikscale', 'QuikScale')]);
    const body = await (await GET(req(), {})).json();
    const self = body.data.apps.find((a: { slug: string }) => a.slug === 'quiklms');
    expect(self.current).toBe(true);
    expect(body.data.apps.find((a: { slug: string }) => a.slug === 'quikscale').current).toBe(false);
  });

  it('drops an app with no resolvable url — it would be a dead menu item', async () => {
    // A slug with no env override AND no dev-localhost fallback. (Known slugs
    // like `quikscale` DO get a localhost fallback outside production, which is
    // deliberate — otherwise local dev would link at production.)
    h.findMany.mockResolvedValue([grant('someunknownapp', 'Unknown App', null)]);
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps).toEqual([]);
  });

  it('falls back to localhost for a known app in dev, never to production', async () => {
    h.findMany.mockResolvedValue([grant('quikscale', 'QuikScale', null)]);
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps[0].url).toBe('http://localhost:3003');
  });

  it('keeps the CURRENT app even without a url — it is never navigated to', async () => {
    h.findMany.mockResolvedValue([grant('quiklms', 'QuikLMS', null)]);
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps).toHaveLength(1);
    expect(body.data.apps[0].current).toBe(true);
  });

  it('strips a trailing slash so the url does not double up', async () => {
    h.findMany.mockResolvedValue([grant('quikcrm', 'QuikCRM', 'https://crm.example/')]);
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps[0].url).toBe('https://crm.example');
  });

  it('sorts by name for a stable menu order', async () => {
    h.findMany.mockResolvedValue([
      grant('quiktrack', 'QuikTrack'),
      grant('quikcrm', 'QuikCRM'),
      grant('quikhrms', 'QuikHrms'),
    ]);
    const body = await (await GET(req(), {})).json();
    expect(body.data.apps.map((a: { name: string }) => a.name)).toEqual(['QuikCRM', 'QuikHrms', 'QuikTrack']);
  });
});

describe('production never links at localhost', () => {
  // The live `quikit.App` table holds localhost baseUrls for several apps
  // (quikscale, quikcrm, quikinfra, quiktrack). A production build must not
  // surface those — the user would be sent to their own machine.
  const withProd = async (fn: () => Promise<void>) => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await fn();
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it('drops an app whose stored url is localhost', async () => {
    await withProd(async () => {
      h.findMany.mockResolvedValue([grant('quikscale', 'QuikScale', 'http://localhost:3003')]);
      const body = await (await GET(req(), {})).json();
      expect(body.data.apps).toEqual([]);
    });
  });

  it('drops 127.0.0.1 too', async () => {
    await withProd(async () => {
      h.findMany.mockResolvedValue([grant('quikcrm', 'QuikCRM', 'http://127.0.0.1:3008')]);
      const body = await (await GET(req(), {})).json();
      expect(body.data.apps).toEqual([]);
    });
  });

  it('keeps a real production url', async () => {
    await withProd(async () => {
      h.findMany.mockResolvedValue([grant('quikhrms', 'QuikHrms', 'https://people.quikit.ai')]);
      const body = await (await GET(req(), {})).json();
      expect(body.data.apps[0].url).toBe('https://people.quikit.ai');
    });
  });

  it('does not mistake a hostname merely CONTAINING localhost', async () => {
    await withProd(async () => {
      h.findMany.mockResolvedValue([grant('quikvc', 'QuikVC', 'https://localhost-vc.quikit.ai')]);
      const body = await (await GET(req(), {})).json();
      expect(body.data.apps[0].url).toBe('https://localhost-vc.quikit.ai');
    });
  });
});
