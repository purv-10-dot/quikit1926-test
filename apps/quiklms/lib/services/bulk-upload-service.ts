/**
 * Bulk upload service — ported from BulkUploadService (Prisma).
 *
 * Parses CSV → creates users via `provisionLmsUser` (centralized identity), then
 * applies the LMS-side enrichment ITSELF.
 *
 * An earlier docblock here claimed `provisionLmsUser` "handles per-tenant id
 * generation, parent↔child linking and deferred parent-email linking". It does
 * not — `registerUser` writes a fixed column subset and ignores the rest. Every
 * bulk-created user therefore had a null roll number; every teacher lost their
 * subjects, pay rate, qualification and availability; and parents were never
 * linked to their children — all while the row reported "success". Those writes
 * now happen here, against LMS tables only, so the off-limits auth/identity path
 * is consumed exactly as-is.
 *
 * Each row is provisioned with a temp password in the ORG identity DB; the
 * invitation email is dispatched centrally by `createCentralIdentity`.
 */
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { provisionLmsUser } from './identity-service';
// Shared with the single-person roster forms — see roster-profile.ts for why
// these had to stop being private to bulk upload.
import { applyTeacherProfile, assignGeneratedId, type TeacherProfileFields } from './roster-profile';

export interface RowResult {
  row: number;
  email?: string;
  userId?: string;
  generatedId?: string;
  reason?: string;
}

export function getTemplate(type: 'teachers' | 'students' | 'parents'): string {
  const templates: Record<string, string> = {
    teachers: 'email,firstName,lastName,phone,subjects,ratePerClass,rateType,qualification,monthlyPayout,availability',
    students: 'email,firstName,lastName,phone,grade,section,parentEmail,skipEmail',
    parents: 'email,firstName,lastName,phone,guardianRelation,studentEmail',
  };
  return templates[type] || '';
}

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

/** Parse availability "1:09:00-17:00;2:09:00-17:00" → slot list. */
function parseAvailability(raw: string): { dayOfWeek: number; startTime: string; endTime: string }[] {
  if (!raw || !raw.trim()) return [];
  const slots: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
  const entries = raw.split(';').map((e) => e.trim()).filter(Boolean);
  const timeRe = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  for (const entry of entries) {
    const firstColon = entry.indexOf(':');
    if (firstColon < 1) continue;
    const dayStr = entry.substring(0, firstColon);
    const timeRange = entry.substring(firstColon + 1);
    if (!timeRange.includes('-')) continue;
    const dayOfWeek = parseInt(dayStr, 10);
    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
    const dashIdx = timeRange.indexOf('-');
    const startTime = timeRange.substring(0, dashIdx).trim();
    const endTime = timeRange.substring(dashIdx + 1).trim();
    if (!timeRe.test(startTime) || !timeRe.test(endTime)) continue;
    slots.push({ dayOfWeek, startTime, endTime });
  }
  return slots;
}

const randomPassword = () => randomBytes(16).toString('hex') + 'A1!';

/**
 * LMS-side enrichment after `provisionLmsUser`.
 *
 * WHY THIS EXISTS. `provisionLmsUser` → `registerUser` lives in the centralized
 * auth/identity path, which is OFF-LIMITS to this migration, and it writes only
 * a fixed subset of columns. Everything this module passed beyond that subset —
 * the roll-number counters, all teacher rate/subject/qualification fields, the
 * availability slots, and the parent→child links — was silently dropped, while
 * the row still reported as "success". These helpers write those LMS columns
 * ourselves, so auth is consumed exactly as-is and nothing is lost.
 *
 * Each is best-effort per row: a failure here must not fail an already-created
 * user, but it IS surfaced so the report stays trustworthy.
 */

/** Link a parent to explicit children (from `studentEmail`). */
async function linkChildren(parentId: string, childIds: string[]): Promise<void> {
  for (const childId of childIds) {
    await db.lmsUserParent.upsert({
      where: { parentId_childId: { parentId, childId } },
      create: { parentId, childId },
      update: {},
    });
  }
}

/**
 * Resolve the deferred student→parent links — port of `bulk-upload.service.ts:345-365`.
 *
 * The student upload stores an unmatched `parentEmail` as a placeholder. When
 * that parent is later created, those students must be linked and the
 * placeholder cleared. Nothing did this, so the common "students first, parents
 * second" workflow left every such student permanently unlinked.
 */
async function resolveDeferredChildren(parentId: string, parentEmail: string, orgId: string): Promise<number> {
  const pending = await db.lmsUser.findMany({
    where: { orgId, parentEmail: parentEmail.trim().toLowerCase(), role: 'LEARNER' },
    select: { id: true },
  });
  if (!pending.length) return 0;

  await linkChildren(parentId, pending.map((s) => s.id));
  // Clear the placeholder now that the real link exists.
  await db.lmsUser.updateMany({
    where: { id: { in: pending.map((s) => s.id) } },
    data: { parentEmail: null },
  });
  return pending.length;
}

export async function uploadTeachers(orgId: string, csvContent: string): Promise<{ success: RowResult[]; failed: RowResult[] }> {
  const rows = parseCsv(csvContent);
  const success: RowResult[] = [];
  const failed: RowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      if (!row.email || !row.firstName || !row.lastName) {
        failed.push({ row: rowNum, email: row.email, reason: 'Missing required fields (email, firstName, lastName)' });
        continue;
      }
      const exists = await db.lmsUser.findFirst({ where: { email: row.email.toLowerCase() } });
      if (exists) { failed.push({ row: rowNum, email: row.email, reason: 'Email already exists' }); continue; }

      const profile = {
        subjects: row.subjects ? row.subjects.split(';').map((s) => s.trim()).filter(Boolean) : undefined,
        ratePerClass: row.ratePerClass ? Number(row.ratePerClass) : undefined,
        rateType: row.rateType || 'per_class',
        qualification: row.qualification || undefined,
        monthlyPayout: row.monthlyPayout ? Number(row.monthlyPayout) : undefined,
        availableSlots: parseAvailability(row.availability),
      };

      const { userId } = await provisionLmsUser({
        email: row.email, password: randomPassword(), firstName: row.firstName, lastName: row.lastName,
        lmsRole: 'TEACHER', orgId, phone: row.phone || undefined,
      });

      // registerUser writes only a fixed column subset — persist the rest here.
      await applyTeacherProfile(userId, profile);
      const generatedId = await assignGeneratedId(userId, orgId, 'teacher');

      success.push({ row: rowNum, email: row.email, userId, generatedId });
    } catch (err) {
      failed.push({ row: rowNum, email: row.email, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { success, failed };
}

export async function uploadStudents(orgId: string, csvContent: string): Promise<{ success: RowResult[]; failed: RowResult[] }> {
  const rows = parseCsv(csvContent);
  const success: RowResult[] = [];
  const failed: RowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      if (!row.firstName || !row.lastName) {
        failed.push({ row: rowNum, email: row.email, reason: 'Missing required fields (firstName, lastName)' });
        continue;
      }
      const skipEmail = row.skipEmail === 'true' || row.skipEmail === '1';
      const email = skipEmail && !row.email ? `student_${Date.now()}_${i}@noemail.placeholder` : row.email;
      if (!email) { failed.push({ row: rowNum, reason: 'Email required unless skipEmail=true' }); continue; }

      const exists = await db.lmsUser.findFirst({ where: { email: email.toLowerCase() } });
      if (exists) { failed.push({ row: rowNum, email, reason: 'Email already exists' }); continue; }

      // Resolve parent: existing parent → link as child; else store deferred parentEmail.
      let parentId: string | undefined;
      let parentEmail: string | undefined;
      if (row.parentEmail) {
        const pe = row.parentEmail.trim().toLowerCase();
        const parent = await db.lmsUser.findFirst({ where: { email: pe, role: 'PARENT', orgId } });
        if (parent) parentId = parent.id;
        else parentEmail = pe;
      }

      const { userId } = await provisionLmsUser({
        email, password: randomPassword(), firstName: row.firstName, lastName: row.lastName,
        lmsRole: 'LEARNER', orgId, phone: row.phone || undefined,
        grade: row.grade || undefined, section: row.section || undefined, skipEmail,
      });
      if (parentEmail) await db.lmsUser.update({ where: { id: userId }, data: { parentEmail } });
      if (parentId) {
        await db.lmsUserParent.upsert({
          where: { parentId_childId: { parentId, childId: userId } },
          create: { parentId, childId: userId }, update: {},
        });
      }

      const generatedId = await assignGeneratedId(userId, orgId, 'student');
      success.push({ row: rowNum, email, userId, generatedId });
    } catch (err) {
      failed.push({ row: rowNum, email: row.email, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { success, failed };
}

export async function uploadParents(orgId: string, csvContent: string): Promise<{ success: RowResult[]; failed: RowResult[] }> {
  const rows = parseCsv(csvContent);
  const success: RowResult[] = [];
  const failed: RowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      if (!row.email || !row.firstName || !row.lastName) {
        failed.push({ row: rowNum, email: row.email, reason: 'Missing required fields' });
        continue;
      }
      const exists = await db.lmsUser.findFirst({ where: { email: row.email.toLowerCase() } });
      if (exists) { failed.push({ row: rowNum, email: row.email, reason: 'Email already exists' }); continue; }

      const childrenIds: string[] = [];
      if (row.studentEmail) {
        const student = await db.lmsUser.findFirst({ where: { email: row.studentEmail.toLowerCase(), role: 'LEARNER' } });
        if (student) childrenIds.push(student.id);
      }

      // Centralized identity + LMS row. registerUser does NOT do id generation,
      // children linking, or the deferred student auto-link — an earlier comment
      // here claimed it did. All three are done below, LMS-side.
      const { userId } = await provisionLmsUser({
        email: row.email, password: randomPassword(), firstName: row.firstName, lastName: row.lastName,
        lmsRole: 'PARENT', orgId, phone: row.phone || undefined,
        guardianRelation: row.guardianRelation || undefined,
      });

      if (childrenIds.length) await linkChildren(userId, childrenIds);
      // Students uploaded earlier with this address as a placeholder.
      await resolveDeferredChildren(userId, row.email, orgId);
      const generatedId = await assignGeneratedId(userId, orgId, 'parent');

      success.push({ row: rowNum, email: row.email, userId, generatedId });
    } catch (err) {
      failed.push({ row: rowNum, email: row.email, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { success, failed };
}
