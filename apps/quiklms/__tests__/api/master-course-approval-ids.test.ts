/**
 * The tenant → super-admin course approval workflow was dead downstream of
 * submission — the SAME defect as the certificate queue.
 *
 * `withSelectedTenants` spread the bare Prisma row (which has `id`) and never
 * emitted `_id`, the Mongo-compat alias every course screen addresses a course
 * by. So approve, reject, preview, delete, duplicate and edit all built
 * `/master-courses/undefined/...` and 404'd.
 *
 * Submission itself worked, because a POST carries no id — which is exactly why
 * the workflow looked half-alive: a tenant admin could submit a course, watch it
 * appear in the super admin's queue, and then nothing could act on it.
 *
 * Every list and mutation in this service funnels through that one helper, so
 * these assert the contract at the helper AND end-to-end through the state
 * machine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  courseFindMany: vi.fn(),
  courseFindFirst: vi.fn(),
  courseUpdate: vi.fn(),
  selTenantFindMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({
  putObject: vi.fn(),
  getObjectBufferFrom: vi.fn(),
  S3_BUCKET: 'b',
  presignGet: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
}));
// `@/lib/auth/context` pulls in `authOptions`, which constructs a real
// PrismaClient at import time. The service only needs `userHasRole` from it.
vi.mock('@/lib/auth/context', () => ({
  userHasRole: (u: { role?: string }, r: string) => u?.role === r,
  isPlatformOperator: (u: { isSuperAdmin?: boolean }) => u?.isSuperAdmin === true,
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsMasterCourse: {
      findMany: h.courseFindMany,
      findFirst: h.courseFindFirst,
      update: h.courseUpdate,
    },
    lmsMasterCourseSelectedTenant: { findMany: h.selTenantFindMany },
  },
}));

import {
  findAll,
  findOne,
  findPendingApprovals,
  findAllApprovalItems,
  findBySubmittedTenant,
  tenantApprove,
  tenantReject,
  approve,
} from '@/lib/services/master-course-service';

const ROW = {
  id: 'course-1',
  title: 'Fire Safety',
  status: 'PendingApproval',
  isMaster: true,
  parentCourseId: null,
  submittedBy: 'u1',
  submittedByTenantId: 'org-1',
  modules: [],
  settings: {},
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.courseFindMany.mockResolvedValue([ROW]);
  h.courseFindFirst.mockResolvedValue(ROW);
  h.courseUpdate.mockImplementation(async ({ data }: never) => ({ ...ROW, ...(data as object) }));
  h.selTenantFindMany.mockResolvedValue([]);
});

describe('every course read exposes an actionable _id', () => {
  it('findPendingApprovals — the super admin queue', async () => {
    const [c] = await findPendingApprovals();
    expect(c._id).toBe('course-1');
  });

  it('findAllApprovalItems', async () => {
    const [c] = await findAllApprovalItems();
    expect(c._id).toBe('course-1');
  });

  it('findBySubmittedTenant — the tenant My Submissions list drives Edit and Delete', async () => {
    const [c] = await findBySubmittedTenant('org-1');
    expect(c._id).toBe('course-1');
  });

  it('findAll — the master library grid drives Duplicate and Delete', async () => {
    const [c] = await findAll();
    expect(c._id).toBe('course-1');
  });

  it('findOne — the approval preview modal', async () => {
    expect((await findOne('course-1'))._id).toBe('course-1');
  });

  it('keeps the real id alongside the alias rather than replacing it', async () => {
    const [c] = await findPendingApprovals();
    expect(c.id).toBe('course-1');
    expect(c._id).toBe(c.id);
  });
});

describe('the tenant → super-admin state machine, driven by the id the UI receives', () => {
  it('tenantApprove moves PendingTenantApproval → PendingApproval', async () => {
    h.courseFindFirst.mockResolvedValue({ ...ROW, status: 'PendingTenantApproval' });
    const out = await tenantApprove('course-1', 'admin-1', 'org-1');
    expect(h.courseUpdate.mock.calls[0][0].data).toMatchObject({
      status: 'PendingApproval',
      tenantApprovedBy: 'admin-1',
      tenantRejectionReason: null,
    });
    expect(out._id).toBe('course-1');
  });

  it('tenantReject moves it to RejectedByTenantAdmin with the reason', async () => {
    h.courseFindFirst.mockResolvedValue({ ...ROW, status: 'PendingTenantApproval' });
    const out = await tenantReject('course-1', 'admin-1', 'org-1', 'needs work');
    expect(h.courseUpdate.mock.calls[0][0].data).toMatchObject({
      status: 'RejectedByTenantAdmin',
      tenantRejectionReason: 'needs work',
    });
    expect(out._id).toBe('course-1');
  });

  it('a tenant admin cannot approve another org’s submission', async () => {
    h.courseFindFirst.mockResolvedValue({ ...ROW, status: 'PendingTenantApproval', submittedByTenantId: 'org-OTHER' });
    await expect(tenantApprove('course-1', 'admin-1', 'org-1')).rejects.toMatchObject({
      message: 'You can only approve courses from your own organization',
    });
    expect(h.courseUpdate).not.toHaveBeenCalled();
  });

  it('tenantApprove refuses a course that is not awaiting tenant approval', async () => {
    h.courseFindFirst.mockResolvedValue({ ...ROW, status: 'Published' });
    await expect(tenantApprove('course-1', 'admin-1', 'org-1')).rejects.toMatchObject({
      message: 'Only courses pending Tenant Admin approval can be approved',
    });
  });

  const SUPER = { id: 'super-1', role: 'ADMIN', orgId: null, isSuperAdmin: true } as never;

  it('the queue id round-trips into approve() — the hop that was broken', async () => {
    const [item] = await findPendingApprovals();
    await approve(SUPER, item._id);
    // Looked up by the very id the UI was handed, not `undefined`.
    expect(h.courseFindFirst.mock.calls.at(-1)![0].where).toMatchObject({ id: 'course-1' });
  });

  it('reproduces the original failure: an undefined id 404s', async () => {
    h.courseFindFirst.mockResolvedValue(null);
    await expect(approve(SUPER, 'undefined')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Master course not found',
    });
    expect(h.courseUpdate).not.toHaveBeenCalled();
  });
});
