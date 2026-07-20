/**
 * Teacher lateness escalation — when a class is past start + grace and the
 * teacher hasn't started it, call the teacher up to maxCallAttempts (default 3),
 * then notify the admin. Parameters come from tenant.enhancementConfig.escalation.
 * Run every minute.
 */
import { prisma } from '../db.js';
import { placeCall } from '../notify.js';

interface EscalationCfg { gracePeriodMinutes: number; callIntervalSeconds: number; maxCallAttempts: number }
const DEFAULTS: EscalationCfg = { gracePeriodMinutes: 2, callIntervalSeconds: 60, maxCallAttempts: 3 };

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

export async function runEscalations(): Promise<void> {
  const now = Date.now();
  // Classes that should have started but are still 'scheduled' (teacher not started),
  // bounded to the recent past — see ESCALATION_LOOKBACK_MINUTES.
  const windowStart = new Date(now - ESCALATION_LOOKBACK_MINUTES * 60_000);
  const candidates = await prisma.lmsScheduledClass.findMany({
    where: { status: 'scheduled', startTime: { lt: new Date(now), gte: windowStart } },
    select: { id: true, orgId: true, teacherId: true, startTime: true },
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
        await prisma.lmsCallEscalation.update({ where: { id: esc.id }, data: { status: 'failed', adminNotified: true, adminNotifiedAt: new Date() } });
      }
      continue;
    }

    // Respect the call interval between attempts
    const last = esc.callAttempts.sort((a, b) => +new Date(b.attemptTime) - +new Date(a.attemptTime))[0];
    if (last && (now - new Date(last.attemptTime).getTime()) / 1000 < conf.callIntervalSeconds) continue;

    const teacher = await prisma.lmsUser.findUnique({ where: { id: c.teacherId }, select: { phone: true, firstName: true } });
    const phone = teacher?.phone;
    if (!phone) continue;
    const sid = await placeCall(phone, `Hello ${teacher?.firstName ?? 'teacher'}, your QuikSkill class has started. Please join immediately.`).catch(() => null);
    await prisma.lmsCallEscalationAttempt.create({
      data: { escalationId: esc.id, attemptNumber: attempts + 1, attemptTime: new Date(), phoneNumber: phone, callStatus: sid ? 'initiated' : 'failed', callSid: sid ?? undefined },
    });
  }
}
