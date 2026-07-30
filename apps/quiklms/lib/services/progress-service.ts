/**
 * Progress service — ported from ProgressService + PlayerService (Prisma).
 *
 * Tenant scoping is applied by callers (they pass orgId explicitly). The
 * route handlers also run requireAuth + tenantWhere/assertTenantMatch.
 *
 * NOTE: courseId may reference EITHER db.lmsCourse OR db.lmsMasterCourse
 * (scalar string, ambiguous target). Lesson-id extraction reads masterCourse
 * embedded `modules` Json first, then falls back to the legacy Module/Lesson
 * tables. Certificate generation delegates to certificates-service (PDF/QR
 * generation deferred — see notes there).
 */
import type { LmsProgressStatus as ProgressStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { generateCertificateForCompletion, getLearnerCertificates } from './certificates-service';

type LessonProgress = Record<string, Record<string, unknown>>;

function normalizeKey(key: unknown): string {
  return String(key ?? '').trim();
}

function isResourceCompleted(lessonProgress: LessonProgress, candidateIds: unknown[]): boolean {
  if (!lessonProgress) return false;
  const normalized = new Map<string, Record<string, unknown>>();
  for (const [k, v] of Object.entries(lessonProgress)) {
    const nk = normalizeKey(k);
    if (nk) normalized.set(nk, v as Record<string, unknown>);
  }
  for (const id of candidateIds) {
    const nid = normalizeKey(id);
    if (!nid) continue;
    const prog = normalized.get(nid);
    if (prog && (prog.isCompleted === true || ((prog.completionPercentage as number) || 0) >= 95)) return true;
  }
  return false;
}

/** One playable item in a MasterCourse, tagged so quizzes can be told apart. */
interface MasterLessonEntry {
  id: string;
  /** True for a sub-module quiz or a module-end quiz — a GATED item. */
  isQuiz: boolean;
}

/**
 * Walk a MasterCourse's embedded modules → subModules → resources/quizzes and
 * return every playable item WITH its kind.
 *
 * The kind tag exists so `getQuizLessonIds` can identify gated items using the
 * exact same walk (and therefore the exact same fallback-id numbering) that
 * `calculateOverallCourseProgress` counts with. Deriving the quiz set from a
 * second, parallel walk would drift the moment either one changed, and a quiz id
 * that the gate does not recognise is a quiz a learner can skip.
 */
function extractLessonEntriesFromMasterCourse(masterCourse: { modules?: unknown }): MasterLessonEntry[] {
  const lessonIds: MasterLessonEntry[] = [];
  const getId = (obj: Record<string, unknown> | undefined): string | undefined => {
    if (!obj) return undefined;
    if (typeof obj.id === 'string') return obj.id;
    if (obj._id) return String(obj._id);
    return undefined;
  };
  const usedIds = new Set<string>();
  const pushUnique = (proposedId: string, fallbackId: string, isQuiz = false) => {
    const normalized = normalizeKey(proposedId);
    if (normalized && !usedIds.has(normalized)) {
      usedIds.add(normalized);
      lessonIds.push({ id: normalized, isQuiz });
      return;
    }
    let candidate = fallbackId;
    let suffix = 1;
    while (usedIds.has(candidate)) candidate = `${fallbackId}_${suffix++}`;
    usedIds.add(candidate);
    lessonIds.push({ id: candidate, isQuiz });
  };

  const modules = (masterCourse.modules as Record<string, unknown>[]) || [];
  modules.forEach((mod, moduleIndex) => {
    let lessonIndex = 0;
    const subModules = (mod.subModules as Record<string, unknown>[]) || [];
    subModules.forEach((subMod) => {
      const resources = subMod.resources as Record<string, unknown>[] | undefined;
      if (resources && resources.length > 0) {
        for (const resource of resources) {
          const rid = getId(resource) || `lesson_${moduleIndex}_${lessonIndex}`;
          pushUnique(rid, `lesson_${moduleIndex}_${lessonIndex}`);
          lessonIndex++;
        }
      } else if (subMod.resourceType) {
        const rd = (subMod.resourceData as Record<string, unknown>) || {};
        const hasUrl = rd.videoUrl || rd.youtubeUrl || rd.url || rd.contentUrl || rd.fileUrl;
        const hasContent = rd.content || rd.htmlContent || rd.body;
        if (hasUrl || hasContent) {
          const sid = getId(subMod) || `lesson_${moduleIndex}_${lessonIndex}`;
          pushUnique(sid, `lesson_${moduleIndex}_${lessonIndex}`);
          lessonIndex++;
        }
      } else if (subMod.title && !subMod.quiz) {
        const textContent = subMod.learningObjective || subMod.description || '';
        if (textContent) {
          const sid = getId(subMod) || `lesson_${moduleIndex}_${lessonIndex}`;
          pushUnique(sid, `lesson_${moduleIndex}_${lessonIndex}`);
          lessonIndex++;
        }
      }
      const quiz = subMod.quiz as Record<string, unknown> | undefined;
      if (quiz && (quiz.questions as unknown[])?.length > 0) {
        const qid = getId(quiz) || `quiz_${moduleIndex}_${lessonIndex}`;
        pushUnique(qid, `quiz_${moduleIndex}_${lessonIndex}`, true);
        lessonIndex++;
      }
    });
    const moduleEndQuiz = mod.moduleEndQuiz as Record<string, unknown> | undefined;
    if (moduleEndQuiz && (moduleEndQuiz.questions as unknown[])?.length > 0) {
      const mqid = getId(moduleEndQuiz) || `module_quiz_${moduleIndex}`;
      pushUnique(mqid, `module_quiz_${moduleIndex}`, true);
    }
  });
  return lessonIds;
}

/** Ids only — the shape `calculateOverallCourseProgress` counts with. */
function extractLessonIdsFromMasterCourse(masterCourse: { modules?: unknown }): string[] {
  return extractLessonEntriesFromMasterCourse(masterCourse).map((e) => e.id);
}

/**
 * The lesson ids in this course that are QUIZZES — the items a learner must
 * actually sit rather than merely open.
 *
 * WHY THIS EXISTS. `updateProgress` / `syncProgress` accept a `lessonId` and a
 * completion figure from the client, and both are reachable from
 * `PATCH /api/player/sync`, `POST /api/progress` and
 * `POST /api/progress/:courseId/lesson/:lessonId/complete`. Nothing checked what
 * KIND of lesson was being completed, so a caller could post
 * `{ lessonId: <quiz id>, completionPercentage: 100, status: 'Completed' }` and
 * have the quiz counted as done. `calculateOverallCourseProgress` counts quiz
 * ids as lessons, so marking every item that way reached 100%, which in turn
 * fired `generateCertificateForCompletion` — a certificate with zero questions
 * answered. The learner UI did exactly this: the `/course-player` page could not
 * render a quiz at all and offered a plain "Mark Complete" button for it.
 *
 * Fixing the UI alone would not have closed it — the endpoints are public API
 * and a hand-rolled request bypasses any client. The gate belongs here.
 *
 * Resolves against BOTH course shapes, in the same order the rest of this
 * service uses: MasterCourse embedded JSON first, then the relational
 * Module/Lesson tables (`Module.assessmentId`, plus any lesson typed `Quiz`).
 */
async function getQuizLessonIds(courseId: string): Promise<Set<string>> {
  try {
    const masterCourse = await db.lmsMasterCourse.findUnique({
      where: { id: courseId },
      select: { modules: true },
    });
    if (masterCourse && (masterCourse.modules as unknown[])?.length) {
      return new Set(
        extractLessonEntriesFromMasterCourse(masterCourse as { modules: unknown })
          .filter((e) => e.isQuiz)
          .map((e) => e.id),
      );
    }

    const modules = await db.lmsModule.findMany({
      where: { courseId },
      select: { assessmentId: true, lessons: { select: { id: true, type: true } } },
    });
    const ids = new Set<string>();
    for (const mod of modules) {
      const assessmentId = normalizeKey(mod.assessmentId);
      if (assessmentId) ids.add(assessmentId);
      for (const lesson of mod.lessons) {
        if (lesson.type === 'Quiz') ids.add(normalizeKey(lesson.id));
      }
    }
    return ids;
  } catch (err) {
    // FAIL OPEN, but loudly. A DB fault here would otherwise block a legitimate
    // video completion — and the very next call (`calculateOverallCourseProgress`)
    // reads the same rows, so a real outage surfaces there regardless.
    // eslint-disable-next-line no-console
    console.error(`[progress] could not resolve quiz lessons for course ${courseId}:`, err);
    return new Set();
  }
}

/**
 * May this write mark `lessonId` complete?
 *
 * No, when the lesson is a quiz and the caller is not the grading path. The
 * ONLY writer allowed to complete a quiz is `submitQuiz` (reached via
 * `POST /api/learner/submit-quiz`), which sets `quizGraded`.
 *
 * Cheap by construction: it is consulted only when a write would actually mark
 * something complete, so ordinary position/heartbeat syncs cost no extra query.
 */
async function quizCompletionAllowed(
  courseId: string,
  lessonId: string,
  quizGraded: boolean | undefined,
): Promise<boolean> {
  if (quizGraded) return true;
  const quizIds = await getQuizLessonIds(courseId);
  return !quizIds.has(normalizeKey(lessonId));
}

interface OverallProgress {
  percentage: number;
  completedLessons: number;
  totalLessons: number;
  allAccessed: boolean;
}

async function calculateOverallCourseProgress(courseId: string, lessonProgress: LessonProgress): Promise<OverallProgress> {
  try {
    const resolveScore = (lid: string): number => {
      const normalized = new Map<string, Record<string, unknown>>();
      for (const [k, v] of Object.entries(lessonProgress || {})) {
        const nk = normalizeKey(k);
        if (nk) normalized.set(nk, v as Record<string, unknown>);
      }
      const prog = normalized.get(lid);
      if (!prog) return 0;
      if (prog.isCompleted === true) return (prog.completionPercentage as number) ?? 100;
      return (prog.completionPercentage as number) ?? 0;
    };

    // Strategy 1: MasterCourse embedded modules
    const masterCourse = await db.lmsMasterCourse.findUnique({ where: { id: courseId }, select: { modules: true } });
    if (masterCourse && (masterCourse.modules as unknown[])?.length) {
      const allLessonIds = extractLessonIdsFromMasterCourse(masterCourse as { modules: unknown });
      if (allLessonIds.length === 0) return { percentage: 0, completedLessons: 0, totalLessons: 0, allAccessed: true };
      const uniqueLessonIds = Array.from(new Set(allLessonIds.map((id) => normalizeKey(id)).filter(Boolean)));
      let completedLessons = 0;
      let scoreSum = 0;
      for (const lid of uniqueLessonIds) {
        scoreSum += resolveScore(lid);
        if (isResourceCompleted(lessonProgress, [lid])) completedLessons++;
      }
      const percentage = Math.round(scoreSum / uniqueLessonIds.length);
      return { percentage, completedLessons, totalLessons: uniqueLessonIds.length, allAccessed: completedLessons === uniqueLessonIds.length };
    }

    // Strategy 2: Legacy Module/Lesson tables
    const modules = await db.lmsModule.findMany({ where: { courseId }, include: { lessons: true } });
    if (modules.length > 0) {
      let totalLessons = 0;
      let completedLessons = 0;
      let scoreSum = 0;
      const counted = new Set<string>();
      for (const mod of modules) {
        for (const lesson of mod.lessons) {
          const lid = normalizeKey(lesson.id || lesson.title);
          if (counted.has(lid)) continue;
          totalLessons++;
          const aliases = [lid, lesson.title];
          if (isResourceCompleted(lessonProgress, aliases)) completedLessons++;
          scoreSum += resolveScore(lid);
          counted.add(lid);
        }
        const moduleAssessmentId = normalizeKey(mod.assessmentId);
        if (moduleAssessmentId && !counted.has(moduleAssessmentId)) {
          totalLessons++;
          if (isResourceCompleted(lessonProgress, [moduleAssessmentId])) completedLessons++;
          scoreSum += resolveScore(moduleAssessmentId);
          counted.add(moduleAssessmentId);
        }
      }
      if (totalLessons > 0) {
        const percentage = Math.round(scoreSum / totalLessons);
        return { percentage, completedLessons, totalLessons, allAccessed: completedLessons === totalLessons };
      }
    }

    // Fallback
    const entries = Object.values(lessonProgress || {});
    if (entries.length === 0) return { percentage: 0, completedLessons: 0, totalLessons: 0, allAccessed: false };
    const completed = entries.filter((lp) => lp.isCompleted || ((lp.completionPercentage as number) || 0) >= 95).length;
    return { percentage: -1, completedLessons: completed, totalLessons: 0, allAccessed: false };
  } catch {
    return { percentage: -1, completedLessons: 0, totalLessons: 0, allAccessed: false };
  }
}

function parseSCORMLocation(location: string | number | undefined): number {
  if (typeof location === 'number') return location;
  if (!location) return 0;
  const match = String(location).match(/^(slide|scroll|time):(\d+)$/);
  return match ? parseInt(match[2], 10) : parseInt(String(location), 10) || 0;
}

async function getUserCourseDueDate(orgId: string, learnerId: string, courseId: string): Promise<Date | undefined> {
  const assignment = await db.lmsCourseAssignment.findFirst({
    where: { orgId, targetType: 'USER', targetId: learnerId, courseId },
    select: { dueDate: true },
  });
  return assignment?.dueDate ? new Date(assignment.dueDate) : undefined;
}

function deriveLifecycleStatus(
  completionPercentage: number,
  dueDate: Date | undefined,
  requestedStatus?: ProgressStatus,
  currentStatus?: ProgressStatus,
): ProgressStatus {
  if (completionPercentage >= 100) return 'Completed';
  if (dueDate && new Date(dueDate).getTime() < Date.now()) return 'Overdue';
  if (
    completionPercentage > 0 ||
    requestedStatus === 'InProgress' ||
    requestedStatus === 'Overdue' ||
    currentStatus === 'InProgress' ||
    currentStatus === 'Overdue'
  ) {
    return 'InProgress';
  }
  return 'NotStarted';
}

function normalizeStatus(status: string | ProgressStatus | undefined): ProgressStatus | undefined {
  if (!status) return undefined;
  const s = String(status).toLowerCase().trim();
  switch (s) {
    case 'in_progress':
    case 'in-progress':
    case 'in progress':
      return 'InProgress';
    case 'completed':
      return 'Completed';
    case 'not_started':
    case 'not-started':
    case 'not started':
      return 'NotStarted';
    case 'failed':
      return 'Failed';
    default:
      return undefined;
  }
}

async function loadOrInit(orgId: string, learnerId: string, courseId: string) {
  const existing = await db.lmsProgress.findUnique({
    where: { orgId_learnerId_courseId: { orgId, learnerId, courseId } },
  });
  return existing;
}

export async function updateProgress(data: {
  orgId: string;
  learnerId: string;
  courseId: string;
  lessonId?: string;
  currentPosition?: string | number;
  duration?: number;
  percentRemaining?: number;
  status?: ProgressStatus;
  scormStatus?: string;
  /**
   * Set ONLY by the quiz-grading path. Without it a quiz lesson cannot be
   * marked complete here — see `getQuizLessonIds`.
   */
  quizGraded?: boolean;
}) {
  const { orgId, learnerId, courseId, lessonId, currentPosition, duration, percentRemaining, status, scormStatus } = data;
  const positionNumeric = parseSCORMLocation(currentPosition);

  let lessonCompletionPercentage = 0;
  if (duration && positionNumeric !== undefined) {
    lessonCompletionPercentage = Math.min(100, Math.max(0, (positionNumeric / duration) * 100));
  } else if (percentRemaining !== undefined) {
    lessonCompletionPercentage = Math.min(100, Math.max(0, 100 - percentRemaining));
  }
  if (scormStatus === 'completed' || scormStatus === 'passed') lessonCompletionPercentage = 100;

  const existing = await loadOrInit(orgId, learnerId, courseId);
  const wasCompleted = existing?.status === 'Completed';
  const lessonProgress: LessonProgress = (existing?.lessonProgress as LessonProgress) || {};
  let currentModuleId = existing?.currentModuleId ?? null;
  let scorePercentage = existing?.scorePercentage ?? null;
  let completionPercentage = existing?.completionPercentage ?? 0;
  let startedAt = existing?.startedAt ?? null;
  let completedAt = existing?.completedAt ?? null;

  if (lessonId) {
    // A quiz is completed by SITTING it, never by reporting a position. When
    // this write would complete one and it did not come from the grader, the
    // lesson entry is left exactly as it is — so an already-graded attempt is
    // preserved and an ungraded quiz is never invented.
    const wouldComplete = lessonCompletionPercentage >= 95;
    const blocked = wouldComplete && !(await quizCompletionAllowed(courseId, lessonId, data.quizGraded));

    if (!blocked) {
      lessonProgress[lessonId] = {
        ...(lessonProgress[lessonId] || {}),
        lessonId,
        completionPercentage: lessonCompletionPercentage,
        isCompleted: wouldComplete,
        currentPosition,
        lastAccessedAt: new Date().toISOString(),
      };
    }
    currentModuleId = lessonId;
  }

  const courseProgress = await calculateOverallCourseProgress(courseId, lessonProgress);
  if (courseProgress.percentage >= 0 && courseProgress.totalLessons > 0) {
    scorePercentage = courseProgress.percentage;
    completionPercentage = courseProgress.allAccessed ? 100 : courseProgress.percentage;
  } else if (!lessonId) {
    completionPercentage = Math.min(100, Math.max(0, lessonCompletionPercentage));
  }

  const dueDate = await getUserCourseDueDate(orgId, learnerId, courseId);
  const newStatus = deriveLifecycleStatus(completionPercentage, dueDate, status, existing?.status);
  if (!startedAt && (completionPercentage > 0 || newStatus === 'InProgress')) startedAt = new Date();
  if (newStatus === 'Completed' && !completedAt) completedAt = new Date();

  const saved = await db.lmsProgress.upsert({
    where: { orgId_learnerId_courseId: { orgId, learnerId, courseId } },
    create: {
      orgId, learnerId, courseId, currentModuleId, status: newStatus,
      completionPercentage, scorePercentage, startedAt: startedAt ?? new Date(), completedAt,
      lessonProgress: lessonProgress as object,
    },
    update: {
      currentModuleId, status: newStatus, completionPercentage, scorePercentage,
      startedAt: startedAt ?? undefined, completedAt, lessonProgress: lessonProgress as object,
    },
  });

  const isNewCompletion = saved.status === 'Completed' && !wasCompleted;
  if (isNewCompletion) {
    try { await generateCertificateForCompletion(orgId, learnerId, courseId); } catch { /* non-fatal */ }
  }
  return saved;
}

export async function syncProgress(data: {
  orgId: string;
  learnerId: string;
  courseId: string;
  moduleId?: string;
  lessonId?: string;
  completionPercentage?: number;
  currentPosition?: string | number;
  suspendData?: string;
  scormData?: Record<string, string>;
  status?: string | ProgressStatus;
  /**
   * Set ONLY by the quiz-grading path. Without it a quiz lesson cannot be
   * marked complete here — see `getQuizLessonIds`.
   */
  quizGraded?: boolean;
}) {
  const { orgId, learnerId, courseId, lessonId, completionPercentage, currentPosition, suspendData, scormData, status } = data;

  const existing = await loadOrInit(orgId, learnerId, courseId);
  const wasCompleted = existing?.status === 'Completed';
  const lessonProgress: LessonProgress = (existing?.lessonProgress as LessonProgress) || {};
  let scorePercentage = existing?.scorePercentage ?? null;
  let completionPercentageOut = existing?.completionPercentage ?? 0;
  let startedAt = existing?.startedAt ?? null;
  let completedAt = existing?.completedAt ?? null;

  if (lessonId && completionPercentage !== undefined) {
    const pct = completionPercentage;
    let isLessonCompleted = pct >= 95;
    if (!isLessonCompleted && status) {
      const ns = typeof status === 'string' ? status.toLowerCase() : '';
      isLessonCompleted = ns === 'completed' || ns === 'passed';
    }
    if (!isLessonCompleted && scormData) {
      const s12 = scormData['cmi.core.lesson_status'] || '';
      const s2004 = scormData['cmi.completion_status'] || '';
      const sSuccess = scormData['cmi.success_status'] || '';
      isLessonCompleted = ['completed', 'passed'].includes(s12) || ['completed', 'passed'].includes(s2004) || sSuccess === 'passed';
    }

    /**
     * Same gate as `updateProgress`: only the grader may complete a quiz. This
     * is the path `PATCH /api/player/sync` and
     * `POST /api/progress/:courseId/lesson/:lessonId/complete` both land on, and
     * it is where the "Mark Complete on a quiz" bypass lived.
     *
     * The whole lesson write is SKIPPED, not merely downgraded to
     * `isCompleted: false`. Downgrading is not enough: the `else` branch below
     * would still store `completionPercentage: 100`, and
     * `calculateOverallCourseProgress` averages the stored percentages — so the
     * course would reach 100% and issue a certificate anyway, just without the
     * lesson-level flag. Skipping leaves a real graded attempt untouched and
     * never invents one for an unsat quiz.
     */
    const quizBlocked =
      isLessonCompleted && !(await quizCompletionAllowed(courseId, lessonId, data.quizGraded));

    if (!quizBlocked) {
      const existingLesson = lessonProgress[lessonId];
      if (existingLesson?.isCompleted && !isLessonCompleted) {
        existingLesson.lastAccessedAt = new Date().toISOString();
        if (currentPosition) existingLesson.currentPosition = currentPosition;
      } else if (existingLesson?.quizScore || existingLesson?.attempted) {
        existingLesson.lastAccessedAt = new Date().toISOString();
        if (currentPosition) existingLesson.currentPosition = currentPosition;
      } else {
        const isQuizScore = isLessonCompleted && pct < 95;
        const finalPct = isQuizScore ? pct : isLessonCompleted ? Math.max(pct, 100) : pct;
        const entry: Record<string, unknown> = {
          lessonId, completionPercentage: finalPct, isCompleted: isLessonCompleted,
          currentPosition, suspendData, scormData, lastAccessedAt: new Date().toISOString(),
        };
        const score = scormData?.['cmi.core.score.raw'] || scormData?.['cmi.score.raw'];
        const maxScore = scormData?.['cmi.core.score.max'] || scormData?.['cmi.score.max'];
        const minScore = scormData?.['cmi.core.score.min'] || scormData?.['cmi.score.min'];
        if (score !== undefined) {
          entry.quizScore = {
            raw: parseFloat(score) || 0, max: parseFloat(maxScore || '') || 100,
            min: parseFloat(minScore || '') || 0, scaled: maxScore ? parseFloat(score) / parseFloat(maxScore) : 0,
          };
        }
        lessonProgress[lessonId] = entry;
      }
    }
  }

  const courseProgress = await calculateOverallCourseProgress(courseId, lessonProgress);
  if (courseProgress.percentage >= 0 && courseProgress.totalLessons > 0) {
    scorePercentage = courseProgress.percentage;
    completionPercentageOut = courseProgress.allAccessed ? 100 : courseProgress.percentage;
  } else if (completionPercentage !== undefined && !lessonId) {
    completionPercentageOut = Math.min(100, Math.max(0, completionPercentage));
  }

  /**
   * Status: the SHARED lifecycle derivation, which honours the due date.
   *
   * This previously inlined a three-way derivation copied from
   * `PlayerService.syncProgress` (`player.service.ts:407-424`) — which was DEAD
   * CODE in the original: `PlayerController` routed `PATCH /player/sync` to
   * `ProgressService.syncProgress` (`player.controller.ts:54`), which calls the
   * lifecycle helpers (`progress.service.ts:1035-1041`). The port merged the two
   * files and kept the dead one's logic.
   *
   * Two consequences, both live:
   *  1. **Status flap** — every write path wrote `InProgress` for a past-due
   *     learner, then `getProgress` recomputed `Overdue` and persisted it, so the
   *     badge flipped on every interaction and two endpoints disagreed about the
   *     same record.
   *  2. **Silent downgrade** — the inline branch only tested `'InProgress'`, so
   *     an existing `Overdue` row at 0% was written back as `NotStarted`,
   *     erasing the flag and under-counting overdue learners in compliance and
   *     manager reports.
   */
  const dueDate = await getUserCourseDueDate(orgId, learnerId, courseId);
  const newStatus: ProgressStatus = deriveLifecycleStatus(
    completionPercentageOut,
    dueDate,
    normalizeStatus(status),
    existing?.status,
  );

  if (!startedAt && (completionPercentageOut > 0 || newStatus === 'InProgress')) startedAt = new Date();
  if (newStatus === 'Completed' && !completedAt) completedAt = new Date();

  const saved = await db.lmsProgress.upsert({
    where: { orgId_learnerId_courseId: { orgId, learnerId, courseId } },
    create: {
      orgId, learnerId, courseId, status: newStatus,
      completionPercentage: completionPercentageOut, scorePercentage,
      startedAt: startedAt ?? new Date(), completedAt, lessonProgress: lessonProgress as object,
    },
    update: {
      status: newStatus, completionPercentage: completionPercentageOut, scorePercentage,
      startedAt: startedAt ?? undefined, completedAt, lessonProgress: lessonProgress as object,
    },
  });

  const isNewCompletion = saved.status === 'Completed' && !wasCompleted;
  if (isNewCompletion) {
    try { await generateCertificateForCompletion(orgId, learnerId, courseId); } catch { /* non-fatal */ }
  }
  return saved;
}

/** Resolve course titles from both Course and MasterCourse for a set of ids. */
async function resolveCourseTitleMap(courseIds: string[]) {
  const map = new Map<string, { _id: string; title: string; description?: string | null }>();
  if (courseIds.length === 0) return map;
  const unique = [...new Set(courseIds)];
  const courses = await db.lmsCourse.findMany({ where: { id: { in: unique } }, select: { id: true, title: true, description: true } });
  courses.forEach((c) => map.set(c.id, { _id: c.id, title: c.title, description: c.description }));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) {
    const masters = await db.lmsMasterCourse.findMany({ where: { id: { in: missing } }, select: { id: true, title: true, description: true } });
    masters.forEach((mc) => map.set(mc.id, { _id: mc.id, title: mc.title, description: mc.description }));
  }
  return map;
}

export async function getAllByUser(orgId: string, learnerId: string) {
  const records = await db.lmsProgress.findMany({ where: { orgId, learnerId }, orderBy: { updatedAt: 'desc' } });
  const ids = records.map((p) => p.courseId).filter(Boolean);
  const courseMap = await resolveCourseTitleMap(ids);
  return records.map((p) => ({ ...p, courseId: courseMap.get(p.courseId) || p.courseId }));
}

export async function getProgress(orgId: string, learnerId: string, courseId: string) {
  const progress = await db.lmsProgress.findUnique({
    where: { orgId_learnerId_courseId: { orgId, learnerId, courseId } },
  });
  if (!progress) return null;

  try {
    const lessonProgress = (progress.lessonProgress as LessonProgress) || {};
    const courseProgress = await calculateOverallCourseProgress(courseId, lessonProgress);
    const oldPct = progress.completionPercentage;
    const oldStatus = progress.status;
    let completionPercentage = oldPct;
    let scorePercentage = progress.scorePercentage;

    if (courseProgress.totalLessons > 0 && courseProgress.percentage >= 0) {
      scorePercentage = courseProgress.percentage;
      completionPercentage = courseProgress.allAccessed ? 100 : courseProgress.percentage;
    } else if (courseProgress.totalLessons === 0 && oldPct >= 100) {
      if (Object.values(lessonProgress).length === 0) completionPercentage = 0;
    }

    const dueDate = await getUserCourseDueDate(orgId, learnerId, courseId);
    const newStatus = deriveLifecycleStatus(completionPercentage, dueDate, undefined, oldStatus);

    if (oldPct !== completionPercentage || oldStatus !== newStatus) {
      let completedAt = progress.completedAt;
      if (newStatus !== 'Completed' && completedAt) completedAt = null;
      return db.lmsProgress.update({
        where: { id: progress.id },
        data: { completionPercentage, scorePercentage, status: newStatus, completedAt },
      });
    }
  } catch { /* return stored on error */ }

  return progress;
}

export async function generateMissingCertificates(orgId: string, learnerId: string) {
  const result = { generated: 0, alreadyExist: 0, failed: 0 };
  const completedProgress = await db.lmsProgress.findMany({
    where: { orgId, learnerId, OR: [{ status: 'Completed' }, { completionPercentage: { gte: 100 } }] },
  });
  if (completedProgress.length === 0) return result;

  const existingCerts = await getLearnerCertificates(orgId, learnerId);
  const existingCourseIds = new Set(
    existingCerts.map((c) => {
      const cid = (c.courseId as { _id?: string })?._id ?? c.courseId;
      return cid ? String(cid) : '';
    }).filter(Boolean),
  );

  for (const progress of completedProgress) {
    const courseId = progress.courseId;
    if (existingCourseIds.has(courseId)) { result.alreadyExist++; continue; }
    if (progress.status !== 'Completed' && progress.completionPercentage >= 100) {
      await db.lmsProgress.update({
        where: { id: progress.id },
        data: { status: 'Completed', completedAt: progress.completedAt ?? new Date() },
      });
    }
    try { await generateCertificateForCompletion(orgId, learnerId, courseId); result.generated++; }
    catch { result.failed++; }
  }
  return result;
}

export async function processXAPIStatements(orgId: string, learnerId: string, statements: { verb: { id: string } }[]) {
  let processed = 0;
  let saved = 0;
  for (const statement of statements || []) {
    processed++;
    const verbId = statement.verb?.id;
    if (verbId === 'http://adlnet.gov/expapi/verbs/completed' || verbId === 'http://adlnet.gov/expapi/verbs/passed') saved++;
  }
  return { processed, saved };
}
