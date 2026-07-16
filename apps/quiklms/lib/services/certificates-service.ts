/**
 * Certificates service — ported from CertificatesService (Prisma).
 *
 * DEFERRED / SIMPLIFIED per re-platform rules:
 *   - S3 presigned enrichment is SKIPPED. The stored url is returned as-is.
 *     `*Presigned` / `*PreviewUrl` fields mirror the stored value (no signing).
 *   - PDF & QR generation (jsPDF/PDFKit/QRCode + html-pdf-node) are DEFERRED.
 *     `generateCertificate` / `generateDefaultCertificate` create the issuance
 *     record only, with a placeholder pdfUrl/qrCodeUrl. `regenerate*` returns
 *     an empty Buffer placeholder.
 *
 * Tables: certificate (templates), certificateIssued (issued), certificateSelectedTenant.
 * certificateId is the public verification id (CERT-...). courseId is scalar
 * (refs Course or MasterCourse). Never relation-include actor/course refs.
 */
import type { LmsCertificateApprovalStatus as CertificateApprovalStatus, LmsCertificateIssued as CertificateIssued } from '@prisma/client';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { NotFound } from '@/lib/http';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.BASE_URL || 'https://quikskills.quikit.ai';

function newCertificateId(): string {
  return `CERT-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function createTemplate(data: Record<string, unknown>) {
  const { selectedTenants, ...rest } = data as { selectedTenants?: string[] } & Record<string, unknown>;
  const created = await prisma.lmsCertificate.create({
    data: {
      ...(rest as object),
      ...(selectedTenants?.length
        ? { selectedTenants: { create: selectedTenants.map((orgId) => ({ orgId })) } }
        : {}),
    } as never,
  });
  if (created.isActive) await deactivateOtherTenantTemplates(created.id, created.orgId, created.submittedByTenantId);
  return created;
}

/** Returns certificate templates assigned to a tenant, or all for super admin (orgId undefined). */
export async function findAll(orgId?: string) {
  if (orgId) {
    const where = {
      OR: [
        { selectedTenants: { some: { orgId } } },
        { orgId },
        { submittedByTenantId: orgId },
      ],
    };
    let certs = await prisma.lmsCertificate.findMany({ where: { AND: [where, { isActive: true }] } });
    if (certs.length === 0) {
      certs = await prisma.lmsCertificate.findMany({ where: { AND: [where, { approvalStatus: 'approved' }] } });
      if (certs.length) {
        await prisma.lmsCertificate.updateMany({ where: { id: { in: certs.map((c) => c.id) } }, data: { isActive: true } });
        certs = certs.map((c) => ({ ...c, isActive: true }));
      }
    }
    if (certs.length === 0) {
      certs = await prisma.lmsCertificate.findMany({ where });
      if (certs.length) {
        await prisma.lmsCertificate.updateMany({ where: { id: { in: certs.map((c) => c.id) } }, data: { isActive: true, approvalStatus: 'approved' } });
      }
    }
    return certs;
  }
  return prisma.lmsCertificate.findMany();
}

export async function findPendingApprovals() {
  return prisma.lmsCertificate.findMany({ where: { approvalStatus: 'pending_approval' }, orderBy: { createdAt: 'desc' } });
}

export async function findAllApprovalItems() {
  return prisma.lmsCertificate.findMany({
    where: { submittedByTenantId: { not: null }, approvalStatus: { in: ['pending_approval', 'approved', 'rejected'] } },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function findBySubmittedTenant(orgId: string) {
  return prisma.lmsCertificate.findMany({
    where: { OR: [{ submittedByTenantId: orgId }, { selectedTenants: { some: { orgId } } }] },
    orderBy: { updatedAt: 'desc' },
  });
}

async function deactivateOtherTenantTemplates(excludeId: string, orgId?: string | null, submittedByTenantId?: string | null) {
  const tid = orgId || submittedByTenantId;
  if (!tid) return;
  await prisma.lmsCertificate.updateMany({
    where: {
      id: { not: excludeId },
      isActive: true,
      OR: [{ orgId: tid }, { submittedByTenantId: tid }, { selectedTenants: { some: { orgId: tid } } }],
    },
    data: { isActive: false },
  });
}

export async function approve(id: string, approvedById: string) {
  const cert = await prisma.lmsCertificate.findUnique({ where: { id } });
  if (!cert) throw NotFound('Certificate template not found');
  if (cert.approvalStatus !== 'pending_approval') throw NotFound('Only pending certificates can be approved');
  const saved = await prisma.lmsCertificate.update({
    where: { id },
    data: { approvalStatus: 'approved', isActive: true, approvedBy: approvedById, approvalDate: new Date(), rejectionReason: null },
  });
  await deactivateOtherTenantTemplates(saved.id, saved.orgId, saved.submittedByTenantId);
  return saved;
}

export async function reject(id: string, rejectedById: string, reason: string) {
  const cert = await prisma.lmsCertificate.findUnique({ where: { id } });
  if (!cert) throw NotFound('Certificate template not found');
  if (cert.approvalStatus !== 'pending_approval') throw NotFound('Only pending certificates can be rejected');
  return prisma.lmsCertificate.update({
    where: { id },
    data: { approvalStatus: 'rejected', isActive: false, approvedBy: rejectedById, approvalDate: new Date(), rejectionReason: reason },
  });
}

/** A template is visible to a tenant if it owns / submitted / was assigned it. */
function tenantTemplateScope(orgId?: string | null) {
  if (!orgId) return undefined; // super-admin: no scoping
  return {
    OR: [
      { orgId },
      { submittedByTenantId: orgId },
      { selectedTenants: { some: { orgId } } },
    ],
  };
}

export async function findOne(id: string, orgId?: string | null) {
  const scope = tenantTemplateScope(orgId);
  const cert = await prisma.lmsCertificate.findFirst({ where: scope ? { AND: [{ id }, scope] } : { id } });
  if (!cert) throw NotFound('Certificate template not found');
  return cert;
}

export async function updateTemplate(id: string, data: Record<string, unknown>, orgId?: string | null) {
  const { selectedTenants, ...rest } = data as { selectedTenants?: string[] } & Record<string, unknown>;
  const scope = tenantTemplateScope(orgId);
  const result = await prisma.lmsCertificate.updateMany({
    where: scope ? { AND: [{ id }, scope] } : { id },
    data: rest as never,
  });
  if (result.count === 0) throw NotFound('Certificate template not found');
  return prisma.lmsCertificate.findUnique({ where: { id } });
}

export async function deleteTemplate(id: string) {
  try {
    await prisma.lmsCertificate.delete({ where: { id } });
  } catch {
    throw NotFound('Certificate template not found');
  }
}

export async function deleteAllTemplates() {
  const result = await prisma.lmsCertificate.deleteMany({});
  return result.count;
}

/** Keeps the oldest issued cert per (tenant, learner, course); removes the rest. */
export async function removeDuplicateIssuedCertificates() {
  const all = await prisma.lmsCertificateIssued.findMany({ orderBy: { createdAt: 'asc' } });
  const seen = new Map<string, string>();
  const toRemove: string[] = [];
  for (const c of all) {
    const key = `${c.orgId}|${c.learnerId}|${c.courseId}`;
    if (seen.has(key)) toRemove.push(c.id);
    else seen.set(key, c.id);
  }
  if (toRemove.length) await prisma.lmsCertificateIssued.deleteMany({ where: { id: { in: toRemove } } });
  return toRemove.length;
}

// ── Issuance (PDF/QR generation deferred; record-only) ───────────────────────

interface GenerateInput {
  certificateTemplateId?: string;
  learnerId: string;
  courseId: string;
  orgId: string;
  userName: string;
  courseName: string;
  designation?: string;
  isComplianceCertificate?: boolean;
  expiresAt?: Date;
  score?: number;
  passingScore?: number;
  passed?: boolean;
}

export async function generateCertificate(data: GenerateInput) {
  const { orgId, learnerId, courseId } = data;
  const existing = await prisma.lmsCertificateIssued.findFirst({ where: { orgId, learnerId, courseId } });
  if (existing) return existing;

  const certificateId = newCertificateId();
  const verificationUrl = `${FRONTEND_URL}/verify-certificate/${certificateId}`;
  // PDF/QR generation deferred — store placeholder urls.
  return prisma.lmsCertificateIssued.create({
    data: {
      orgId, learnerId, courseId,
      certificateTemplateId: data.certificateTemplateId ?? null,
      certificateId, courseName: data.courseName, learnerName: data.userName,
      pdfUrl: '', qrCodeUrl: '', verificationUrl, issuedAt: new Date(),
      isComplianceCertificate: Boolean(data.isComplianceCertificate), expiresAt: data.expiresAt ?? null,
      score: data.score ?? null, passingScore: data.passingScore ?? null, passed: data.passed ?? null,
    },
  });
}

export async function generateDefaultCertificate(data: GenerateInput) {
  return generateCertificate({ ...data, certificateTemplateId: undefined });
}

/**
 * Certificate completion generation — ported from ProgressService.generateCertificateForCompletion.
 * Re-verifies completion + quiz pass gate, selects active template, then issues.
 */
export async function generateCertificateForCompletion(orgId: string, learnerId: string, courseId: string): Promise<void> {
  const progress = await prisma.lmsProgress.findUnique({
    where: { orgId_learnerId_courseId: { orgId, learnerId, courseId } },
  });
  if (!progress) return;
  if (progress.completionPercentage < 100 && progress.status !== 'Completed') return;
  if (progress.quizScore != null && progress.isPassed !== true) return;

  // Already issued?
  const existing = await prisma.lmsCertificateIssued.findFirst({ where: { orgId, learnerId, courseId } });
  if (existing) return;

  const user = await prisma.lmsUser.findUnique({ where: { id: learnerId } });
  if (!user) return;

  // Course details — Course first, then MasterCourse.
  let course: { title: string; settings?: unknown } | null =
    await prisma.lmsCourse.findFirst({ where: { id: courseId }, select: { title: true } });
  let settings: Record<string, unknown> | undefined;
  if (!course) {
    const mc = await prisma.lmsMasterCourse.findUnique({ where: { id: courseId }, select: { title: true, settings: true } });
    if (mc) { course = { title: mc.title }; settings = (mc.settings as Record<string, unknown>) ?? undefined; }
  }
  if (!course) return;

  // Tenant feature + designation
  const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId } });
  const featureConfig = (tenant?.featureConfig as Record<string, unknown>) || {};
  if (featureConfig.enableCertificates === false) return;
  if (settings?.certificateEnabled === false && settings?.certificateTemplateId) return;

  // Compliance metadata
  const assignment = await prisma.lmsCourseAssignment.findFirst({
    where: { orgId, targetType: 'USER', targetId: learnerId, courseId },
    select: { isMandatory: true },
  });
  const isComplianceCertificate = Boolean(assignment?.isMandatory);
  const corporateConfig = (tenant?.corporateConfig as Record<string, unknown>) || {};
  const validityDays = settings?.validityDays;
  const expiryDays = Number.isFinite(validityDays)
    ? Number(validityDays)
    : isComplianceCertificate ? (corporateConfig.complianceDueDays as number | undefined) : undefined;
  const expiresAt = expiryDays && expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000) : undefined;

  const userName = `${user.firstName} ${user.lastName}`.trim() || user.email || 'Learner';

  // Active template selection (base64 preference)
  const templates = await findAll(orgId);
  const hasBase64 = (t: { backgroundImageUrl: string }) => t.backgroundImageUrl?.startsWith('data:');
  const sorted = [...templates].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
  );
  const active = sorted.find((c) => c.isActive && hasBase64(c)) || sorted.find((c) => c.isActive) || sorted.find((c) => hasBase64(c)) || sorted[0] || null;

  // Pass-criteria snapshot
  const certScore = typeof progress.scorePercentage === 'number'
    ? progress.scorePercentage
    : typeof progress.quizScore === 'number' ? progress.quizScore : undefined;
  let certPassingScore: number | undefined;
  try {
    const latestAttempt = await prisma.lmsQuizAttempt.findFirst({
      where: { orgId, learnerId, courseId }, orderBy: { submittedAt: 'desc' },
    });
    if (latestAttempt) {
      const a = await prisma.lmsAssessment.findFirst({ where: { id: latestAttempt.assessmentId }, select: { passingScore: true } });
      if (a && typeof a.passingScore === 'number') certPassingScore = a.passingScore;
    }
  } catch { /* best-effort */ }

  const passed = progress.isPassed === true ? true : certScore == null ? undefined : false;

  if (active) {
    await generateCertificate({
      certificateTemplateId: active.id, learnerId, courseId, orgId, userName,
      courseName: course.title, designation: active.designation || tenant?.contactRoleInOrganization || '',
      isComplianceCertificate, expiresAt, score: certScore, passingScore: certPassingScore, passed,
    });
  } else {
    await generateDefaultCertificate({
      learnerId, courseId, orgId, userName, courseName: course.title,
      designation: tenant?.contactRoleInOrganization || 'Course Administrator',
      isComplianceCertificate, expiresAt, score: certScore, passingScore: certPassingScore, passed,
    });
  }
}

// ── Issued cert listings ─────────────────────────────────────────────────────

async function resolveCourseMap(courseIds: string[]) {
  const map = new Map<string, { _id: string; title: string; description?: string | null }>();
  if (courseIds.length === 0) return map;
  const unique = [...new Set(courseIds)];
  const masters = await prisma.lmsMasterCourse.findMany({ where: { id: { in: unique } }, select: { id: true, title: true, description: true } });
  masters.forEach((mc) => map.set(mc.id, { _id: mc.id, title: mc.title, description: mc.description }));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) {
    const courses = await prisma.lmsCourse.findMany({ where: { id: { in: missing } }, select: { id: true, title: true, description: true } });
    courses.forEach((c) => map.set(c.id, { _id: c.id, title: c.title, description: c.description }));
  }
  return map;
}

export async function getLearnerCertificates(orgId: string, learnerId: string) {
  const certs = await prisma.lmsCertificateIssued.findMany({ where: { orgId, learnerId }, orderBy: { issuedAt: 'desc' } });
  const courseMap = await resolveCourseMap(certs.map((c) => c.courseId).filter(Boolean));
  const seen = new Set<string>();
  return certs
    .map((cert) => {
      const resolved = courseMap.get(cert.courseId);
      return {
        ...cert,
        courseId: resolved || (cert.courseId ? { _id: cert.courseId, title: cert.courseName || 'Course' } : null),
        courseName: resolved?.title || cert.courseName || 'Course',
      };
    })
    .filter((cert) => {
      const key = (cert.courseId as { _id?: string })?._id?.toString() || cert.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function getTenantIssuedCertificates(orgId: string) {
  const certs = await prisma.lmsCertificateIssued.findMany({ where: { orgId }, orderBy: { issuedAt: 'desc' } });
  const courseMap = await resolveCourseMap(certs.map((c) => c.courseId).filter(Boolean));
  const learnerIds = [...new Set(certs.map((c) => c.learnerId).filter(Boolean))];
  const learners = await prisma.lmsUser.findMany({
    where: { id: { in: learnerIds } }, select: { id: true, firstName: true, lastName: true, email: true },
  });
  const learnerMap = new Map(learners.map((l) => [l.id, l]));
  const seen = new Set<string>();
  return certs
    .map((cert) => {
      const resolved = courseMap.get(cert.courseId);
      return {
        ...cert,
        learnerId: learnerMap.get(cert.learnerId) || cert.learnerId,
        courseId: resolved || (cert.courseId ? { _id: cert.courseId, title: cert.courseName || 'Course' } : null),
        courseName: resolved?.title || cert.courseName || 'Course',
      };
    })
    .filter((cert) => {
      const learnKey = (cert.learnerId as { id?: string })?.id?.toString() || String(cert.learnerId) || 'unknown';
      const courseKey = (cert.courseId as { _id?: string })?._id?.toString() || cert.id;
      const key = `${learnKey}_${courseKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ── Verification + downloads (PDF generation deferred) ───────────────────────

export async function findIssuedById(id: string) {
  return prisma.lmsCertificateIssued.findUnique({ where: { id } });
}

export async function verifyCertificate(certificateId: string) {
  return prisma.lmsCertificateIssued.findUnique({ where: { certificateId } });
}

/** Download permission gate result — used by the authenticated download route. */
export function downloadGateBlocked(issued: { passed: boolean | null; score: number | null; passingScore: number | null } | null): boolean {
  if (!issued) return false;
  return (
    issued.passed === false ||
    (typeof issued.score === 'number' && typeof issued.passingScore === 'number' && issued.score < issued.passingScore)
  );
}

/**
 * Render an issued certificate to a real PDF (A4 landscape) using jsPDF.
 * Includes recipient name, course, issue date, certificate id, and a QR code
 * pointing at the public verification URL.
 */
export async function buildCertificatePdf(cert: CertificateIssued): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Background + decorative double border.
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setDrawColor(79, 70, 229); // indigo
  doc.setLineWidth(4);
  doc.rect(24, 24, pageW - 48, pageH - 48);
  doc.setLineWidth(1);
  doc.rect(36, 36, pageW - 72, pageH - 72);

  const centerX = pageW / 2;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.setFontSize(34);
  doc.text('Certificate of Completion', centerX, 130, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(15);
  doc.text('This is proudly presented to', centerX, 185, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(30);
  doc.text(cert.learnerName || 'Learner', centerX, 235, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(15);
  doc.text('for successfully completing the course', centerX, 285, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(22);
  doc.text(cert.courseName || 'Course', centerX, 325, { align: 'center', maxWidth: pageW - 160 });

  const issued = cert.issuedAt ? new Date(cert.issuedAt) : new Date();
  const issuedStr = issued.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (typeof cert.score === 'number') {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(13);
    doc.text(`Score: ${Math.round(cert.score)}%`, centerX, 360, { align: 'center' });
  }

  // Footer: date (left) + certificate id (center) + QR (right).
  const footerY = pageH - 80;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(12);
  doc.text(`Issued on ${issuedStr}`, 80, footerY);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Certificate ID: ${cert.certificateId}`, centerX, footerY, { align: 'center' });
  if (cert.verificationUrl) {
    doc.text(`Verify at: ${cert.verificationUrl}`, centerX, footerY + 16, { align: 'center', maxWidth: pageW - 320 });
  }

  // QR code → verification URL.
  try {
    const qrTarget = cert.verificationUrl || `${FRONTEND_URL}/verify-certificate/${cert.certificateId}`;
    const qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 120 });
    doc.addImage(qrDataUrl, 'PNG', pageW - 160, footerY - 70, 90, 90);
  } catch {
    /* QR is decorative; skip on failure */
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/** Regenerate PDF for an issued certificate (tenant-scoped when orgId given). */
export async function regeneratePdfForIssuedCertificate(id: string, orgId?: string | null) {
  const where: { id: string; orgId?: string } = { id };
  if (orgId) where.orgId = orgId;
  const cert = await prisma.lmsCertificateIssued.findFirst({ where });
  if (!cert) throw NotFound('Issued certificate not found');
  const buffer = await buildCertificatePdf(cert);
  return { buffer, certificate: cert };
}

export async function regeneratePdfByCertificateId(certificateId: string) {
  const cert = await prisma.lmsCertificateIssued.findUnique({ where: { certificateId } });
  if (!cert) throw NotFound('Certificate not found');
  const buffer = await buildCertificatePdf(cert);
  return { buffer, certificate: cert };
}

/** Stored download url (no S3 presigning). */
export async function getDownloadUrl(id: string, orgId: string | null, learnerId: string) {
  const where: { id: string; orgId?: string; learnerId?: string } = { id };
  if (orgId) where.orgId = orgId;
  if (learnerId) where.learnerId = learnerId;
  const cert = await prisma.lmsCertificateIssued.findFirst({ where });
  if (!cert) throw NotFound('Certificate not found');
  return cert.pdfUrl || cert.verificationUrl;
}

export type { CertificateApprovalStatus };
