/**
 * Compliance service — ported from ComplianceService (Prisma).
 * Compliance is COMPUTED (no own table) — aggregated from User + CourseAssignment
 * + Progress. The legacy auto-repair of progress records is omitted (read-only
 * analytics; noted). Nudge email sending is stubbed to a count (no email side
 * effect), matching the legacy TODO.
 */
import { prisma } from '@/lib/prisma';
import { notifyUsers } from '@/lib/services/notify-service';

interface CompletionRates { completed: number; inProgress: number; notStarted: number }
interface TopPerformer { userId: string; userName: string; email: string; coursesCompleted: number; averageScore: number }
interface DifficultModule { courseId: string; courseTitle: string; averageScore: number; totalAttempts: number }

export async function getComplianceAnalytics(orgId: string): Promise<{
  completionRates: CompletionRates; topPerformers: TopPerformer[]; difficultModules: DifficultModule[];
}> {
  if (!orgId) return { completionRates: { completed: 0, inProgress: 0, notStarted: 0 }, topPerformers: [], difficultModules: [] };

  const users = await prisma.user.findMany({ where: { orgId, role: { in: ['LEARNER', 'TEACHER'] } } });
  const userIds = users.map((u) => u.id);

  const assignments = await prisma.courseAssignment.findMany({ where: { orgId, targetType: 'USER' } });
  const allProgress = await prisma.progress.findMany({
    where: { OR: [{ learnerId: { in: userIds } }, { orgId }] },
  });

  const completedProgress = allProgress.filter((p) => p.completionPercentage >= 100 || p.status === 'Completed');
  const inProgressProgress = allProgress.filter(
    (p) => (p.completionPercentage > 0 && p.completionPercentage < 100) || (p.status === 'InProgress' && p.completionPercentage < 100),
  );
  const totalAssignments = Math.max(assignments.length, allProgress.length);
  const completedCount = completedProgress.length;
  const inProgressCount = inProgressProgress.length;
  const notStartedCount = Math.max(0, totalAssignments - completedCount - inProgressCount);

  // Top performers
  const userCompletions = new Map<string, { completed: number; totalScore: number; scoreCount: number }>();
  for (const p of allProgress) {
    const uid = p.learnerId;
    if (!userCompletions.has(uid)) userCompletions.set(uid, { completed: 0, totalScore: 0, scoreCount: 0 });
    const d = userCompletions.get(uid)!;
    if (p.completionPercentage >= 100 || p.status === 'Completed') d.completed++;
    if (p.quizScore != null) { d.totalScore += p.quizScore; d.scoreCount++; }
  }
  const topPerformers = Array.from(userCompletions.entries())
    .map(([uid, d]) => {
      const user = users.find((u) => u.id === uid);
      if (!user) return null;
      return {
        userId: uid, userName: `${user.firstName} ${user.lastName}`, email: user.email,
        coursesCompleted: d.completed, averageScore: d.scoreCount > 0 ? d.totalScore / d.scoreCount : 0,
      };
    })
    .filter((p): p is TopPerformer => p !== null && p.coursesCompleted > 0)
    .sort((a, b) => (b.coursesCompleted !== a.coursesCompleted ? b.coursesCompleted - a.coursesCompleted : b.averageScore - a.averageScore))
    .slice(0, 10);

  // Difficult modules — resolve titles from assignments / MasterCourse
  const assignedCourseIds = [...new Set(assignments.map((a) => a.courseId))];
  const masters = await prisma.masterCourse.findMany({ where: { id: { in: assignedCourseIds } }, select: { id: true, title: true } });
  const masterTitle = new Map(masters.map((m) => [m.id, m.title]));

  const courseCompletions = new Map<string, { totalPct: number; count: number; title: string }>();
  for (const p of allProgress) {
    const courseId = p.courseId;
    if (!courseId) continue;
    if (!courseCompletions.has(courseId)) {
      courseCompletions.set(courseId, { totalPct: 0, count: 0, title: masterTitle.get(courseId) || 'Unknown Course' });
    }
    const d = courseCompletions.get(courseId)!;
    d.totalPct += p.completionPercentage || 0;
    d.count++;
  }
  const difficultModules = Array.from(courseCompletions.entries())
    .map(([courseId, d]) => ({
      courseId, courseTitle: d.title, averageScore: d.count > 0 ? Math.round(d.totalPct / d.count) : 0, totalAttempts: d.count,
    }))
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 10);

  return { completionRates: { completed: completedCount, inProgress: inProgressCount, notStarted: notStartedCount }, topPerformers, difficultModules };
}

type NudgeReason = 'no_login' | 'overdue_course';
interface NudgeUser {
  userId: string; userName: string; email: string; reason: NudgeReason;
  daysSinceLastLogin?: number;
  overdueCourses?: { courseId: string; courseTitle: string; dueDate: Date; daysOverdue: number }[];
}

export async function getNudgeUsers(orgId: string): Promise<{ users: NudgeUser[]; totalCount: number }> {
  if (!orgId) return { users: [], totalCount: 0 };
  const now = new Date();

  const users = await prisma.user.findMany({ where: { orgId, role: { in: ['LEARNER', 'TEACHER'] } } });
  const assignments = await prisma.courseAssignment.findMany({ where: { orgId, targetType: 'USER', isMandatory: true } });
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const masters = await prisma.masterCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } });
  const titleMap = new Map(masters.map((m) => [m.id, m.title]));

  const nudgeUsers: NudgeUser[] = [];
  for (const user of users) {
    const userAssignments = assignments.filter((a) => a.targetId === user.id);
    const userProgress = await prisma.progress.findMany({ where: { learnerId: user.id } });

    const reasons: NudgeReason[] = [];
    const overdueCourses: NonNullable<NudgeUser['overdueCourses']> = [];

    const lastActivity = user.updatedAt || user.createdAt;
    const daysSinceLastLogin = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / 86400000);
    if (daysSinceLastLogin > 7) reasons.push('no_login');

    for (const a of userAssignments) {
      if (!a.dueDate) continue;
      const dueDate = new Date(a.dueDate);
      if (dueDate < now) {
        const progress = userProgress.find((p) => p.courseId === a.courseId);
        const isCompleted = progress && (progress.completionPercentage >= 100 || progress.status === 'Completed');
        if (!isCompleted) {
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
          overdueCourses.push({ courseId: a.courseId, courseTitle: titleMap.get(a.courseId) || 'Unknown Course', dueDate, daysOverdue });
        }
      }
    }

    if (reasons.length > 0 || overdueCourses.length > 0) {
      nudgeUsers.push({
        userId: user.id, userName: `${user.firstName} ${user.lastName}`, email: user.email,
        reason: reasons.length > 0 ? reasons[0] : 'overdue_course',
        daysSinceLastLogin: reasons.includes('no_login') ? daysSinceLastLogin : undefined,
        overdueCourses: overdueCourses.length > 0 ? overdueCourses : undefined,
      });
    }
  }
  return { users: nudgeUsers, totalCount: nudgeUsers.length };
}

export async function sendNudgeEmails(
  orgId: string,
  userIds: string[],
  senderId: string,
): Promise<{ success: boolean; sentCount: number }> {
  if (userIds.length === 0) return { success: false, sentCount: 0 };
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, orgId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (users.length === 0) return { success: false, sentCount: 0 };

  // Deliver a real in-app notification (Message inbox) to each user, plus a
  // best-effort email, plus a tenant audit row. Only count delivered users.
  const { deliveredCount } = await notifyUsers({
    orgId,
    senderId,
    recipients: users,
    message: 'Reminder: you have pending or overdue training. Please complete your assigned courses.',
    subject: 'Training reminder',
    auditAction: 'UserNudgedByManager',
  });
  return { success: deliveredCount > 0, sentCount: deliveredCount };
}
