/**
 * Compliance service — ported from ComplianceService (Prisma).
 * Compliance is COMPUTED (no own table) — aggregated from User + CourseAssignment
 * + Progress. The legacy auto-repair of progress records runs before every
 * aggregation (see `autoRepairProgress` below). Nudge email sending is stubbed to
 * a count (no email side effect), matching the legacy TODO.
 */
import { Prisma } from '@prisma/client';
import type { LmsProgress, LmsProgressStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { notifyUsers } from '@/lib/services/notify-service';

type AnyRec = Record<string, unknown>;

/** A lesson counts as done at `isCompleted` or >= 95% — the legacy threshold. */
function isLessonDone(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as AnyRec;
  return e.isCompleted === true || (Number(e.completionPercentage) || 0) >= 95;
}

/**
 * Every lesson id embedded in a MasterCourse's modules → subModules →
 * resources/quizzes. 1:1 port of
 * `ComplianceService.extractLessonIdsFromMasterCourse`.
 */
function extractLessonIds(modules: AnyRec[]): string[] {
  const lessonIds: string[] = [];
  for (const mod of modules) {
    for (const sub of (mod.subModules as AnyRec[]) || []) {
      const resources = (sub.resources as AnyRec[]) || [];
      if (resources.length > 0) {
        for (const resource of resources) lessonIds.push(String(resource.id ?? sub.id));
      } else if (sub.resourceType || sub.title) {
        lessonIds.push(String(sub.id));
      }
      const quiz = sub.quiz as AnyRec | undefined;
      if (quiz && ((quiz.questions as unknown[]) || []).length > 0) lessonIds.push(String(quiz.id));
    }
    const endQuiz = mod.moduleEndQuiz as AnyRec | undefined;
    if (endQuiz && ((endQuiz.questions as unknown[]) || []).length > 0) lessonIds.push(String(endQuiz.id));
  }
  return lessonIds;
}

/** Quiz lesson ids only — decides whether a gap is "nothing but the quizzes". */
function extractQuizIds(modules: AnyRec[]): Set<string> {
  const quizIds = new Set<string>();
  for (const mod of modules) {
    for (const sub of (mod.subModules as AnyRec[]) || []) {
      const quiz = sub.quiz as AnyRec | undefined;
      if (quiz && ((quiz.questions as unknown[]) || []).length > 0) quizIds.add(String(quiz.id));
    }
    const endQuiz = mod.moduleEndQuiz as AnyRec | undefined;
    if (endQuiz && ((endQuiz.questions as unknown[]) || []).length > 0) quizIds.add(String(endQuiz.id));
  }
  return quizIds;
}

/**
 * Rows corrected per analytics request. A full repair sweep is a maintenance
 * job, not something a dashboard load should turn into thousands of writes;
 * whatever is past the cap is picked up by the next request.
 */
const REPAIR_WRITE_LIMIT = 500;

/**
 * Recompute completion % / status from the MasterCourse structure, backfill
 * missing quiz lesson entries, and PERSIST the corrections — port of
 * `ComplianceService.autoRepairProgress` (`compliance.service.ts:55-122`), which
 * ran before every aggregation. This build had dropped it as "read-only
 * analytics", which let stale progress rows under-report completion rates and
 * top-performer counts.
 *
 * Deliberate differences from the Mongoose original:
 *  - the owning master courses are fetched in ONE query instead of a `findById`
 *    per progress row;
 *  - each row is repaired inside its own try/catch, so one malformed
 *    `lessonProgress` document cannot fail the whole analytics request (the
 *    legacy comment: "Silently continue — don't break analytics for repair
 *    errors");
 *  - a write only happens when a stored value actually changes, and the number
 *    of writes per request is capped;
 *  - `Overdue` / `Failed` are preserved. The legacy status ladder only knew
 *    Completed / In Progress / Not Started, so it rewrote such a row down to
 *    `Not Started`; nothing else recomputes those two states, so clobbering them
 *    would lose tenant-visible compliance state. They are still promoted to
 *    `Completed` at 100%.
 *
 * `rows` is mutated in place so the aggregation reads the repaired values.
 * Progress pointing at a plain `LmsCourse` rather than an `LmsMasterCourse` is
 * skipped, exactly as the legacy `masterCourseModel.findById` lookup did.
 */
async function autoRepairProgress(rows: LmsProgress[]): Promise<void> {
  const courseIds = [...new Set(rows.map((r) => r.courseId).filter(Boolean))];
  if (courseIds.length === 0) return;

  let masters: { id: string; modules: Prisma.JsonValue }[];
  try {
    masters = await db.lmsMasterCourse.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, modules: true },
    });
  } catch {
    return; // no structure to repair against — analytics still runs
  }
  const moduleMap = new Map(masters.map((m) => [m.id, (m.modules as unknown as AnyRec[]) || []]));

  let writes = 0;
  for (const progress of rows) {
    if (writes >= REPAIR_WRITE_LIMIT) break;
    try {
      const modules = moduleMap.get(progress.courseId);
      if (!modules || modules.length === 0) continue;

      const allLessonIds = extractLessonIds(modules);
      if (allLessonIds.length === 0) continue;

      const lp: AnyRec = { ...((progress.lessonProgress as AnyRec | null) || {}) };
      const missing = allLessonIds.filter((id) => !lp[id]);
      let backfilled = false;

      // Backfill only when the gap is explainable: every lesson the learner DID
      // touch is finished and the holes are all quizzes, or the row is already
      // flagged complete.
      if (missing.length > 0) {
        const quizIds = extractQuizIds(modules);
        const present = allLessonIds.filter((id) => !!lp[id]);
        const allDone = present.length > 0 && present.every((id) => isLessonDone(lp[id]));
        const allMissingAreQuizzes = missing.every((id) => quizIds.has(id));
        if ((allDone && allMissingAreQuizzes) || progress.completedAt) {
          for (const lid of missing) {
            lp[lid] = { lessonId: lid, completionPercentage: 100, isCompleted: true, lastAccessedAt: new Date() };
          }
          backfilled = true;
        }
      }

      const done = allLessonIds.filter((id) => isLessonDone(lp[id])).length;
      const correctPct = Math.round((done / allLessonIds.length) * 100);

      let correctStatus: LmsProgressStatus;
      if (correctPct >= 100) correctStatus = 'Completed';
      else if (correctPct > 0) correctStatus = 'InProgress';
      else if (progress.status === 'InProgress') correctStatus = 'InProgress';
      else correctStatus = 'NotStarted';
      if (correctStatus !== 'Completed' && (progress.status === 'Overdue' || progress.status === 'Failed')) {
        correctStatus = progress.status;
      }

      const changed =
        progress.completionPercentage !== correctPct || progress.status !== correctStatus || backfilled;
      if (!changed) continue;

      const completedAt = correctStatus === 'Completed' ? progress.completedAt ?? new Date() : null;

      await db.lmsProgress.update({
        where: { id: progress.id },
        data: {
          completionPercentage: correctPct,
          status: correctStatus,
          completedAt,
          ...(backfilled ? { lessonProgress: lp as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      writes++;

      // Keep the in-memory row in step so the aggregation sees the repair.
      progress.completionPercentage = correctPct;
      progress.status = correctStatus;
      progress.completedAt = completedAt;
      if (backfilled) progress.lessonProgress = lp as unknown as Prisma.JsonValue;
    } catch {
      // One bad row must not fail the whole analytics request.
    }
  }
}

interface CompletionRates { completed: number; inProgress: number; notStarted: number }
interface TopPerformer { userId: string; userName: string; email: string; coursesCompleted: number; averageScore: number }
interface DifficultModule { courseId: string; courseTitle: string; averageScore: number; totalAttempts: number }

export async function getComplianceAnalytics(orgId: string): Promise<{
  completionRates: CompletionRates; topPerformers: TopPerformer[]; difficultModules: DifficultModule[];
}> {
  if (!orgId) return { completionRates: { completed: 0, inProgress: 0, notStarted: 0 }, topPerformers: [], difficultModules: [] };

  const users = await db.lmsUser.findMany({ where: { orgId, role: { in: ['LEARNER', 'TEACHER'] } } });
  const userIds = users.map((u) => u.id);

  const assignments = await db.lmsCourseAssignment.findMany({ where: { orgId, targetType: 'USER' } });
  const allProgress = await db.lmsProgress.findMany({
    where: { OR: [{ learnerId: { in: userIds } }, { orgId }] },
  });

  // Repair BEFORE aggregating, as the legacy did (`compliance.service.ts:170-173`).
  // Stale rows otherwise under-report completion rates and top-performer counts.
  await autoRepairProgress(allProgress);

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
  const masters = await db.lmsMasterCourse.findMany({ where: { id: { in: assignedCourseIds } }, select: { id: true, title: true } });
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

  const users = await db.lmsUser.findMany({ where: { orgId, role: { in: ['LEARNER', 'TEACHER'] } } });
  const assignments = await db.lmsCourseAssignment.findMany({ where: { orgId, targetType: 'USER', isMandatory: true } });
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const masters = await db.lmsMasterCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } });
  const titleMap = new Map(masters.map((m) => [m.id, m.title]));

  const nudgeUsers: NudgeUser[] = [];
  for (const user of users) {
    const userAssignments = assignments.filter((a) => a.targetId === user.id);
    const userProgress = await db.lmsProgress.findMany({ where: { learnerId: user.id } });

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
  const users = await db.lmsUser.findMany({
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
