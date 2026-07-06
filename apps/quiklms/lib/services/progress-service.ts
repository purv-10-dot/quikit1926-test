/**
 * Progress service — ported from ProgressService + PlayerService (Prisma).
 *
 * Tenant scoping is applied by callers (they pass tenantId explicitly). The
 * route handlers also run requireAuth + tenantWhere/assertTenantMatch.
 *
 * NOTE: courseId may reference EITHER prisma.course OR prisma.masterCourse
 * (scalar string, ambiguous target). Lesson-id extraction reads masterCourse
 * embedded `modules` Json first, then falls back to the legacy Module/Lesson
 * tables. Certificate generation delegates to certificates-service (PDF/QR
 * generation deferred — see notes there).
 */
import type { ProgressStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
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

/** Extract all lesson IDs from a MasterCourse's embedded modules → subModules → resources/quizzes. */
function extractLessonIdsFromMasterCourse(masterCourse: { modules?: unknown }): string[] {
  const lessonIds: string[] = [];
  const getId = (obj: Record<string, unknown> | undefined): string | undefined => {
    if (!obj) return undefined;
    if (typeof obj.id === 'string') return obj.id;
    if (obj._id) return String(obj._id);
    return undefined;
  };
  const usedIds = new Set<string>();
  const pushUnique = (proposedId: string, fallbackId: string) => {
    const normalized = normalizeKey(proposedId);
    if (normalized && !usedIds.has(normalized)) {
      usedIds.add(normalized);
      lessonIds.push(normalized);
      return;
    }
    let candidate = fallbackId;
    let suffix = 1;
    while (usedIds.has(candidate)) candidate = `${fallbackId}_${suffix++}`;
    usedIds.add(candidate);
    lessonIds.push(candidate);
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
        pushUnique(qid, `quiz_${moduleIndex}_${lessonIndex}`);
        lessonIndex++;
      }
    });
    const moduleEndQuiz = mod.moduleEndQuiz as Record<string, unknown> | undefined;
    if (moduleEndQuiz && (moduleEndQuiz.questions as unknown[])?.length > 0) {
      const mqid = getId(moduleEndQuiz) || `module_quiz_${moduleIndex}`;
      pushUnique(mqid, `module_quiz_${moduleIndex}`);
    }
  });
  return lessonIds;
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
    const masterCourse = await prisma.masterCourse.findUnique({ where: { id: courseId }, select: { modules: true } });
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
    const modules = await prisma.module.findMany({ where: { courseId }, include: { lessons: true } });
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

async function getUserCourseDueDate(tenantId: string, learnerId: string, courseId: string): Promise<Date | undefined> {
  const assignment = await prisma.courseAssignment.findFirst({
    where: { tenantId, targetType: 'USER', targetId: learnerId, courseId },
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

async function loadOrInit(tenantId: string, learnerId: string, courseId: string) {
  const existing = await prisma.progress.findUnique({
    where: { tenantId_learnerId_courseId: { tenantId, learnerId, courseId } },
  });
  return existing;
}

export async function updateProgress(data: {
  tenantId: string;
  learnerId: string;
  courseId: string;
  lessonId?: string;
  currentPosition?: string | number;
  duration?: number;
  percentRemaining?: number;
  status?: ProgressStatus;
  scormStatus?: string;
}) {
  const { tenantId, learnerId, courseId, lessonId, currentPosition, duration, percentRemaining, status, scormStatus } = data;
  const positionNumeric = parseSCORMLocation(currentPosition);

  let lessonCompletionPercentage = 0;
  if (duration && positionNumeric !== undefined) {
    lessonCompletionPercentage = Math.min(100, Math.max(0, (positionNumeric / duration) * 100));
  } else if (percentRemaining !== undefined) {
    lessonCompletionPercentage = Math.min(100, Math.max(0, 100 - percentRemaining));
  }
  if (scormStatus === 'completed' || scormStatus === 'passed') lessonCompletionPercentage = 100;

  const existing = await loadOrInit(tenantId, learnerId, courseId);
  const wasCompleted = existing?.status === 'Completed';
  const lessonProgress: LessonProgress = (existing?.lessonProgress as LessonProgress) || {};
  let currentModuleId = existing?.currentModuleId ?? null;
  let scorePercentage = existing?.scorePercentage ?? null;
  let completionPercentage = existing?.completionPercentage ?? 0;
  let startedAt = existing?.startedAt ?? null;
  let completedAt = existing?.completedAt ?? null;

  if (lessonId) {
    lessonProgress[lessonId] = {
      ...(lessonProgress[lessonId] || {}),
      lessonId,
      completionPercentage: lessonCompletionPercentage,
      isCompleted: lessonCompletionPercentage >= 95,
      currentPosition,
      lastAccessedAt: new Date().toISOString(),
    };
    currentModuleId = lessonId;
  }

  const courseProgress = await calculateOverallCourseProgress(courseId, lessonProgress);
  if (courseProgress.percentage >= 0 && courseProgress.totalLessons > 0) {
    scorePercentage = courseProgress.percentage;
    completionPercentage = courseProgress.allAccessed ? 100 : courseProgress.percentage;
  } else if (!lessonId) {
    completionPercentage = Math.min(100, Math.max(0, lessonCompletionPercentage));
  }

  const dueDate = await getUserCourseDueDate(tenantId, learnerId, courseId);
  const newStatus = deriveLifecycleStatus(completionPercentage, dueDate, status, existing?.status);
  if (!startedAt && (completionPercentage > 0 || newStatus === 'InProgress')) startedAt = new Date();
  if (newStatus === 'Completed' && !completedAt) completedAt = new Date();

  const saved = await prisma.progress.upsert({
    where: { tenantId_learnerId_courseId: { tenantId, learnerId, courseId } },
    create: {
      tenantId, learnerId, courseId, currentModuleId, status: newStatus,
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
    try { await generateCertificateForCompletion(tenantId, learnerId, courseId); } catch { /* non-fatal */ }
  }
  return saved;
}

export async function syncProgress(data: {
  tenantId: string;
  learnerId: string;
  courseId: string;
  moduleId?: string;
  lessonId?: string;
  completionPercentage?: number;
  currentPosition?: string | number;
  suspendData?: string;
  scormData?: Record<string, string>;
  status?: string | ProgressStatus;
}) {
  const { tenantId, learnerId, courseId, lessonId, completionPercentage, currentPosition, suspendData, scormData, status } = data;

  const existing = await loadOrInit(tenantId, learnerId, courseId);
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

  const courseProgress = await calculateOverallCourseProgress(courseId, lessonProgress);
  if (courseProgress.percentage >= 0 && courseProgress.totalLessons > 0) {
    scorePercentage = courseProgress.percentage;
    completionPercentageOut = courseProgress.allAccessed ? 100 : courseProgress.percentage;
  } else if (completionPercentage !== undefined && !lessonId) {
    completionPercentageOut = Math.min(100, Math.max(0, completionPercentage));
  }

  // Status: derived from overall completion (PlayerService semantics)
  let newStatus: ProgressStatus;
  if (completionPercentageOut >= 100) newStatus = 'Completed';
  else if (completionPercentageOut > 0) newStatus = 'InProgress';
  else {
    const ns = normalizeStatus(status);
    newStatus = ns === 'InProgress' || existing?.status === 'InProgress' ? 'InProgress' : 'NotStarted';
  }

  if (!startedAt && (completionPercentageOut > 0 || newStatus === 'InProgress')) startedAt = new Date();
  if (newStatus === 'Completed' && !completedAt) completedAt = new Date();

  const saved = await prisma.progress.upsert({
    where: { tenantId_learnerId_courseId: { tenantId, learnerId, courseId } },
    create: {
      tenantId, learnerId, courseId, status: newStatus,
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
    try { await generateCertificateForCompletion(tenantId, learnerId, courseId); } catch { /* non-fatal */ }
  }
  return saved;
}

/** Resolve course titles from both Course and MasterCourse for a set of ids. */
async function resolveCourseTitleMap(courseIds: string[]) {
  const map = new Map<string, { _id: string; title: string; description?: string | null }>();
  if (courseIds.length === 0) return map;
  const unique = [...new Set(courseIds)];
  const courses = await prisma.course.findMany({ where: { id: { in: unique } }, select: { id: true, title: true, description: true } });
  courses.forEach((c) => map.set(c.id, { _id: c.id, title: c.title, description: c.description }));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) {
    const masters = await prisma.masterCourse.findMany({ where: { id: { in: missing } }, select: { id: true, title: true, description: true } });
    masters.forEach((mc) => map.set(mc.id, { _id: mc.id, title: mc.title, description: mc.description }));
  }
  return map;
}

export async function getAllByUser(tenantId: string, learnerId: string) {
  const records = await prisma.progress.findMany({ where: { tenantId, learnerId }, orderBy: { updatedAt: 'desc' } });
  const ids = records.map((p) => p.courseId).filter(Boolean);
  const courseMap = await resolveCourseTitleMap(ids);
  return records.map((p) => ({ ...p, courseId: courseMap.get(p.courseId) || p.courseId }));
}

export async function getProgress(tenantId: string, learnerId: string, courseId: string) {
  const progress = await prisma.progress.findUnique({
    where: { tenantId_learnerId_courseId: { tenantId, learnerId, courseId } },
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

    const dueDate = await getUserCourseDueDate(tenantId, learnerId, courseId);
    const newStatus = deriveLifecycleStatus(completionPercentage, dueDate, undefined, oldStatus);

    if (oldPct !== completionPercentage || oldStatus !== newStatus) {
      let completedAt = progress.completedAt;
      if (newStatus !== 'Completed' && completedAt) completedAt = null;
      return prisma.progress.update({
        where: { id: progress.id },
        data: { completionPercentage, scorePercentage, status: newStatus, completedAt },
      });
    }
  } catch { /* return stored on error */ }

  return progress;
}

export async function generateMissingCertificates(tenantId: string, learnerId: string) {
  const result = { generated: 0, alreadyExist: 0, failed: 0 };
  const completedProgress = await prisma.progress.findMany({
    where: { tenantId, learnerId, OR: [{ status: 'Completed' }, { completionPercentage: { gte: 100 } }] },
  });
  if (completedProgress.length === 0) return result;

  const existingCerts = await getLearnerCertificates(tenantId, learnerId);
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
      await prisma.progress.update({
        where: { id: progress.id },
        data: { status: 'Completed', completedAt: progress.completedAt ?? new Date() },
      });
    }
    try { await generateCertificateForCompletion(tenantId, learnerId, courseId); result.generated++; }
    catch { result.failed++; }
  }
  return result;
}

export async function processXAPIStatements(tenantId: string, learnerId: string, statements: { verb: { id: string } }[]) {
  let processed = 0;
  let saved = 0;
  for (const statement of statements || []) {
    processed++;
    const verbId = statement.verb?.id;
    if (verbId === 'http://adlnet.gov/expapi/verbs/completed' || verbId === 'http://adlnet.gov/expapi/verbs/passed') saved++;
  }
  return { processed, saved };
}
