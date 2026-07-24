/**
 * `GET /api/apps/switcher` — backs the topbar app switcher.
 *
 * Replaces `/api/me/apps`. That endpoint read `UserAppAccess` and nothing else,
 * so it applied ONE of the launcher's five visibility clauses. The clause tests
 * below pin the four it was missing; the url-resolution tests are ported
 * verbatim from the old suite because those behaviours were correct and are
 * worth not regressing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  appFindMany: vi.fn(),
  orgAppAccessFindMany: vi.fn(),
  userAppAccessFindMany: vi.fn(),
  orgMemberFindFirst: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    app: { findMany: h.appFindMany },
    orgAppAccess: { findMany: h.orgAppAccessFindMany },
    userAppAccess: { findMany: h.userAppAccessFindMany },
    orgMember: { findFirst: h.orgMemberFindFirst },
  },
}));

import { GET } from '@/app/api/apps/switcher/route';

const app = (
  slug: string,
  name: string,
  extra: { baseUrl?: string | null; requiresOrgAdmin?: boolean } = {},
) => ({
  id: `app-${slug}`,
  name,
  slug,
  description: null,
  iconUrl: null,
  baseUrl: extra.baseUrl === undefined ? `https://${slug}.example` : extra.baseUrl,
  status: 'active',
  requiresOrgAdmin: extra.requiresOrgAdmin ?? false,
});

const session = (over: Record<string, unknown> = {}) => ({
  user: { id: 'u1', orgId: 'org-1', membershipRole: 'member', isSuperAdmin: false, ...over },
});

const body = async () => (await GET()).json();
const slugs = (b: { data: { slug: string }[] }) => b.data.map((a) => a.slug);

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.getServerSession.mockResolvedValue(session());
  h.appFindMany.mockResolvedValue([]);
  h.orgAppAccessFindMany.mockResolvedValue([]);
  h.userAppAccessFindMany.mockResolvedValue([]);
  h.orgMemberFindFirst.mockResolvedValue(null);
});

describe('authentication', () => {
  it('401s an unauthenticated caller', async () => {
    h.getServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('returns an empty list when the user has no org, rather than every app', async () => {
    h.getServerSession.mockResolvedValue(session({ orgId: null }));
    expect((await body()).data).toEqual([]);
    expect(h.appFindMany).not.toHaveBeenCalled();
  });
});

describe('visibility clause 1 — OrgAppAccess.enabled', () => {
  it('hides an app the org was never granted, even with a per-user row', async () => {
    // The exact hole in /api/me/apps: it saw the UserAppAccess row and listed
    // the app regardless of whether the org had it enabled.
    h.appFindMany.mockResolvedValue([app('quikscale', 'QuikScale')]);
    h.orgAppAccessFindMany.mockResolvedValue([]); // org has NOT enabled it
    h.userAppAccessFindMany.mockResolvedValue([{ appId: 'app-quikscale' }]);

    expect((await body()).data).toEqual([]);
  });

  it('shows it once the org enables it', async () => {
    h.appFindMany.mockResolvedValue([app('quikscale', 'QuikScale')]);
    h.orgAppAccessFindMany.mockResolvedValue([{ appId: 'app-quikscale' }]);
    h.userAppAccessFindMany.mockResolvedValue([{ appId: 'app-quikscale' }]);

    expect(slugs(await body())).toEqual(['quikscale']);
  });
});

describe('visibility clause 2 — requiresOrgAdmin', () => {
  beforeEach(() => {
    h.appFindMany.mockResolvedValue([app('admin', 'Admin Portal', { requiresOrgAdmin: true })]);
    h.orgAppAccessFindMany.mockResolvedValue([{ appId: 'app-admin' }]);
    h.userAppAccessFindMany.mockResolvedValue([{ appId: 'app-admin' }]);
  });

  it('hides an admin-tier app from an ordinary member', async () => {
    expect((await body()).data).toEqual([]);
  });

  it('shows it to an org admin', async () => {
    h.getServerSession.mockResolvedValue(session({ membershipRole: 'org_admin' }));
    expect(slugs(await body())).toEqual(['admin']);
  });
});

describe('visibility clause 3 — the admin bypass', () => {
  beforeEach(() => {
    h.appFindMany.mockResolvedValue([app('quikscale', 'QuikScale')]);
    h.orgAppAccessFindMany.mockResolvedValue([{ appId: 'app-quikscale' }]);
    h.userAppAccessFindMany.mockResolvedValue([]); // no per-user grant
  });

  it('shows org-level apps to an org admin who holds NO per-user row', async () => {
    // The user-visible symptom of the old endpoint: admins are provisioned at
    // the org level only, so a UserAppAccess-only query showed them an empty
    // switcher.
    h.getServerSession.mockResolvedValue(session({ membershipRole: 'org_admin' }));
    expect(slugs(await body())).toEqual(['quikscale']);
  });

  it('shows them to a super admin too', async () => {
    h.getServerSession.mockResolvedValue(session({ isSuperAdmin: true }));
    expect(slugs(await body())).toEqual(['quikscale']);
  });

  it('still hides them from an ordinary member with no per-user row', async () => {
    expect((await body()).data).toEqual([]);
  });
});

describe('visibility clause 4 — catalog exclusions', () => {
  it('excludes the launcher and hidden slugs at the query level', async () => {
    await GET();
    const where = h.appFindMany.mock.calls[0][0].where;
    expect(where.slug.notIn).toEqual(expect.arrayContaining(['quikit', 'quikvc', 'quiksocial']));
    expect(where.status).toEqual({ not: 'disabled' });
  });
});

describe('url resolution', () => {
  const grant = (slug: string, name: string, baseUrl?: string | null) => {
    h.appFindMany.mockResolvedValue([app(slug, name, { baseUrl })]);
    h.orgAppAccessFindMany.mockResolvedValue([{ appId: `app-${slug}` }]);
    h.userAppAccessFindMany.mockResolvedValue([{ appId: `app-${slug}` }]);
  };

  it('strips a trailing slash so the url does not double up', async () => {
    grant('quikcrm', 'QuikCRM', 'https://crm.example/');
    expect((await body()).data[0].baseUrl).toBe('https://crm.example');
  });

  it('falls back to localhost for a known app in dev, never to production', async () => {
    grant('quikscale', 'QuikScale', null);
    expect((await body()).data[0].baseUrl).toBe('http://localhost:3003');
  });

  it('has a dev fallback for quikfinance, which the old map omitted', async () => {
    grant('quikfinance', 'QuikFinance', null);
    expect((await body()).data[0].baseUrl).toBe('http://localhost:3013');
  });

  it('drops an app with no resolvable url — it would be a dead menu item', async () => {
    grant('someunknownapp', 'Unknown App', null);
    expect((await body()).data).toEqual([]);
  });

  it('keeps the CURRENT app even without a url — it is never navigated to', async () => {
    grant('quiklms', 'QuikLMS', null);
    const b = await body();
    expect(b.data).toHaveLength(1);
    expect(b.data[0].current).toBe(true);
  });

  it('flags this app as current and others as not', async () => {
    h.appFindMany.mockResolvedValue([app('quiklms', 'QuikLMS'), app('quikscale', 'QuikScale')]);
    h.orgAppAccessFindMany.mockResolvedValue([{ appId: 'app-quiklms' }, { appId: 'app-quikscale' }]);
    h.userAppAccessFindMany.mockResolvedValue([{ appId: 'app-quiklms' }, { appId: 'app-quikscale' }]);

    const b = await body();
    expect(b.data.find((a: { slug: string }) => a.slug === 'quiklms').current).toBe(true);
    expect(b.data.find((a: { slug: string }) => a.slug === 'quikscale').current).toBe(false);
  });
});

describe('production never links at localhost', () => {
  // The live `quikit.App` table holds localhost baseUrls for several apps. A
  // production build must not surface those — the user would be sent to their
  // own machine. Ported from the /api/me/apps suite.
  const withProd = async (fn: () => Promise<void>) => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await fn();
    } finally {
      vi.unstubAllEnvs();
    }
  };
  const grant = (slug: string, name: string, baseUrl: string | null) => {
    h.appFindMany.mockResolvedValue([app(slug, name, { baseUrl })]);
    h.orgAppAccessFindMany.mockResolvedValue([{ appId: `app-${slug}` }]);
    h.userAppAccessFindMany.mockResolvedValue([{ appId: `app-${slug}` }]);
  };

  it('drops an app whose stored url is localhost', async () => {
    await withProd(async () => {
      grant('quikscale', 'QuikScale', 'http://localhost:3003');
      expect((await body()).data).toEqual([]);
    });
  });

  it('drops 127.0.0.1 too', async () => {
    await withProd(async () => {
      grant('quikcrm', 'QuikCRM', 'http://127.0.0.1:3008');
      expect((await body()).data).toEqual([]);
    });
  });

  it('keeps a real production url', async () => {
    await withProd(async () => {
      grant('quikhrms', 'QuikHrms', 'https://people.quikit.ai');
      expect((await body()).data[0].baseUrl).toBe('https://people.quikit.ai');
    });
  });

  it('does not mistake a hostname merely CONTAINING localhost', async () => {
    await withProd(async () => {
      grant('quikinfra', 'QuikInfra', 'https://localhost-infra.quikit.ai');
      expect((await body()).data[0].baseUrl).toBe('https://localhost-infra.quikit.ai');
    });
  });
});
