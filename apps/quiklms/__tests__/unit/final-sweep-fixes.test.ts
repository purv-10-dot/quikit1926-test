/**
 * Final sweep — the last round of findings.
 *
 *  - certificates: the PUBLIC verification page printed "N/A" for learner,
 *    course and template because the populates were dropped and the page read
 *    properties off raw uuid strings (truthy, so every block rendered empty).
 *  - certificates: `selectedTenants` was never returned, so every
 *    tenant-restricted template showed the "Global Availability" badge; and
 *    `updateTemplate` silently discarded a re-assignment.
 *  - homework: `DELETE /homework/:id` cascade-wiped every student's submission,
 *    grade, feedback and rubric — Mongo left them intact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  issuedFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  templateFindUnique: vi.fn(),
  masterFindMany: vi.fn(),
  courseFindMany: vi.fn(),
  templateUpdateMany: vi.fn(),
  selDeleteMany: vi.fn(),
  selCreateMany: vi.fn(),
  transaction: vi.fn(),
  hwFindUnique: vi.fn(),
  hwDelete: vi.fn(),
  subCount: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1', env: { ENCRYPTION_KEY: 'k'.repeat(32), DATABASE_URL: 'x' } }));
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() }, S3_BUCKET: 'b', presignGet: vi.fn(), presignFromUrlOrKey: vi.fn(),
}));
vi.mock('@/lib/services/email-templates-service', () => ({ sendTemplateEmail: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsCertificateIssued: { findUnique: h.issuedFindUnique, findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    lmsCertificate: { findUnique: h.templateFindUnique, updateMany: h.templateUpdateMany, findMany: vi.fn(), create: vi.fn() },
    lmsCertificateSelectedTenant: { deleteMany: h.selDeleteMany, createMany: h.selCreateMany },
    lmsUser: { findUnique: h.userFindUnique, findMany: vi.fn() },
    lmsMasterCourse: { findMany: h.masterFindMany },
    lmsCourse: { findMany: h.courseFindMany },
    lmsHomework: { findUnique: h.hwFindUnique, delete: h.hwDelete },
    lmsHomeworkSubmission: { count: h.subCount, findMany: vi.fn() },
    lmsBatch: { findUnique: vi.fn() },
    lmsTenant: { findMany: vi.fn() },
    $transaction: h.transaction,
  },
}));

import { verifyCertificate, updateTemplate } from '@/lib/services/certificates-service';
import { remove as removeHomework } from '@/lib/services/homework-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.masterFindMany.mockResolvedValue([]);
  h.courseFindMany.mockResolvedValue([]);
  h.templateUpdateMany.mockResolvedValue({ count: 1 });
  h.templateFindUnique.mockResolvedValue({ id: 't1', name: 'Gold', selectedTenants: [] });
  h.selDeleteMany.mockResolvedValue({ count: 0 });
  h.selCreateMany.mockResolvedValue({ count: 0 });
  h.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ lmsCertificateSelectedTenant: { deleteMany: h.selDeleteMany, createMany: h.selCreateMany } }),
  );
  h.subCount.mockResolvedValue(0);
  h.hwFindUnique.mockResolvedValue({ id: 'hw1', orgId: 'org-1' });
});

describe('public certificate verification names the learner, course and template', () => {
  beforeEach(() => {
    h.issuedFindUnique.mockResolvedValue({
      id: 'i1', certificateId: 'CERT-1', learnerId: 'u1', courseId: 'c1',
      certificateTemplateId: 't1', courseName: 'Fire Safety',
    });
    h.userFindUnique.mockResolvedValue({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace', email: 'a@b.test' });
    h.masterFindMany.mockResolvedValue([{ id: 'c1', title: 'Fire Safety', description: null }]);
  });

  it('populates the learner as an object with a name', async () => {
    const cert = await verifyCertificate('CERT-1');
    // The page reads certificate.learnerId.name — a raw string printed "N/A".
    expect(cert!.learnerId).toMatchObject({ _id: 'u1', name: 'Ada Lovelace' });
  });

  it('populates the course title', async () => {
    const cert = await verifyCertificate('CERT-1');
    expect(cert!.courseId).toMatchObject({ title: 'Fire Safety' });
  });

  it('populates the template name', async () => {
    const cert = await verifyCertificate('CERT-1');
    expect(cert!.certificateTemplateId).toMatchObject({ _id: 't1', name: 'Gold' });
  });

  it('falls back to the stored courseName when the course row is gone', async () => {
    h.masterFindMany.mockResolvedValue([]);
    const cert = await verifyCertificate('CERT-1');
    expect(cert!.courseId).toMatchObject({ title: 'Fire Safety' });
  });

  it('returns null for an unknown certificate id', async () => {
    h.issuedFindUnique.mockResolvedValue(null);
    expect(await verifyCertificate('nope')).toBeNull();
  });
});

describe('updateTemplate persists the tenant assignment', () => {
  it('replaces selectedTenants instead of silently dropping them', async () => {
    await updateTemplate('t1', { name: 'Gold', selectedTenants: ['org-a', 'org-b'] });
    expect(h.selDeleteMany).toHaveBeenCalledWith({ where: { certificateId: 't1' } });
    expect(h.selCreateMany.mock.calls[0][0].data).toEqual([
      { certificateId: 't1', orgId: 'org-a' },
      { certificateId: 't1', orgId: 'org-b' },
    ]);
  });

  it('an empty array clears the assignment (template becomes global)', async () => {
    await updateTemplate('t1', { selectedTenants: [] });
    expect(h.selDeleteMany).toHaveBeenCalled();
    expect(h.selCreateMany).not.toHaveBeenCalled();
  });

  it('leaves the assignment alone when the field is absent', async () => {
    await updateTemplate('t1', { name: 'Renamed' });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('drops payload keys that are not template columns, rather than 500ing', async () => {
    await updateTemplate('t1', { name: 'Gold', _id: 'x', createdAt: 'y', someUiState: true });
    const data = h.templateUpdateMany.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'Gold' });
  });
});

describe('deleting homework never destroys student work', () => {
  it('deletes an assignment nobody submitted to', async () => {
    await removeHomework('org-1', 'hw1');
    expect(h.hwDelete).toHaveBeenCalledWith({ where: { id: 'hw1' } });
  });

  it('refuses when submissions exist, and says how many', async () => {
    h.subCount.mockResolvedValue(17);
    await expect(removeHomework('org-1', 'hw1')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('17 student submission(s)'),
    });
    expect(h.hwDelete).not.toHaveBeenCalled();
  });

  it('still 404s another tenant’s homework', async () => {
    h.hwFindUnique.mockResolvedValue({ id: 'hw1', orgId: 'org-2' });
    await expect(removeHomework('org-1', 'hw1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
