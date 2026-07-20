/**
 * Student attendance reminder — when a class has started and a student hasn't
 * joined, call the student up to maxCallAttempts (default 3), falling back to
 * guardianContact when no personal phone. Params from
 * tenant.enhancementConfig.studentReminder. Run every minute.
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

export async function runStudentReminders(): Promise<void> {
  const now = Date.now();
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
      // Skip students already marked present
      const att = await prisma.lmsAttendance.findFirst({ where: { scheduledClassId: c.id, studentId } });
      if (att && (att.status === 'present' || att.status === 'late')) continue;

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
      const phone = student?.phone || student?.guardianContact;
      if (!phone) continue;
      const sid = await placeCall(phone, `Hello, this is a reminder that ${student?.firstName ?? 'the student'}'s QuikSkill class has started. Please join now.`).catch(() => null);
      await prisma.lmsStudentReminderCallAttempt.create({
        data: { reminderCallId: rec.id, attemptNumber: attempts + 1, attemptTime: new Date(), phoneNumber: phone, callStatus: sid ? 'initiated' : 'failed', callSid: sid ?? undefined },
      });
    }
  }
}
