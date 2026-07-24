/**
 * GAP_REPORT §3.2 course-assignments:
 *
 *  1. "Tenant audit logging dropped on all four write endpoints (grep: zero hits)."
 *     Root cause was deeper than the report said: the port's tenant-audit service
 *     had NO createLog at all — only the read side — so every module meant to
 *     record an action recorded nothing.
 *  2. "The reminder queue is never triggered. Both sides believe the other does
 *     it. Nobody does." — the immediate "course assigned" email.
 *  3. "?tenantId=X is silently ignored" — cross-tenant inspection broke with no error.
 *  4. "Its role check ignores secondaryRole, unlike isTenantOrSubAdminActor."
 *
 * Audit is observability: these tests also pin that a failing audit write can
 * never fail the assignment the user actually asked for.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  userHasRole: vi.fn(),
  tenantLogCreate: vi.fn(),
  assignCourse: vi.fn(),
  bulkAssignCourses: vi.fn(),
  assignCourseByBatch: vi.fn(),
  assignCourseToAllLearners: vi.fn(),
  getAssignedCourses: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: h.requireRoles,
  userHasRole: h.userHasRole,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { lmsTenantLog: { create: h.tenantLogCreate } } }));
vi.mock('@/lib/s3', () => ({ presignFromUrlOrKey: h.presignFromUrlOrKey }));
vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(16), ENCRYPTION_KEY: 'x'.repeat(16) }, optionalEnv: () => '' }));
// The reminder emails are covered by their own suite; stubbed here so importing
// the real assignments service does not drag the mail transport in.
vi.mock('@/lib/services/course-assignment-reminders-service', () => ({
  handleNewAssignments: vi.fn(),
  sendAssignmentAssignedEmail: vi.fn(),
}));
vi.mock('@/lib/services/course-assignments-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/services/course-assignments-service');
  return {
    ...actual,
    assignCourse: h.assignCourse,
    bulkAssignCourses: h.bulkAssignCourses,
    assignCourseByBatch: h.assignCourseByBatch,
    assignCourseToAllLearners: h.assignCourseToAllLearners,
    getAssignedCourses: h.getAssignedCourses,
  };
});

import { POST as assignPOST } from '@/app/api/course-assignments/assign/route';
import { POST as bulkPOST } from '@/app/api/course-assignments/bulk-assign/route';
import { POST as batchPOST } from '@/app/api/course-assignments/assign-by-batch/route';
import { POST as allPOST } from '@/app/api/course-assignments/assign-all-learners/route';
import { GET as coursesGET } from '@/app/api/course-assignments/courses/route';

const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue({ id: 'admin1', role: 'TENANT_ADMIN', orgId: 'org-1', email: 'a@b.test' });
  h.requireRoles.mockReturnValue(undefined);
  h.userHasRole.mockImplementation((u: { role: string }, r: string) => u.role === r);
  h.tenantLogCreate.mockResolvedValue({ id: 'log1' });
  h.assignCourse.mockResolvedValue({ assignments: [{ id: 'a1' }], newCount: 1, alreadyAssignedCount: 0, alreadyAssignedIds: [] });
  h.bulkAssignCourses.mockResolvedValue([{ assigned: 3 }, { assigned: 2 }]);
  h.assignCourseByBatch.mockResolvedValue({ assigned: 7 });
  h.assignCourseToAllLearners.mockResolvedValue({ assigned: 9, total: 10 });
  h.getAssignedCourses.mockResolvedValue([]);
  h.presignFromUrlOrKey.mockImplementation(async (u: string) => `${u}?signed`);
});

const logOf = () => h.tenantLogCreate.mock.calls[0][0].data;

describe('audit logging — restored on all four writes', () => {
  it('POST /assign logs CourseAssignedToUser with the new count', async () => {
    await assignPOST(post('http://x/api/course-assignments/assign', {
      courseId: 'c1', targetType: 'USER', targetIds: ['u1'],
    }), {});

    expect(logOf()).toMatchObject({
      orgId: 'org-1',
      performedBy: 'admin1',
      actionType: 'CourseAssignedToUser',
      description: 'Assigned course to 1 user(s)',
      metadata: { courseId: 'c1', targetIds: ['u1'] },
    });
  });

  it('POST /assign logs CourseAssignedToGroup for a GROUP target', async () => {
    await assignPOST(post('http://x/api/course-assignments/assign', {
      courseId: 'c1', targetType: 'GROUP', targetIds: ['g1'],
    }), {});
    expect(logOf().actionType).toBe('CourseAssignedToGroup');
    expect(logOf().description).toBe('Assigned course to 1 group(s)');
  });

  it('POST /assign does NOT log when everything was already assigned', async () => {
    // Legacy gates on newCount > 0 (`controller.ts:136`).
    h.assignCourse.mockResolvedValue({ assignments: [{ id: 'a1' }], newCount: 0, alreadyAssignedCount: 1, alreadyAssignedIds: ['u1'] });
    await assignPOST(post('http://x/api/course-assignments/assign', {
      courseId: 'c1', targetType: 'USER', targetIds: ['u1'],
    }), {});
    expect(h.tenantLogCreate).not.toHaveBeenCalled();
  });

  it('POST /bulk-assign logs the totals', async () => {
    await bulkPOST(post('http://x/api/course-assignments/bulk-assign', {
      courseIds: ['c1', 'c2'], targetType: 'USER', targetIds: ['u1', 'u2'],
    }), {});
    expect(logOf()).toMatchObject({
      actionType: 'CourseAssignedToUser',
      description: 'Bulk assigned 2 course(s) to 2 target(s) (5 total assignments)',
      metadata: { courseIds: ['c1', 'c2'], targetIds: ['u1', 'u2'] },
    });
  });

  it('POST /assign-by-batch logs CourseAssignedToGroup', async () => {
    await batchPOST(post('http://x/api/course-assignments/assign-by-batch', {
      courseId: 'c1', batchIds: ['b1', 'b2'],
    }), {});
    expect(logOf()).toMatchObject({
      actionType: 'CourseAssignedToGroup',
      description: 'Assigned course to 7 students via 2 batch(es)',
    });
  });

  it('POST /assign-all-learners logs assigned/total', async () => {
    await allPOST(post('http://x/api/course-assignments/assign-all-learners', { courseId: 'c1' }), {});
    expect(logOf()).toMatchObject({
      actionType: 'CourseAssignedToUser',
      description: 'Assigned course to all learners (9/10)',
    });
  });

  it('a failing audit write never fails the assignment', async () => {
    h.tenantLogCreate.mockRejectedValue(new Error('audit table down'));
    const res = await assignPOST(post('http://x/api/course-assignments/assign', {
      courseId: 'c1', targetType: 'USER', targetIds: ['u1'],
    }), {});
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });
});

describe('GET /courses — ?tenantId is no longer silently ignored', () => {
  it('a SUPER_ADMIN can inspect another tenant with the legacy ?tenantId param', async () => {
    h.requireAuth.mockResolvedValue({ id: 's1', role: 'SUPER_ADMIN', orgId: 'org-1', email: 's@b.test' });
    await coursesGET(new Request('http://x/api/course-assignments/courses?tenantId=org-9') as never, {});
    expect(h.getAssignedCourses).toHaveBeenCalledWith('org-9');
  });

  it('also accepts the new ?orgId name', async () => {
    h.requireAuth.mockResolvedValue({ id: 's1', role: 'SUPER_ADMIN', orgId: 'org-1', email: 's@b.test' });
    await coursesGET(new Request('http://x/api/course-assignments/courses?orgId=org-9') as never, {});
    expect(h.getAssignedCourses).toHaveBeenCalledWith('org-9');
  });

  it('a SUPER_ADMIN with no org and no param spans every tenant', async () => {
    h.requireAuth.mockResolvedValue({ id: 's1', role: 'SUPER_ADMIN', orgId: null, email: 's@b.test' });
    await coursesGET(new Request('http://x/api/course-assignments/courses') as never, {});
    expect(h.getAssignedCourses).toHaveBeenCalledWith(null);
  });

  it('a TENANT_ADMIN cannot escape their own org via ?tenantId', async () => {
    await coursesGET(new Request('http://x/api/course-assignments/courses?tenantId=org-9') as never, {});
    expect(h.getAssignedCourses).toHaveBeenCalledWith('org-1');
  });

  it('honours a delegated SUB_ADMIN secondaryRole in the org guard', async () => {
    // isTenantOrSubAdminActor parity: a MANAGER with SUB_ADMIN delegated and no
    // org must hit the guard, not sail past it.
    h.requireAuth.mockResolvedValue({ id: 'm1', role: 'MANAGER', secondaryRole: 'SUB_ADMIN', orgId: null, email: 'm@b.test' });
    h.userHasRole.mockImplementation((u: { role: string; secondaryRole?: string }, r: string) => u.role === r || u.secondaryRole === r);

    const res = await coursesGET(new Request('http://x/api/course-assignments/courses') as never, {});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: 'Tenant ID is required' });
  });

  it('presigns course thumbnails', async () => {
    h.getAssignedCourses.mockResolvedValue([{ id: 'c1', thumbnailUrl: 'https://b.s3.amazonaws.com/t.png' }]);
    const res = await coursesGET(new Request('http://x/api/course-assignments/courses') as never, {});
    const { data } = await res.json();
    expect(data[0].thumbnailUrlPresigned).toBe('https://b.s3.amazonaws.com/t.png?signed');
    expect(data[0].thumbnailUrl).toBe('https://b.s3.amazonaws.com/t.png'); // original preserved
  });
});
