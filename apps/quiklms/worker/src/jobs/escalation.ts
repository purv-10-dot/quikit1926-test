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

async function cfg(tenantId: string): Promise<EscalationCfg> {
  const t = await prisma.lmsTenant.findUnique({ where: { id: tenantId }, select: { enhancementConfig: true } });
  const e = (t?.enhancementConfig as { escalation?: Partial<EscalationCfg> } | null)?.escalation;
  return { ...DEFAULTS, ...(e || {}) };
}

export async function runEscalations(): Promise<void> {
  const now = Date.now();
  // Classes that should have started but are still 'scheduled' (teacher not started)
  const candidates = await prisma.lmsScheduledClass.findMany({
    where: { status: 'scheduled', startTime: { lt: new Date(now) } },
    select: { id: true, tenantId: true, teacherId: true, startTime: true },
  });

  for (const c of candidates) {
    const conf = await cfg(c.tenantId);
    const minutesLate = (now - new Date(c.startTime).getTime()) / 60_000;
    if (minutesLate < conf.gracePeriodMinutes) continue;

    let esc = await prisma.lmsCallEscalation.findFirst({
      where: { tenantId: c.tenantId, scheduledClassId: c.id },
      include: { callAttempts: true },
    });
    if (!esc) {
      esc = await prisma.lmsCallEscalation.create({
        data: { tenantId: c.tenantId, scheduledClassId: c.id, teacherId: c.teacherId, status: 'escalating' },
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
