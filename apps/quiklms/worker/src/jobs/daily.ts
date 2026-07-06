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
  const assignments = await prisma.courseAssignment.findMany({
    where: { targetType: 'USER', dueDate: { gte: now, lte: soon } },
    select: { courseId: true, targetId: true, tenantId: true, dueDate: true },
  });
  for (const a of assignments) {
    const p = await prisma.progress.findFirst({ where: { tenantId: a.tenantId, learnerId: a.targetId, courseId: a.courseId }, select: { status: true } });
    if (p?.status === 'Completed') continue;
    const learner = await prisma.user.findUnique({ where: { id: a.targetId }, select: { email: true, firstName: true } });
    const course = await prisma.course.findUnique({ where: { id: a.courseId }, select: { title: true } });
    if (learner?.email) {
      await sendEmail(learner.email, `Upcoming deadline: ${course?.title ?? 'course'}`,
        `<p>Hello ${learner.firstName ?? ''}, your course <strong>${course?.title ?? ''}</strong> is due on ${a.dueDate?.toDateString()}.</p>`).catch(() => {});
    }
  }
}

/** 09:30 — overdue assignments: email + mark progress Overdue. */
export async function runOverdueReminders(): Promise<void> {
  const now = new Date();
  const assignments = await prisma.courseAssignment.findMany({
    where: { targetType: 'USER', dueDate: { lt: now } },
    select: { courseId: true, targetId: true, tenantId: true, dueDate: true },
  });
  for (const a of assignments) {
    const p = await prisma.progress.findFirst({ where: { tenantId: a.tenantId, learnerId: a.targetId, courseId: a.courseId } });
    if (p?.status === 'Completed') continue;
    if (p && p.status !== 'Overdue') {
      await prisma.progress.update({ where: { id: p.id }, data: { status: 'Overdue' } }).catch(() => {});
    }
    const learner = await prisma.user.findUnique({ where: { id: a.targetId }, select: { email: true, firstName: true } });
    const course = await prisma.course.findUnique({ where: { id: a.courseId }, select: { title: true } });
    if (learner?.email) {
      await sendEmail(learner.email, `Overdue: ${course?.title ?? 'course'}`,
        `<p>Hello ${learner.firstName ?? ''}, your course <strong>${course?.title ?? ''}</strong> was due on ${a.dueDate?.toDateString()} and is now overdue.</p>`).catch(() => {});
    }
  }
}

/** 07:00 — scan yesterday's classes for teacher lateness; email admins a summary. */
export async function runTeacherLatenessScan(): Promise<void> {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setTime(start.getTime() - DAY);
  const end = new Date(start.getTime() + DAY);
  const escalations = await prisma.callEscalation.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { tenantId: true, teacherId: true },
  });
  // Group by tenant → notify each tenant admin
  const byTenant = new Map<string, Set<string>>();
  for (const e of escalations) {
    if (!byTenant.has(e.tenantId)) byTenant.set(e.tenantId, new Set());
    byTenant.get(e.tenantId)!.add(e.teacherId);
  }
  for (const [tenantId, teachers] of byTenant) {
    const admins = await prisma.user.findMany({ where: { tenantId, role: 'TENANT_ADMIN' }, select: { email: true } });
    for (const admin of admins) {
      if (admin.email) {
        await sendEmail(admin.email, 'Daily teacher lateness summary',
          `<p>${teachers.size} teacher(s) had lateness escalations yesterday.</p>`).catch(() => {});
      }
    }
  }
}

/** TTL cleanup — replaces Mongo TTL indexes on otps + analytics-cache. */
export async function runTtlCleanup(): Promise<void> {
  const now = new Date();
  await prisma.otp.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
  await prisma.analyticsCache.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
}
