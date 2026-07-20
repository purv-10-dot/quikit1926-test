/**
 * GAP_REPORT §3.2 / priority #18 — "Fix the certificate verification URL:
 * BACKEND_URL/API_BASE_URL/PLATFORM_NAME have zero hits in the new app. Every QR
 * code points at the wrong host with the /download segment dropped."
 *
 * The finding was WRONG about the QR (see certificate-pdf tests — the QR uses
 * FRONTEND_URL and is correct, exactly as `certificates.service.ts:476` does).
 * The real gap those three env vars pointed at: `generateCertificateForCompletion`
 * never sent the certificate-earned EMAIL at all (`progress.service.ts:745-778`),
 * so a learner was never told the certificate existed. That email is where
 * BACKEND_URL / PLATFORM_NAME / the `/download` segment actually belong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pin the host BEFORE the service is imported — FRONTEND_URL/BACKEND_URL are
// module-level consts resolved at import time.
//
// This must be explicit, not ambient: Vite defines `BASE_URL` as a built-in and
// Vitest leaves `process.env.BASE_URL === '/'`. Since FRONTEND_URL falls back to
// BASE_URL, an un-pinned test silently resolves the host to '/' and every link
// assertion becomes meaningless.
vi.hoisted(() => {
  process.env.FRONTEND_URL = 'https://lms.test';
  delete process.env.BACKEND_URL;
  delete process.env.API_BASE_URL;
  delete process.env.PLATFORM_NAME;
});

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  progressFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  courseFindFirst: vi.fn(),
  masterFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  assignmentFindFirst: vi.fn(),
  attemptFindFirst: vi.fn(),
  assessmentFindFirst: vi.fn(),
  certFindFirst: vi.fn(),
  certCreate: vi.fn(),
  certUpdate: vi.fn(),
  templateFindMany: vi.fn(),
  templateFindUnique: vi.fn(),
  templateUpdateMany: vi.fn(),
  emailTemplateFindUnique: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/s3', () => ({
  s3: { send: h.send },
  S3_BUCKET: 'b',
  presignGet: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsProgress: { findUnique: h.progressFindUnique },
    lmsUser: { findUnique: h.userFindUnique, findMany: vi.fn() },
    lmsCourse: { findFirst: h.courseFindFirst },
    lmsMasterCourse: { findUnique: h.masterFindUnique, findMany: vi.fn() },
    lmsTenant: { findUnique: h.tenantFindUnique, findMany: vi.fn() },
    lmsCourseAssignment: { findFirst: h.assignmentFindFirst },
    lmsQuizAttempt: { findFirst: h.attemptFindFirst },
    lmsAssessment: { findFirst: h.assessmentFindFirst },
    lmsCertificateIssued: { findFirst: h.certFindFirst, create: h.certCreate, update: h.certUpdate },
    lmsCertificate: { findMany: h.templateFindMany, findUnique: h.templateFindUnique, updateMany: h.templateUpdateMany },
    lmsEmailTemplate: { findUnique: h.emailTemplateFindUnique },
  },
}));

import { generateCertificateForCompletion } from '@/lib/services/certificates-service';
import { sendTemplateEmail } from '@/lib/services/email-templates-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.send.mockResolvedValue({});
  h.progressFindUnique.mockResolvedValue({
    orgId: 'org-1', learnerId: 'u1', courseId: 'c1',
    completionPercentage: 100, status: 'Completed', isPassed: true,
    quizScore: 88, scorePercentage: 92, completedAt: new Date('2026-02-03T00:00:00Z'),
  });
  h.userFindUnique.mockResolvedValue({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.dev' });
  h.courseFindFirst.mockResolvedValue({ title: 'Fire Safety' });
  h.tenantFindUnique.mockResolvedValue({ featureConfig: {}, corporateConfig: {}, contactRoleInOrganization: 'Head' });
  h.assignmentFindFirst.mockResolvedValue(null);
  h.attemptFindFirst.mockResolvedValue(null);
  h.certFindFirst.mockResolvedValue(null);
  h.certCreate.mockImplementation(async ({ data }: any) => ({ id: 'i1', ...data }));
  // The update must carry the CREATED certificateId through — the service mints
  // it, and hardcoding one here would hide a mismatch between the mailed link
  // and the record.
  h.certUpdate.mockImplementation(async ({ data }: any) => ({
    ...(h.certCreate.mock.calls[0]?.[0]?.data ?? {}),
    id: 'i1',
    ...data,
  }));
  h.templateFindMany.mockResolvedValue([]);
  h.emailTemplateFindUnique.mockResolvedValue(null); // fall back to the built-in template
});

describe('certificate-earned email', () => {
  it('mails the learner when a certificate is issued', async () => {
    await generateCertificateForCompletion('org-1', 'u1', 'c1');

    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const mail = h.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('ada@test.dev');
    expect(mail.subject).toContain('Fire Safety');
  });

  it('points the download link at THIS app with the /api prefix and /download segment', async () => {
    await generateCertificateForCompletion('org-1', 'u1', 'c1');

    const certificateId = h.certCreate.mock.calls[0][0].data.certificateId as string;
    const { html } = h.sendEmail.mock.calls[0][0];

    expect(html).toContain(`https://lms.test/api/verify-certificate/${certificateId}/download`);
    // The legacy default host is the retired NestJS box — never mail a dead link.
    expect(html).not.toContain('quikskillsbackend.moreyeahs.in');
  });

  it('substitutes every placeholder — none left unrendered', async () => {
    await generateCertificateForCompletion('org-1', 'u1', 'c1');
    const { html, subject } = h.sendEmail.mock.calls[0][0];
    expect(html).toContain('Ada Lovelace');
    expect(html).not.toMatch(/\{\{\w+\}\}/);
    expect(subject).not.toMatch(/\{\{\w+\}\}/);
  });

  it('does not mail when no certificate is issued (course not complete)', async () => {
    h.progressFindUnique.mockResolvedValue({
      orgId: 'org-1', learnerId: 'u1', courseId: 'c1',
      completionPercentage: 40, status: 'InProgress', isPassed: true, quizScore: null, scorePercentage: null,
    });
    await generateCertificateForCompletion('org-1', 'u1', 'c1');
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('does not re-mail a certificate that was already issued', async () => {
    h.certFindFirst.mockResolvedValue({ id: 'i1', certificateId: 'CERT-OLD' });
    await generateCertificateForCompletion('org-1', 'u1', 'c1');
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('a mail failure never costs the learner their certificate', async () => {
    h.sendEmail.mockRejectedValue(new Error('SMTP down'));
    await expect(generateCertificateForCompletion('org-1', 'u1', 'c1')).resolves.toBeUndefined();
    expect(h.certCreate).toHaveBeenCalled(); // the certificate still exists
  });
});

describe('sendTemplateEmail', () => {
  it("maps the legacy 'certificate-earned' alias onto the certificate template", async () => {
    await sendTemplateEmail({ to: 'a@b.test', template: 'certificate-earned', data: { courseName: 'Ethics' } });
    expect(h.emailTemplateFindUnique).toHaveBeenCalledWith({ where: { type: 'certificate' } });
    expect(h.sendEmail.mock.calls[0][0].subject).toContain('Ethics');
  });

  it('prefers a tenant-saved template over the built-in default', async () => {
    h.emailTemplateFindUnique.mockResolvedValue({ subject: 'Hi {{studentName}}', htmlContent: '<p>{{courseName}}</p>' });
    await sendTemplateEmail({ to: 'a@b.test', template: 'certificate', data: { studentName: 'Ada', courseName: 'Ethics' } });
    expect(h.sendEmail).toHaveBeenCalledWith({ to: 'a@b.test', subject: 'Hi Ada', html: '<p>Ethics</p>' });
  });

  it('inserts values literally — a $& in the data must not corrupt the body', async () => {
    h.emailTemplateFindUnique.mockResolvedValue({ subject: 's', htmlContent: '<p>{{courseName}}</p>' });
    await sendTemplateEmail({ to: 'a@b.test', template: 'certificate', data: { courseName: 'A $& B' } });
    expect(h.sendEmail.mock.calls[0][0].html).toBe('<p>A $& B</p>');
  });

  it('leaves a placeholder with no matching key untouched, as the legacy did', async () => {
    h.emailTemplateFindUnique.mockResolvedValue({ subject: 's', htmlContent: '<p>{{unknownKey}}</p>' });
    await sendTemplateEmail({ to: 'a@b.test', template: 'certificate', data: { courseName: 'x' } });
    expect(h.sendEmail.mock.calls[0][0].html).toBe('<p>{{unknownKey}}</p>');
  });

  it('never throws — a send failure is swallowed and logged', async () => {
    h.sendEmail.mockRejectedValue(new Error('SMTP down'));
    await expect(sendTemplateEmail({ to: 'a@b.test', template: 'certificate', data: {} })).resolves.toBeUndefined();
  });
});
