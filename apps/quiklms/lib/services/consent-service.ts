/**
 * Consent service — ported from ConsentService (Prisma).
 * consentType values: video_recording | data_processing | photo_usage.
 * studentId / parentId are scalar actor refs (no relation include); parent &
 * student enrichment done via manual user lookups.
 */
import type { ConsentType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound } from '@/lib/http';

export async function grantConsent(
  orgId: string,
  parentId: string,
  dto: { studentId: string; consentType: ConsentType; consentVersion?: string; notes?: string },
  ipAddress?: string,
) {
  const existing = await prisma.consentRecord.findFirst({
    where: { orgId, studentId: dto.studentId, parentId, consentType: dto.consentType },
  });
  if (existing) {
    return prisma.consentRecord.update({
      where: { id: existing.id },
      data: {
        granted: true, grantedAt: new Date(), revokedAt: null, ipAddress,
        consentVersion: dto.consentVersion || '1.0', notes: dto.notes,
      },
    });
  }
  return prisma.consentRecord.create({
    data: {
      orgId, studentId: dto.studentId, parentId, consentType: dto.consentType,
      granted: true, grantedAt: new Date(), ipAddress, consentVersion: dto.consentVersion || '1.0', notes: dto.notes,
    },
  });
}

export async function revokeConsent(
  orgId: string,
  parentId: string,
  dto: { studentId: string; consentType: ConsentType; notes?: string },
) {
  const consent = await prisma.consentRecord.findFirst({
    where: { orgId, studentId: dto.studentId, parentId, consentType: dto.consentType },
  });
  if (!consent) throw NotFound('No consent record found');
  return prisma.consentRecord.update({
    where: { id: consent.id },
    data: { granted: false, revokedAt: new Date(), notes: dto.notes ?? consent.notes },
  });
}

export async function checkConsent(orgId: string, studentId: string, consentType: string) {
  const consent = await prisma.consentRecord.findFirst({
    where: { orgId, studentId, consentType: consentType as ConsentType, granted: true },
  });
  return { hasConsent: !!consent, consent };
}

export async function getConsentHistory(orgId: string, studentId: string) {
  const records = await prisma.consentRecord.findMany({ where: { orgId, studentId }, orderBy: { createdAt: 'desc' } });
  const parentIds = [...new Set(records.map((r) => r.parentId))];
  const parents = await prisma.user.findMany({ where: { id: { in: parentIds } }, select: { id: true, firstName: true, lastName: true, email: true } });
  const parentMap = new Map(parents.map((p) => [p.id, p]));
  return records.map((r) => ({ ...r, parentId: parentMap.get(r.parentId) || r.parentId }));
}

export async function getPendingConsents(orgId: string, parentId: string) {
  const records = await prisma.consentRecord.findMany({ where: { orgId, parentId, granted: false }, orderBy: { createdAt: 'desc' } });
  const studentIds = [...new Set(records.map((r) => r.studentId))];
  const students = await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, grade: true } });
  const studentMap = new Map(students.map((s) => [s.id, s]));
  return records.map((r) => ({ ...r, studentId: studentMap.get(r.studentId) || r.studentId }));
}
