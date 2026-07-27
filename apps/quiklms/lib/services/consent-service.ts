/**
 * Consent service — ported from ConsentService (Prisma).
 * consentType values: video_recording | data_processing | photo_usage.
 * studentId / parentId are scalar actor refs (no relation include); parent &
 * student enrichment done via manual user lookups.
 */
import type { LmsConsentType as ConsentType } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/http';

export async function grantConsent(
  orgId: string,
  parentId: string,
  dto: { studentId: string; consentType: ConsentType; consentVersion?: string; notes?: string },
  ipAddress?: string,
) {
  const existing = await db.lmsConsentRecord.findFirst({
    where: { orgId, studentId: dto.studentId, parentId, consentType: dto.consentType },
  });
  if (existing) {
    return db.lmsConsentRecord.update({
      where: { id: existing.id },
      data: {
        granted: true, grantedAt: new Date(), revokedAt: null,
        consentVersion: dto.consentVersion || '1.0',
        // `?? null`, not `undefined`. Mongoose UNSET these paths when the new
        // value was undefined (`consent.service.ts:25-27`); in Prisma
        // `undefined` means "leave unchanged", so a re-grant without an IP kept
        // the PREVIOUS grant's IP while `grantedAt` advanced — attributing an
        // old address to a new consent event, in a record that exists to be
        // legal evidence.
        ipAddress: ipAddress ?? null,
        notes: dto.notes ?? null,
      },
    });
  }
  return db.lmsConsentRecord.create({
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
  const consent = await db.lmsConsentRecord.findFirst({
    where: { orgId, studentId: dto.studentId, parentId, consentType: dto.consentType },
  });
  if (!consent) throw NotFound('No consent record found');
  return db.lmsConsentRecord.update({
    where: { id: consent.id },
    data: { granted: false, revokedAt: new Date(), notes: dto.notes ?? consent.notes },
  });
}

export async function checkConsent(orgId: string, studentId: string, consentType: string) {
  const consent = await db.lmsConsentRecord.findFirst({
    where: { orgId, studentId, consentType: consentType as ConsentType, granted: true },
  });
  return { hasConsent: !!consent, consent };
}

export async function getConsentHistory(orgId: string, studentId: string) {
  const records = await db.lmsConsentRecord.findMany({ where: { orgId, studentId }, orderBy: { createdAt: 'desc' } });
  const parentIds = [...new Set(records.map((r) => r.parentId))];
  const parents = await db.lmsUser.findMany({ where: { id: { in: parentIds } }, select: { id: true, firstName: true, lastName: true, email: true } });
  // `_id` alias: Mongoose populate produced `_id`, and the rest of this port
  // follows that convention for populated actors (tutoring-requests, payouts,
  // scheduling). Without it a client keyed on `parentId._id` reads undefined.
  const parentMap = new Map(parents.map((p) => [p.id, { _id: p.id, ...p }]));
  return records.map((r) => ({ _id: r.id, ...r, parentId: parentMap.get(r.parentId) || r.parentId }));
}

export async function getPendingConsents(orgId: string, parentId: string) {
  const records = await db.lmsConsentRecord.findMany({ where: { orgId, parentId, granted: false }, orderBy: { createdAt: 'desc' } });
  const studentIds = [...new Set(records.map((r) => r.studentId))];
  const students = await db.lmsUser.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, grade: true } });
  const studentMap = new Map(students.map((s) => [s.id, { _id: s.id, ...s }]));
  return records.map((r) => ({ _id: r.id, ...r, studentId: studentMap.get(r.studentId) || r.studentId }));
}
