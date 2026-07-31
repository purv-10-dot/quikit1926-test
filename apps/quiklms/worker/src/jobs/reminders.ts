/**
 * Class reminders — for upcoming scheduled classes:
 *   −30 min: email   ·   −10 min: email + SMS   ·   −5 min: SMS
 * Run every minute; narrow 1-minute windows make each bucket fire once per class.
 *
 * Recipients are the teacher, every batch student, AND each student's parents —
 * the legacy `reminders.processor.ts:57-69` fanned out to `parentIds`, and a
 * reminder that never reaches the parent is the one that matters most for a
 * school. Messages carry the meeting join URL (`reminders.processor.ts:41-50`,
 * 89-92, 104); without it the reminder tells you a class is starting but not
 * where, which is the whole point of the nudge.
 */
import { prisma } from '../db.js';
import { sendEmail, sendSms } from '../notify.js';

interface Recipient {
  email?: string | null;
  phone?: string | null;
  guardianContact?: string | null;
  firstName?: string | null;
}

async function recipients(batchId: string, teacherId: string) {
  const teacher = await prisma.lmsUser.findUnique({ where: { id: teacherId }, select: { email: true, phone: true, guardianContact: true, firstName: true, lastName: true } });
  const links = await prisma.lmsBatchStudent.findMany({ where: { batchId }, select: { studentId: true } });
  const studentIds = links.map((l) => l.studentId);
  const students = await prisma.lmsUser.findMany({
    where: { id: { in: studentIds } },
    select: { email: true, phone: true, guardianContact: true, firstName: true },
  });

  // Parents via the user_parents link table (legacy `User.parentIds[]`).
  const parentLinks = studentIds.length
    ? await prisma.lmsUserParent.findMany({ where: { childId: { in: studentIds } }, select: { parentId: true } })
    : [];
  const parentIds = [...new Set(parentLinks.map((p) => p.parentId))];
  const parents = parentIds.length
    ? await prisma.lmsUser.findMany({
        where: { id: { in: parentIds } },
        select: { email: true, phone: true, guardianContact: true, firstName: true },
      })
    : [];

  return { teacher, students, parents };
}

/** Meeting join URL for a class: by `meetingId` first, else by back-reference. */
async function meetingFor(classId: string, meetingId: string | null) {
  if (meetingId) {
    const m = await prisma.lmsMeeting.findUnique({ where: { id: meetingId }, select: { joinUrl: true, password: true } });
    if (m?.joinUrl) return m;
  }
  return prisma.lmsMeeting.findFirst({
    where: { scheduledClassId: classId },
    orderBy: { createdAt: 'desc' },
    select: { joinUrl: true, password: true },
  });
}

async function notifyWindow(minLow: number, minHigh: number, mode: 'email' | 'sms' | 'both') {
  const now = Date.now();
  const from = new Date(now + minLow * 60_000);
  const to = new Date(now + minHigh * 60_000);
  const classes = await prisma.lmsScheduledClass.findMany({
    where: { status: 'scheduled', startTime: { gte: from, lt: to } },
    select: { id: true, title: true, batchId: true, teacherId: true, startTime: true, meetingId: true },
  });
  for (const c of classes) {
    const { teacher, students, parents } = await recipients(c.batchId, c.teacherId);
    const meeting = await meetingFor(c.id, c.meetingId).catch(() => null);
    const joinUrl = meeting?.joinUrl || '';
    const password = meeting?.password || '';
    const when = new Date(c.startTime).toLocaleTimeString();
    const teacherName = `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim() || 'Your teacher';

    const subject = `Class reminder: ${c.title}`;
    const html =
      `<p>Your class <strong>${c.title}</strong> with ${teacherName} starts at ${when}.</p>` +
      (joinUrl
        ? `<div style="margin:20px 0;"><a href="${joinUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Join Class Now</a></div>` +
          (password ? `<p>Meeting password: <strong>${password}</strong></p>` : '')
        : '');
    const sms =
      `QuikSkill: "${c.title}" starts at ${when}.` +
      (joinUrl ? ` Join: ${joinUrl}` : '') +
      (joinUrl && password ? ` Password: ${password}` : '');

    const all = [teacher, ...students, ...parents].filter(Boolean) as Recipient[];
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
