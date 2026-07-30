/**
 * GAP_REPORT §2.5 — the SUB_ADMIN approval bypass.
 *
 * The legacy controller forced a Sub Admin's edit of a PUBLISHED course to
 * PendingTenantApproval, overriding whatever the service computed
 * (`master-course.controller.ts:305-311` for :id/save and `:386-390` for PUT :id):
 *
 *     revision.status = MasterCourseStatus.PENDING_TENANT_APPROVAL;
 *     await revision.save();
 *
 * Losing that override meant:
 *   - approval workflow OFF → revision computed to `Published`. A Sub Admin's
 *     edit went LIVE with no approval from anyone.
 *   - approval workflow ON  → revision computed to `PendingApproval`, skipping
 *     Tenant Admin review and landing in the Super Admin queue.
 *
 * These tests assert the FINAL persisted status, not the call arguments, so they
 * fail if the override regresses no matter how it is wired.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  tenantFindUnique: vi.fn(),
  selectedFindMany: vi.fn(),
  selectedDeleteMany: vi.fn(),
  selectedCreateMany: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: h.requireRoles,
  // Real implementation — `userHasRole` is a pure predicate that
  // master-course-service builds its actor checks on. Stubbing it would silently
  // disable the very ownership guards these tests exist to protect.
  userHasRole: (u: { role?: string; secondaryRole?: string | null }, role: string) =>
    u?.role === role || u?.secondaryRole === role,
  // Likewise real: the tenant/operator split is exactly what decides whether the
  // create path forces `selectedTenants` + the approval workflow.
  isPlatformOperator: (u: { isSuperAdmin?: boolean }) => u?.isSuperAdmin === true,
}));
// master-course-service imports lib/s3 for presigned enrichment, and lib/s3
// validates the whole environment at import time.
vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({
  presignFromUrlOrKey: vi.fn(async (u: string) => `${u}?sig=1`),
  s3: { send: vi.fn() },
  S3_BUCKET: 'test-bucket',
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsMasterCourse: {
      findFirst: h.findFirst,
      findUnique: h.findUnique,
      create: h.create,
      update: h.update,
    },
    lmsTenant: { findUnique: h.tenantFindUnique },
    lmsMasterCourseSelectedTenant: {
      findMany: h.selectedFindMany,
      deleteMany: h.selectedDeleteMany,
      createMany: h.selectedCreateMany,
    },
  },
}));

import { POST as savePOST } from '@/app/api/master-courses/[id]/save/route';
import { PUT as masterPUT } from '@/app/api/master-courses/[id]/route';
import { POST as createPOST } from '@/app/api/master-courses/route';

const ctx = { params: { id: 'course-1' } };

function body(payload: unknown, method = 'POST') {
  return new Request('http://x/api/master-courses/course-1/save', {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  }) as never;
}

const subAdmin = { id: 'u-sub', role: 'SUB_ADMIN', secondaryRole: null, orgId: 'org-1', isActive: true };

/** A published master course owned by org-1 — the §2.5 trigger condition. */
const publishedCourse = {
  id: 'course-1',
  isMaster: true,
  status: 'Published',
  parentCourseId: null,
  submittedByTenantId: 'org-1',
  submittedBy: 'u-sub',
  title: 'T',
  description: 'D',
  category: 'C',
  level: 'Beginner',
  modules: [],
  settings: {},
  tags: [],
  version: 1,
  revisionNumber: 1,
  authorId: 'a1',
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(subAdmin);
  h.requireRoles.mockReturnValue(undefined);
  h.selectedFindMany.mockResolvedValue([]);
  h.selectedDeleteMany.mockResolvedValue({});
  h.selectedCreateMany.mockResolvedValue({});
  // findFirst serves both findOne(course) and the existing-revision lookup.
  h.findFirst.mockImplementation(async (args: any) =>
    args?.where?.parentCourseId ? null : publishedCourse,
  );
  h.create.mockImplementation(async ({ data }: any) => ({ id: 'rev-1', ...data }));
  h.update.mockImplementation(async ({ data }: any) => ({ id: 'rev-1', ...data }));
});

/**
 * approvalEnabled is read off the tenant's featureConfig. The key is
 * `approvalWorkflowEnabled` and the check is `!== false`, so approval is ON
 * unless explicitly disabled — matching the legacy service
 * (`master-course.service.ts:24-32`). Getting this key wrong silently pins both
 * branches to "enabled" and never exercises the dangerous path.
 */
function setApprovalWorkflow(enabled: boolean) {
  h.tenantFindUnique.mockResolvedValue({ id: 'org-1', featureConfig: { approvalWorkflowEnabled: enabled } });
}

describe('§2.5 — POST /api/master-courses/:id/save', () => {
  it('forces PendingTenantApproval when the approval workflow is DISABLED', async () => {
    // Without the override this computed to `Published` — live, unapproved.
    setApprovalWorkflow(false);

    const res = await savePOST(body({ title: 'Edited' }), ctx);

    expect(res.status).toBe(200);
    expect(h.create.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
    expect((await res.json()).data.status).toBe('PendingTenantApproval');
  });

  it('forces PendingTenantApproval when the approval workflow is ENABLED', async () => {
    // Without the override this computed to `PendingApproval`, skipping the
    // Tenant Admin and going straight to the Super Admin queue.
    setApprovalWorkflow(true);

    const res = await savePOST(body({ title: 'Edited' }), ctx);

    expect(h.create.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
    expect((await res.json()).data.status).toBe('PendingTenantApproval');
  });

  it('forces PendingTenantApproval when updating an existing revision', async () => {
    setApprovalWorkflow(false);
    h.findFirst.mockImplementation(async (args: any) =>
      args?.where?.parentCourseId
        ? { id: 'rev-1', status: 'RejectedByTenantAdmin', version: 2 }
        : publishedCourse,
    );

    await savePOST(body({ title: 'Edited' }), ctx);

    expect(h.create).not.toHaveBeenCalled();
    expect(h.update.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
  });

  it('ignores a client-supplied status — the body cannot pick the approval state', async () => {
    // The route parses with .passthrough(), so this must not be honored.
    setApprovalWorkflow(true);

    await savePOST(body({ title: 'Edited', status: 'Published' }), ctx);

    expect(h.create.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
  });

  it('returns the legacy message', async () => {
    setApprovalWorkflow(false);
    const res = await savePOST(body({ title: 'Edited' }), ctx);
    expect((await res.json()).message).toBe('Course update submitted for Tenant Admin approval');
  });
});

describe('§2.5 — PUT /api/master-courses/:id', () => {
  it('forces PendingTenantApproval with the workflow DISABLED', async () => {
    // This route never even attempted the override.
    setApprovalWorkflow(false);
    const res = await masterPUT(body({ title: 'Edited' }, 'PUT'), ctx);
    expect(res.status).toBe(200);
    expect(h.create.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
  });

  it('forces PendingTenantApproval with the workflow ENABLED', async () => {
    setApprovalWorkflow(true);
    await masterPUT(body({ title: 'Edited' }, 'PUT'), ctx);
    expect(h.create.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
  });

  it('ignores a client-supplied status', async () => {
    setApprovalWorkflow(true);
    await masterPUT(body({ title: 'Edited', status: 'Published' }, 'PUT'), ctx);
    expect(h.create.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
  });
});

describe('a SUB_ADMIN by secondaryRole is treated identically', () => {
  it('still forces PendingTenantApproval', async () => {
    h.requireAuth.mockResolvedValue({ ...subAdmin, role: 'TEACHER', secondaryRole: 'SUB_ADMIN' });
    setApprovalWorkflow(false);
    await savePOST(body({ title: 'Edited' }), ctx);
    expect(h.create.mock.calls[0][0].data.status).toBe('PendingTenantApproval');
  });
});

describe('POST /api/master-courses — fail closed without an orgId', () => {
  it('400s a TENANT_ADMIN with no orgId instead of using the SUPER_ADMIN path', async () => {
    // Previously fell through both branches to the SUPER_ADMIN path, where
    // dto.status is honored as-is and selectedTenants is never forced.
    h.requireAuth.mockResolvedValue({ id: 'u-ta', role: 'TENANT_ADMIN', secondaryRole: null, orgId: null, isActive: true });

    const res = await createPOST(body({ title: 'X', status: 'Published' }), {});

    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Tenant ID is required');
    expect(h.create).not.toHaveBeenCalled();
  });

  it('400s a SUB_ADMIN with no orgId', async () => {
    h.requireAuth.mockResolvedValue({ id: 'u-sa', role: 'SUB_ADMIN', secondaryRole: null, orgId: null, isActive: true });
    const res = await createPOST(body({ title: 'X', status: 'Published' }), {});
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('still lets the platform OPERATOR create without a tenant', async () => {
    // `isSuperAdmin: true` — the operator authors the shared catalogue and has no
    // tenant of their own, so the fail-closed guard must not catch them.
    h.requireAuth.mockResolvedValue({ id: 'u-su', role: 'SUPER_ADMIN', secondaryRole: null, orgId: null, isActive: true, isSuperAdmin: true });
    const res = await createPOST(body({ title: 'X' }), {});
    expect(res.status).toBe(200);
    expect(h.create).toHaveBeenCalled();
  });

  it('400s a founding admin (SUPER_ADMIN role) with no orgId', async () => {
    // Regression: a non-operator SUPER_ADMIN is a tenant actor, so the same
    // fail-closed guard applies. Previously they fell through onto the operator path,
    // where `dto.status` is honoured verbatim and `selectedTenants` is never forced —
    // letting them publish an unscoped master course visible to every tenant.
    h.requireAuth.mockResolvedValue({ id: 'u-fa', role: 'SUPER_ADMIN', secondaryRole: null, orgId: null, isActive: true, isSuperAdmin: false });
    const res = await createPOST(body({ title: 'X', status: 'Published' }), {});
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('forces a founding admin’s course into their own org, not the whole platform', async () => {
    h.requireAuth.mockResolvedValue({ id: 'u-fa', role: 'SUPER_ADMIN', secondaryRole: null, orgId: 'org-mine', isActive: true, isSuperAdmin: false });
    await createPOST(body({ title: 'X', status: 'Published', selectedTenants: ['org-other'] }), {});
    expect(h.create).toHaveBeenCalled();
    // Prisma-level mock, same as the sibling assertions above.
    const data = h.create.mock.calls[0][0].data as Record<string, unknown>;
    // Stamped as their own org's submission, and the status comes from the approval
    // workflow rather than being honoured from the request body.
    expect(data.submittedByTenantId).toBe('org-mine');
    expect(data.status).not.toBe('Published');
  });
});
