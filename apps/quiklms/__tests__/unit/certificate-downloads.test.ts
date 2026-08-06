/**
 * GAP_REPORT §3.2 certificates — the download/upload/approval-queue gaps:
 *
 *  1. `GET /:id/download-url` returned a PERMANENT public link. `pdfUrl` was ''
 *     so it fell through to `cert.verificationUrl` — unexpiring, unauthenticated
 *     — where the legacy returned a short-lived presigned S3 URL.
 *  2. `regeneratePdfForIssuedCertificate` never uploaded or persisted anything,
 *     and rendered with NO template, so every regenerated PDF was the generic
 *     fallback rather than the tenant's current design.
 *  3. The three upload-* endpoints never touched S3: `s3Key` was always null.
 *  4. `pending-approvals` / `all-approval-items` lost their populates, so the
 *     Super Admin queue got bare ids and rendered blanks.
 *
 * These assert on the S3 calls and the persisted record, so they fail if any of
 * it regresses to a stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  put: vi.fn(),
  getFrom: vi.fn(),
  presignGet: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
  certFindFirst: vi.fn(),
  certFindUnique: vi.fn(),
  certUpdate: vi.fn(),
  templateFindMany: vi.fn(),
  templateFindUnique: vi.fn(),
  templateUpdateMany: vi.fn(),
  userFindMany: vi.fn(),
  tenantFindMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({
  putObject: h.put,
  getObjectBufferFrom: h.getFrom,
  S3_BUCKET: 'test-bucket',
  presignGet: h.presignGet,
  presignFromUrlOrKey: h.presignFromUrlOrKey,
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsCertificateIssued: { findFirst: h.certFindFirst, findUnique: h.certFindUnique, update: h.certUpdate },
    lmsCertificate: { findMany: h.templateFindMany, findUnique: h.templateFindUnique, updateMany: h.templateUpdateMany },
    lmsUser: { findMany: h.userFindMany },
    lmsTenant: { findMany: h.tenantFindMany },
  },
}));

import {
  getPresignedDownloadUrl,
  regeneratePdfForIssuedCertificate,
  selectTemplateForIssued,
  uploadCertificateAsset,
  findPendingApprovals,
} from '@/lib/services/certificates-service';

const CERT = {
  id: 'i1',
  orgId: 'org-1',
  learnerId: 'u1',
  courseId: 'c1',
  certificateTemplateId: 't-old',
  certificateId: 'CERT-1',
  courseName: 'Fire Safety',
  learnerName: 'Ada Lovelace',
  verificationUrl: 'https://app.test/verify-certificate/CERT-1',
  issuedAt: new Date('2026-01-15T00:00:00Z'),
  pdfUrl: '',
  qrCodeUrl: '',
  score: 92,
  passingScore: 70,
  passed: true,
};

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const DATA_BG = `data:image/png;base64,${PNG_1x1.toString('base64')}`;

const tpl = (over: Record<string, unknown>) => ({
  id: 't1',
  orgId: 'org-1',
  name: 'T',
  backgroundImageUrl: DATA_BG,
  logoImageUrl: null,
  signatureImageUrl: null,
  designation: null,
  signatoryName: null,
  textPlacements: null,
  logoPlacement: null,
  signaturePlacement: null,
  isActive: true,
  approvalStatus: 'approved',
  submittedBy: null,
  submittedByTenantId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...over,
});

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.put.mockResolvedValue(undefined);
  h.getFrom.mockResolvedValue(Buffer.from(PNG_1x1));
  h.presignGet.mockResolvedValue('https://signed.example/cert.pdf?X-Amz-Expires=3600');
  h.presignFromUrlOrKey.mockImplementation(async (u: string) => `${u}?signed`);
  h.certUpdate.mockImplementation(async ({ data }: any) => ({ ...CERT, ...data }));
  h.templateFindMany.mockResolvedValue([]);
  h.templateFindUnique.mockResolvedValue(null);
  h.userFindMany.mockResolvedValue([]);
  h.tenantFindMany.mockResolvedValue([]);
});

describe('getPresignedDownloadUrl — no more permanent public links', () => {
  it('returns a short-lived presigned S3 url, never the verification url', async () => {
    h.certFindFirst.mockResolvedValue({
      ...CERT,
      pdfUrl: 'https://storage.googleapis.com/test-bucket/certificates/templates/generated/CERT-1.pdf',
    });

    const url = await getPresignedDownloadUrl('i1', 'org-1', 'u1');

    expect(h.presignGet).toHaveBeenCalledWith('certificates/templates/generated/CERT-1.pdf', 3600);
    expect(url).toBe('https://signed.example/cert.pdf?X-Amz-Expires=3600');
    // The regression: falling through to the unexpiring public verification url.
    expect(url).not.toContain('verify-certificate');
  });

  it('enforces ownership in the query — id + org + learner', async () => {
    h.certFindFirst.mockResolvedValue(null);
    await expect(getPresignedDownloadUrl('i1', 'org-1', 'someone-else')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Certificate not found',
    });
    expect(h.certFindFirst).toHaveBeenCalledWith({ where: { id: 'i1', orgId: 'org-1', learnerId: 'someone-else' } });
    expect(h.presignGet).not.toHaveBeenCalled();
  });

  it('404s without an org rather than presigning cross-tenant', async () => {
    await expect(getPresignedDownloadUrl('i1', null, 'u1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Tenant ID is required',
    });
    expect(h.certFindFirst).not.toHaveBeenCalled();
  });

  it('404s when the certificate has no stored pdf', async () => {
    h.certFindFirst.mockResolvedValue({ ...CERT, pdfUrl: '' });
    await expect(getPresignedDownloadUrl('i1', 'org-1', 'u1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Certificate PDF not found',
    });
  });

  it('falls back to the conventional key when pdfUrl is not an s3 url', async () => {
    h.certFindFirst.mockResolvedValue({ ...CERT, pdfUrl: 'legacy-value-with-no-host' });
    await getPresignedDownloadUrl('i1', 'org-1', 'u1');
    expect(h.presignGet).toHaveBeenCalledWith('certificates/CERT-1.pdf', 3600);
  });
});

describe('regeneratePdfForIssuedCertificate — uploads and persists', () => {
  it('uploads the fresh PDF and stores the new pdfUrl', async () => {
    h.certFindFirst.mockResolvedValue(CERT);
    h.templateFindMany.mockResolvedValue([tpl({ id: 't-new' })]);

    const { buffer, certificate } = await regeneratePdfForIssuedCertificate('i1');

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Drawn with the tenant's template, NOT the generic fallback layout.
    expect(buffer.toString('latin1')).not.toContain('This is proudly presented to');
    // putObject(key, body, contentType)
    expect(h.put.mock.calls).toHaveLength(1);
    expect(h.put.mock.calls[0][0]).toBe('certificates/templates/generated/CERT-1.pdf');
    expect(certificate.pdfUrl).toBe(
      'https://storage.googleapis.com/test-bucket/certificates/templates/generated/CERT-1.pdf',
    );
  });

  it("re-points certificateTemplateId at the template it actually drew with", async () => {
    h.certFindFirst.mockResolvedValue(CERT); // stored template is 't-old'
    h.templateFindMany.mockResolvedValue([tpl({ id: 't-new' })]);

    await regeneratePdfForIssuedCertificate('i1');

    expect(h.certUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ certificateTemplateId: 't-new' }) }),
    );
  });

  it('still returns a PDF when storage is down — a storage outage must not block a download', async () => {
    h.certFindFirst.mockResolvedValue(CERT);
    h.templateFindMany.mockResolvedValue([tpl({ id: 't-new' })]);
    h.put.mockRejectedValue(new Error('storage down'));

    const { buffer } = await regeneratePdfForIssuedCertificate('i1');
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(h.certUpdate).not.toHaveBeenCalled();
  });

  it('scopes the lookup by org when one is given', async () => {
    h.certFindFirst.mockResolvedValue(null);
    await expect(regeneratePdfForIssuedCertificate('i1', 'org-2')).rejects.toMatchObject({ statusCode: 404 });
    expect(h.certFindFirst).toHaveBeenCalledWith({ where: { id: 'i1', orgId: 'org-2' } });
  });
});

describe('selectTemplateForIssued — legacy candidate order', () => {
  it('prefers the tenant active template over the one stored on the record', async () => {
    h.templateFindMany.mockResolvedValue([tpl({ id: 't-active', isActive: true })]);
    const chosen = await selectTemplateForIssued({ ...CERT, certificateTemplateId: 't-old' } as never);
    expect(chosen?.id).toBe('t-active');
  });

  it('prefers an active template WITH an embedded background over an active one without', async () => {
    h.templateFindMany.mockResolvedValue([
      tpl({ id: 't-s3', isActive: true, backgroundImageUrl: 'https://other.example/bg.png' }),
      tpl({ id: 't-b64', isActive: true, backgroundImageUrl: DATA_BG }),
    ]);
    const chosen = await selectTemplateForIssued(CERT as never);
    expect(chosen?.id).toBe('t-b64');
  });

  it('never lets a base64 inactive template beat an active one', async () => {
    h.templateFindMany.mockResolvedValue([
      tpl({ id: 't-inactive-b64', isActive: false, backgroundImageUrl: DATA_BG }),
      tpl({ id: 't-active', isActive: true, backgroundImageUrl: DATA_BG }),
    ]);
    const chosen = await selectTemplateForIssued(CERT as never);
    expect(chosen?.id).toBe('t-active');
  });

  it('falls back to the stored template when the tenant has none assigned', async () => {
    h.templateFindMany.mockResolvedValue([]);
    h.templateFindUnique.mockResolvedValue(tpl({ id: 't-old' }));
    const chosen = await selectTemplateForIssued(CERT as never);
    expect(chosen?.id).toBe('t-old');
  });

  it('switches template when the chosen background fails to load', async () => {
    // t-broken is active but its stored background 404s; t-b64 carries an embedded one.
    h.getFrom.mockRejectedValue(new Error('AccessDenied'));
    h.templateFindMany.mockResolvedValue([
      tpl({ id: 't-broken', isActive: true, backgroundImageUrl: 'https://b.s3.ap-south-1.amazonaws.com/gone.png' }),
      tpl({ id: 't-b64', isActive: false, backgroundImageUrl: DATA_BG }),
    ]);
    const chosen = await selectTemplateForIssued(CERT as never);
    expect(chosen?.id).toBe('t-b64');
  });

  it('returns null when there is nothing to draw with', async () => {
    expect(await selectTemplateForIssued({ ...CERT, certificateTemplateId: null } as never)).toBeNull();
  });
});

describe('uploadCertificateAsset — s3Key is no longer always null', () => {
  it('puts the bytes in S3 and returns the key alongside the data url', async () => {
    const result = await uploadCertificateAsset(
      { buffer: PNG_1x1, originalName: 'my logo!.png', mimeType: 'image/png' },
      'certificates/logos',
      'denied',
    );

    const put = h.put.mock.calls[0] as any;
    expect(put[2]).toBe('image/png');
    // Legacy sanitisation: anything outside [A-Za-z0-9.-] becomes '_'.
    expect(put[0]).toMatch(/^certificates\/logos\/\d+-my_logo_\.png$/);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.s3Key).toBe(put[0]);
    expect(result.data.dataUrl).toBe(DATA_BG);
    // The data url stays the primary `url` — templates embed it so reading it
    // back never needs a storage read.
    expect(result.data.url).toBe(DATA_BG);
    expect(result.data.permanentUrl).toContain('?signed');
  });

  it('reports AccessDenied as a body rather than throwing', async () => {
    h.put.mockRejectedValue(Object.assign(new Error('nope'), { name: 'AccessDenied' }));
    const result = await uploadCertificateAsset(
      { buffer: PNG_1x1, originalName: 'a.png', mimeType: 'image/png' },
      'certificates/templates',
      'Storage permission denied.',
    );
    expect(result).toEqual({ success: false, message: 'Storage permission denied.', error: 'S3_ACCESS_DENIED' });
  });

  it('rethrows every other storage error', async () => {
    h.put.mockRejectedValue(Object.assign(new Error('boom'), { name: 'NetworkingError' }));
    await expect(
      uploadCertificateAsset({ buffer: PNG_1x1, originalName: 'a.png', mimeType: 'image/png' }, 'certificates/logos', 'd'),
    ).rejects.toThrow('boom');
  });
});

describe('approval queue populates', () => {
  it('replaces submittedBy / submittedByTenantId ids with the actor objects', async () => {
    h.templateFindMany.mockResolvedValue([tpl({ id: 'c1', submittedBy: 'u9', submittedByTenantId: 'org-9' })]);
    h.userFindMany.mockResolvedValue([{ id: 'u9', firstName: 'Grace', lastName: 'Hopper', email: 'g@h.test' }]);
    h.tenantFindMany.mockResolvedValue([{ id: 'org-9', orgName: 'Acme', contactEmail: 'c@acme.test' }]);

    const [item] = await findPendingApprovals();

    // The Super Admin queue reads .orgName / .firstName straight off these.
    expect(item.submittedByTenantId).toEqual({ _id: 'org-9', orgName: 'Acme', contactEmail: 'c@acme.test' });
    expect(item.submittedBy).toEqual({ _id: 'u9', firstName: 'Grace', lastName: 'Hopper', email: 'g@h.test' });
  });

  it('nulls a reference whose row is gone, as populate does', async () => {
    h.templateFindMany.mockResolvedValue([tpl({ id: 'c1', submittedBy: 'deleted', submittedByTenantId: 'gone' })]);
    const [item] = await findPendingApprovals();
    expect(item.submittedBy).toBeNull();
    expect(item.submittedByTenantId).toBeNull();
  });

  it('does not query actors when there are none to resolve', async () => {
    h.templateFindMany.mockResolvedValue([tpl({ id: 'c1' })]);
    const [item] = await findPendingApprovals();
    expect(item.submittedBy).toBeNull();
    expect(h.userFindMany).not.toHaveBeenCalled();
    expect(h.tenantFindMany).not.toHaveBeenCalled();
  });
});
