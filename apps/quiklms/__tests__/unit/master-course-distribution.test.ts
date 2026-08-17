/**
 * A COURSE MUST NOT LOSE THE TENANT THAT WROTE IT.
 *
 * `selectedTenants` is the only thing that makes a master course visible to a
 * tenant — `findAllForTenant`, `courses-service.findOne` and `assignCourse` all
 * gate on `selectedTenants: { some: { orgId } }`. Empty it and the course is
 * still there, still Published, and reachable by nobody: the author cannot open
 * it, cannot assign it, and gets no error saying why.
 *
 * PRODUCTION EVIDENCE (2026-07-23): 19 published master courses had zero
 * `selectedTenants`, and every single one carried a `submittedByTenantId` — 19
 * tenant-authored courses whose authors had silently lost them, across two
 * tenants and three months. Several were still `version: 1`, so they were never
 * edited after creation, which pins it on `publish` (the only path that rewrites
 * the list without bumping the version). Its route defaulted a missing
 * `selectedTenants` to `[]`, while the NestJS original's `PublishMasterCourseDto`
 * required the field.
 *
 * Both halves are covered here: the route now rejects the malformed call, and
 * `setSelectedTenants` re-adds the author whatever the caller passes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  masterFindUnique: vi.fn(),
  masterFindFirst: vi.fn(),
  masterUpdate: vi.fn(),
  selDeleteMany: vi.fn(),
  selCreateMany: vi.fn(),
  selFindMany: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/s3', () => ({
  presignFromUrlOrKey: vi.fn(async (v: string) => v),
  isManagedStorageUrl: () => false,
  S3_BUCKET: 'b',
}));
vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: vi.fn(),
  userHasRole: (u: { role?: string }, r: string) => u?.role === r,
  isPlatformOperator: (u: { isSuperAdmin?: boolean }) => u?.isSuperAdmin === true,
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsMasterCourse: {
      findUnique: h.masterFindUnique,
      findFirst: h.masterFindFirst,
      update: h.masterUpdate,
      findMany: vi.fn(),
    },
    lmsMasterCourseSelectedTenant: {
      deleteMany: h.selDeleteMany,
      createMany: h.selCreateMany,
      findMany: h.selFindMany,
    },
  },
}));

import { publish } from '@/lib/services/master-course-service';
import { POST as publishRoute } from '@/app/api/master-courses/[id]/publish/route';

const AUTHOR = 'org-author';
const OTHER = 'org-other';
const COURSE = { id: 'c1', isMaster: true, modules: [{ id: 'm1', subModules: [] }], submittedByTenantId: AUTHOR };
/** The platform operator — bypasses the org-ownership check, unrelated to what this suite tests. */
const OPERATOR = { id: 'su', role: 'ADMIN' as const, orgId: null, isSuperAdmin: true } as never;

/** The org ids actually written to the join table. */
const distributedTo = (): string[] => {
  const call = h.selCreateMany.mock.calls[0];
  if (!call) return [];
  return (call[0].data as Array<{ orgId: string }>).map((r) => r.orgId);
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.masterFindFirst.mockResolvedValue(COURSE);
  h.masterFindUnique.mockResolvedValue({ submittedByTenantId: AUTHOR });
  h.masterUpdate.mockResolvedValue({ ...COURSE, status: 'Published' });
  h.selDeleteMany.mockResolvedValue({ count: 0 });
  h.selCreateMany.mockResolvedValue({ count: 0 });
  h.selFindMany.mockResolvedValue([]);
  h.requireAuth.mockResolvedValue({ id: 'su', role: 'ADMIN', orgId: null, isSuperAdmin: true });
});

describe('publish keeps the authoring tenant', () => {
  it('re-adds the author when the caller publishes to an empty list', async () => {
    await publish(OPERATOR, 'c1', []);
    expect(distributedTo()).toEqual([AUTHOR]);
  });

  it('re-adds the author when the caller publishes to OTHER tenants only', async () => {
    await publish(OPERATOR, 'c1', [OTHER]);
    expect(distributedTo()).toEqual([OTHER, AUTHOR]);
  });

  it('does not duplicate the author when already present', async () => {
    await publish(OPERATOR, 'c1', [AUTHOR, OTHER]);
    expect(distributedTo()).toEqual([AUTHOR, OTHER]);
  });

  it('de-duplicates a repeated tenant id', async () => {
    await publish(OPERATOR, 'c1', [OTHER, OTHER]);
    expect(distributedTo()).toEqual([OTHER, AUTHOR]);
  });

  it('leaves a super-admin-authored course (no author tenant) alone', async () => {
    h.masterFindUnique.mockResolvedValue({ submittedByTenantId: null });
    await publish(OPERATOR, 'c1', [OTHER]);
    expect(distributedTo()).toEqual([OTHER]);
  });

  it('still refuses to publish a course with no modules', async () => {
    h.masterFindFirst.mockResolvedValue({ ...COURSE, modules: [] });
    await expect(publish(OPERATOR, 'c1', [OTHER])).rejects.toThrow(/without modules/i);
  });
});

describe('POST /api/master-courses/:id/publish requires selectedTenants', () => {
  const call = (body: unknown) =>
    publishRoute(
      new Request('http://x/api/master-courses/c1/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as never,
      { params: { id: 'c1' } } as never,
    );

  it('400s when selectedTenants is missing instead of wiping the list', async () => {
    const res = await call({});
    expect(res.status).toBe(400);
    expect(h.selDeleteMany).not.toHaveBeenCalled();
  });

  it('400s on a non-array selectedTenants', async () => {
    const res = await call({ selectedTenants: 'org-1' });
    expect(res.status).toBe(400);
    expect(h.selDeleteMany).not.toHaveBeenCalled();
  });

  it('publishes when the list is supplied', async () => {
    const res = await call({ selectedTenants: [OTHER] });
    expect(res.status).toBe(200);
    expect(distributedTo()).toContain(OTHER);
  });

  it('an EXPLICIT empty array is still honoured — but keeps the author', async () => {
    // Deliberately un-distributing a course is a real operation; losing the
    // author is not.
    const res = await call({ selectedTenants: [] });
    expect(res.status).toBe(200);
    expect(distributedTo()).toEqual([AUTHOR]);
  });
});
