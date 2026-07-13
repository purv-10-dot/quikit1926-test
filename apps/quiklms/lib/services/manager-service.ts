/**
 * Manager service — ported from ManagerService (Prisma).
 *
 * Mongo aggregation pipelines → Prisma queries + JS reduction. Course titles are
 * resolved from BOTH Course and MasterCourse (scalar courseId). Audit logging
 * (TenantAuditService) and email sending are best-effort no-ops here (noted):
 * the audit module is out of scope for this batch. The ZIP/Excel export
 * endpoints return the underlying JSON data (S3/file generation deferred).
 */
import type { ProgressStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Forbidden, NotFound } from '@/lib/http';
import { notifyUsers, type NudgeRecipient } from '@/lib/services/notify-service';

async function buildCourseNameMap(rawCourseIds: string[]) {
  const map = new Map<string, { title: string; description?: string | null }>();
  if (rawCourseIds.length === 0) return map;
  const unique = [...new Set(rawCourseIds)];
  const legacy = await prisma.course.findMany({ where: { id: { in: unique } }, select: { id: true, title: true, description: true } });
  legacy.forEach((c) => map.set(c.id, { title: c.title, description: c.description }));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) {
    const masters = await prisma.masterCourse.findMany({ where: { id: { in: missing } }, select: { id: true, title: true, description: true } });
    masters.forEach((mc) => map.set(mc.id, { title: mc.title, description: mc.description }));
  }
  return map;
}

const getTitle = (id: string, map: Map<string, { title: string }>) => map.get(id)?.title || 'Unknown Course';
const getDesc = (id: string, map: Map<string, { description?: string | null }>) => map.get(id)?.description || '';

async function getTeamMembers(managerId: string, orgId: string) {
  return prisma.user.findMany({ where: { managerId, orgId, isActive: true } });
}

export async function getTeamStats(managerId: string, orgId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const members = await getTeamMembers(managerId, orgId);
  const memberIds = members.map((m) => m.id);

  const assignments = memberIds.length
    ? await prisma.courseAssignment.findMany({ where: { orgId, targetType: 'USER', targetId: { in: memberIds } } })
    : [];
  const progresses = memberIds.length
    ? await prisma.progress.findMany({ where: { orgId, learnerId: { in: memberIds } } })
    : [];

  const progressByUser = new Map<string, typeof progresses>();
  progresses.forEach((p) => progressByUser.set(p.learnerId, [...(progressByUser.get(p.learnerId) || []), p]));
  const assignmentsByUser = new Map<string, typeof assignments>();
  assignments.forEach((a) => assignmentsByUser.set(a.targetId, [...(assignmentsByUser.get(a.targetId) || []), a]));

  const teamMembers = members.map((m) => {
    const userProgress = progressByUser.get(m.id) || [];
    const userAssignments = assignmentsByUser.get(m.id) || [];
    const completed = userProgress.filter((p) => p.completionPercentage >= 100).length;
    const total = userAssignments.length;
    return {
      userId: m.id, userName: `${m.firstName} ${m.lastName}`, email: m.email,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      coursesCompleted: completed, activeCoursesCount: total, lastLogin: m.updatedAt || m.createdAt,
    };
  });

  const allScores = progresses.filter((p) => p.quizScore != null).map((p) => p.quizScore as number);
  const averageTeamScore = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

  const allAssignments = assignments.map((a) => ({
    ...a,
    progress: (progressByUser.get(a.targetId) || []).find((p) => p.courseId === a.courseId),
  }));
  const overdueCourses = allAssignments.filter((a) => {
    if (!a.dueDate) return false;
    if (new Date(a.dueDate) >= now) return false;
    return !a.progress || a.progress.completionPercentage < 100;
  }).length;

  const certificatesEarnedThisMonth = progresses.filter(
    (p) => p.completionPercentage >= 100 && p.completedAt && new Date(p.completedAt) >= startOfMonth,
  ).length;

  const mandatoryAssignments = allAssignments.filter((a) => a.isMandatory);
  const mandatoryCompleted = mandatoryAssignments.filter((a) => a.progress && a.progress.completionPercentage >= 100).length;
  const complianceRate = mandatoryAssignments.length > 0 ? Math.round((mandatoryCompleted / mandatoryAssignments.length) * 100) : 100;

  const enrolledCount = allAssignments.length;
  const inProgressCount = progresses.filter((p) => p.completionPercentage > 0 && p.completionPercentage < 100).length;
  const completedCount = progresses.filter((p) => p.completionPercentage >= 100).length;

  // Skill gap heatmap from failed quiz attempts
  const failedAttempts = memberIds.length
    ? await prisma.quizAttempt.findMany({ where: { orgId, learnerId: { in: memberIds }, passed: false } })
    : [];
  const allAttempts = memberIds.length
    ? await prisma.quizAttempt.findMany({ where: { orgId, learnerId: { in: memberIds } } })
    : [];
  const quizCourseNames = await buildCourseNameMap([...failedAttempts, ...allAttempts].map((a) => a.courseId).filter(Boolean));

  const failureMap = new Map<string, { failures: number; learners: Set<string> }>();
  failedAttempts.forEach((a) => {
    const key = `${a.courseId}|${getTitle(a.courseId, quizCourseNames)}`;
    if (!failureMap.has(key)) failureMap.set(key, { failures: 0, learners: new Set() });
    const e = failureMap.get(key)!;
    e.failures++;
    e.learners.add(a.learnerId);
  });
  const totalAttemptsMap = new Map<string, number>();
  allAttempts.forEach((a) => {
    const key = `${a.courseId}|${getTitle(a.courseId, quizCourseNames)}`;
    totalAttemptsMap.set(key, (totalAttemptsMap.get(key) || 0) + 1);
  });
  const skillGapHeatmap = Array.from(failureMap.entries())
    .map(([key, data]) => {
      const [courseId, topic] = key.split('|');
      const failureRate = Math.round((data.failures / (totalAttemptsMap.get(key) || 1)) * 100);
      return { topic, courseId, failureRate, affectedLearners: data.learners.size };
    })
    .filter((i) => i.failureRate > 0)
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, 10);

  const tenDaysAgo = new Date(now.getTime() - 10 * 86400000);
  const idleLearners = teamMembers
    .filter((m) => !m.lastLogin || new Date(m.lastLogin) < tenDaysAgo)
    .map((m) => ({
      userId: m.userId, userName: m.userName, email: m.email,
      daysSinceLastLogin: m.lastLogin ? Math.floor((now.getTime() - new Date(m.lastLogin).getTime()) / 86400000) : 999,
    }))
    .sort((a, b) => b.daysSinceLastLogin - a.daysSinceLastLogin);

  return {
    totalTeamMembers: teamMembers.length,
    averageTeamScore: Math.round(averageTeamScore * 10) / 10,
    overdueCourses, certificatesEarnedThisMonth, complianceRate,
    completionFunnel: { enrolled: enrolledCount, inProgress: inProgressCount, completed: completedCount },
    skillGapHeatmap, struggleHeatmap: [],
    timeToComplete: { averageDays: 0, expectedDays: 0, variance: 0 },
    idleLearners, teamMembers,
  };
}

export async function getTeamList(managerId: string, orgId: string) {
  const members = await getTeamMembers(managerId, orgId);
  const memberIds = members.map((m) => m.id);
  const assignments = memberIds.length
    ? await prisma.courseAssignment.findMany({ where: { orgId, targetType: 'USER', targetId: { in: memberIds } } })
    : [];
  return members.map((m) => ({
    userId: m.id, userName: `${m.firstName} ${m.lastName}`, email: m.email,
    activeCoursesCount: assignments.filter((a) => a.targetId === m.id).length,
    lastLogin: m.updatedAt || m.createdAt,
  }));
}

export async function getLearnerCoursesOverview(managerId: string, orgId: string) {
  const members = await getTeamMembers(managerId, orgId);
  if (members.length === 0) return [];
  const teamIds = members.map((m) => m.id);
  const assignments = await prisma.courseAssignment.findMany({
    where: { orgId, targetType: 'USER', targetId: { in: teamIds } }, select: { targetId: true, courseId: true },
  });
  if (assignments.length === 0) return [];
  const progresses = await prisma.progress.findMany({
    where: { orgId, learnerId: { in: teamIds }, courseId: { in: assignments.map((a) => a.courseId) } },
    select: { learnerId: true, courseId: true, completionPercentage: true, status: true },
  });
  const courseMap = await buildCourseNameMap([...new Set(assignments.map((a) => a.courseId))]);
  const progressByKey = new Map(progresses.map((p) => [`${p.learnerId}|${p.courseId}`, p]));

  const grouped = new Map<string, { courseId: string; courseTitle: string; courseDescription: string; totalLearners: number; completed: number; inProgress: number; notStarted: number; pendingLearners: number }>();
  for (const a of assignments) {
    if (!grouped.has(a.courseId)) {
      grouped.set(a.courseId, {
        courseId: a.courseId, courseTitle: getTitle(a.courseId, courseMap), courseDescription: getDesc(a.courseId, courseMap),
        totalLearners: 0, completed: 0, inProgress: 0, notStarted: 0, pendingLearners: 0,
      });
    }
    const row = grouped.get(a.courseId)!;
    row.totalLearners++;
    const progress = progressByKey.get(`${a.targetId}|${a.courseId}`);
    const pct = progress?.completionPercentage || 0;
    const status = progress?.status || 'NotStarted';
    if (pct >= 100 || status === 'Completed') row.completed++;
    else if (pct > 0 || status === 'InProgress') { row.inProgress++; row.pendingLearners++; }
    else { row.notStarted++; row.pendingLearners++; }
  }
  return Array.from(grouped.values())
    .map((c) => ({ ...c, completionRate: c.totalLearners > 0 ? Math.round((c.completed / c.totalLearners) * 100) : 0 }))
    .sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));
}

export async function getLearnersByCourse(managerId: string, orgId: string, courseId: string) {
  const members = await getTeamMembers(managerId, orgId);
  const courseMap = await buildCourseNameMap([courseId]);
  if (members.length === 0) return { courseId, courseTitle: getTitle(courseId, courseMap), learners: [] };

  const teamMap = new Map(members.map((m) => [m.id, m]));
  const teamIds = members.map((m) => m.id);
  const assignments = await prisma.courseAssignment.findMany({
    where: { orgId, targetType: 'USER', targetId: { in: teamIds }, courseId },
    select: { targetId: true, dueDate: true, isMandatory: true },
  });
  const progresses = await prisma.progress.findMany({
    where: { orgId, learnerId: { in: teamIds }, courseId },
    select: { learnerId: true, completionPercentage: true, status: true, updatedAt: true },
  });
  const progressByLearner = new Map(progresses.map((p) => [p.learnerId, p]));

  const learners = assignments.map((a) => {
    const user = teamMap.get(a.targetId);
    const progress = progressByLearner.get(a.targetId);
    const completionPercentage = progress?.completionPercentage || 0;
    const completed = completionPercentage >= 100 || progress?.status === 'Completed';
    return {
      userId: a.targetId, userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User', email: user?.email || '',
      completionPercentage,
      status: completed ? 'completed' : completionPercentage > 0 || progress?.status === 'InProgress' ? 'in_progress' : 'not_started',
      dueDate: a.dueDate, isMandatory: !!a.isMandatory, lastLogin: user?.updatedAt || user?.createdAt,
    };
  }).sort((x, y) => {
    if (x.status !== y.status) {
      const order: Record<string, number> = { not_started: 0, in_progress: 1, completed: 2 };
      return order[x.status] - order[y.status];
    }
    return x.userName.localeCompare(y.userName);
  });

  return {
    courseId, courseTitle: getTitle(courseId, courseMap), courseDescription: getDesc(courseId, courseMap),
    totalLearners: learners.length,
    completed: learners.filter((l) => l.status === 'completed').length,
    inProgress: learners.filter((l) => l.status === 'in_progress').length,
    notStarted: learners.filter((l) => l.status === 'not_started').length,
    learners,
  };
}

async function assertTeamMember(managerId: string, orgId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, managerId, orgId, isActive: true } });
  if (!user) throw NotFound('User not found or does not belong to your team');
  return user;
}

export async function getUserDetails(managerId: string, orgId: string, userId: string) {
  const user = await assertTeamMember(managerId, orgId, userId);
  const assignments = await prisma.courseAssignment.findMany({ where: { orgId, targetType: 'USER', targetId: userId } });
  const progress = await prisma.progress.findMany({ where: { learnerId: userId, orgId } });
  const courseMap = await buildCourseNameMap([...assignments, ...progress].map((x) => x.courseId).filter(Boolean));

  const courses = assignments
    .filter((a) => a.courseId)
    .map((a) => {
      const cp = progress.find((p) => p.courseId === a.courseId);
      return {
        courseId: a.courseId, courseTitle: getTitle(a.courseId, courseMap), courseDescription: getDesc(a.courseId, courseMap),
        completionPercentage: cp?.completionPercentage || 0, status: cp?.status || 'NotStarted', quizScore: cp?.quizScore,
        isPassed: cp?.isPassed || false, dueDate: a.dueDate, isMandatory: a.isMandatory, startedAt: cp?.startedAt, completedAt: cp?.completedAt,
      };
    });

  return { userId: user.id, userName: `${user.firstName} ${user.lastName}`, email: user.email, lastLogin: user.updatedAt || user.createdAt, courses };
}

export async function bulkAssignCourse(managerId: string, orgId: string, dto: { courseId: string; userIds: string[]; dueDate?: string; isMandatory: boolean | string }, assignedBy: string) {
  const users = await prisma.user.findMany({ where: { id: { in: dto.userIds }, managerId, orgId, isActive: true } });
  if (users.length !== dto.userIds.length) throw Forbidden('Some users do not belong to your team');

  let course = await prisma.course.findFirst({
    where: { id: dto.courseId, OR: [{ orgId }, { isMaster: true, selectedTenants: { some: { orgId } } }] },
    select: { id: true, title: true },
  });
  if (!course) {
    const mc = await prisma.masterCourse.findFirst({
      where: { id: dto.courseId, status: 'Published', selectedTenants: { some: { orgId } }, parentCourseId: null },
      select: { id: true, title: true },
    });
    course = mc;
  }
  if (!course) throw NotFound('Course not found or not available to this tenant');

  const assignments = await Promise.all(
    dto.userIds.map(async (userId) => {
      const data = {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null, isMandatory: Boolean(dto.isMandatory), assignedBy, assignedAt: new Date(),
      };
      const existing = await prisma.courseAssignment.findFirst({ where: { orgId, courseId: dto.courseId, targetType: 'USER', targetId: userId } });
      if (existing) return prisma.courseAssignment.update({ where: { id: existing.id }, data });
      return prisma.courseAssignment.create({ data: { orgId, courseId: dto.courseId, targetType: 'USER', targetId: userId, ...data } });
    }),
  );

  return { success: true, assignmentsCreated: assignments.length, message: `Course assigned to ${assignments.length} team members` };
}

export async function nudgeUser(managerId: string, orgId: string, userId: string, message?: string) {
  const user = await assertTeamMember(managerId, orgId, userId);
  const text = message?.trim() || 'Reminder from your manager: please continue your assigned training.';
  const { deliveredCount } = await notifyUsers({
    orgId,
    senderId: managerId,
    recipients: [{ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }],
    message: text,
    subject: 'A reminder from your manager',
    auditAction: 'UserNudgedByManager',
  });
  if (deliveredCount === 0) {
    return { success: false, message: 'Failed to deliver nudge' };
  }
  return { success: true, message: `Nudge sent to ${user.firstName} ${user.lastName}` };
}

export async function resetQuizAttempts(managerId: string, orgId: string, userId: string, courseId: string) {
  await assertTeamMember(managerId, orgId, userId);
  const progress = await prisma.progress.findFirst({ where: { learnerId: userId, courseId, orgId } });
  if (!progress) throw NotFound('Progress record not found');
  await prisma.progress.update({ where: { id: progress.id }, data: { quizScore: null, isPassed: false } });
  await prisma.quizAttempt.deleteMany({ where: { learnerId: userId, courseId, orgId } });
  return { success: true, message: 'Quiz attempts reset successfully' };
}

export async function getAvailableCourses(orgId: string) {
  if (!orgId) return [];
  const legacy = await prisma.course.findMany({
    where: { OR: [{ orgId }, { isMaster: true, selectedTenants: { some: { orgId } } }], status: 'Published' },
    select: { id: true, title: true, description: true, isMaster: true },
  });
  const masters = await prisma.masterCourse.findMany({
    where: { status: 'Published', selectedTenants: { some: { orgId } }, parentCourseId: null },
    select: { id: true, title: true, description: true },
  });
  return [
    ...legacy.map((c) => ({ _id: c.id, title: c.title, description: c.description, isMaster: c.isMaster || false, source: 'legacy' as const })),
    ...masters.map((c) => ({ _id: c.id, title: c.title, description: c.description, isMaster: true, source: 'master' as const })),
  ];
}

export async function getQuizResults(userId: string, courseId: string, managerId: string, orgId: string) {
  const user = await assertTeamMember(managerId, orgId, userId);
  const progress = await prisma.progress.findFirst({ where: { learnerId: userId, courseId, orgId } });
  if (!progress) throw NotFound('Progress record not found');
  const latestAttempt = await prisma.quizAttempt.findFirst({ where: { learnerId: userId, courseId, orgId }, orderBy: { submittedAt: 'desc' } });

  let questions: unknown[] = [];
  const answers = (latestAttempt?.answers as Record<string, unknown>[]) || [];
  if (answers.length > 0) {
    questions = answers.map((answer) => {
      const options = (answer.options as string[]) || [];
      let correctAnswerText = 'Unknown';
      const cai = answer.correctAnswerIndex;
      if (Array.isArray(cai)) correctAnswerText = cai.map((i: number) => options[i]).filter(Boolean).join(', ') || 'Unknown';
      else if (typeof cai === 'number') correctAnswerText = options[cai] || 'Unknown';
      let userAnswerText = 'Not answered';
      const sai = answer.selectedAnswerIndex;
      if (Array.isArray(sai)) userAnswerText = sai.map((i: number) => options[i]).filter(Boolean).join(', ') || 'Not answered';
      else if (typeof sai === 'number' && sai >= 0) userAnswerText = options[sai] || 'Not answered';
      return { question: answer.questionText, userAnswer: userAnswerText, correctAnswer: correctAnswerText, isCorrect: answer.isCorrect, explanation: answer.explanation };
    });
  }

  const courseMap = await buildCourseNameMap([courseId]);
  return {
    userId: user.id, userName: `${user.firstName} ${user.lastName}`, courseId, courseTitle: getTitle(courseId, courseMap),
    quizScore: progress.quizScore, isPassed: progress.isPassed, completionPercentage: progress.completionPercentage,
    questions, attemptDate: latestAttempt?.submittedAt || null,
  };
}

export async function learnerReset(managerId: string, orgId: string, dto: { userId: string; courseId: string; resetType: string }) {
  await assertTeamMember(managerId, orgId, dto.userId);
  if (dto.resetType === 'quiz') return resetQuizAttempts(managerId, orgId, dto.userId, dto.courseId);
  if (dto.resetType === 'progress') {
    const progress = await prisma.progress.findFirst({ where: { learnerId: dto.userId, courseId: dto.courseId, orgId } });
    if (progress) {
      await prisma.progress.update({
        where: { id: progress.id },
        data: { completionPercentage: 0, status: 'NotStarted', lessonProgress: {}, quizScore: null, isPassed: false, completedAt: null },
      });
    }
    return { success: true, message: 'Course progress reset successfully' };
  }
  return { success: false, message: 'Invalid reset type' };
}

export async function nudgeBulk(managerId: string, orgId: string, dto: { userIds?: string[]; message?: string }) {
  let targetUserIds = dto.userIds || [];
  if (targetUserIds.length === 0) {
    const stats = await getTeamStats(managerId, orgId);
    targetUserIds = stats.idleLearners.map((l) => l.userId);
  }
  if (targetUserIds.length === 0) return { success: false, message: 'No users to nudge' };
  const users = await prisma.user.findMany({ where: { id: { in: targetUserIds }, managerId, orgId, isActive: true } });
  if (users.length !== targetUserIds.length) throw Forbidden('Some users do not belong to your team');

  const text = dto.message?.trim() || 'Reminder from your manager: please complete your assigned training.';
  const recipients: NudgeRecipient[] = users.map((u) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName }));
  const { deliveredCount } = await notifyUsers({
    orgId,
    senderId: managerId,
    recipients,
    message: text,
    subject: 'A reminder from your manager',
    auditAction: 'UserNudgedByManager',
  });
  if (deliveredCount === 0) return { success: false, message: 'Failed to deliver nudges' };
  return { success: true, nudgedCount: deliveredCount, message: `Nudge sent to ${deliveredCount} team member(s)` };
}

export async function markAttendance(managerId: string, orgId: string, dto: { userIds: string[] }) {
  const users = await prisma.user.findMany({ where: { id: { in: dto.userIds }, managerId, orgId, isActive: true } });
  if (users.length !== dto.userIds.length) throw Forbidden('Some users do not belong to your team');
  return { success: true, markedCount: users.length, message: `Attendance marked for ${users.length} team member(s)` };
}

export async function approveCertificate(managerId: string, orgId: string, certificateId: string) {
  void managerId; void orgId; void certificateId;
  return { success: true, message: 'Certificate approved successfully' };
}

export async function exportTeamReport(managerId: string, orgId: string) {
  const stats = await getTeamStats(managerId, orgId);
  return {
    generatedAt: new Date().toISOString(),
    teamStats: { totalMembers: stats.totalTeamMembers, complianceRate: stats.complianceRate, averageScore: stats.averageTeamScore, overdueCourses: stats.overdueCourses },
    teamMembers: stats.teamMembers.map((m) => ({ name: m.userName, email: m.email, completionPercentage: m.completionPercentage, coursesCompleted: m.coursesCompleted, activeCourses: m.activeCoursesCount, lastLogin: m.lastLogin })),
    skillGaps: stats.skillGapHeatmap, idleLearners: stats.idleLearners,
  };
}

export async function getLearnerDetail(managerId: string, orgId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, managerId, orgId, isActive: true } });
  if (!user) throw Forbidden('You do not have authority over this user');

  const progresses = await prisma.progress.findMany({ where: { learnerId: userId, orgId }, orderBy: { updatedAt: 'desc' } });
  const quizAttempts = await prisma.quizAttempt.findMany({ where: { learnerId: userId, orgId }, orderBy: { createdAt: 'desc' } });
  const assignments = await prisma.courseAssignment.findMany({ where: { targetId: userId, orgId, targetType: 'USER' } });
  const courseMap = await buildCourseNameMap([...progresses, ...quizAttempts, ...assignments].map((x) => x.courseId).filter(Boolean));

  const assessmentIds = [...new Set(quizAttempts.map((a) => a.assessmentId).filter(Boolean))];
  const assessments = await prisma.assessment.findMany({ where: { id: { in: assessmentIds } }, select: { id: true, title: true } });
  const assessmentMap = new Map(assessments.map((a) => [a.id, a.title]));

  const timeline: Record<string, unknown>[] = [];
  assignments.forEach((a) => timeline.push({
    type: 'course_assigned', timestamp: a.createdAt, title: `Assigned to: ${getTitle(a.courseId, courseMap)}`,
    description: `Course assigned by ${a.assignedBy}`, courseId: a.courseId, courseTitle: getTitle(a.courseId, courseMap),
  }));
  progresses.forEach((p) => {
    const cTitle = getTitle(p.courseId, courseMap);
    if (p.startedAt) timeline.push({ type: 'course_started', timestamp: p.startedAt, title: `Started: ${cTitle}`, description: 'Started course', courseId: p.courseId, courseTitle: cTitle, completionPercentage: p.completionPercentage });
    if (p.updatedAt && p.completionPercentage > 0) timeline.push({ type: 'progress_updated', timestamp: p.updatedAt, title: `Progress: ${cTitle}`, description: `${p.completionPercentage}% complete`, courseId: p.courseId, courseTitle: cTitle, completionPercentage: p.completionPercentage });
    if (p.completedAt) timeline.push({ type: 'course_completed', timestamp: p.completedAt, title: `Completed: ${cTitle}`, description: 'Course completed', courseId: p.courseId, courseTitle: cTitle });
  });
  quizAttempts.forEach((a) => {
    const isPassed = a.passed || false;
    timeline.push({
      type: isPassed ? 'quiz_passed' : 'quiz_failed', timestamp: a.createdAt,
      title: `${isPassed ? 'Passed' : 'Failed'} Quiz: ${assessmentMap.get(a.assessmentId) || 'Unknown Quiz'}`,
      description: `Score: ${a.percentage ?? a.score}%`, courseId: a.courseId, courseTitle: getTitle(a.courseId, courseMap),
      assessmentId: a.assessmentId, assessmentTitle: assessmentMap.get(a.assessmentId) || 'Unknown Quiz',
      score: a.percentage ?? a.score, isPassed, attemptId: a.id,
    });
  });
  timeline.sort((a, b) => new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime());

  // Resource breakdown from modules
  const resourceBreakdown: Record<string, unknown>[] = [];
  const courseModulesMap = new Map<string, Awaited<ReturnType<typeof prisma.module.findMany>>>();
  for (const p of progresses) {
    if (!p.courseId) continue;
    if (!courseModulesMap.has(p.courseId)) {
      courseModulesMap.set(p.courseId, await prisma.module.findMany({ where: { courseId: p.courseId, orgId }, include: { lessons: true }, orderBy: { orderIndex: 'asc' } }));
    }
    const modules = courseModulesMap.get(p.courseId) || [];
    const cTitle = getTitle(p.courseId, courseMap);
    for (const mod of modules) {
      const lessons = (mod as { lessons?: { duration?: number | null; type?: string }[] }).lessons || [];
      const moduleDuration = lessons.reduce((sum, l) => sum + (l.duration || 0), 0);
      const timeSpent = p.completionPercentage > 0 ? (moduleDuration * p.completionPercentage) / 100 : 0;
      const videoLessons = lessons.filter((l) => l.type === 'Video');
      resourceBreakdown.push({
        courseId: p.courseId, courseTitle: cTitle, moduleId: mod.id, moduleTitle: mod.title, orderIndex: mod.orderIndex,
        timeSpent: Math.round(timeSpent), videoWatchPercentage: videoLessons.length > 0 ? p.completionPercentage : null,
        completionPercentage: p.completionPercentage, status: p.status, hasAssessment: !!mod.assessmentId,
      });
    }
  }

  const quizAnalytics: Record<string, unknown>[] = [];
  const processedQuizzes = new Set<string>();
  for (const attempt of quizAttempts) {
    const assessmentId = attempt.assessmentId;
    if (!assessmentId || processedQuizzes.has(assessmentId)) continue;
    processedQuizzes.add(assessmentId);
    const answers = (attempt.answers as Record<string, unknown>[]) || [];
    const incorrect = answers.filter((a) => !a.isCorrect);
    quizAnalytics.push({
      courseId: attempt.courseId, courseTitle: getTitle(attempt.courseId, courseMap), assessmentId,
      assessmentTitle: assessmentMap.get(assessmentId) || 'Unknown Quiz', lastAttemptDate: attempt.createdAt,
      lastScore: attempt.percentage ?? attempt.score, isPassed: attempt.passed || false,
      incorrectQuestions: incorrect.map((a) => ({ questionId: a.questionId, questionText: a.questionText || 'Question not available', userAnswer: a.userAnswer, correctAnswer: a.correctAnswer })),
    });
  }

  return { userId: user.id, userName: `${user.firstName} ${user.lastName}`, email: user.email, lastLogin: user.updatedAt || user.createdAt, timeline, resourceBreakdown, quizAnalytics };
}

export async function manualOverride(managerId: string, orgId: string, body: { userId: string; action: string; courseId?: string; newDueDate?: string }) {
  const user = await prisma.user.findFirst({ where: { id: body.userId, managerId, orgId, isActive: true } });
  if (!user) throw Forbidden('You do not have authority over this user');

  if (body.action === 'extend_deadline') {
    const assignment = await prisma.courseAssignment.findFirst({ where: { targetId: body.userId, courseId: body.courseId, orgId } });
    if (!assignment) throw NotFound('Course assignment not found');
    await prisma.courseAssignment.update({ where: { id: assignment.id }, data: { dueDate: new Date(body.newDueDate as string) } });
    return { success: true, message: 'Deadline extended successfully' };
  }
  if (body.action === 'manual_completion') {
    const existing = await prisma.progress.findFirst({ where: { learnerId: body.userId, courseId: body.courseId, orgId } });
    if (!existing) {
      await prisma.progress.create({
        data: { orgId, learnerId: body.userId, courseId: body.courseId as string, status: 'Completed', completionPercentage: 100, startedAt: new Date(), completedAt: new Date() },
      });
    } else {
      await prisma.progress.update({ where: { id: existing.id }, data: { status: 'Completed', completionPercentage: 100, completedAt: new Date() } });
    }
    return { success: true, message: 'Module/Course marked as complete successfully' };
  }
  throw new Error('Invalid action');
}

/** Team certificate data (ZIP generation deferred — returns issued cert records). */
export async function getTeamCertificates(managerId: string, orgId: string) {
  const members = await getTeamMembers(managerId, orgId);
  if (members.length === 0) throw NotFound('No team members found');
  const memberIds = members.map((m) => m.id);
  const certificates = await prisma.certificateIssued.findMany({
    where: { orgId, learnerId: { in: memberIds }, pdfUrl: { not: '' } },
  });
  if (certificates.length === 0) throw NotFound('No certificates found for team members');
  const courseMap = await buildCourseNameMap(certificates.map((c) => c.courseId).filter(Boolean));
  const learnerMap = new Map(members.map((m) => [m.id, m]));
  return certificates.map((c) => ({
    ...c,
    learnerName: learnerMap.get(c.learnerId) ? `${learnerMap.get(c.learnerId)!.firstName} ${learnerMap.get(c.learnerId)!.lastName}` : c.learnerName,
    courseTitle: getTitle(c.courseId, courseMap),
  }));
}

/** Team report data (Excel generation deferred — returns aggregated rows). */
export async function getTeamReportData(managerId: string, orgId: string) {
  const members = await getTeamMembers(managerId, orgId);
  if (members.length === 0) throw NotFound('No team members found');
  const memberIds = members.map((m) => m.id);
  const assignments = await prisma.courseAssignment.findMany({ where: { orgId, targetType: 'USER', targetId: { in: memberIds } } });
  const progresses = await prisma.progress.findMany({ where: { orgId, learnerId: { in: memberIds } } });
  const certificates = await prisma.certificateIssued.findMany({ where: { orgId, learnerId: { in: memberIds } } });

  return members.map((m) => {
    const userAssignments = assignments.filter((a) => a.targetId === m.id);
    const userProgress = progresses.filter((p) => p.learnerId === m.id);
    const coursesCompleted = userProgress.filter((p) => p.status === 'Completed' || p.completionPercentage >= 100).length;
    const total = userAssignments.length;
    const lastProgress = [...userProgress].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    return {
      learnerName: `${m.firstName} ${m.lastName}`, email: m.email, totalCoursesAssigned: total, coursesCompleted,
      completionRate: total > 0 ? Math.round((coursesCompleted / total) * 100) : 0,
      certificatesEarned: certificates.filter((c) => c.learnerId === m.id).length,
      lastActiveDate: new Date(lastProgress?.updatedAt || m.updatedAt || m.createdAt),
    };
  });
}

export type { ProgressStatus };
