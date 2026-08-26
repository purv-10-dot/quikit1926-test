/**
 * Teacher lateness escalation — when a class is past start + grace and the
 * teacher hasn't started it, call the teacher up to maxCallAttempts (default 3),
 * then notify the admin. Parameters come from tenant.enhancementConfig.escalation.
 * Run every minute.
 */
import { prisma } from '../db.js';
import { placeCall, sendEmail, sendSms } from '../notify.js';

interface EscalationCfg {
  gracePeriodMinutes: number;
  callIntervalSeconds: number;
  maxCallAttempts: number;
  penaltyPointsPerMiss: number;
}
const DEFAULTS: EscalationCfg = { gracePeriodMinutes: 2, callIntervalSeconds: 60, maxCallAttempts: 3, penaltyPointsPerMiss: 10 };

async function cfg(orgId: string): Promise<EscalationCfg> {
  const t = await prisma.lmsTenant.findUnique({ where: { id: orgId }, select: { enhancementConfig: true } });
  const e = (t?.enhancementConfig as { escalation?: Partial<EscalationCfg> } | null)?.escalation;
  return { ...DEFAULTS, ...(e || {}) };
}

/**
 * How far back to look for un-started classes.
 *
 * The legacy bounded this deliberately (`escalation.service.ts:51-58`:
 * `startTime: { $lte: minGrace, $gte: windowStart }` with a 60-minute floor).
 * This job had NO lower bound, so its first successful run would escalate every
 * class ever left in `scheduled` — including ones from months ago — and start
 * Twilio-dialing teachers about classes that ended long before. Real money and
 * real angry teachers.
 */
const ESCALATION_LOOKBACK_MINUTES = 60;

/**
 * Terminal side-effects when every call attempt has failed — ported from
 * `escalation.processor.ts:94-121` + `notifyAdmin()`.
 *
 * The port had reduced "teacher never showed up" to a status flag, so the class
 * stayed `scheduled` forever, the teacher's punctuality/miss counters (which
 * feed teacher level → payout rate) never moved, and nobody was told. All three
 * are restored here:
 *   (a) escalation → failed
 *   (b) class → cancelled, reason 'Missed - Teacher Not Joined'
 *   (c) teacher → classesMissed +1, punctualityScore −penaltyPointsPerMiss
 *   (d) tenant admin → email + SMS
 */
async function finalizeFailedEscalation(
  esc: { id: string; orgId: string; teacherId: string },
  cls: { id: string; title: string; startTime: Date; status: string },
  attemptCount: number,
  penaltyPoints: number,
): Promise<void> {
  await prisma.lmsCallEscalation.update({
    where: { id: esc.id },
    data: { status: 'failed', adminNotified: true, adminNotifiedAt: new Date() },
  });

  // (b) Cancel the class — only while it is still `scheduled`, mirroring the
  // legacy guard, so a class the teacher eventually started is never clobbered.
  if (cls.status === 'scheduled') {
    await prisma.lmsScheduledClass
      .update({ where: { id: cls.id }, data: { status: 'cancelled', cancellationReason: 'Missed - Teacher Not Joined' } })
      .catch((e: unknown) => console.error('[escalation] cancel class failed:', (e as Error).message));
  }

  // (c) Penalise the teacher.
  await prisma.lmsUser
    .update({
      where: { id: esc.teacherId },
      data: { classesMissed: { increment: 1 }, punctualityScore: { decrement: penaltyPoints } },
    })
    .catch((e: unknown) => console.error('[escalation] teacher penalty failed:', (e as Error).message));

  // (d) Notify the tenant admin (email + SMS).
  try {
    const teacher = await prisma.lmsUser.findUnique({
      where: { id: esc.teacherId },
      select: { firstName: true, lastName: true, email: true },
    });
    const admin = await prisma.lmsUser.findFirst({
      where: { orgId: esc.orgId, role: 'TENANT_ADMIN', isActive: true },
      select: { email: true, phone: true, guardianContact: true },
    });
    if (!admin) return;

    const className = cls.title || 'Unknown class';
    const classTime = cls.startTime ? new Date(cls.startTime).toLocaleString() : 'Unknown time';
    const teacherName = `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim() || 'Teacher';

    if (admin.email) {
      await sendEmail(
        admin.email,
        `URGENT: Teacher ${teacherName} missed class - ${className}`,
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
           <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
             <h2 style="margin: 0;">Teacher Missed Class Alert</h2>
           </div>
           <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
             <p><strong>Teacher:</strong> ${teacherName} (${teacher?.email ?? ''})</p>
             <p><strong>Class:</strong> ${className}</p>
             <p><strong>Scheduled Time:</strong> ${classTime}</p>
             <p><strong>Call Attempts:</strong> ${attemptCount} (all unanswered)</p>
             <p style="color: #dc2626; font-weight: bold;">The class has been marked as cancelled. Please take appropriate action.</p>
           </div>
         </div>`,
      ).catch(() => {});
    }

    const adminPhone = admin.guardianContact || admin.phone;
    if (adminPhone) {
      await sendSms(
        adminPhone,
        `URGENT: Teacher ${teacherName} missed class "${className}" at ${classTime}. ${attemptCount} call attempts failed.`,
      ).catch(() => {});
    }
  } catch (e) {
    console.error('[escalation] notifyAdmin failed:', (e as Error).message);
  }
}

export async function runEscalations(): Promise<void> {
  const now = Date.now();
  // Classes that should have started but are still 'scheduled' (teacher not started),
  // bounded to the recent past — see ESCALATION_LOOKBACK_MINUTES.
  const windowStart = new Date(now - ESCALATION_LOOKBACK_MINUTES * 60_000);
  const candidates = await prisma.lmsScheduledClass.findMany({
    where: { status: 'scheduled', startTime: { lt: new Date(now), gte: windowStart } },
    select: { id: true, orgId: true, teacherId: true, startTime: true, title: true, status: true },
  });

  for (const c of candidates) {
    const conf = await cfg(c.orgId);
    const minutesLate = (now - new Date(c.startTime).getTime()) / 60_000;
    if (minutesLate < conf.gracePeriodMinutes) continue;

    let esc = await prisma.lmsCallEscalation.findFirst({
      where: { orgId: c.orgId, scheduledClassId: c.id },
      include: { callAttempts: true },
    });
    if (!esc) {
      esc = await prisma.lmsCallEscalation.create({
        data: { orgId: c.orgId, scheduledClassId: c.id, teacherId: c.teacherId, status: 'escalating' },
        include: { callAttempts: true },
      });
    }
    if (esc.status === 'resolved' || esc.status === 'failed') continue;

    const attempts = esc.callAttempts.length;
    if (attempts >= conf.maxCallAttempts) {
      if (!esc.adminNotified) {
        await finalizeFailedEscalation(esc, c, attempts, conf.penaltyPointsPerMiss);
      }
      continue;
    }

    // Respect the call interval between attempts
    const last = esc.callAttempts.sort((a, b) => +new Date(b.attemptTime) - +new Date(a.attemptTime))[0];
    if (last && (now - new Date(last.attemptTime).getTime()) / 1000 < conf.callIntervalSeconds) continue;

    const teacher = await prisma.lmsUser.findUnique({ where: { id: c.teacherId }, select: { phone: true, firstName: true } });
    const phone = teacher?.phone;
    if (!phone) continue;
    const sid = await placeCall(phone, `Hello ${teacher?.firstName ?? 'teacher'}, your QuikLMS class has started. Please join immediately.`).catch(() => null);
    await prisma.lmsCallEscalationAttempt.create({
      data: { escalationId: esc.id, attemptNumber: attempts + 1, attemptTime: new Date(), phoneNumber: phone, callStatus: sid ? 'initiated' : 'failed', callSid: sid ?? undefined },
    });
  }
}
