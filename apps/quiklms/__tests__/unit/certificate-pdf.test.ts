/**
 * GAP_REPORT §3.2 certificates — "POST /certificates/generate produces no PDF
 * and no QR. It stores pdfUrl: '', qrCodeUrl: ''. The tenant's template is never
 * loaded — buildCertificatePdf ignores certificateTemplateId entirely and renders
 * a hardcoded generic indigo layout. Background, logo, signature, textPlacements,
 * designation and signatoryName are all dropped."
 *
 * These tests assert on the produced BYTES and on the S3 calls, so they fail if
 * the renderer regresses to a placeholder or stops honouring the template.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  put: vi.fn(),
  getFrom: vi.fn(),
  certCreate: vi.fn(),
  certUpdate: vi.fn(),
  certFindFirst: vi.fn(),
  templateFindUnique: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({
  putObject: h.put,
  getObjectBufferFrom: h.getFrom,
  S3_BUCKET: 'test-bucket',
  presignFromUrlOrKey: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsCertificateIssued: { create: h.certCreate, update: h.certUpdate, findFirst: h.certFindFirst },
    lmsCertificate: { findUnique: h.templateFindUnique },
  },
}));

import { buildCertificatePdf, generateCertificate } from '@/lib/services/certificates-service';

const CERT = {
  id: 'i1',
  orgId: 'org-1',
  learnerId: 'u1',
  courseId: 'c1',
  certificateTemplateId: 't1',
  certificateId: 'CERT-123-abc',
  courseName: 'Fire Safety',
  learnerName: 'Ada Lovelace',
  verificationUrl: 'https://app.test/verify-certificate/CERT-123-abc',
  issuedAt: new Date('2026-01-15T00:00:00Z'),
  pdfUrl: '',
  qrCodeUrl: '',
  score: 92,
  passingScore: 70,
  passed: true,
  isComplianceCertificate: false,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TEMPLATE = {
  id: 't1',
  orgId: 'org-1',
  name: 'Tenant Template',
  backgroundImageUrl: 'https://b.s3.ap-south-1.amazonaws.com/bg.png',
  logoImageUrl: 'https://b.s3.ap-south-1.amazonaws.com/logo.png',
  signatureImageUrl: 'https://b.s3.ap-south-1.amazonaws.com/sig.png',
  designation: 'Head of Training',
  signatoryName: 'Grace Hopper',
  textPlacements: {
    userName: { x: 50, y: 45, fontSize: 30, color: '#112233' },
    courseName: { x: 50, y: 58, fontSize: 18, color: '#334455' },
    date: { x: 20, y: 88, fontSize: 12, color: '#666666' },
  },
  logoPlacement: { x: 50, y: 12, width: 140, height: 70 },
  signaturePlacement: { x: 75, y: 82, width: 300, height: 110 },
  isActive: true,
  approvalStatus: 'approved',
};

/** A 1x1 PNG — enough for jsPDF's addImage to accept. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Mock storage: object reads return a real PNG; writes succeed. */
function mockS3() {
  h.getFrom.mockResolvedValue(Buffer.from(PNG_1x1));
  h.put.mockResolvedValue(undefined);
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  mockS3();
  h.certFindFirst.mockResolvedValue(null);
  h.certCreate.mockImplementation(async ({ data }: any) => ({ ...CERT, ...data }));
  h.certUpdate.mockImplementation(async ({ data }: any) => ({ ...CERT, ...data }));
  h.templateFindUnique.mockResolvedValue(TEMPLATE);
});

describe('buildCertificatePdf', () => {
  it('produces a real, non-trivial PDF', async () => {
    const buf = await buildCertificatePdf(CERT as never, TEMPLATE as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('embeds the learner name and course into the document', async () => {
    const buf = await buildCertificatePdf(CERT as never, TEMPLATE as never);
    // jsPDF writes text uncompressed by default, so the strings are findable.
    const raw = buf.toString('latin1');
    expect(raw).toContain('Ada Lovelace');
    expect(raw).toContain('Fire Safety');
  });

  it('loads the template images rather than ignoring them', async () => {
    await buildCertificatePdf(CERT as never, TEMPLATE as never);
    // getObjectBufferFrom(bucket, key) — the key is the 2nd argument.
    const gets = h.getFrom.mock.calls.map((c: any) => c[1]);
    // background + logo + signature — the three the old renderer dropped.
    expect(gets).toEqual(expect.arrayContaining(['bg.png', 'logo.png', 'sig.png']));
  });

  it('renders the template signatory and designation', async () => {
    const raw = (await buildCertificatePdf(CERT as never, TEMPLATE as never)).toString('latin1');
    expect(raw).toContain('Grace Hopper');
    expect(raw).toContain('Head of Training');
  });

  it('honours a generate-time designation override', async () => {
    const raw = (await buildCertificatePdf(CERT as never, TEMPLATE as never, 'Chief Examiner')).toString('latin1');
    expect(raw).toContain('Chief Examiner');
    expect(raw).not.toContain('Head of Training');
  });

  it('still renders when the template has no images', async () => {
    const bare = { ...TEMPLATE, backgroundImageUrl: '', logoImageUrl: null, signatureImageUrl: null };
    const buf = await buildCertificatePdf(CERT as never, bare as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('does not fail issuance when an image fetch throws', async () => {
    h.getFrom.mockRejectedValue(new Error('storage down'));
    const buf = await buildCertificatePdf(CERT as never, TEMPLATE as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('Ada Lovelace');
  });

  it('falls back to the generic layout with no template', async () => {
    const raw = (await buildCertificatePdf(CERT as never, null)).toString('latin1');
    expect(raw).toContain('Certificate of Completion');
    expect(raw).toContain('Ada Lovelace');
  });

  it('the template path does NOT emit the generic hardcoded heading', async () => {
    // Proof the tenant's design is used rather than the old fixed layout.
    const raw = (await buildCertificatePdf(CERT as never, TEMPLATE as never)).toString('latin1');
    expect(raw).not.toContain('This is proudly presented to');
  });
});

describe('generateCertificate — no more empty pdfUrl/qrCodeUrl', () => {
  const input = {
    orgId: 'org-1',
    learnerId: 'u1',
    courseId: 'c1',
    certificateTemplateId: 't1',
    userName: 'Ada Lovelace',
    courseName: 'Fire Safety',
  };

  it('uploads a PDF and a QR, then stores both urls', async () => {
    const out = await generateCertificate(input);

    // The service mints a fresh certificateId — read it back rather than
    // assuming one, so the key assertions stay honest.
    const newId = h.certCreate.mock.calls[0][0].data.certificateId as string;
    expect(newId).toMatch(/^CERT-\d+-[a-z0-9]+$/);

    // putObject(key, body, contentType)
    const puts = h.put.mock.calls.map((c: any) => ({ key: c[0], type: c[2] }));

    expect(puts).toEqual(
      expect.arrayContaining([
        { key: `certificates/templates/generated/${newId}.pdf`, type: 'application/pdf' },
        { key: `certificates/templates/qr/${newId}.png`, type: 'image/png' },
      ]),
    );
    expect(out.pdfUrl).toContain('certificates/templates/generated/');
    expect(out.qrCodeUrl).toContain('certificates/templates/qr/');
    expect(out.pdfUrl).not.toBe('');
    expect(out.qrCodeUrl).not.toBe('');
  });

  it('keeps the certificate record when the upload fails — a storage outage must not cost a certificate', async () => {
    h.put.mockRejectedValue(new Error('storage down'));

    const out = await generateCertificate(input);
    // The record survives with the id it was created under.
    expect(out.certificateId).toBe(h.certCreate.mock.calls[0][0].data.certificateId);
    expect(h.certUpdate).not.toHaveBeenCalled(); // no urls to attach
  });

  it('honours the duplicate guard', async () => {
    h.certFindFirst.mockResolvedValue({ ...CERT, pdfUrl: 'existing.pdf' });
    const out = await generateCertificate(input);
    expect(out.pdfUrl).toBe('existing.pdf');
    expect(h.certCreate).not.toHaveBeenCalled();
  });

  it('loads the tenant template for the render', async () => {
    await generateCertificate(input);
    expect(h.templateFindUnique).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});
