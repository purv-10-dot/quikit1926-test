/**
 * Analytics service — ported from AnalyticsService (Prisma + JS aggregation).
 *
 * The legacy service used Mongo aggregation pipelines across many collections.
 * Postgres stores orgId/courseId/learnerId/etc. as scalar Strings (no dual
 * ObjectId|string matching needed), so each metric is recomputed with Prisma
 * queries + JS grouping. Response objects are preserved exactly.
 *
 * Cache helpers (AnalyticsCache) are ported but the public methods below do not
 * wrap themselves in caching (the legacy public methods didn't either — caching
 * was opt-in via getCached/setCache, which callers never invoked here).
 */
import { prisma } from '@/lib/prisma';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
// %Y-%U — year + zero-based week-of-year (Sunday-start), matching Mongo $dateToString.
const weekKey = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86400000);
  const week = Math.floor((days + start.getDay()) / 7);
  return `${d.getFullYear()}-${String(week).padStart(2, '0')}`;
};

async function buildCourseNameMap(courseIds: string[]): Promise<Map<string, { title: string; description?: string }>> {
  const nameMap = new Map<string, { title: string; description?: string }>();
  const uniqueIds = [...new Set(courseIds.filter(Boolean))];
  if (!uniqueIds.length) return nameMap;

  const legacyCourses = await prisma.lmsCourse.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, title: true, description: true },
  });
  legacyCourses.forEach((c) => nameMap.set(c.id, { title: c.title || 'Untitled Course', description: c.description || '' }));

  const unresolved = uniqueIds.filter((id) => !nameMap.has(id));
  if (unresolved.length) {
    const masters = await prisma.lmsMasterCourse.findMany({
      where: { id: { in: unresolved } },
      select: { id: true, title: true, description: true },
    });
    masters.forEach((c) => nameMap.set(c.id, { title: c.title || 'Untitled Course', description: c.description || '' }));
  }
  return nameMap;
}

// ═══════════════ EVENT TRACKING ═══════════════
export async function trackEvent(orgId: string, eventType: string, eventData?: unknown, userId?: string) {
  try {
    await prisma.lmsAnalyticsEvent.create({
      data: {
        orgId,
        userId: userId || null,
        eventType,
        eventData: (eventData ?? undefined) as never,
      },
    });
  } catch {
    /* swallow — tracking is best-effort */
  }
}

// ═══════════════ CORPORATE OVERVIEW ═══════════════
export async function getCorporateOverview(orgId: string) {
  const now = new Date();
  const [totalLearners, progresses, totalAssignments, mandatoryAssignments, certificatesIssued] = await Promise.all([
    prisma.lmsUser.count({ where: { orgId, role: 'LEARNER', isActive: true } }),
    prisma.lmsProgress.findMany({
      where: { orgId },
      select: { learnerId: true, courseId: true, completionPercentage: true, status: true, startedAt: true, completedAt: true },
    }),
    prisma.lmsCourseAssignment.count({ where: { orgId } }),
    prisma.lmsCourseAssignment.findMany({
      where: { orgId, isMandatory: true },
      select: { courseId: true, targetId: true, targetType: true, dueDate: true },
    }),
    prisma.lmsCertificateIssued.count({ where: { orgId } }),
  ]);

  let completed = 0;
  let inProgress = 0;
  const activeLearnerSet = new Set<string>();
  const completedCourseSet = new Set<string>(); // learnerId|courseId completed
  const activeCourseSet = new Set<string>();
  let completionDaysSum = 0;
  let completionDaysCount = 0;

  for (const p of progresses) {
    const pct = p.completionPercentage || 0;
    const isDone = pct >= 100 || p.status === 'Completed';
    const isActive = (pct > 0 || p.status === 'InProgress') && !isDone;
    if (isDone) completed++;
    else if (isActive) inProgress++;

    if (isDone || isActive) activeLearnerSet.add(p.learnerId); // learner engaged with content
    if (p.courseId) activeCourseSet.add(p.courseId);
    if (isDone) {
      completedCourseSet.add(`${p.learnerId}|${p.courseId}`);
      if (p.completedAt && p.startedAt) {
        const days = (p.completedAt.getTime() - p.startedAt.getTime()) / 86400000;
        if (days >= 0) { completionDaysSum += days; completionDaysCount++; }
      }
    }
  }

  const totalEnrollments = Math.max(progresses.length, totalAssignments);
  const completionRate = totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0;

  // Compliance: fraction of mandatory (USER-targeted) assignments whose learner has completed the course.
  const userMandatory = mandatoryAssignments.filter((a) => a.targetType === 'USER' && a.targetId);
  const compliant = userMandatory.filter((a) => completedCourseSet.has(`${a.targetId}|${a.courseId}`)).length;
  const complianceRate = userMandatory.length > 0 ? Math.round((compliant / userMandatory.length) * 100) : 0;

  // Overdue: past-due mandatory user assignments not yet completed.
  const overdueAssignments = userMandatory.filter(
    (a) => a.dueDate && a.dueDate < now && !completedCourseSet.has(`${a.targetId}|${a.courseId}`),
  ).length;

  const avgCompletionTime = completionDaysCount > 0 ? Math.round(completionDaysSum / completionDaysCount) : 0;

  // Top courses by completions (tenant-scoped), enriched with titles.
  const byCourse = new Map<string, { completions: number; enrolled: number }>();
  for (const p of progresses) {
    if (!p.courseId) continue;
    const row = byCourse.get(p.courseId) || { completions: 0, enrolled: 0 };
    row.enrolled++;
    if (p.completionPercentage >= 100 || p.status === 'Completed') row.completions++;
    byCourse.set(p.courseId, row);
  }
  const topCourseIds = [...byCourse.entries()].sort((a, b) => b[1].completions - a[1].completions).slice(0, 5);
  const courseNameMap = await buildCourseNameMap(topCourseIds.map(([id]) => id));
  const topCourses = topCourseIds.map(([id, v]) => ({
    name: courseNameMap.get(id)?.title || 'Untitled Course',
    completions: v.completions,
    enrolled: v.enrolled,
  }));

  return {
    totalLearners,
    activeLearners: activeLearnerSet.size,
    totalCourses: totalEnrollments,
    completedCourses: completed,
    inProgressCourses: inProgress,
    notStartedCourses: Math.max(0, totalEnrollments - completed - inProgress),
    completionRate,
    complianceRate,
    certificatesIssued,
    overdueAssignments,
    avgCompletionTime,
    activeCoursesCount: activeCourseSet.size,
    topCourses,
  };
}

export async function getCorporateLearnerCoursesOverview(orgId: string) {
  const users = await prisma.lmsUser.findMany({
    where: { orgId, role: { in: ['LEARNER', 'MANAGER'] }, isActive: true },
    select: { id: true },
  });
  if (!users.length) return [];

  const userIds = users.map((u) => u.id);
  const userIdSet = new Set(userIds);

  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { orgId, targetType: 'USER', targetId: { in: userIds } },
    select: { targetId: true, courseId: true },
  });
  if (!assignments.length) return [];

  const seen = new Set<string>();
  const deduped = assignments.filter((a) => {
    if (!a.targetId || !a.courseId || !userIdSet.has(a.targetId)) return false;
    const key = `${a.targetId}|${a.courseId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!deduped.length) return [];

  const courseIds = [...new Set(deduped.map((a) => a.courseId))];
  const progresses = await prisma.lmsProgress.findMany({
    where: { orgId, learnerId: { in: userIds }, courseId: { in: courseIds } },
    select: { learnerId: true, courseId: true, completionPercentage: true, status: true },
  });

  const courseMap = await buildCourseNameMap(courseIds);
  const progressByKey = new Map<string, { completionPercentage: number; status: string }>();
  progresses.forEach((p) => progressByKey.set(`${p.learnerId}|${p.courseId}`, p));

  const grouped = new Map<string, {
    courseId: string; courseTitle: string; courseDescription: string;
    totalLearners: number; completed: number; inProgress: number; notStarted: number; pendingLearners: number;
  }>();

  for (const a of deduped) {
    if (!grouped.has(a.courseId)) {
      const info = courseMap.get(a.courseId);
      grouped.set(a.courseId, {
        courseId: a.courseId,
        courseTitle: info?.title || 'Unknown Course',
        courseDescription: info?.description || '',
        totalLearners: 0, completed: 0, inProgress: 0, notStarted: 0, pendingLearners: 0,
      });
    }
    const row = grouped.get(a.courseId)!;
    row.totalLearners += 1;

    const progress = progressByKey.get(`${a.targetId}|${a.courseId}`);
    const pct = progress?.completionPercentage || 0;
    const status = progress?.status || '';
    if (pct >= 100 || status === 'Completed') row.completed += 1;
    else if (pct > 0 || status === 'InProgress') { row.inProgress += 1; row.pendingLearners += 1; }
    else { row.notStarted += 1; row.pendingLearners += 1; }
  }

  return Array.from(grouped.values())
    .map((c) => ({ ...c, completionRate: c.totalLearners > 0 ? Math.round((c.completed / c.totalLearners) * 100) : 0 }))
    .sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));
}

export async function getCorporateLearnersByCourse(orgId: string, courseId: string) {
  const emptyShape = async () => {
    const info = (await buildCourseNameMap([courseId])).get(courseId);
    return {
      courseId,
      courseTitle: info?.title || 'Unknown Course',
      courseDescription: info?.description || '',
      totalLearners: 0, completed: 0, inProgress: 0, notStarted: 0, learners: [] as unknown[],
    };
  };

  const users = await prisma.lmsUser.findMany({
    where: { orgId, role: { in: ['LEARNER', 'MANAGER'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, updatedAt: true, createdAt: true },
  });
  if (!users.length) return emptyShape();

  const userMap = new Map(users.map((u) => [u.id, u]));
  const userIds = users.map((u) => u.id);
  const userIdSet = new Set(userIds);

  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { orgId, targetType: 'USER', targetId: { in: userIds }, courseId },
    select: { id: true, targetId: true, dueDate: true, isMandatory: true },
  });

  const userSeen = new Set<string>();
  const deduped = assignments.filter((a) => {
    if (!a.targetId || !userIdSet.has(a.targetId) || userSeen.has(a.targetId)) return false;
    userSeen.add(a.targetId);
    return true;
  });

  const progresses = await prisma.lmsProgress.findMany({
    where: { orgId, courseId, learnerId: { in: userIds } },
    select: { learnerId: true, completionPercentage: true, status: true },
  });
  const progressByLearner = new Map(progresses.map((p) => [p.learnerId, p]));

  const learners = deduped
    .map((a) => {
      const user = userMap.get(a.targetId);
      const progress = progressByLearner.get(a.targetId);
      const completionPercentage = progress?.completionPercentage || 0;
      const completed = completionPercentage >= 100 || progress?.status === 'Completed';
      return {
        assignmentId: a.id,
        userId: a.targetId,
        userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User',
        email: user?.email || '',
        role: user?.role || 'LEARNER',
        completionPercentage,
        status: completed ? 'completed' : completionPercentage > 0 || progress?.status === 'InProgress' ? 'in_progress' : 'not_started',
        dueDate: a.dueDate,
        isMandatory: !!a.isMandatory,
        lastLogin: user?.updatedAt || user?.createdAt,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) {
        const order: Record<string, number> = { not_started: 0, in_progress: 1, completed: 2 };
        return order[a.status] - order[b.status];
      }
      return a.userName.localeCompare(b.userName);
    });

  const info = (await buildCourseNameMap([courseId])).get(courseId);
  return {
    courseId,
    courseTitle: info?.title || 'Unknown Course',
    courseDescription: info?.description || '',
    totalLearners: learners.length,
    completed: learners.filter((l) => l.status === 'completed').length,
    inProgress: learners.filter((l) => l.status === 'in_progress').length,
    notStarted: learners.filter((l) => l.status === 'not_started').length,
    learners,
  };
}

// ═══════════════ SCHOOL OVERVIEW ═══════════════
export async function getSchoolOverview(orgId: string, dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })();
  const to = dateTo ? new Date(new Date(dateTo).getTime() + 86400000 - 1) : new Date();

  const [totalStudents, totalTeachers, totalBatches, activeBatches] = await Promise.all([
    prisma.lmsUser.count({ where: { orgId, role: 'LEARNER', isActive: true } }),
    prisma.lmsUser.count({ where: { orgId, role: 'TEACHER', isActive: true } }),
    prisma.lmsBatch.count({ where: { orgId } }),
    prisma.lmsBatch.count({ where: { orgId, status: 'active' } }),
  ]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const todaysClasses = await prisma.lmsScheduledClass.count({
    where: { orgId, startTime: { gte: today, lt: tomorrow }, status: { notIn: ['cancelled'] } },
  });

  const classesThisMonth = await prisma.lmsScheduledClass.count({
    where: { orgId, startTime: { gte: from, lte: to }, status: 'completed' },
  });

  const attendances = await prisma.lmsAttendance.findMany({
    where: { orgId, classDate: { gte: from, lte: to } },
    select: { status: true },
  });
  const attTotal = attendances.length;
  const attPresent = attendances.filter((a) => a.status === 'present' || a.status === 'late').length;
  const attendanceRate = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0;

  // Revenue from CreditPackage.price
  let revenueThisMonth = 0;
  let revenuePrevMonth = 0;
  try {
    const thisAgg = await prisma.lmsCreditPackage.aggregate({
      _sum: { price: true },
      where: { orgId, purchaseDate: { gte: from, lte: to }, price: { gt: 0 } },
    });
    revenueThisMonth = thisAgg._sum.price || 0;

    const prevFrom = new Date(from); prevFrom.setMonth(prevFrom.getMonth() - 1);
    const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
    const prevAgg = await prisma.lmsCreditPackage.aggregate({
      _sum: { price: true },
      where: { orgId, purchaseDate: { gte: prevFrom, lte: prevTo }, price: { gt: 0 } },
    });
    revenuePrevMonth = prevAgg._sum.price || 0;
  } catch { /* ignore */ }

  let pendingPayouts = 0;
  let totalPayoutAmount = 0;
  try {
    pendingPayouts = await prisma.lmsTeacherPayout.count({ where: { orgId, status: { in: ['draft', 'pending'] } } });
    const paidAgg = await prisma.lmsTeacherPayout.aggregate({
      _sum: { netAmount: true },
      where: { orgId, status: { in: ['approved', 'paid'] } },
    });
    totalPayoutAmount = paidAgg._sum.netAmount || 0;
  } catch { /* ignore */ }

  // Enrollment trend (learners by month, last 6 months)
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const learnerRows = await prisma.lmsUser.findMany({
    where: { orgId, role: 'LEARNER', createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true },
  });
  const trendMap = new Map<string, number>();
  for (const r of learnerRows) trendMap.set(monthKey(r.createdAt), (trendMap.get(monthKey(r.createdAt)) || 0) + 1);
  const enrollmentTrend = [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));

  // Enrollment by grade (active batches)
  const activeBatchRows = await prisma.lmsBatch.findMany({
    where: { orgId, status: 'active' },
    select: { grade: true, _count: { select: { students: true } } },
  });
  const gradeMap = new Map<string, number>();
  for (const b of activeBatchRows) {
    const grade = b.grade || 'Unknown';
    gradeMap.set(grade, (gradeMap.get(grade) || 0) + b._count.students);
  }
  const enrollmentByGrade = [...gradeMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([grade, count]) => ({ grade, count }));

  let avgHomeworkScore = 0;
  try {
    const hwAgg = await prisma.lmsHomeworkSubmission.aggregate({
      _avg: { score: true },
      where: { orgId, score: { not: null } },
    });
    avgHomeworkScore = Math.round(hwAgg._avg.score || 0);
  } catch { /* ignore */ }

  return {
    totalStudents,
    totalTeachers,
    totalBatches,
    activeBatches,
    todaysClasses,
    todayClasses: todaysClasses,
    classesThisMonth,
    attendanceRate,
    revenueThisMonth,
    creditRevenue: revenueThisMonth,
    revenuePrevMonth,
    revenueChange: revenuePrevMonth > 0 ? Math.round(((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100) : 0,
    pendingPayouts,
    totalPayoutAmount,
    avgHomeworkScore,
    enrollmentTrend,
    enrollmentByGrade,
  };
}

// ═══════════════ ATTENDANCE TREND ═══════════════
export async function getAttendanceTrend(orgId: string, days = 14) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const rows = await prisma.lmsAttendance.findMany({
    where: { orgId, classDate: { gte: startDate } },
    select: { classDate: true, status: true },
  });

  const byDay = new Map<string, { total: number; present: number; absent: number }>();
  for (const r of rows) {
    const key = dayKey(r.classDate);
    const cur = byDay.get(key) || { total: 0, present: 0, absent: 0 };
    cur.total += 1;
    if (r.status === 'present' || r.status === 'late') cur.present += 1;
    if (r.status === 'absent') cur.absent += 1;
    byDay.set(key, cur);
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      total: v.total,
      present: v.present,
      absent: v.absent,
      attendanceRate: v.total > 0 ? Math.round((v.present / v.total) * 1000) / 10 : 0,
    }));
}

// ═══════════════ TEACHER PERFORMANCE ═══════════════
export async function getTeacherPerformance(orgId: string, dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? new Date(dateFrom) : undefined;
  const to = dateTo ? new Date(dateTo) : undefined;

  const teachers = await prisma.lmsUser.findMany({
    where: { orgId, role: 'TEACHER', isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, classesMissed: true, punctualityScore: true },
  });

  const results: Array<Record<string, unknown>> = [];

  for (const teacher of teachers) {
    const startTimeFilter: { gte?: Date; lte?: Date } = {};
    if (from) startTimeFilter.gte = from;
    if (to) startTimeFilter.lte = to;
    const hasTime = from || to;
    const baseWhere = { orgId, teacherId: teacher.id, ...(hasTime ? { startTime: startTimeFilter } : {}) };

    const completedClasses = await prisma.lmsScheduledClass.count({ where: { ...baseWhere, status: 'completed' } });
    const totalClasses = await prisma.lmsScheduledClass.count({ where: { ...baseWhere, status: { notIn: ['cancelled', 'rescheduled'] } } });

    // On-time start rate — legacy computed this from ScheduledClass.actualStartTime,
    // a field that does not exist in the Postgres schema. With no data source we
    // return 0 (documented deviation), preserving the response shape.
    const onTimeRate = 0;

    // Attendance across the teacher's classes
    let attendanceRate = 0;
    try {
      const teacherClassIds = (await prisma.lmsScheduledClass.findMany({ where: { orgId, teacherId: teacher.id }, select: { id: true } })).map((c) => c.id);
      if (teacherClassIds.length) {
        const att = await prisma.lmsAttendance.findMany({ where: { scheduledClassId: { in: teacherClassIds } }, select: { status: true } });
        const total = att.length;
        const present = att.filter((a) => a.status === 'present' || a.status === 'late').length;
        attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
      }
    } catch { /* ignore */ }

    // Avg homework grading time (days)
    let avgGradingDays = 0;
    try {
      const graded = await prisma.lmsHomeworkSubmission.findMany({
        where: { gradedBy: teacher.id, gradedAt: { not: null } },
        select: { gradedAt: true, submittedAt: true },
      });
      if (graded.length) {
        const totalMs = graded.reduce((s, g) => s + (g.gradedAt!.getTime() - g.submittedAt.getTime()), 0);
        avgGradingDays = Math.round((totalMs / graded.length) / (1000 * 60 * 60 * 24) * 10) / 10;
      }
    } catch { /* ignore */ }

    results.push({
      teacherId: teacher.id,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      email: teacher.email,
      completedClasses,
      totalClasses,
      attendanceRate,
      onTimeRate,
      avgGradingDays,
      classesMissed: teacher.classesMissed || 0,
      punctualityScore: teacher.punctualityScore || 0,
    });
  }

  results.sort((a, b) => (b.completedClasses as number) - (a.completedClasses as number));
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}

// ═══════════════ TEACHER SELF-DASHBOARD ═══════════════
export async function getTeacherDashboard(orgId: string, teacherId: string) {
  const teacher = await prisma.lmsUser.findFirst({
    where: { id: teacherId, orgId },
    select: { firstName: true, lastName: true, email: true, classesMissed: true, punctualityScore: true },
  });
  if (!teacher) return null;

  const completedClasses = await prisma.lmsScheduledClass.count({ where: { orgId, teacherId, status: 'completed' } });
  const totalClasses = await prisma.lmsScheduledClass.count({ where: { orgId, teacherId, status: { notIn: ['cancelled', 'rescheduled'] } } });

  let attendanceRate = 0;
  {
    const teacherClassIds = (await prisma.lmsScheduledClass.findMany({ where: { orgId, teacherId }, select: { id: true } })).map((c) => c.id);
    if (teacherClassIds.length) {
      const att = await prisma.lmsAttendance.findMany({ where: { scheduledClassId: { in: teacherClassIds } }, select: { status: true } });
      const total = att.length;
      const present = att.filter((a) => a.status === 'present' || a.status === 'late').length;
      attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
    }
  }

  let homeworkCompletionRate = 0;
  try {
    const teacherHwIds = (await prisma.lmsHomework.findMany({ where: { orgId, teacherId }, select: { id: true } })).map((h) => h.id);
    if (teacherHwIds.length) {
      const totalSubs = await prisma.lmsHomeworkSubmission.count({ where: { orgId, homeworkId: { in: teacherHwIds } } });
      const gradedSubs = await prisma.lmsHomeworkSubmission.count({ where: { orgId, homeworkId: { in: teacherHwIds }, status: 'graded' } });
      homeworkCompletionRate = totalSubs > 0 ? Math.round((gradedSubs / totalSubs) * 100) : 0;
    }
  } catch { /* ignore */ }

  const classesMissed = teacher.classesMissed || 0;
  const punctualityScore = teacher.punctualityScore || 100;

  let teacherLevel: Awaited<ReturnType<typeof prisma.lmsTeacherLevel.findFirst>> & { levelHistory?: unknown[] } | null = null;
  try {
    teacherLevel = await prisma.lmsTeacherLevel.findFirst({
      where: { orgId, teacherId },
      include: { levelHistory: true },
    });
  } catch { /* ignore */ }

  const suggestions: string[] = [];
  if (attendanceRate < 80) suggestions.push('Student attendance in your classes is below 80%. Try making sessions more interactive to improve participation.');
  if (classesMissed > 3) suggestions.push('You have missed more than 3 classes this month. Consider adjusting your schedule to improve reliability.');
  if (homeworkCompletionRate < 60) suggestions.push('Your homework grading rate is low. Timely feedback helps students improve faster.');
  if (punctualityScore < 70) suggestions.push('Your punctuality score needs improvement. Joining classes on time builds student trust.');
  if (completedClasses < 5) suggestions.push('You have completed fewer than 5 classes this month. Take on more sessions to grow your teaching profile.');
  if (suggestions.length === 0) suggestions.push('You are performing well! Keep up the great work and continue engaging with your students.');

  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentClasses = await prisma.lmsScheduledClass.findMany({
    where: { orgId, teacherId, startTime: { gte: sevenDaysAgo } },
    select: { title: true, status: true, startTime: true, endTime: true },
    orderBy: { startTime: 'desc' },
    take: 5,
  });

  return {
    teacher: { firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email },
    level: teacherLevel
      ? {
          currentLevel: teacherLevel.currentLevel,
          overallScore: teacherLevel.overallScore,
          totalClassesTaught: teacherLevel.totalClassesTaught,
          attendanceScore: teacherLevel.attendanceScore,
          homeworkCompletionRate: teacherLevel.homeworkCompletionRate,
          parentFeedbackScore: teacherLevel.parentFeedbackScore,
          levelHistory: ((teacherLevel.levelHistory as unknown[]) || []).slice(-3),
        }
      : null,
    metrics: { completedClasses, totalClasses, attendanceRate, homeworkCompletionRate, classesMissed, punctualityScore },
    suggestions,
    recentClasses,
  };
}

// ═══════════════ STUDENT PROGRESS ═══════════════
export async function getStudentProgress(orgId: string, studentId: string) {
  const student = await prisma.lmsUser.findFirst({
    where: { id: studentId, orgId },
    select: { firstName: true, lastName: true, email: true, grade: true },
  });
  if (!student) return null;

  const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const attendanceRecords = await prisma.lmsAttendance.findMany({
    where: { orgId, studentId, classDate: { gte: threeMonthsAgo } },
    select: { classDate: true, status: true },
    orderBy: { classDate: 'asc' },
  });

  const totalAtt = attendanceRecords.length;
  const presentAtt = attendanceRecords.filter((a) => a.status === 'present' || a.status === 'late').length;
  const attendanceRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : 0;
  const attendanceCalendar = attendanceRecords.map((a) => ({ date: a.classDate, status: a.status }));

  let homeworkCompletion = 0;
  let avgScore = 0;
  let scoreTrend: Array<{ week: string; avgScore: number; count: number }> = [];
  try {
    const studentBatches = await prisma.lmsBatchStudent.findMany({ where: { studentId, batch: { orgId } }, select: { batchId: true } });
    const batchIds = studentBatches.map((b) => b.batchId);

    const totalHomework = batchIds.length
      ? await prisma.lmsHomework.count({ where: { batchId: { in: batchIds }, status: 'published' } })
      : 0;
    const submittedHomework = await prisma.lmsHomeworkSubmission.count({ where: { studentId } });
    homeworkCompletion = totalHomework > 0 ? Math.round((submittedHomework / totalHomework) * 100) : 0;

    const scoreAgg = await prisma.lmsHomeworkSubmission.aggregate({ _avg: { score: true }, where: { studentId, score: { not: null } } });
    avgScore = Math.round(scoreAgg._avg.score || 0);

    const trendRows = await prisma.lmsHomeworkSubmission.findMany({
      where: { studentId, score: { not: null }, submittedAt: { gte: threeMonthsAgo } },
      select: { score: true, submittedAt: true },
    });
    const trendMap = new Map<string, { sum: number; count: number }>();
    for (const r of trendRows) {
      const key = weekKey(r.submittedAt);
      const cur = trendMap.get(key) || { sum: 0, count: 0 };
      cur.sum += r.score || 0;
      cur.count += 1;
      trendMap.set(key, cur);
    }
    scoreTrend = [...trendMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, v]) => ({ week, avgScore: Math.round(v.sum / v.count), count: v.count }));
  } catch { /* ignore */ }

  // Class average comparison
  let classAvgScore = 0;
  try {
    const studentBatches = await prisma.lmsBatchStudent.findMany({ where: { studentId, batch: { orgId } }, select: { batchId: true } });
    const batchIds = studentBatches.map((b) => b.batchId);
    if (batchIds.length) {
      const classmates = await prisma.lmsBatchStudent.findMany({ where: { batchId: { in: batchIds } }, select: { studentId: true } });
      const allStudentIds = [...new Set(classmates.map((c) => c.studentId))];
      const classAgg = await prisma.lmsHomeworkSubmission.aggregate({
        _avg: { score: true },
        where: { studentId: { in: allStudentIds }, score: { not: null } },
      });
      classAvgScore = Math.round(classAgg._avg.score || 0);
    }
  } catch { /* ignore */ }

  // creditBalance — legacy read a 'CreditBalance' collection that has no Prisma model; default 0.
  const creditBalance = 0;

  return {
    student: { _id: studentId, firstName: student.firstName, lastName: student.lastName, email: student.email },
    attendanceRate,
    attendanceCalendar,
    homeworkCompletion,
    avgScore,
    classAvgScore,
    scoreTrend,
    creditBalance,
    comparedToClassAvg: avgScore > classAvgScore ? 'above' : avgScore < classAvgScore ? 'below' : 'average',
  };
}

// ═══════════════ BATCH ANALYTICS ═══════════════
export async function getBatchAnalytics(orgId: string, batchId: string) {
  const batch = await prisma.lmsBatch.findFirst({
    where: { id: batchId, orgId },
    select: { name: true, grade: true, subject: true, teacherId: true, maxCapacity: true, students: { select: { studentId: true } } },
  });
  if (!batch) return null;

  const teacher = batch.teacherId
    ? await prisma.lmsUser.findUnique({ where: { id: batch.teacherId }, select: { id: true, firstName: true, lastName: true } })
    : null;

  const studentIds = batch.students.map((s) => s.studentId);
  const enrolledCount = studentIds.length;
  const maxCapacity = batch.maxCapacity || 0;

  // Class status counts
  const classes = await prisma.lmsScheduledClass.findMany({ where: { batchId }, select: { status: true } });
  const classCounts: Record<string, number> = {};
  for (const c of classes) classCounts[c.status] = (classCounts[c.status] || 0) + 1;
  const totalScheduled = classes.length;
  const completedCount = classCounts['completed'] || 0;

  // Attendance rate for this batch (via class join)
  const batchClassIds = (await prisma.lmsScheduledClass.findMany({ where: { batchId }, select: { id: true } })).map((c) => c.id);
  let batchAttendanceRate = 0;
  if (batchClassIds.length) {
    const att = await prisma.lmsAttendance.findMany({ where: { scheduledClassId: { in: batchClassIds } }, select: { status: true } });
    const total = att.length;
    const present = att.filter((a) => a.status === 'present' || a.status === 'late').length;
    batchAttendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
  }

  // Top performers (homework avg score)
  let topPerformers: Array<{ _id: string; avgScore: number; count: number; name: string }> = [];
  try {
    if (studentIds.length) {
      const subs = await prisma.lmsHomeworkSubmission.findMany({
        where: { studentId: { in: studentIds }, score: { not: null } },
        select: { studentId: true, score: true },
      });
      const byStudent = new Map<string, { sum: number; count: number }>();
      for (const s of subs) {
        const cur = byStudent.get(s.studentId) || { sum: 0, count: 0 };
        cur.sum += s.score || 0;
        cur.count += 1;
        byStudent.set(s.studentId, cur);
      }
      const ranked = [...byStudent.entries()]
        .map(([sid, v]) => ({ studentId: sid, avgScore: Math.round((v.sum / v.count) * 10) / 10, count: v.count }))
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 10);
      const users = await prisma.lmsUser.findMany({ where: { id: { in: ranked.map((r) => r.studentId) } }, select: { id: true, firstName: true, lastName: true } });
      const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
      topPerformers = ranked.map((r) => ({ _id: r.studentId, avgScore: r.avgScore, count: r.count, name: userMap.get(r.studentId) || '' }));
    }
  } catch { /* ignore */ }

  // At-risk students (attendance < 70%)
  const atRiskStudents: Array<{ studentId: string; name: string; attendanceRate: number; reason: string }> = [];
  try {
    for (const sid of studentIds) {
      const studentAtt = await prisma.lmsAttendance.count({ where: { orgId, studentId: sid } });
      const studentPresent = await prisma.lmsAttendance.count({ where: { orgId, studentId: sid, status: { in: ['present', 'late'] } } });
      const rate = studentAtt > 0 ? Math.round((studentPresent / studentAtt) * 100) : 100;
      if (rate < 70 && studentAtt > 0) {
        const user = await prisma.lmsUser.findUnique({ where: { id: sid }, select: { firstName: true, lastName: true } });
        atRiskStudents.push({
          studentId: sid,
          name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          attendanceRate: rate,
          reason: 'Low attendance',
        });
      }
    }
  } catch { /* ignore */ }

  // Homework completion rate
  let homeworkCompletion = 0;
  try {
    const totalHw = await prisma.lmsHomework.count({ where: { batchId, status: 'published' } });
    const totalPossible = totalHw * enrolledCount;
    const hwIds = (await prisma.lmsHomework.findMany({ where: { batchId }, select: { id: true } })).map((h) => h.id);
    const totalSubmitted = hwIds.length ? await prisma.lmsHomeworkSubmission.count({ where: { homeworkId: { in: hwIds } } }) : 0;
    homeworkCompletion = totalPossible > 0 ? Math.round((totalSubmitted / totalPossible) * 100) : 0;
  } catch { /* ignore */ }

  return {
    batch: { _id: batchId, name: batch.name, grade: batch.grade, subject: batch.subject, teacher: teacher ? { _id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName } : batch.teacherId },
    enrollment: { current: enrolledCount, max: maxCapacity, fillRate: maxCapacity > 0 ? Math.round((enrolledCount / maxCapacity) * 100) : 0 },
    classes: { total: totalScheduled, completed: completedCount, cancelled: classCounts['cancelled'] || 0, utilization: totalScheduled > 0 ? Math.round((completedCount / totalScheduled) * 100) : 0 },
    attendanceRate: batchAttendanceRate,
    homeworkCompletion,
    topPerformers,
    atRiskStudents,
  };
}

// ═══════════════ FINANCIAL ANALYTICS ═══════════════
export async function getFinancialAnalytics(orgId: string, dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d; })();
  const to = dateTo ? new Date(new Date(dateTo).getTime() + 86400000 - 1) : new Date();

  let revenueByMonth: Array<{ month: string; revenue: number; count: number }> = [];
  let revenueByPackage: Array<{ package: string; revenue: number; count: number }> = [];
  let totalRevenue = 0;
  try {
    const pkgs = await prisma.lmsCreditPackage.findMany({
      where: { orgId, purchaseDate: { gte: from, lte: to }, price: { gt: 0 } },
      select: { price: true, purchaseDate: true, packageName: true },
    });

    const byMonth = new Map<string, { total: number; count: number }>();
    const byPackage = new Map<string, { total: number; count: number }>();
    for (const p of pkgs) {
      const price = p.price || 0;
      totalRevenue += price;
      const mk = monthKey(p.purchaseDate);
      const cm = byMonth.get(mk) || { total: 0, count: 0 };
      cm.total += price; cm.count += 1; byMonth.set(mk, cm);
      const pname = p.packageName || 'Direct Purchase';
      const cp = byPackage.get(pname) || { total: 0, count: 0 };
      cp.total += price; cp.count += 1; byPackage.set(pname, cp);
    }
    revenueByMonth = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, revenue: v.total, count: v.count }));
    revenueByPackage = [...byPackage.entries()].sort((a, b) => b[1].total - a[1].total).map(([pkg, v]) => ({ package: pkg, revenue: v.total, count: v.count }));
  } catch { /* ignore */ }

  let payoutsByMonth: Array<{ month: string; amount: number; count: number }> = [];
  let totalPayouts = 0;
  let pendingPayoutCount = 0;
  let pendingPayoutAmount = 0;
  try {
    const payouts = await prisma.lmsTeacherPayout.findMany({
      where: { orgId, status: { in: ['approved', 'paid'] }, createdAt: { gte: from, lte: to } },
      select: { netAmount: true, createdAt: true },
    });
    const byMonth = new Map<string, { total: number; count: number }>();
    for (const p of payouts) {
      totalPayouts += p.netAmount;
      const mk = monthKey(p.createdAt);
      const cur = byMonth.get(mk) || { total: 0, count: 0 };
      cur.total += p.netAmount; cur.count += 1; byMonth.set(mk, cur);
    }
    payoutsByMonth = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, amount: v.total, count: v.count }));

    pendingPayoutCount = await prisma.lmsTeacherPayout.count({ where: { orgId, status: { in: ['draft', 'pending'] } } });
    const pendingAgg = await prisma.lmsTeacherPayout.aggregate({ _sum: { netAmount: true }, where: { orgId, status: { in: ['draft', 'pending'] } } });
    pendingPayoutAmount = pendingAgg._sum.netAmount || 0;
  } catch { /* ignore */ }

  // totalUnusedCredits — legacy 'CreditBalance' collection has no Prisma model; default 0.
  const totalUnusedCredits = 0;
  const expiringCredits = 0;

  const totalStudents = await prisma.lmsUser.count({ where: { orgId, role: 'LEARNER', isActive: true } });
  const avgRevenuePerStudent = totalStudents > 0 ? Math.round(totalRevenue / totalStudents) : 0;

  const netProfit = totalRevenue - totalPayouts;
  const marginBase = Math.max(totalRevenue, totalPayouts);
  const profitMargin = marginBase > 0 ? Math.round((netProfit / marginBase) * 100) : 0;

  return {
    totalRevenue,
    totalPayouts,
    netProfit,
    profitMargin,
    avgRevenuePerStudent,
    totalUnusedCredits,
    expiringCredits,
    pendingPayoutCount,
    pendingPayoutAmount,
    revenueByMonth,
    revenueByPackage,
    payoutsByMonth,
  };
}

// ═══════════════ ARR / CASH FLOW REPORT ═══════════════
export async function getArrReport(orgId: string) {
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const yearStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Income: credit package purchases
  const creditRevenueByMonth: Record<string, number> = {};
  let totalCreditRevenue = 0;
  try {
    const pkgs = await prisma.lmsCreditPackage.findMany({
      where: { orgId, purchaseDate: { gte: yearStart }, price: { gt: 0 } },
      select: { price: true, purchaseDate: true },
    });
    for (const p of pkgs) {
      const mk = monthKey(p.purchaseDate);
      creditRevenueByMonth[mk] = (creditRevenueByMonth[mk] || 0) + (p.price || 0);
    }
    totalCreditRevenue = Object.values(creditRevenueByMonth).reduce((a, b) => a + b, 0);
  } catch { /* ignore */ }

  // Expenses: teacher payouts
  const payoutsByMonth: Record<string, number> = {};
  let totalPayouts = 0;
  try {
    const payouts = await prisma.lmsTeacherPayout.findMany({
      where: { orgId, status: { in: ['approved', 'paid'] }, createdAt: { gte: yearStart } },
      select: { netAmount: true, createdAt: true },
    });
    for (const p of payouts) {
      const mk = monthKey(p.createdAt);
      payoutsByMonth[mk] = (payoutsByMonth[mk] || 0) + p.netAmount;
    }
    totalPayouts = Object.values(payoutsByMonth).reduce((a, b) => a + b, 0);
  } catch { /* ignore */ }

  // Expenses: non-teaching task payments
  const nonTeachingByMonth: Record<string, number> = {};
  let totalNonTeachingExpense = 0;
  try {
    const tasks = await prisma.lmsNonTeachingTask.findMany({
      where: { orgId, status: 'approved', approvedAt: { gte: yearStart } },
      select: { paymentAmount: true, approvedAt: true },
    });
    for (const t of tasks) {
      if (!t.approvedAt) continue;
      const mk = monthKey(t.approvedAt);
      nonTeachingByMonth[mk] = (nonTeachingByMonth[mk] || 0) + t.paymentAmount;
    }
    totalNonTeachingExpense = Object.values(nonTeachingByMonth).reduce((a, b) => a + b, 0);
  } catch { /* ignore */ }

  const monthlyTrend = months.map((m) => ({
    month: m,
    creditRevenue: creditRevenueByMonth[m] || 0,
    teacherPayouts: payoutsByMonth[m] || 0,
    nonTeachingExpense: nonTeachingByMonth[m] || 0,
    netCashFlow: (creditRevenueByMonth[m] || 0) - (payoutsByMonth[m] || 0) - (nonTeachingByMonth[m] || 0),
  }));

  const totalExpenses = totalPayouts + totalNonTeachingExpense;
  const totalNetProfit = totalCreditRevenue - totalExpenses;

  const lastThreeMonths = monthlyTrend.slice(-4, -1);
  const mrrBase = lastThreeMonths.length > 0
    ? lastThreeMonths.reduce((sum, m) => sum + m.creditRevenue, 0) / lastThreeMonths.length
    : totalCreditRevenue / 12;
  const arr = Math.round(mrrBase * 12);

  return {
    arr,
    mrrBase: Math.round(mrrBase),
    totalCreditRevenue,
    totalPayouts,
    totalNonTeachingExpense,
    totalExpenses,
    totalNetProfit,
    profitMargin: totalExpenses > 0 || totalCreditRevenue > 0
      ? Math.round((totalNetProfit / Math.max(totalCreditRevenue, totalExpenses)) * 100)
      : 0,
    monthlyTrend,
  };
}

// ═══════════════ ENGAGEMENT ANALYTICS ═══════════════
export async function getEngagementAnalytics(orgId: string, days = 30) {
  const startDate = new Date(); startDate.setDate(startDate.getDate() - days);

  const activeStudentRows = await prisma.lmsAttendance.findMany({
    where: { orgId, classDate: { gte: startDate } },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const activeStudents = activeStudentRows.length;

  const activeTeacherRows = await prisma.lmsScheduledClass.findMany({
    // legacy 'started' status maps to the Postgres ClassStatus enum 'in_progress'
    where: { orgId, startTime: { gte: startDate }, status: { in: ['completed', 'in_progress'] } },
    select: { teacherId: true },
    distinct: ['teacherId'],
  });
  const activeTeachers = activeTeacherRows.length;

  const events = await prisma.lmsAnalyticsEvent.findMany({
    where: { orgId, createdAt: { gte: startDate } },
    select: { eventType: true, userId: true, createdAt: true },
  });
  const byType = new Map<string, number>();
  const dauMap = new Map<string, Set<string>>();
  for (const e of events) {
    byType.set(e.eventType, (byType.get(e.eventType) || 0) + 1);
    if (e.userId) {
      const key = dayKey(e.createdAt);
      if (!dauMap.has(key)) dauMap.set(key, new Set());
      dauMap.get(key)!.add(e.userId);
    }
  }
  const eventsByType = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([eventType, count]) => ({ eventType, count }));
  const dailyActiveUsers = [...dauMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, set]) => ({ date, count: set.size }));

  let homeworkSubmissionTrend: Array<{ date: string; count: number }> = [];
  try {
    const subs = await prisma.lmsHomeworkSubmission.findMany({
      where: { orgId, submittedAt: { gte: startDate } },
      select: { submittedAt: true },
    });
    const byDay = new Map<string, number>();
    for (const s of subs) byDay.set(dayKey(s.submittedAt), (byDay.get(dayKey(s.submittedAt)) || 0) + 1);
    homeworkSubmissionTrend = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  } catch { /* ignore */ }

  return { activeStudents, activeTeachers, eventsByType, dailyActiveUsers, homeworkSubmissionTrend };
}

// ═══════════════ BATCH UTILIZATION ═══════════════
export async function getBatchUtilization(orgId: string) {
  const batches = await prisma.lmsBatch.findMany({
    where: { orgId, status: 'active' },
    select: {
      id: true, name: true, grade: true, subject: true, teacherId: true, maxCapacity: true,
      _count: { select: { students: true, schedule: true } },
    },
  });

  const teacherIds = [...new Set(batches.map((b) => b.teacherId).filter(Boolean))];
  const teachers = teacherIds.length
    ? await prisma.lmsUser.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const teacherMap = new Map(teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`]));

  return batches.map((batch) => {
    const enrolled = batch._count.students;
    const maxCapacity = batch.maxCapacity || 0;
    return {
      batchId: batch.id,
      name: batch.name,
      grade: batch.grade,
      subject: batch.subject,
      teacher: batch.teacherId ? teacherMap.get(batch.teacherId) || 'Unassigned' : 'Unassigned',
      enrolledStudents: enrolled,
      maxCapacity,
      fillRate: maxCapacity > 0 ? Math.round((enrolled / maxCapacity) * 100) : 0,
      scheduleSlots: batch._count.schedule,
    };
  });
}

// ═══════════════ PERIOD COMPARISON ═══════════════
export async function getPeriodComparison(orgId: string, dateFrom: string, dateTo: string, _metric?: string) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const periodMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - periodMs);
  const prevTo = new Date(from);

  const [current, previous] = await Promise.all([
    getSchoolOverview(orgId, dateFrom, dateTo),
    getSchoolOverview(orgId, prevFrom.toISOString().split('T')[0], prevTo.toISOString().split('T')[0]),
  ]);

  const calcChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  return {
    currentPeriod: { from: dateFrom, to: dateTo },
    previousPeriod: { from: prevFrom.toISOString().split('T')[0], to: prevTo.toISOString().split('T')[0] },
    comparison: {
      students: { current: current.totalStudents || 0, previous: previous.totalStudents || 0, change: calcChange(current.totalStudents || 0, previous.totalStudents || 0) },
      teachers: { current: current.totalTeachers || 0, previous: previous.totalTeachers || 0, change: calcChange(current.totalTeachers || 0, previous.totalTeachers || 0) },
      classes: { current: current.classesThisMonth || 0, previous: previous.classesThisMonth || 0, change: calcChange(current.classesThisMonth || 0, previous.classesThisMonth || 0) },
      attendance: { current: current.attendanceRate || 0, previous: previous.attendanceRate || 0, change: calcChange(current.attendanceRate || 0, previous.attendanceRate || 0) },
      revenue: { current: current.revenueThisMonth || 0, previous: previous.revenueThisMonth || 0, change: calcChange(current.revenueThisMonth || 0, previous.revenueThisMonth || 0) },
    },
  };
}

// ═══════════════ COURSE ANALYTICS ═══════════════
export async function getCourseAnalytics(orgId: string, courseId: string) {
  const info = (await buildCourseNameMap([courseId])).get(courseId);

  const users = await prisma.lmsUser.findMany({
    where: { orgId, role: { in: ['LEARNER', 'MANAGER'] }, isActive: true },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { orgId, targetType: 'USER', targetId: { in: userIds }, courseId },
    select: { targetId: true },
  });
  const assignedUserIds = [...new Set(assignments.map((a) => a.targetId).filter(Boolean))];
  const totalEnrolled = assignedUserIds.length;

  const progresses = await prisma.lmsProgress.findMany({
    where: { orgId, courseId, learnerId: { in: userIds } },
    select: { learnerId: true, completionPercentage: true, status: true, scorePercentage: true, quizScore: true },
  });
  const progressByUser = new Map(progresses.map((p) => [p.learnerId, p]));

  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let totalCompletion = 0;
  const quizScores: number[] = [];
  const dist = { '0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };

  for (const uid of assignedUserIds) {
    const progress = progressByUser.get(uid);
    const pct = progress?.completionPercentage || 0;
    totalCompletion += pct;

    if (pct >= 100 || progress?.status === 'Completed') completed++;
    else if (pct > 0 || progress?.status === 'InProgress') inProgress++;
    else notStarted++;

    if (pct <= 25) dist['0-25']++;
    else if (pct <= 50) dist['26-50']++;
    else if (pct <= 75) dist['51-75']++;
    else dist['76-100']++;

    const score = progress?.scorePercentage ?? progress?.quizScore;
    if (typeof score === 'number') quizScores.push(score);
  }

  const avgCompletion = totalEnrolled > 0 ? Math.round(totalCompletion / totalEnrolled) : 0;
  const avgQuizScore = quizScores.length > 0 ? Math.round(quizScores.reduce((s, v) => s + v, 0) / quizScores.length) : null;
  const highestQuizScore = quizScores.length > 0 ? Math.round(Math.max(...quizScores)) : null;
  const lowestQuizScore = quizScores.length > 0 ? Math.round(Math.min(...quizScores)) : null;

  const certificatesIssued = await prisma.lmsCertificateIssued.count({ where: { orgId, courseId } });

  return {
    courseId,
    courseTitle: info?.title || 'Unknown Course',
    courseDescription: info?.description || '',
    totalEnrolled,
    completed,
    inProgress,
    notStarted,
    averageCompletionPercentage: avgCompletion,
    certificatesIssued,
    quizPerformance: quizScores.length > 0
      ? { averageScore: avgQuizScore, highestScore: highestQuizScore, lowestScore: lowestQuizScore, participantCount: quizScores.length }
      : null,
    progressDistribution: [
      { range: '0–25%', count: dist['0-25'] },
      { range: '26–50%', count: dist['26-50'] },
      { range: '51–75%', count: dist['51-75'] },
      { range: '76–100%', count: dist['76-100'] },
    ],
  };
}

// ═══════════════ EXPORT DATA ═══════════════
export async function exportData(orgId: string, type: string, dateFrom?: string, dateTo?: string) {
  let data: unknown;
  switch (type) {
    case 'school-overview': data = await getSchoolOverview(orgId, dateFrom, dateTo); break;
    case 'teacher-performance': data = await getTeacherPerformance(orgId, dateFrom, dateTo); break;
    case 'financial': data = await getFinancialAnalytics(orgId, dateFrom, dateTo); break;
    case 'batch-utilization': data = await getBatchUtilization(orgId); break;
    default: data = await getSchoolOverview(orgId, dateFrom, dateTo);
  }
  return { type, dateFrom, dateTo, exportedAt: new Date().toISOString(), data };
}

// CSV conversion (ported from the controller helper)
export function convertToCSV(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0] as Record<string, unknown>);
    const rows = (data as Array<Record<string, unknown>>).map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }

  if (typeof data === 'object' && data !== null) {
    const flat: Record<string, unknown> = {};
    const flatten = (obj: Record<string, unknown>, prefix = '') => {
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
          flatten(v as Record<string, unknown>, `${prefix}${k}.`);
        } else if (Array.isArray(v)) {
          flat[`${prefix}${k}`] = `[${v.length} items]`;
        } else {
          flat[`${prefix}${k}`] = v;
        }
      }
    };
    flatten(data as Record<string, unknown>);
    return ['Metric,Value', ...Object.entries(flat).map(([k, v]) => `${k},${v ?? ''}`)].join('\n');
  }

  return String(data);
}
