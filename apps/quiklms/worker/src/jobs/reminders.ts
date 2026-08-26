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

/**
 * `minutesBefore` is the bucket LABEL, not just the window bound — every message
 * names it ("starts in 30 minutes"), which is the whole content of a reminder.
 * The port had dropped it from the subject and body, so all three buckets sent an
 * identical, undated "Class reminder: <title>" and a recipient could not tell the
 * −30 nudge from the one telling them the class is about to begin.
 */
async function notifyWindow(
  minLow: number,
  minHigh: number,
  minutesBefore: number,
  mode: 'email' | 'sms' | 'both',
) {
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
    // `toLocaleString`, not `toLocaleTimeString` — the reminder for a class late
    // tonight and one tomorrow morning read identically with time alone.
    const when = new Date(c.startTime).toLocaleString();
    const teacherName = `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim() || 'Your teacher';

    const subject = `Class Reminder: ${c.title} starts in ${minutesBefore} minutes`;
    const sms =
      `QuikLMS: "${c.title}" with ${teacherName} starts in ${minutesBefore} min.` +
      (joinUrl ? ` Join: ${joinUrl}` : '') +
      (joinUrl && password ? ` Password: ${password}` : '');

    const all = [teacher, ...students, ...parents].filter(Boolean) as Recipient[];
    for (const r of all) {
      if ((mode === 'email' || mode === 'both') && r.email) {
        const html =
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">` +
          `<div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">` +
          `<h2 style="margin: 0;">Class Starting Soon!</h2>` +
          `<p style="margin: 8px 0 0; opacity: 0.9;">${minutesBefore} minutes until class begins</p>` +
          `</div>` +
          `<div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">` +
          `<p>Hello <strong>${r.firstName ?? 'there'}</strong>,</p>` +
          `<p><strong>Class:</strong> ${c.title}</p>` +
          `<p><strong>Teacher:</strong> ${teacherName}</p>` +
          `<p><strong>Time:</strong> ${when}</p>` +
          (joinUrl
            ? `<div style="text-align: center; margin: 24px 0;">` +
              `<a href="${joinUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Join Class Now</a>` +
              `</div>` +
              (password ? `<p style="text-align:center;font-size:12px;color:#6b7280;">Meeting password: <strong>${password}</strong></p>` : '')
            : '') +
          `</div></div>`;
        await sendEmail(r.email, subject, html).catch(() => {});
      }
      const phone = r.phone || r.guardianContact;
      if ((mode === 'sms' || mode === 'both') && phone) await sendSms(phone, sms).catch(() => {});
    }
  }
}

export async function runClassReminders(): Promise<void> {
  await notifyWindow(29, 30, 30, 'email');  // −30 min
  await notifyWindow(9, 10, 10, 'both');    // −10 min
  await notifyWindow(4, 5, 5, 'sms');       // −5 min
}
