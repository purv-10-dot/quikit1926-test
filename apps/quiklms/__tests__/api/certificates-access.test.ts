/**
 * GAP_REPORT §3.2 certificates — the two product decisions taken 2026-07-17,
 * both DELIBERATE deviations from the NestJS original:
 *
 *  1. `findAll`'s last-resort rescue auto-approved templates of ANY status —
 *     including ones a Super Admin had REJECTED — putting a refused design live
 *     and bypassing the approval workflow. Rejected templates are now excluded.
 *
 *  2. `GET /certificates/:id/download` now requires ownership of everyone except
 *     the three admin roles. The legacy had NO ownership check at all.
 *
 * Both are deviations, so these tests are what stops a future "restore parity"
 * pass from silently reopening them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  userHasRole: vi.fn(),
  templateFindMany: vi.fn(),
  templateUpdateMany: vi.fn(),
  certFindUnique: vi.fn(),
  certFindFirst: vi.fn(),
  certUpdate: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: h.requireRoles,
  userHasRole: h.userHasRole,
}));
vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({
  s3: { send: h.send },
  S3_BUCKET: 'test-bucket',
  presignGet: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsCertificate: { findMany: h.templateFindMany, updateMany: h.templateUpdateMany, findUnique: vi.fn() },
    lmsCertificateIssued: { findUnique: h.certFindUnique, findFirst: h.certFindFirst, update: h.certUpdate },
    lmsUser: { findMany: vi.fn() },
    lmsTenant: { findMany: vi.fn() },
  },
}));

import { findAll } from '@/lib/services/certificates-service';
import { GET as downloadGET } from '@/app/api/certificates/[id]/download/route';

const ISSUED = {
  id: 'i1',
  orgId: 'org-1',
  learnerId: 'owner',
  courseId: 'c1',
  certificateTemplateId: null,
  certificateId: 'CERT-1',
  courseName: 'Fire Safety',
  learnerName: 'Ada',
  verificationUrl: 'https://app.test/verify-certificate/CERT-1',
  issuedAt: new Date('2026-01-15T00:00:00Z'),
  pdfUrl: '',
  qrCodeUrl: '',
  score: 92,
  passingScore: 70,
  passed: true,
};

const tpl = (over: Record<string, unknown>) => ({
  id: 't1',
  orgId: 'org-1',
  name: 'T',
  backgroundImageUrl: '',
  isActive: false,
  approvalStatus: 'rejected',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const req = () => new Request('http://x/api/certificates/i1/download') as never;
const ctx = { params: { id: 'i1' } };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireRoles.mockReturnValue(undefined);
  h.userHasRole.mockReturnValue(false);
  h.send.mockResolvedValue({});
  h.certFindUnique.mockResolvedValue(ISSUED);
  h.certFindFirst.mockResolvedValue(ISSUED);
  h.certUpdate.mockImplementation(async ({ data }: any) => ({ ...ISSUED, ...data }));
  h.templateFindMany.mockResolvedValue([]);
});

describe('findAll — a rejected template must never be auto-approved back to life', () => {
  it('does not rescue a rejected template', async () => {
    // No active, no approved: the last-resort branch runs. The tenant's only
    // template was rejected by a Super Admin.
    h.templateFindMany
      .mockResolvedValueOnce([]) // isActive
      .mockResolvedValueOnce([]) // approvalStatus: approved
      .mockResolvedValueOnce([]); // last resort — must exclude rejected

    const out = await findAll('org-1');

    expect(out).toEqual([]);
    // The rescue query must filter rejected out rather than fetching everything.
    // `expect.objectContaining` on the where only — the query also carries an
    // `include` for selectedTenants, which is orthogonal to this assertion.
    expect(h.templateFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { AND: [expect.anything(), { approvalStatus: { not: 'rejected' } }] },
      }),
    );
    // Nothing was flipped to approved.
    expect(h.templateUpdateMany).not.toHaveBeenCalled();
  });

  it('still rescues a pending template — the tenant is not left with nothing', async () => {
    h.templateFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([tpl({ id: 't-pending', approvalStatus: 'pending_approval' })]);

    const out = await findAll('org-1');

    expect(h.templateUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t-pending'] } },
      data: { isActive: true, approvalStatus: 'approved' },
    });
    // The returned rows reflect the write, as the legacy's in-memory save did.
    expect(out[0]).toMatchObject({ id: 't-pending', isActive: true, approvalStatus: 'approved' });
  });

  it('is untouched when the tenant already has an active template', async () => {
    h.templateFindMany.mockResolvedValueOnce([tpl({ id: 't-active', isActive: true, approvalStatus: 'approved' })]);
    const out = await findAll('org-1');
    expect(out).toHaveLength(1);
    expect(h.templateFindMany).toHaveBeenCalledTimes(1);
    expect(h.templateUpdateMany).not.toHaveBeenCalled();
  });

  it('super admin (no org) is never scoped or mutated', async () => {
    h.templateFindMany.mockResolvedValueOnce([tpl({ id: 't-rejected' })]);
    const out = await findAll(undefined);
    expect(out).toHaveLength(1);
    expect(h.templateUpdateMany).not.toHaveBeenCalled();
  });
});

describe('GET /certificates/:id/download — ownership', () => {
  it('lets the owner download their own certificate', async () => {
    h.requireAuth.mockResolvedValue({ id: 'owner', role: 'LEARNER', orgId: 'org-1' });
    const res = await downloadGET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('404s a LEARNER reaching for someone else\'s certificate', async () => {
    h.requireAuth.mockResolvedValue({ id: 'someone-else', role: 'LEARNER', orgId: 'org-1' });
    const res = await downloadGET(req(), ctx);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ message: 'Certificate not found' });
  });

  it("404s a MANAGER reaching for a team member's certificate", async () => {
    // The decision of 2026-07-17: MANAGER is not exempt. Their own certificates
    // page reads /my-certificates, so it is unaffected.
    h.requireAuth.mockResolvedValue({ id: 'mgr', role: 'MANAGER', orgId: 'org-1' });
    const res = await downloadGET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it('lets a TENANT_ADMIN download any certificate in their tenant', async () => {
    h.requireAuth.mockResolvedValue({ id: 'admin', role: 'TENANT_ADMIN', orgId: 'org-1' });
    h.userHasRole.mockImplementation((_u: unknown, r: string) => r === 'TENANT_ADMIN');
    const res = await downloadGET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('honours a SECONDARY admin role for the exemption', async () => {
    h.requireAuth.mockResolvedValue({ id: 'x', role: 'MANAGER', secondaryRole: 'SUB_ADMIN', orgId: 'org-1' });
    h.userHasRole.mockImplementation((_u: unknown, r: string) => r === 'SUB_ADMIN');
    const res = await downloadGET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('404s across tenants even for the owner id', async () => {
    h.requireAuth.mockResolvedValue({ id: 'owner', role: 'LEARNER', orgId: 'org-2' });
    const res = await downloadGET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it('still refuses a learner who failed the course', async () => {
    h.certFindUnique.mockResolvedValue({ ...ISSUED, passed: false });
    h.requireAuth.mockResolvedValue({ id: 'owner', role: 'LEARNER', orgId: 'org-1' });
    const res = await downloadGET(req(), ctx);
    expect(res.status).toBe(403);
  });
});
