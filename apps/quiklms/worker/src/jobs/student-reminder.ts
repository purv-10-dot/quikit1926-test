/**
 * Student attendance reminder — when a class has started and a student hasn't
 * joined, call the guardian (falling back to the student's own phone) up to
 * maxCallAttempts (default 3). Params from
 * tenant.enhancementConfig.studentReminder. Run every minute.
 *
 * Reminder records are also RESOLVED — the legacy processor
 * (`student-reminder.processor.ts:44-64`) closed a reminder as soon as the
 * student turned up present/late or the class completed/cancelled. The port
 * never wrote `resolved`, so every record stayed `pending`/`calling` forever:
 * the admin reminder screens showed permanently-open calls, and nothing ever
 * distinguished "student joined after our call" from "student never came".
 */
import { prisma } from '../db.js';
import { placeCall } from '../notify.js';

interface ReminderCfg { gracePeriodMinutes: number; callIntervalSeconds: number; maxCallAttempts: number }
const DEFAULTS: ReminderCfg = { gracePeriodMinutes: 5, callIntervalSeconds: 90, maxCallAttempts: 3 };

async function cfg(orgId: string): Promise<ReminderCfg> {
  const t = await prisma.lmsTenant.findUnique({ where: { id: orgId }, select: { enhancementConfig: true } });
  const e = (t?.enhancementConfig as { studentReminder?: Partial<ReminderCfg> } | null)?.studentReminder;
  return { ...DEFAULTS, ...(e || {}) };
}

/**
 * Close out reminders whose class has finished — the class leaves `in_progress`
 * so the sweep below never revisits it, and the record would otherwise be
 * stranded open (`student-reminder.processor.ts:44-49`).
 */
async function resolveFinishedClassReminders(): Promise<void> {
  const open = await prisma.lmsStudentReminderCall.findMany({
    where: { status: { in: ['pending', 'calling'] } },
    select: { id: true, scheduledClassId: true },
  });
  if (open.length === 0) return;

  const classIds = [...new Set(open.map((r) => r.scheduledClassId))];
  const live = await prisma.lmsScheduledClass.findMany({
    where: { id: { in: classIds }, status: { in: ['scheduled', 'in_progress'] } },
    select: { id: true },
  });
  const liveIds = new Set(live.map((c) => c.id));
  // Finished, cancelled, or deleted classes → resolve.
  const doneIds = open.filter((r) => !liveIds.has(r.scheduledClassId)).map((r) => r.id);
  if (doneIds.length === 0) return;
  await prisma.lmsStudentReminderCall.updateMany({
    where: { id: { in: doneIds } },
    data: { status: 'resolved', resolvedAt: new Date() },
  });
}

export async function runStudentReminders(): Promise<void> {
  const now = Date.now();
  await resolveFinishedClassReminders().catch((e: unknown) =>
    console.error('[studentReminder] resolve sweep failed:', (e as Error).message),
  );

  const inProgress = await prisma.lmsScheduledClass.findMany({
    where: { status: 'in_progress', startTime: { lt: new Date(now) } },
    select: { id: true, orgId: true, batchId: true, startTime: true },
  });

  for (const c of inProgress) {
    const conf = await cfg(c.orgId);
    const minutesLate = (now - new Date(c.startTime).getTime()) / 60_000;
    if (minutesLate < conf.gracePeriodMinutes) continue;

    const links = await prisma.lmsBatchStudent.findMany({ where: { batchId: c.batchId }, select: { studentId: true } });
    for (const { studentId } of links) {
      // Student turned up → resolve any open reminder and skip.
      const att = await prisma.lmsAttendance.findFirst({ where: { scheduledClassId: c.id, studentId } });
      if (att && (att.status === 'present' || att.status === 'late')) {
        await prisma.lmsStudentReminderCall.updateMany({
          where: { orgId: c.orgId, scheduledClassId: c.id, studentId, status: { in: ['pending', 'calling'] } },
          data: { status: 'resolved', resolvedAt: new Date() },
        });
        continue;
      }

      let rec = await prisma.lmsStudentReminderCall.findFirst({
        where: { orgId: c.orgId, scheduledClassId: c.id, studentId },
        include: { callAttempts: true },
      });
      if (!rec) {
        rec = await prisma.lmsStudentReminderCall.create({
          data: { orgId: c.orgId, scheduledClassId: c.id, studentId, batchId: c.batchId, status: 'calling' },
          include: { callAttempts: true },
        });
      }
      if (rec.status === 'resolved' || rec.status === 'failed') continue;

      const attempts = rec.callAttempts.length;
      if (attempts >= conf.maxCallAttempts) {
        await prisma.lmsStudentReminderCall.update({ where: { id: rec.id }, data: { status: 'failed' } });
        continue;
      }
      const last = rec.callAttempts.sort((a, b) => +new Date(b.attemptTime) - +new Date(a.attemptTime))[0];
      if (last && (now - new Date(last.attemptTime).getTime()) / 1000 < conf.callIntervalSeconds) continue;

      const student = await prisma.lmsUser.findUnique({ where: { id: studentId }, select: { phone: true, guardianContact: true, firstName: true } });
      // Guardian first, then the student's own number — the legacy order
      // (`student-reminder.processor.ts:73`): a parent is far likelier to pick
      // up a mid-class call than the student who is already not in the class.
      const phone = student?.guardianContact || student?.phone;
      if (!phone) continue;
      const sid = await placeCall(phone, `Hello, this is a reminder that ${student?.firstName ?? 'the student'}'s QuikSkill class has started. Please join now.`).catch(() => null);
      await prisma.lmsStudentReminderCallAttempt.create({
        data: { reminderCallId: rec.id, attemptNumber: attempts + 1, attemptTime: new Date(), phoneNumber: phone, callStatus: sid ? 'initiated' : 'failed', callSid: sid ?? undefined },
      });
    }
  }
}
