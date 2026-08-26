/**
 * Student-absence notification calls — ported from
 * `EscalationService.checkStudentAbsences` (`escalation.service.ts:106-163`),
 * which had no equivalent in the new worker at all: marking a student absent
 * notified nobody.
 *
 * Finds attendance rows *freshly* flipped to `absent` and places a "you were
 * marked absent" voice call to the student (falling back to guardianContact).
 * Run every minute.
 */
import { prisma } from '../db.js';
import { placeCall } from '../notify.js';

/**
 * Lookback for "freshly marked absent". The legacy used 90s — a 30s buffer over
 * the 60s cron interval — deliberately narrow so a row is not re-announced on
 * every tick. Keyed off `updatedAt`, not `createdAt`, so a present→absent edit
 * is caught too.
 */
const ABSENCE_LOOKBACK_MS = 90_000;

/**
 * Second dedupe layer. The 90s window overlaps the 60s tick by design, so a row
 * updated in the overlap would be seen twice and the student called twice —
 * real money and a real annoyed student. Keyed by `id:updatedAt` so a genuine
 * re-mark (a later edit back to absent) still calls, mirroring the intent of
 * the legacy `updatedAt` filter.
 */
const called = new Map<string, number>();
const CALLED_TTL_MS = 60 * 60_000;

function alreadyCalled(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of called) if (now - t > CALLED_TTL_MS) called.delete(k);
  if (called.has(key)) return true;
  called.set(key, now);
  return false;
}

export async function runStudentAbsenceCalls(): Promise<void> {
  const since = new Date(Date.now() - ABSENCE_LOOKBACK_MS);
  const absences = await prisma.lmsAttendance.findMany({
    where: { status: 'absent', updatedAt: { gte: since } },
    select: { id: true, studentId: true, scheduledClassId: true, updatedAt: true },
  });
  if (absences.length === 0) return;

  for (const a of absences) {
    try {
      if (alreadyCalled(`${a.id}:${new Date(a.updatedAt).getTime()}`)) continue;

      const student = await prisma.lmsUser.findUnique({
        where: { id: a.studentId },
        select: { firstName: true, lastName: true, phone: true, guardianContact: true },
      });
      if (!student) continue;

      // Student's own phone first; guardianContact is the fallback contact.
      const phone = student.phone || student.guardianContact;
      if (!phone) {
        console.warn(`[absence] no phone for student ${a.studentId} — skipping call`);
        continue;
      }

      const cls = await prisma.lmsScheduledClass.findUnique({
        where: { id: a.scheduledClassId },
        select: { title: true, startTime: true },
      });
      const className = cls?.title || 'class';
      const classTime = cls?.startTime ? new Date(cls.startTime).toLocaleString() : '';
      const studentName = `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || 'student';

      const message =
        `Hello ${studentName}. This is an automated message from QuikLMS. ` +
        `You were marked absent for the class "${className}"` +
        (classTime ? ` scheduled at ${classTime}` : '') +
        `. Please contact your school for more information.`;

      await placeCall(phone, message).catch((e: unknown) =>
        console.error(`[absence] call failed for ${a.studentId}:`, (e as Error).message),
      );
    } catch (e) {
      console.error(`[absence] failed for attendance ${a.id}:`, (e as Error).message);
    }
  }
}
