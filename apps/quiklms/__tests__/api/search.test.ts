/**
 * `GET /api/search` — the global nav-bar type-ahead.
 *
 * The route is authenticated but not role-gated, so the ENTIRE access decision
 * lives in `lib/services/search-service.ts`. These tests pin that decision, in
 * three parts:
 *
 *  1. org scoping — every query an actor triggers carries their `orgId`, and a
 *     hit from another org can never be reached (the cross-tenant requirement in
 *     apps/quiklms/CLAUDE.md §4);
 *  2. section gating — a learner never queries the people or batch tables at
 *     all, so a learner cannot enumerate the staff directory through the search
 *     box, and a manager only ever sees their own reports;
 *  3. the hrefs, because they are the whole point of the endpoint: the client
 *     navigates wherever the server says, so a wrong href sends a school admin
 *     to a corporate page.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  courseFindMany: vi.fn(),
  masterCourseFindMany: vi.fn(),
  userFindMany: vi.fn(),
  batchFindMany: vi.fn(),
  assignmentFindMany: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  // Mirrors the real helper (lib/auth/context.ts): `undefined` — meaning every
  // org — for the platform operator claim ONLY, never for a role.
  orgScope: (u: { isSuperAdmin?: boolean; orgId?: string | null }) =>
    (u.isSuperAdmin === true ? undefined : u.orgId ?? undefined),
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsCourse: { findMany: h.courseFindMany },
    lmsMasterCourse: { findMany: h.masterCourseFindMany },
    lmsUser: { findMany: h.userFindMany },
    lmsBatch: { findMany: h.batchFindMany },
    lmsCourseAssignment: { findMany: h.assignmentFindMany },
  },
}));

import { Unauthorized } from '@/lib/http';
import { GET } from '@/app/api/search/route';

type Actor = {
  id: string;
  role: string;
  orgId: string | null;
  tenantType: 'corporate' | 'school' | null;
  isSuperAdmin?: boolean;
};

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 'u1',
  role: 'TENANT_ADMIN',
  orgId: 'org-1',
  tenantType: 'corporate',
  isSuperAdmin: false,
  ...over,
});

const call = (q = 'ada') =>
  GET(new Request(`http://lms.test/api/search?q=${encodeURIComponent(q)}`) as never, {} as never);

const hits = async (q = 'ada') => (await (await call(q)).json()).data as {
  type: string; id: string; label: string; sub: string | null; href: string;
}[];

/** Every `where` the mocked client was handed, across all five tables. */
const allWheres = () =>
  [h.courseFindMany, h.masterCourseFindMany, h.userFindMany, h.batchFindMany, h.assignmentFindMany]
    .flatMap((fn) => fn.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> })?.where ?? {}));

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(actor());
  h.courseFindMany.mockResolvedValue([]);
  h.masterCourseFindMany.mockResolvedValue([]);
  h.userFindMany.mockResolvedValue([]);
  h.batchFindMany.mockResolvedValue([]);
  h.assignmentFindMany.mockResolvedValue([]);
});

describe('authentication', () => {
  it('401s an unauthenticated caller', async () => {
    h.requireAuth.mockRejectedValue(Unauthorized('Not authenticated.'));
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });
});

describe('query floor', () => {
  it('returns nothing and touches no table for a one-character query', async () => {
    expect(await hits('a')).toEqual([]);
    expect(h.courseFindMany).not.toHaveBeenCalled();
    expect(h.userFindMany).not.toHaveBeenCalled();
  });

  it('ignores surrounding whitespace when applying the floor', async () => {
    expect(await hits('  a  ')).toEqual([]);
    expect(h.courseFindMany).not.toHaveBeenCalled();
  });
});

describe('org scoping', () => {
  it('scopes every query to the caller org', async () => {
    await hits();
    const wheres = allWheres();
    expect(wheres.length).toBeGreaterThan(0);
    // The master-course clause scopes through its join rows rather than a
    // column, so accept either shape — but never an unscoped where.
    for (const w of wheres) {
      const scoped =
        w.orgId === 'org-1' ||
        JSON.stringify(w.OR ?? '').includes('org-1') ||
        JSON.stringify(w).includes('org-1');
      expect(scoped).toBe(true);
    }
  });

  it('never returns a row belonging to another org — the DB filter is the gate', async () => {
    // A cross-org row can only come back if the where was not scoped, so assert
    // on the filter the service built rather than on a hand-filtered result.
    h.requireAuth.mockResolvedValue(actor({ orgId: 'org-2' }));
    await hits();
    expect(h.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 'org-2' }) }),
    );
  });

  it('drops the org filter only for the platform-operator claim', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'ADMIN', isSuperAdmin: true, orgId: null }));
    await hits();
    expect(h.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ orgId: expect.anything() }) }),
    );
  });

  it('does NOT unscope for an LMS role of ADMIN without the platform claim', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'ADMIN', isSuperAdmin: false }));
    await hits();
    expect(h.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 'org-1' }) }),
    );
  });
});

describe('section gating by role', () => {
  it('gives an admin courses, people and (school only) batches', async () => {
    h.requireAuth.mockResolvedValue(actor({ tenantType: 'school' }));
    await hits();
    expect(h.courseFindMany).toHaveBeenCalled();
    expect(h.userFindMany).toHaveBeenCalled();
    expect(h.batchFindMany).toHaveBeenCalled();
  });

  it('skips batches for a corporate tenant — the feature is off there', async () => {
    await hits();
    expect(h.batchFindMany).not.toHaveBeenCalled();
  });

  it('never lets a learner reach the people or batch tables', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'LEARNER' }));
    await hits();
    expect(h.userFindMany).not.toHaveBeenCalled();
    expect(h.batchFindMany).not.toHaveBeenCalled();
  });

  it('searches only a learner ASSIGNED courses, not the org catalogue', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'LEARNER' }));
    h.assignmentFindMany.mockResolvedValue([{ courseId: 'c1' }, { courseId: 'c1' }]);
    h.masterCourseFindMany.mockResolvedValue([{ id: 'c1', title: 'Ada 101', category: 'Basics' }]);

    const out = await hits();

    expect(h.assignmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 'org-1', targetType: 'USER', targetId: 'u1' }) }),
    );
    // The title query is confined to the ids the learner was assigned.
    expect(h.masterCourseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['c1'] } }) }),
    );
    // `toMatchObject`, not `toEqual`: `json()` aliases `id` to `_id` on every
    // object it serialises (lib/http.ts) — a legacy-client compatibility shim
    // that is additive and not this endpoint's contract.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject(
      { type: 'course', id: 'c1', label: 'Ada 101', sub: 'Basics', href: '/learner/course/c1' },
    );
  });

  it('returns nothing at all for a learner with no assignments', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'LEARNER' }));
    h.assignmentFindMany.mockResolvedValue([]);
    expect(await hits()).toEqual([]);
    expect(h.masterCourseFindMany).not.toHaveBeenCalled();
  });

  it('limits a manager people search to their own reports', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'MANAGER', id: 'mgr-1' }));
    await hits();
    expect(h.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ managerId: 'mgr-1' }) }),
    );
  });

  it('limits a teacher batch search to the classes they teach, and gives them no people', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'TEACHER', id: 'tch-1', tenantType: 'school' }));
    await hits();
    expect(h.batchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ teacherId: 'tch-1' }) }),
    );
    expect(h.userFindMany).not.toHaveBeenCalled();
    expect(h.courseFindMany).not.toHaveBeenCalled();
  });

  it('returns nothing for a parent', async () => {
    h.requireAuth.mockResolvedValue(actor({ role: 'PARENT' }));
    expect(await hits()).toEqual([]);
  });

  it('keeps teachers and parents out of a corporate people search', async () => {
    await hits();
    expect(h.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ role: { notIn: ['TEACHER', 'PARENT'] } }) }),
    );
  });
});

describe('hit shape', () => {
  it('routes a school admin to the per-role directory page', async () => {
    h.requireAuth.mockResolvedValue(actor({ tenantType: 'school' }));
    h.userFindMany.mockResolvedValue([
      { id: 's1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@school.test', role: 'LEARNER' },
      { id: 't1', firstName: 'Adam', lastName: 'Smith', email: 'adam@school.test', role: 'TEACHER' },
    ]);

    const out = await hits();
    expect(out.map((x) => x.href)).toEqual(['/students', '/teachers']);
    expect(out[0]).toMatchObject({ type: 'user', label: 'Ada Lovelace', sub: 'Learner · ada@school.test' });
  });

  it('routes a corporate admin to the single directory page', async () => {
    h.userFindMany.mockResolvedValue([
      { id: 's1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@corp.test', role: 'LEARNER' },
    ]);
    expect((await hits())[0].href).toBe('/user-management');
  });

  it('splits a two-word query across first and last name', async () => {
    await hits('ada lovelace');
    const where = h.userFindMany.mock.calls[0][0].where as { AND?: unknown[] };
    expect(where.AND).toEqual([
      { firstName: { contains: 'ada', mode: 'insensitive' } },
      { lastName: { contains: 'lovelace', mode: 'insensitive' } },
    ]);
  });

  it('de-duplicates a course present in both course tables', async () => {
    h.courseFindMany.mockResolvedValue([{ id: 'c9', title: 'Ada Basics', category: null }]);
    h.masterCourseFindMany.mockResolvedValue([{ id: 'c9', title: 'Ada Basics', category: 'Master' }]);
    const out = await hits();
    expect(out.filter((x) => x.type === 'course')).toHaveLength(1);
  });

  it('survives one section failing rather than blanking the whole search', async () => {
    h.userFindMany.mockRejectedValue(new Error('relation does not exist'));
    h.courseFindMany.mockResolvedValue([{ id: 'c1', title: 'Ada 101', category: null }]);
    const out = await hits();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject(
      { type: 'course', id: 'c1', label: 'Ada 101', sub: null, href: '/courses' },
    );
  });
});
