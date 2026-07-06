/**
 * Class reminders — for upcoming scheduled classes:
 *   −30 min: email   ·   −10 min: email + SMS   ·   −5 min: SMS
 * Run every minute; narrow 1-minute windows make each bucket fire once per class.
 */
import { prisma } from '../db.js';
import { sendEmail, sendSms } from '../notify.js';

async function recipients(batchId: string, teacherId: string) {
  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { email: true, phone: true, firstName: true } });
  const links = await prisma.batchStudent.findMany({ where: { batchId }, select: { studentId: true } });
  const students = await prisma.user.findMany({
    where: { id: { in: links.map((l) => l.studentId) } },
    select: { email: true, phone: true, guardianContact: true, firstName: true },
  });
  return { teacher, students };
}

async function notifyWindow(minLow: number, minHigh: number, mode: 'email' | 'sms' | 'both') {
  const now = Date.now();
  const from = new Date(now + minLow * 60_000);
  const to = new Date(now + minHigh * 60_000);
  const classes = await prisma.scheduledClass.findMany({
    where: { status: 'scheduled', startTime: { gte: from, lt: to } },
    select: { id: true, title: true, batchId: true, teacherId: true, startTime: true },
  });
  for (const c of classes) {
    const { teacher, students } = await recipients(c.batchId, c.teacherId);
    const when = new Date(c.startTime).toLocaleTimeString();
    const subject = `Class reminder: ${c.title}`;
    const html = `<p>Your class <strong>${c.title}</strong> starts at ${when}.</p>`;
    const sms = `QuikSkill: "${c.title}" starts at ${when}.`;
    const all = [teacher, ...students].filter(Boolean) as { email?: string | null; phone?: string | null; guardianContact?: string | null }[];
    for (const r of all) {
      if ((mode === 'email' || mode === 'both') && r.email) await sendEmail(r.email, subject, html).catch(() => {});
      const phone = r.phone || r.guardianContact;
      if ((mode === 'sms' || mode === 'both') && phone) await sendSms(phone, sms).catch(() => {});
    }
  }
}

export async function runClassReminders(): Promise<void> {
  await notifyWindow(29, 30, 'email');   // −30 min
  await notifyWindow(9, 10, 'both');     // −10 min
  await notifyWindow(4, 5, 'sms');       // −5 min
}
