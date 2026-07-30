/**
 * Daily scheduled jobs + TTL cleanups.
 *   09:00 deadline reminders  ·  09:30 overdue reminders  ·  07:00 lateness scan
 *   TTL: purge expired otps + analytics-cache (replaces Mongo TTL indexes).
 */
import { prisma } from '../db.js';
import { sendEmail } from '../notify.js';

const DAY = 86_400_000;

/** 09:00 — remind learners of assignments due within the next 3 days, not completed. */
export async function runDeadlineReminders(): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * DAY);
  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { targetType: 'USER', dueDate: { gte: now, lte: soon } },
    select: { courseId: true, targetId: true, orgId: true, dueDate: true },
  });
  for (const a of assignments) {
    const p = await prisma.lmsProgress.findFirst({ where: { orgId: a.orgId, learnerId: a.targetId, courseId: a.courseId }, select: { status: true } });
    if (p?.status === 'Completed') continue;
    const learner = await prisma.lmsUser.findUnique({ where: { id: a.targetId }, select: { email: true, firstName: true } });
    const course = await prisma.lmsCourse.findUnique({ where: { id: a.courseId }, select: { title: true } });
    if (learner?.email) {
      await sendEmail(learner.email, `Upcoming deadline: ${course?.title ?? 'course'}`,
        `<p>Hello ${learner.firstName ?? ''}, your course <strong>${course?.title ?? ''}</strong> is due on ${a.dueDate?.toDateString()}.</p>`).catch(() => {});
    }
  }
}

/** 09:30 — overdue assignments: email + mark progress Overdue. */
export async function runOverdueReminders(): Promise<void> {
  const now = new Date();
  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { targetType: 'USER', dueDate: { lt: now } },
    select: { courseId: true, targetId: true, orgId: true, dueDate: true },
  });
  for (const a of assignments) {
    const p = await prisma.lmsProgress.findFirst({ where: { orgId: a.orgId, learnerId: a.targetId, courseId: a.courseId } });
    if (p?.status === 'Completed') continue;
    if (p && p.status !== 'Overdue') {
      await prisma.lmsProgress.update({ where: { id: p.id }, data: { status: 'Overdue' } }).catch(() => {});
    }
    const learner = await prisma.lmsUser.findUnique({ where: { id: a.targetId }, select: { email: true, firstName: true } });
    const course = await prisma.lmsCourse.findUnique({ where: { id: a.courseId }, select: { title: true } });
    if (learner?.email) {
      await sendEmail(learner.email, `Overdue: ${course?.title ?? 'course'}`,
        `<p>Hello ${learner.firstName ?? ''}, your course <strong>${course?.title ?? ''}</strong> was due on ${a.dueDate?.toDateString()} and is now overdue.</p>`).catch(() => {});
    }
  }
}

/**
 * How far back the lateness scan looks for a teacher's "last 2 sessions".
 *
 * The legacy aggregation (`teacher-lateness-reminders.service.ts:56-80`) was
 * unbounded — fine over a Mongo aggregation, wasteful over every scheduled
 * class ever in Postgres, and it would coach a teacher about a pair of sessions
 * from last year. A quarter is long enough that any actively-taught batch has
 * its two most recent sessions inside the window.
 */
const LATENESS_LOOKBACK_DAYS = 90;

/**
 * 07:00 — "late in your last 2 sessions" coaching email, ported from
 * `TeacherLatenessRemindersService.handleDailyTeacherLatenessScan`.
 *
 * The port had degenerated into mailing tenant ADMINS a bare escalation count,
 * which is a different feature: it told an administrator a number and told the
 * teacher — the only person who can act on it — nothing. Restored here: per
 * (tenant, batch, teacher), take the last 2 non-cancelled/non-rescheduled
 * sessions, compare the teacher's first `MeetingAttendance.joinedAt` against
 * `startTime`, and if late in BOTH, email the teacher directly.
 *
 * Idempotent via LmsTeacherLatenessReminderLog: one mail per "latest session",
 * so a teacher is not re-nagged every morning about the same two classes.
 */
export async function runTeacherLatenessScan(): Promise<void> {
  const now = new Date();
  const since = new Date(now.getTime() - LATENESS_LOOKBACK_DAYS * DAY);

  const sessions = await prisma.lmsScheduledClass.findMany({
    where: {
      meetingId: { not: null },
      startTime: { lte: now, gte: since },
      status: { notIn: ['cancelled', 'rescheduled'] },
    },
    select: { id: true, orgId: true, batchId: true, teacherId: true, meetingId: true, startTime: true },
    orderBy: { startTime: 'desc' },
  });
  if (sessions.length === 0) return;

  // Group by (tenant, batch, teacher), keeping only the 2 most recent sessions.
  type Session = (typeof sessions)[number];
  const groups = new Map<string, { orgId: string; batchId: string; teacherId: string; sessions: Session[] }>();
  for (const s of sessions) {
    const key = `${s.orgId}|${s.batchId}|${s.teacherId}`;
    let g = groups.get(key);
    if (!g) { g = { orgId: s.orgId, batchId: s.batchId, teacherId: s.teacherId, sessions: [] }; groups.set(key, g); }
    if (g.sessions.length < 2) g.sessions.push(s); // already sorted startTime desc
  }
  const eligible = [...groups.values()].filter((g) => g.sessions.length === 2);
  if (eligible.length === 0) return;

  // First teacher join per meeting (legacy `$min: joinedAt` grouped by meeting+user).
  const meetingIds = eligible.flatMap((g) => g.sessions.map((s) => s.meetingId!));
  const joins = await prisma.lmsMeetingAttendance.findMany({
    where: { meetingId: { in: meetingIds }, role: 'teacher' },
    select: { meetingId: true, userId: true, joinedAt: true },
    orderBy: { joinedAt: 'asc' },
  });
  const firstJoin = new Map<string, Date>();
  for (const j of joins) {
    const key = `${j.meetingId}::${j.userId}`;
    if (!firstJoin.has(key)) firstJoin.set(key, j.joinedAt); // asc order → first wins
  }

  let sent = 0;
  for (const g of eligible) {
    try {
      const [latest, previous] = g.sessions; // desc by startTime
      const latestJoin = firstJoin.get(`${latest.meetingId}::${g.teacherId}`);
      const prevJoin = firstJoin.get(`${previous.meetingId}::${g.teacherId}`);
      // No join record → cannot classify as late.
      if (!latestJoin || !prevJoin) continue;
      if (latestJoin.getTime() <= new Date(latest.startTime).getTime()) continue;
      if (prevJoin.getTime() <= new Date(previous.startTime).getTime()) continue;

      // Idempotency — only notify once per "latest session".
      const log = await prisma.lmsTeacherLatenessReminderLog.findFirst({
        where: { orgId: g.orgId, batchId: g.batchId, teacherId: g.teacherId },
        select: { id: true, lastNotifiedScheduledClassId: true },
      });
      if (log?.lastNotifiedScheduledClassId === latest.id) continue;

      const teacher = await prisma.lmsUser.findUnique({
        where: { id: g.teacherId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (!teacher?.email) continue;

      const batch = await prisma.lmsBatch.findUnique({ where: { id: g.batchId }, select: { name: true, subject: true } });
      const className = batch ? `${batch.subject || 'Class'} - ${batch.name || ''}`.trim() : 'Class';
      const teacherName = `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim() || 'Teacher';

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;line-height:1.5;">
          <h2 style="margin:0 0 12px;">Lateness Reminder</h2>
          <p style="margin:0 0 12px;">Hi ${teacherName},</p>
          <p style="margin:0 0 12px;">
            You joined <b>${className}</b> after the scheduled start time for your <b>last 2 sessions</b>.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <thead>
              <tr>
                <th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:8px 4px;">Session</th>
                <th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:8px 4px;">Scheduled start</th>
                <th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:8px 4px;">Your join time</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:8px 4px;">Most recent</td>
                <td style="padding:8px 4px;">${new Date(latest.startTime).toUTCString()}</td>
                <td style="padding:8px 4px;">${new Date(latestJoin).toUTCString()}</td>
              </tr>
              <tr>
                <td style="padding:8px 4px;">Previous</td>
                <td style="padding:8px 4px;">${new Date(previous.startTime).toUTCString()}</td>
                <td style="padding:8px 4px;">${new Date(prevJoin).toUTCString()}</td>
              </tr>
            </tbody>
          </table>
          <p style="margin:0 0 12px;">Please try to join on time so students can start promptly.</p>
          <p style="margin:0;color:#6b7280;font-size:12px;">QuikSkill LMS</p>
        </div>`;

      await sendEmail(teacher.email, `Reminder: Please join ${className} on time`, html);

      // Only stamp the log once the mail actually went out, so a transient SMTP
      // failure retries tomorrow instead of being silently swallowed forever.
      if (log) {
        await prisma.lmsTeacherLatenessReminderLog.update({
          where: { id: log.id },
          data: { lastNotifiedScheduledClassId: latest.id, notifiedAt: new Date() },
        });
      } else {
        await prisma.lmsTeacherLatenessReminderLog.create({
          data: {
            orgId: g.orgId,
            batchId: g.batchId,
            teacherId: g.teacherId,
            lastNotifiedScheduledClassId: latest.id,
            notifiedAt: new Date(),
          },
        });
      }
      sent += 1;
    } catch (e) {
      console.error(`[lateness] teacher ${g.teacherId} / batch ${g.batchId} failed:`, (e as Error).message);
    }
  }
  if (sent > 0) console.log(`[lateness] sent ${sent} coaching email(s)`);
}

/**
 * TTL cleanup — replaces the Mongo TTL index on analytics-cache.
 *
 * The `otps` sweep was removed with the table: local email-OTP login was
 * retired by centralized auth (the platform's registration OTP is Redis-backed
 * and owned by apps/auth), the table held no rows, and nothing wrote to it.
 */
export async function runTtlCleanup(): Promise<void> {
  const now = new Date();
  await prisma.lmsAnalyticsCache.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
}
