/**
 * Bulk upload service — ported from BulkUploadService (Prisma).
 * Parses CSV → creates users via provisionLmsUser (centralized identity), which
 * handles per-tenant id generation, parent↔child linking (UserParent join) and
 * deferred parent-email linking. Each row is provisioned with a temp password in
 * the ORG identity DB; the invitation/welcome email (with those credentials) is
 * dispatched centrally by createCentralIdentity — one email per invited user.
 */
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { provisionLmsUser } from './identity-service';

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
      const exists = await prisma.user.findFirst({ where: { email: row.email.toLowerCase() } });
      if (exists) { failed.push({ row: rowNum, email: row.email, reason: 'Email already exists' }); continue; }

      const { userId, lms } = await provisionLmsUser({
        email: row.email, password: randomPassword(), firstName: row.firstName, lastName: row.lastName,
        lmsRole: 'TEACHER', orgId, phone: row.phone || undefined,
        subjects: row.subjects ? row.subjects.split(';').map((s) => s.trim()) : undefined,
        ratePerClass: row.ratePerClass ? Number(row.ratePerClass) : undefined,
        rateType: row.rateType || 'per_class',
        qualification: row.qualification || undefined,
        monthlyPayout: row.monthlyPayout ? Number(row.monthlyPayout) : undefined,
        availableSlots: parseAvailability(row.availability),
      });
      success.push({ row: rowNum, email: row.email, userId, generatedId: lms?.employeeId ?? undefined });
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

      const exists = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
      if (exists) { failed.push({ row: rowNum, email, reason: 'Email already exists' }); continue; }

      // Resolve parent: existing parent → link as child; else store deferred parentEmail.
      let parentId: string | undefined;
      let parentEmail: string | undefined;
      if (row.parentEmail) {
        const pe = row.parentEmail.trim().toLowerCase();
        const parent = await prisma.user.findFirst({ where: { email: pe, role: 'PARENT', orgId } });
        if (parent) parentId = parent.id;
        else parentEmail = pe;
      }

      const { userId, lms } = await provisionLmsUser({
        email, password: randomPassword(), firstName: row.firstName, lastName: row.lastName,
        lmsRole: 'LEARNER', orgId, phone: row.phone || undefined,
        grade: row.grade || undefined, section: row.section || undefined, skipEmail,
      });
      if (parentEmail) await prisma.user.update({ where: { id: userId }, data: { parentEmail } });
      if (parentId) {
        await prisma.userParent.upsert({
          where: { parentId_childId: { parentId, childId: userId } },
          create: { parentId, childId: userId }, update: {},
        });
      }

      success.push({ row: rowNum, email, userId, generatedId: (lms as { studentId?: string } | undefined)?.studentId ?? undefined });
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
      const exists = await prisma.user.findFirst({ where: { email: row.email.toLowerCase() } });
      if (exists) { failed.push({ row: rowNum, email: row.email, reason: 'Email already exists' }); continue; }

      const childrenIds: string[] = [];
      if (row.studentEmail) {
        const student = await prisma.user.findFirst({ where: { email: row.studentEmail.toLowerCase(), role: 'LEARNER' } });
        if (student) childrenIds.push(student.id);
      }

      // Centralized: platform identity + LMS row. registerUser (inside) handles
      // PARENT id generation, children linking AND deferred student auto-link.
      const { userId, lms } = await provisionLmsUser({
        email: row.email, password: randomPassword(), firstName: row.firstName, lastName: row.lastName,
        lmsRole: 'PARENT', orgId, phone: row.phone || undefined,
        guardianRelation: row.guardianRelation || undefined,
        childrenIds: childrenIds.length ? childrenIds : undefined,
      });
      success.push({ row: rowNum, email: row.email, userId, generatedId: (lms as { parentCode?: string } | undefined)?.parentCode ?? undefined });
    } catch (err) {
      failed.push({ row: rowNum, email: row.email, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { success, failed };
}
