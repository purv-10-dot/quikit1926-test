/**
 * "Certificate template not found" when a Super Admin clicked Approve on a
 * template that visibly existed.
 *
 * CAUSE: `hydrateApprovalActors` spread a raw Prisma row, which has `id` — but
 * every certificate screen keys its actions off `_id`, the Mongo-compat alias
 * `shapeTemplate` emits. So `cert._id` was `undefined` and the page POSTed to
 * `/certificates/undefined/approve`; `findUnique({where:{id:'undefined'}})`
 * returned null and the route reported the template as missing.
 *
 * The SAME omission was in `findBySubmittedTenant` (`GET /my-submissions`), so
 * Edit and Delete on the tenant-admin list were broken too — creation worked,
 * which is why it went unnoticed.
 *
 * These assert the contract directly: any template a UI acts on must carry a
 * usable `_id`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  certFindMany: vi.fn(),
  certFindUnique: vi.fn(),
  certUpdate: vi.fn(),
  certUpdateMany: vi.fn(),
  userFindMany: vi.fn(),
  tenantFindMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({
  putObject: vi.fn(),
  getObjectBufferFrom: vi.fn(),
  S3_BUCKET: 'b',
  presignGet: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsCertificate: {
      findMany: h.certFindMany,
      findUnique: h.certFindUnique,
      update: h.certUpdate,
      updateMany: h.certUpdateMany,
    },
    lmsUser: { findMany: h.userFindMany },
    lmsTenant: { findMany: h.tenantFindMany },
  },
}));

import {
  findPendingApprovals,
  findAllApprovalItems,
  findBySubmittedTenant,
  approve,
} from '@/lib/services/certificates-service';

const ROW = {
  id: 'cert-1',
  name: 'Tenant Template',
  approvalStatus: 'pending_approval',
  submittedBy: 'u1',
  submittedByTenantId: 'org-1',
  orgId: null,
  isActive: false,
  backgroundImageUrl: 'data:image/png;base64,x',
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.certFindMany.mockResolvedValue([ROW]);
  h.userFindMany.mockResolvedValue([{ id: 'u1', firstName: 'Ada', lastName: 'L', email: 'a@b.test' }]);
  h.tenantFindMany.mockResolvedValue([{ id: 'org-1', orgName: 'Acme', contactEmail: 'c@acme.test' }]);
  h.certUpdateMany.mockResolvedValue({ count: 0 });
});

describe('approval queue rows carry an actionable _id', () => {
  it('findPendingApprovals exposes _id', async () => {
    const [item] = await findPendingApprovals();
    expect(item._id).toBe('cert-1');
  });

  it('findAllApprovalItems exposes _id', async () => {
    const [item] = await findAllApprovalItems();
    expect(item._id).toBe('cert-1');
  });

  it('still populates the submitter and tenant actors alongside it', async () => {
    const [item] = await findPendingApprovals();
    expect(item.submittedBy).toMatchObject({ firstName: 'Ada' });
    expect(item.submittedByTenantId).toMatchObject({ orgName: 'Acme' });
  });

  it('the _id it hands out is the id approve() looks up — the round trip that was broken', async () => {
    const [item] = await findPendingApprovals();
    const id = item._id;

    h.certFindUnique.mockResolvedValue(ROW);
    h.certUpdate.mockResolvedValue({ ...ROW, approvalStatus: 'approved', isActive: true });

    await approve(id, 'super-1');
    expect(h.certFindUnique).toHaveBeenCalledWith({ where: { id: 'cert-1' } });
    expect(h.certUpdate.mock.calls[0][0].where).toEqual({ id: 'cert-1' });
  });

  it('reproduces the original failure: a missing _id yields the misleading 404', async () => {
    // What the page did before the fix — `undefined` stringified into the path.
    h.certFindUnique.mockResolvedValue(null);
    await expect(approve('undefined', 'super-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Certificate template not found',
    });
    expect(h.certUpdate).not.toHaveBeenCalled();
  });
});

describe('tenant-admin submissions are equally actionable', () => {
  it('my-submissions rows expose _id so Edit and Delete resolve', async () => {
    h.certFindMany.mockResolvedValue([{ ...ROW, selectedTenants: [] }]);
    const [row] = await findBySubmittedTenant('org-1');
    expect((row as { _id?: string })._id).toBe('cert-1');
  });

  it('flattens selectedTenants to org ids rather than relation rows', async () => {
    h.certFindMany.mockResolvedValue([{ ...ROW, selectedTenants: [{ orgId: 'org-9' }] }]);
    const [row] = await findBySubmittedTenant('org-1');
    expect((row as { selectedTenants: string[] }).selectedTenants).toEqual(['org-9']);
  });

  it('scopes to templates the tenant submitted or was assigned', async () => {
    await findBySubmittedTenant('org-1');
    expect(h.certFindMany.mock.calls[0][0].where).toEqual({
      OR: [{ submittedByTenantId: 'org-1' }, { selectedTenants: { some: { orgId: 'org-1' } } }],
    });
  });
});

describe('approve() guards', () => {
  it('refuses a template that is not pending', async () => {
    h.certFindUnique.mockResolvedValue({ ...ROW, approvalStatus: 'approved' });
    await expect(approve('cert-1', 'super-1')).rejects.toMatchObject({
      message: 'Only pending certificates can be approved',
    });
    expect(h.certUpdate).not.toHaveBeenCalled();
  });

  it('activates the template and stamps the approver', async () => {
    h.certFindUnique.mockResolvedValue(ROW);
    h.certUpdate.mockResolvedValue({ ...ROW, approvalStatus: 'approved' });
    await approve('cert-1', 'super-1');
    expect(h.certUpdate.mock.calls[0][0].data).toMatchObject({
      approvalStatus: 'approved',
      isActive: true,
      approvedBy: 'super-1',
      rejectionReason: null,
    });
  });
});
