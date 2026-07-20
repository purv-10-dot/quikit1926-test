/**
 * Course-assignment reminders — nudge learners about incomplete assignments at
 * day-10 and day-20 after assignment (the immediate reminder is sent at assign
 * time by the REST layer). Skips learners who have already completed the course.
 * Run daily.
 */
import { prisma } from '../db.js';
import { sendEmail } from '../notify.js';

function daysAgoWindow(days: number) {
  const now = Date.now();
  return { gte: new Date(now - (days + 1) * 86_400_000), lt: new Date(now - days * 86_400_000) };
}

async function remindForAge(days: number) {
  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { targetType: 'USER', assignedAt: daysAgoWindow(days) },
    select: { id: true, courseId: true, targetId: true, orgId: true },
  });
  for (const a of assignments) {
    const progress = await prisma.lmsProgress.findFirst({
      where: { orgId: a.orgId, learnerId: a.targetId, courseId: a.courseId },
      select: { status: true },
    });
    if (progress?.status === 'Completed') continue; // skip completed
    const learner = await prisma.lmsUser.findUnique({ where: { id: a.targetId }, select: { email: true, firstName: true } });
    const course = await prisma.lmsCourse.findUnique({ where: { id: a.courseId }, select: { title: true } });
    if (learner?.email) {
      await sendEmail(
        learner.email,
        `Reminder: complete "${course?.title ?? 'your course'}"`,
        `<p>Hello ${learner.firstName ?? ''}, this is a day-${days} reminder to complete <strong>${course?.title ?? 'your assigned course'}</strong>.</p>`,
      ).catch(() => {});
    }
  }
}

export async function runCourseAssignmentReminders(): Promise<void> {
  await remindForAge(10);
  await remindForAge(20);
}
