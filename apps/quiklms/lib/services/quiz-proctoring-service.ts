/**
 * Quiz proctoring service — ported from QuizProctoringService (Mongo → Prisma).
 *
 * Manages QuizProctoringSession lifecycle, per-attempt question selection
 * (selectedQuestionIndices / selectedAdditionalIndices Int[] + questionManifest
 * Json), proctoring log writes with severity, flag aggregation (incl. face_*),
 * lazy incident generation, and admin review enforcement (penalty/void/retake).
 *
 * resolveQuizConfig walks the standalone Assessment row OR the MasterCourse
 * modules Json tree (master-course-embedded quizzes use UUID string ids).
 */
import { Prisma } from '@prisma/client';
import type { QuizProctoringEventType, ProctoringSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';
import type { AuthUser } from '@/lib/auth/context';

type ManifestEntry = { pool: 'main' | 'additional'; index: number };
type ProctoringFlags = Record<string, number | string>;

const EMPTY_FLAGS: ProctoringFlags = {
  tabSwitches: 0,
  fullscreenExits: 0,
  copyAttempts: 0,
  rightClicks: 0,
  shortcutAttempts: 0,
  totalFlags: 0,
  severityLevel: 'none',
  faceNoFace: 0,
  faceMultiple: 0,
  faceLookingAway: 0,
  faceLookingDown: 0,
  faceEyesClosed: 0,
  faceTooFar: 0,
};

const FLAG_FIELD_MAP: Record<string, string> = {
  tab_switch: 'tabSwitches',
  fullscreen_exit: 'fullscreenExits',
  copy_attempt: 'copyAttempts',
  paste_attempt: 'copyAttempts',
  right_click: 'rightClicks',
  shortcut_key: 'shortcutAttempts',
  print_attempt: 'shortcutAttempts',
  blur: 'tabSwitches',
  beforeunload: 'tabSwitches',
  face_no_face: 'faceNoFace',
  face_multiple: 'faceMultiple',
  face_looking_away: 'faceLookingAway',
  face_looking_down: 'faceLookingDown',
  face_eyes_closed: 'faceEyesClosed',
  face_too_far: 'faceTooFar',
  face_camera_error: 'totalFlags',
};

function getFlagField(eventType: string): string | null {
  return FLAG_FIELD_MAP[eventType] || null;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface QuizConfig {
  randomize: boolean;
  questionsToShow?: number;
  total: number;
  additionalTotal: number;
  additionalToInclude?: number;
}

interface EmbeddedQuiz {
  id?: string;
  settings?: { randomizeQuestions?: boolean; questionsToShow?: number; additionalQuestionsToInclude?: number };
  questions?: unknown[];
  additionalQuestions?: unknown[];
}
interface EmbeddedSubModule {
  quiz?: EmbeddedQuiz;
}
interface EmbeddedModule {
  moduleEndQuiz?: EmbeddedQuiz;
  subModules?: EmbeddedSubModule[];
}

async function resolveQuizConfig(assessmentId: string): Promise<QuizConfig | null> {
  // Path A: standalone Assessment row.
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      randomizeQuestions: true,
      questionsToShow: true,
      questions: true,
      additionalQuestions: true,
      additionalQuestionsToInclude: true,
    },
  }).catch(() => null);
  if (a) {
    return {
      randomize: !!a.randomizeQuestions,
      questionsToShow: a.questionsToShow ?? undefined,
      total: ((a.questions as unknown[]) || []).length,
      additionalTotal: ((a.additionalQuestions as unknown[]) || []).length,
      additionalToInclude: a.additionalQuestionsToInclude ?? undefined,
    };
  }

  // Path B: master-course-embedded quiz — walk the modules Json tree.
  const courses = await prisma.masterCourse.findMany({ select: { modules: true } });
  for (const mc of courses) {
    const modules = (mc.modules as unknown as EmbeddedModule[]) || [];
    if (!Array.isArray(modules)) continue;
    for (const m of modules) {
      if (m?.moduleEndQuiz?.id === assessmentId) {
        const q = m.moduleEndQuiz;
        return {
          randomize: !!q.settings?.randomizeQuestions,
          questionsToShow: q.settings?.questionsToShow,
          total: (q.questions || []).length,
          additionalTotal: (q.additionalQuestions || []).length,
          additionalToInclude: q.settings?.additionalQuestionsToInclude,
        };
      }
      for (const sm of m?.subModules || []) {
        if (sm?.quiz?.id === assessmentId) {
          const q = sm.quiz;
          return {
            randomize: !!q.settings?.randomizeQuestions,
            questionsToShow: q.settings?.questionsToShow,
            total: (q.questions || []).length,
            additionalTotal: (q.additionalQuestions || []).length,
            additionalToInclude: q.settings?.additionalQuestionsToInclude,
          };
        }
      }
    }
  }
  return null;
}

interface PickResult {
  main?: number[];
  additional?: number[];
  manifest?: ManifestEntry[];
}

async function pickQuestionSubset(assessmentId: string): Promise<PickResult> {
  const cfg = await resolveQuizConfig(assessmentId);
  if (!cfg) return {};

  const target =
    typeof cfg.questionsToShow === 'number' && cfg.questionsToShow > 0
      ? Math.min(cfg.questionsToShow, cfg.total)
      : cfg.total;

  if (target <= 0) return {};

  let extrasCount = 0;
  if (cfg.additionalTotal > 0) {
    if (typeof cfg.additionalToInclude === 'number' && cfg.additionalToInclude > 0) {
      extrasCount = Math.min(cfg.additionalToInclude, cfg.additionalTotal, target);
    } else {
      extrasCount = Math.min(cfg.additionalTotal, Math.floor(target / 2));
    }
  }
  const mainCount = Math.max(0, target - extrasCount);

  if (extrasCount === 0 && !cfg.randomize && target === cfg.total) {
    return {};
  }

  const allMain = Array.from({ length: cfg.total }, (_, i) => i);
  const mainIndices = shuffle(allMain).slice(0, mainCount);
  if (!cfg.randomize) mainIndices.sort((a, b) => a - b);

  const additionalIndices =
    extrasCount > 0
      ? shuffle(Array.from({ length: cfg.additionalTotal }, (_, i) => i)).slice(0, extrasCount)
      : [];

  const mainPart: ManifestEntry[] = mainIndices.map((i) => ({ pool: 'main', index: i }));
  const additionalPart: ManifestEntry[] = additionalIndices.map((i) => ({ pool: 'additional', index: i }));
  const manifest = cfg.randomize ? shuffle([...mainPart, ...additionalPart]) : [...mainPart, ...additionalPart];

  return {
    main: mainIndices,
    additional: additionalIndices.length > 0 ? additionalIndices : undefined,
    manifest,
  };
}

export async function startSession(
  user: AuthUser,
  learnerId: string,
  assessmentId: string,
  courseId: string,
  timeLimitMinutes?: number,
) {
  const tenantId = user.tenantId as string;

  const voided = await prisma.quizProctoringSession.findFirst({
    where: { tenantId, learnerId, assessmentId, status: 'voided' },
  });
  if (voided) {
    throw BadRequest(
      'Your previous quiz attempt was voided due to proctoring violations. Please contact your administrator.',
    );
  }

  const existing = await prisma.quizProctoringSession.findFirst({
    where: { tenantId, learnerId, assessmentId },
  });

  if (existing) {
    if (existing.status === 'in_progress') {
      let selectedQuestionIndices = existing.selectedQuestionIndices;
      let selectedAdditionalIndices = existing.selectedAdditionalIndices;
      let questionManifest = existing.questionManifest as unknown as ManifestEntry[] | null;

      const currentCfg = await resolveQuizConfig(assessmentId);
      const target = currentCfg
        ? typeof currentCfg.questionsToShow === 'number' && currentCfg.questionsToShow > 0
          ? Math.min(currentCfg.questionsToShow, currentCfg.total)
          : currentCfg.total
        : undefined;
      const storedLen = questionManifest?.length ?? 0;
      if (target && storedLen > target) {
        const fresh = await pickQuestionSubset(assessmentId);
        selectedQuestionIndices = fresh.main ?? [];
        selectedAdditionalIndices = fresh.additional ?? [];
        questionManifest = fresh.manifest ?? null;
      }

      const updated = await prisma.quizProctoringSession.update({
        where: { id: existing.id },
        data: {
          selectedQuestionIndices,
          selectedAdditionalIndices,
          questionManifest: (questionManifest as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          isReconnection: true,
          reconnectedAt: new Date(),
        },
      });

      return {
        sessionId: updated.id,
        status: updated.status,
        proctoringFlags: updated.proctoringFlags,
        startedAt: updated.startedAt,
        serverDeadline: updated.serverDeadline,
        remainingSeconds: updated.serverDeadline
          ? Math.max(0, Math.floor((updated.serverDeadline.getTime() - Date.now()) / 1000))
          : null,
        selectedQuestionIndices: updated.selectedQuestionIndices,
      };
    }

    if (existing.status === 'submitted' || existing.status === 'auto_submitted') {
      // Retake: reset the existing session for a fresh attempt.
      const now2 = new Date();
      const graceMinutes2 = 5;
      const totalMinutes2 = (timeLimitMinutes || 60) + graceMinutes2;
      const serverDeadline2 = new Date(now2.getTime() + totalMinutes2 * 60 * 1000);

      const retakePick = await pickQuestionSubset(assessmentId);

      const updated = await prisma.quizProctoringSession.update({
        where: { id: existing.id },
        data: {
          status: 'in_progress',
          startedAt: now2,
          endedAt: null,
          serverDeadline: timeLimitMinutes ? serverDeadline2 : null,
          isReconnection: false,
          reconnectedAt: null,
          disconnectedAt: null,
          proctoringFlags: EMPTY_FLAGS as unknown as Prisma.InputJsonValue,
          selectedQuestionIndices: retakePick.main ?? [],
          selectedAdditionalIndices: retakePick.additional ?? [],
          questionManifest: (retakePick.manifest as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });

      return {
        sessionId: updated.id,
        status: updated.status,
        proctoringFlags: updated.proctoringFlags,
        startedAt: updated.startedAt,
        serverDeadline: updated.serverDeadline,
        remainingSeconds: timeLimitMinutes ? Math.floor(totalMinutes2 * 60) : null,
        selectedQuestionIndices: updated.selectedQuestionIndices,
        selectedAdditionalIndices: updated.selectedAdditionalIndices,
        questionManifest: updated.questionManifest,
      };
    }
  }

  const now = new Date();
  const graceMinutes = 5;
  const totalMinutes = (timeLimitMinutes || 60) + graceMinutes;
  const serverDeadline = new Date(now.getTime() + totalMinutes * 60 * 1000);

  const pick = await pickQuestionSubset(assessmentId);

  const session = await prisma.quizProctoringSession.create({
    data: {
      tenantId,
      learnerId,
      assessmentId,
      courseId,
      startedAt: now,
      serverDeadline: timeLimitMinutes ? serverDeadline : null,
      status: 'in_progress',
      selectedQuestionIndices: pick.main ?? [],
      selectedAdditionalIndices: pick.additional ?? [],
      questionManifest: (pick.manifest as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    },
  });

  return {
    sessionId: session.id,
    status: session.status,
    proctoringFlags: session.proctoringFlags,
    startedAt: session.startedAt,
    serverDeadline: session.serverDeadline,
    remainingSeconds: timeLimitMinutes ? Math.floor(totalMinutes * 60) : null,
    selectedQuestionIndices: session.selectedQuestionIndices,
    selectedAdditionalIndices: session.selectedAdditionalIndices,
    questionManifest: session.questionManifest,
  };
}

export async function logEvent(
  user: AuthUser,
  learnerId: string,
  sessionId: string,
  eventType: string,
  metadata?: unknown,
) {
  const tenantId = user.tenantId as string;

  const session = await prisma.quizProctoringSession.findFirst({
    where: { id: sessionId, tenantId, learnerId, status: 'in_progress' },
  });
  if (!session) return { severity: 'low' };

  const count = await prisma.quizProctoringLog.count({
    where: { sessionId, eventType: eventType as QuizProctoringEventType },
  });

  let severity: ProctoringSeverity;
  if (eventType === 'print_attempt' || eventType === 'face_multiple') severity = 'high';
  else if (count >= 10) severity = 'high';
  else if (count >= 3) severity = 'medium';
  else severity = 'low';

  const log = await prisma.quizProctoringLog.create({
    data: {
      tenantId,
      sessionId,
      learnerId,
      eventType: eventType as QuizProctoringEventType,
      timestamp: new Date(),
      metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
      severity,
    },
  });

  const flagField = getFlagField(eventType);
  if (flagField) {
    const flags = (session.proctoringFlags as unknown as ProctoringFlags) || {};
    flags[flagField] = ((flags[flagField] as number) || 0) + 1;
    flags.totalFlags = ((flags.totalFlags as number) || 0) + 1;
    flags.severityLevel = severity;
    await prisma.quizProctoringSession.update({
      where: { id: sessionId },
      data: { proctoringFlags: flags as unknown as Prisma.InputJsonValue },
    });
  }

  return { severity: log.severity };
}

export async function completeSession(user: AuthUser, learnerId: string, sessionId: string) {
  const tenantId = user.tenantId as string;
  const existing = await prisma.quizProctoringSession.findFirst({
    where: { id: sessionId, tenantId, learnerId, status: 'in_progress' },
  });
  if (!existing) return null;
  return prisma.quizProctoringSession.update({
    where: { id: existing.id },
    data: { status: 'submitted', endedAt: new Date() },
  });
}

export async function getSessionLog(user: AuthUser, sessionId: string) {
  const tenantId = user.tenantId as string;
  return prisma.quizProctoringLog.findMany({
    where: { tenantId, sessionId },
    orderBy: { timestamp: 'asc' },
  });
}

export async function getAssessmentIncidents(user: AuthUser, assessmentId: string) {
  const tenantId = user.tenantId as string;
  const sessions = await prisma.quizProctoringSession.findMany({
    where: { tenantId, assessmentId, proctoringFlags: { path: ['totalFlags'], gt: 0 } },
  });
  return buildIncidentList(sessions, tenantId, assessmentId);
}

export async function getAllIncidents(user: AuthUser) {
  const tenantId = user.tenantId as string;
  const sessions = await prisma.quizProctoringSession.findMany({
    where: { tenantId, proctoringFlags: { path: ['totalFlags'], gt: 0 } },
    orderBy: { startedAt: 'desc' },
    take: 100,
  });
  return buildIncidentList(sessions, tenantId);
}

type QuizSessionRecord = Prisma.QuizProctoringSessionGetPayload<object>;

async function buildIncidentList(sessions: QuizSessionRecord[], tenantId: string, defaultAssessmentId?: string) {
  const incidents: unknown[] = [];
  for (const session of sessions) {
    let incident = await prisma.quizIncidentReport.findFirst({ where: { sessionId: session.id, tenantId } });
    if (!incident) {
      const logs = await prisma.quizProctoringLog.findMany({ where: { sessionId: session.id } });
      const summary: Record<string, number> = {};
      let total = 0;
      for (const log of logs) {
        summary[log.eventType] = (summary[log.eventType] || 0) + 1;
        total++;
      }
      summary.total = total;
      incident = await prisma.quizIncidentReport.create({
        data: {
          tenantId,
          sessionId: session.id,
          assessmentId: session.assessmentId || (defaultAssessmentId as string),
          flagSummary: summary as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const learner = await prisma.user.findUnique({
      where: { id: session.learnerId },
      select: { id: true, firstName: true, lastName: true, email: true, employeeId: true },
    });

    incidents.push({
      ...incident,
      learner,
      sessionStatus: session.status,
      proctoringFlags: session.proctoringFlags,
      assessmentId: session.assessmentId,
      courseId: session.courseId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    });
  }
  return incidents;
}

export async function reviewIncident(
  user: AuthUser,
  reviewerId: string,
  sessionId: string,
  data: { disposition: string; action: string; remarks?: string },
) {
  const tenantId = user.tenantId as string;

  const existing = await prisma.quizIncidentReport.findFirst({ where: { sessionId, tenantId } });
  if (!existing) throw NotFound('Incident report not found');

  const incident = await prisma.quizIncidentReport.update({
    where: { id: existing.id },
    data: {
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      disposition: data.disposition as Prisma.QuizIncidentReportUpdateInput['disposition'],
      action: data.action as Prisma.QuizIncidentReportUpdateInput['action'],
      remarks: data.remarks,
    },
  });

  const session = await prisma.quizProctoringSession.findUnique({ where: { id: sessionId } });
  if (!session) throw NotFound('Session not found');

  const learnerId = session.learnerId;
  const assessmentId = session.assessmentId;
  const courseId = session.courseId;

  if (data.disposition === 'confirmed_violation') {
    if (data.action === 'penalty_applied') {
      await prisma.quizAttempt.updateMany({
        where: { tenantId, learnerId, assessmentId },
        data: { score: 0, percentage: 0, passed: false },
      });
      await resetQuizLessonProgress(tenantId, learnerId, courseId, assessmentId);
    }

    if (data.action === 'session_voided') {
      await prisma.quizProctoringSession.update({
        where: { id: sessionId },
        data: { status: 'voided', endedAt: new Date() },
      });
      await prisma.quizAttempt.deleteMany({ where: { tenantId, learnerId, assessmentId } });
      await resetQuizLessonProgress(tenantId, learnerId, courseId, assessmentId);
    }
  }

  return incident;
}

async function resetQuizLessonProgress(
  tenantId: string,
  learnerId: string,
  courseId: string,
  assessmentId: string,
) {
  try {
    const progress = await prisma.progress.findFirst({ where: { tenantId, learnerId, courseId } });
    if (!progress) return;

    const lp = (progress.lessonProgress as unknown as Record<string, { completionPercentage?: number }>) || {};
    delete lp[assessmentId];

    const entries = Object.values(lp);
    let completionPercentage = 0;
    if (entries.length > 0) {
      const avg = entries.reduce((sum, e) => sum + (e.completionPercentage || 0), 0) / entries.length;
      completionPercentage = Math.round(avg);
    }

    await prisma.progress.update({
      where: { id: progress.id },
      data: {
        lessonProgress: lp as unknown as Prisma.InputJsonValue,
        completionPercentage,
        status: 'InProgress',
        isPassed: false,
        quizScore: null,
        completedAt: null,
      },
    });
  } catch {
    // best-effort, matches legacy try/catch swallow
  }
}

export async function allowRetake(user: AuthUser, sessionId: string) {
  const tenantId = user.tenantId as string;
  const session = await prisma.quizProctoringSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) throw NotFound('Session not found');
  if (session.status !== 'voided') throw BadRequest('Only voided sessions can be allowed for retake');
  await prisma.quizProctoringSession.delete({ where: { id: sessionId } });
  return { message: 'Learner can now retake the quiz' };
}

export async function getSessionForLearner(user: AuthUser, learnerId: string, assessmentId: string) {
  const tenantId = user.tenantId as string;
  return prisma.quizProctoringSession.findFirst({ where: { tenantId, learnerId, assessmentId } });
}
