/**
 * Assessments service — ported from AssessmentsService (Prisma).
 *
 * Assessments live in two places: standalone `Assessment` rows, and quizzes
 * embedded inside MasterCourse.modules JSON (subModule.quiz / moduleEndQuiz).
 * findOne resolves both. Scoring + progress/QuizAttempt writes are ported.
 *
 * Quiz-proctoring session manifests are NOT available in this build (the
 * quiz-proctoring module was not ported); the `sessionId` slicing path is
 * skipped and the full question bank is used, matching the no-session branch.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';

type AnyRec = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function create(tenantId: string, dto: AnyRec) {
  const normalisePoints = (q: AnyRec) => ({ ...q, points: q.points || 1 });
  const questions = ((dto.questions as AnyRec[]) || []).map(normalisePoints);
  const additionalQuestions = ((dto.additionalQuestions as AnyRec[]) || []).map(normalisePoints);

  return prisma.assessment.create({
    data: {
      tenantId,
      moduleId: String(dto.moduleId),
      title: String(dto.title ?? ''),
      questions: questions as unknown as Prisma.InputJsonValue,
      additionalQuestions: additionalQuestions as unknown as Prisma.InputJsonValue,
      passingScore: typeof dto.passingScore === 'number' ? (dto.passingScore as number) : 80,
      retryLimit: typeof dto.retryLimit === 'number' ? (dto.retryLimit as number) : 3,
      timeLimit: typeof dto.timeLimit === 'number' ? (dto.timeLimit as number) : undefined,
      randomizeQuestions: dto.randomizeQuestions === true,
      questionsToShow: typeof dto.questionsToShow === 'number' ? (dto.questionsToShow as number) : undefined,
      additionalQuestionsToInclude:
        typeof dto.additionalQuestionsToInclude === 'number' ? (dto.additionalQuestionsToInclude as number) : undefined,
      isMaster: dto.isMaster === true,
    },
  });
}

/** Find an assessment by id (standalone Assessment row, else master-course quiz). */
export async function findOne(id: string, tenantId: string): Promise<AnyRec> {
  const standalone = await prisma.assessment.findFirst({ where: { id, tenantId } });
  if (standalone) return standalone as unknown as AnyRec;

  // Search master-course embedded quizzes by quiz id.
  const masterCourses = await prisma.masterCourse.findMany();
  for (const course of masterCourses) {
    const modules = (course.modules as unknown as AnyRec[]) || [];
    for (const module of modules) {
      for (const subModule of (module.subModules as AnyRec[]) || []) {
        const quiz = subModule.quiz as AnyRec | undefined;
        if (quiz && quiz.id === id) return transformMasterQuiz(id, tenantId, quiz, 'Quiz');
      }
      const endQuiz = module.moduleEndQuiz as AnyRec | undefined;
      if (endQuiz && endQuiz.id === id) return transformMasterQuiz(id, tenantId, endQuiz, 'Module Quiz');
    }
  }

  throw NotFound(`Assessment with ID ${id} not found`);
}

function transformMasterQuiz(id: string, tenantId: string, quiz: AnyRec, fallbackTitle: string): AnyRec {
  const settings = (quiz.settings as AnyRec) || {};
  const mapped = ((quiz.questions as AnyRec[]) || []).map(mapQuizQuestion);
  const mappedAdditional = ((quiz.additionalQuestions as AnyRec[]) || []).map(mapQuizQuestion);
  return {
    _id: id,
    originalId: id,
    tenantId,
    moduleId: '',
    title: quiz.title || fallbackTitle,
    questions: mapped,
    additionalQuestions: mappedAdditional,
    additionalQuestionsToInclude: settings.additionalQuestionsToInclude,
    randomizeQuestions: !!settings.randomizeQuestions,
    questionsToShow: settings.questionsToShow,
    passingScore: settings.passingScore || 80,
    retryLimit: settings.maxAttempts || 3,
    timeLimit: settings.timeLimit,
    isMaster: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function update(id: string, tenantId: string, updateData: AnyRec) {
  const existing = await prisma.assessment.findFirst({ where: { id, tenantId } });
  if (!existing) throw NotFound('Assessment not found');
  const { id: _id, tenantId: _t, createdAt: _ca, updatedAt: _ua, ...rest } = updateData;
  return prisma.assessment.update({ where: { id }, data: rest as Prisma.AssessmentUpdateInput });
}

/** Prior submitted attempts for retry-limit enforcement. */
async function countLearnerAttempts(tenantId: string, learnerId: string, courseId: string, assessmentId: string): Promise<number> {
  const attempts = await getQuizAttempts(tenantId, learnerId, assessmentId);
  if (attempts.length > 0) return attempts.length;

  // For UUID/master assessments we don't persist QuizAttempt rows; use
  // lessonProgress as a "1 prior attempt" signal.
  const progress = await prisma.progress.findFirst({ where: { tenantId, learnerId, courseId } });
  const lp = (progress?.lessonProgress as AnyRec | null) || undefined;
  if (!lp) return 0;
  const isDone = (v: AnyRec) => v && (v.isCompleted === true || (Number(v.completionPercentage) || 0) >= 95);
  if (isDone(lp[assessmentId] as AnyRec)) return 1;
  for (const v of Object.values(lp)) {
    const entry = v as AnyRec;
    if (isDone(entry) && entry?.lessonId === assessmentId) return 1;
  }
  return 0;
}

export async function getQuizAttempts(tenantId: string, learnerId: string, assessmentId: string) {
  if (!tenantId || !learnerId || !assessmentId) return [];
  if (UUID_RE.test(assessmentId)) return []; // master-course quizzes aren't stored by assessmentId
  return prisma.quizAttempt.findMany({
    where: { tenantId, learnerId, assessmentId },
    orderBy: { submittedAt: 'desc' },
  });
}

export interface SubmitQuizDto {
  assessmentId: string;
  courseId: string;
  answers: Array<{ questionId: string; selectedAnswerIndex?: number; textAnswer?: string; matchAnswers?: Array<{ left: string; right: string }> }>;
  sessionId?: string;
}

export async function submitQuiz(tenantId: string, learnerId: string, dto: SubmitQuizDto) {
  const assessment = await findOne(dto.assessmentId, tenantId);

  const priorAttempts = await countLearnerAttempts(tenantId, learnerId, dto.courseId, dto.assessmentId);
  const retryLimitRaw = assessment.retryLimit;
  const retryLimit = typeof retryLimitRaw === 'number' && retryLimitRaw > 0 ? retryLimitRaw : Number.POSITIVE_INFINITY;
  if (priorAttempts >= retryLimit) throw BadRequest(`You have used all ${retryLimit} attempts for this quiz.`);

  // No proctoring-session slicing in this build: score against the main bank.
  const questionsToScore = (assessment.questions as AnyRec[]) || [];

  let totalPoints = 0;
  let earnedPoints = 0;
  let correctCount = 0;
  let wrongCount = 0;

  questionsToScore.forEach((question, index) => {
    const points = Number(question.points) || 0;
    totalPoints += points;
    const matched = dto.answers.filter(
      (a) => a.questionId === index.toString() || a.questionId === String(index) || parseInt(a.questionId, 10) === index,
    );

    let isCorrect = false;
    if (matched.length > 0) {
      const qType = String(question.type || '').toLowerCase();
      const answer = matched[0];
      if (qType === 'fillblank' || qType === 'fill_blank') {
        const expected = ((question.blanks as string[]) || []).map((b) => b.trim().toLowerCase());
        const given = answer?.textAnswer?.trim().toLowerCase() || '';
        isCorrect = expected.length > 0 && expected.includes(given);
      } else if (qType === 'match' || qType === 'drag_drop') {
        const pairs = (question.dragDropPairs as Array<{ left: string; right: string }>) || [];
        const submitted = answer?.matchAnswers || [];
        if (pairs.length > 0 && submitted.length === pairs.length) {
          isCorrect = pairs.every((p) => submitted.some((s) => s.left === p.left && s.right === p.right));
        }
      } else if (Array.isArray(question.correctAnswerIndex)) {
        const selectedIndices = matched
          .map((a) => a.selectedAnswerIndex ?? -1)
          .filter((idx) => idx >= 0)
          .sort((a, b) => a - b);
        const correctIndices = [...(question.correctAnswerIndex as number[])].sort((a, b) => a - b);
        isCorrect =
          selectedIndices.length === correctIndices.length &&
          selectedIndices.every((val, idx) => val === correctIndices[idx]);
      } else {
        isCorrect = answer.selectedAnswerIndex === question.correctAnswerIndex;
      }
    }

    if (isCorrect) {
      earnedPoints += points;
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const totalQuestions = questionsToScore.length;
  const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  const passingScore = Number(assessment.passingScore) || 0;
  const passed = percentage >= passingScore;

  // Update or create progress.
  const existingProgress = await prisma.progress.findFirst({ where: { tenantId, learnerId, courseId: dto.courseId } });
  const lessonProgress: AnyRec = (existingProgress?.lessonProgress as AnyRec | null) || {};
  lessonProgress[dto.assessmentId] = {
    lessonId: dto.assessmentId,
    completionPercentage: percentage,
    isCompleted: passed,
    attempted: true,
    lastAccessedAt: new Date(),
    quizScore: { raw: earnedPoints, max: totalPoints, min: 0, scaled: percentage / 100 },
  };

  const nextStatus =
    existingProgress?.status === 'NotStarted' || !existingProgress ? 'InProgress' : existingProgress.status;

  const progress = existingProgress
    ? await prisma.progress.update({
        where: { id: existingProgress.id },
        data: { quizScore: percentage, isPassed: passed, lessonProgress: lessonProgress as Prisma.InputJsonValue, status: nextStatus },
      })
    : await prisma.progress.create({
        data: {
          tenantId,
          learnerId,
          courseId: dto.courseId,
          status: 'InProgress',
          quizScore: percentage,
          isPassed: passed,
          lessonProgress: lessonProgress as Prisma.InputJsonValue,
        },
      });

  // Persist QuizAttempt only for non-UUID (standalone) assessments.
  if (!UUID_RE.test(dto.assessmentId)) {
    const answers = questionsToScore.map((question, index) => {
      const matched = dto.answers.filter(
        (a) => a.questionId === index.toString() || a.questionId === String(index) || parseInt(a.questionId, 10) === index,
      );
      let isCorrect = false;
      let selectedAnswerIndex: number | number[] = -1;
      if (matched.length > 0) {
        if (Array.isArray(question.correctAnswerIndex)) {
          const selectedIndices = matched.map((a) => a.selectedAnswerIndex ?? -1).filter((idx) => idx >= 0).sort((a, b) => a - b);
          const correctIndices = [...(question.correctAnswerIndex as number[])].sort((a, b) => a - b);
          selectedAnswerIndex = selectedIndices.length > 0 ? selectedIndices : [-1];
          isCorrect = selectedIndices.length === correctIndices.length && selectedIndices.every((val, idx) => val === correctIndices[idx]);
        } else {
          const answer = matched[0];
          selectedAnswerIndex = answer?.selectedAnswerIndex ?? -1;
          isCorrect = answer.selectedAnswerIndex === question.correctAnswerIndex;
        }
      }
      return {
        questionIndex: index,
        questionText: question.text,
        options: question.options,
        selectedAnswerIndex,
        correctAnswerIndex: question.correctAnswerIndex,
        isCorrect,
        explanation: question.explanation,
      };
    });

    await prisma.quizAttempt.create({
      data: {
        tenantId,
        learnerId,
        courseId: dto.courseId,
        assessmentId: dto.assessmentId,
        answers: answers as unknown as Prisma.InputJsonValue,
        score: earnedPoints,
        totalPoints,
        percentage: Math.round(percentage * 100) / 100,
        passed,
        submittedAt: new Date(),
      },
    });
  }

  return {
    score: earnedPoints,
    percentage: Math.round(percentage * 100) / 100,
    passed,
    correctCount,
    wrongCount,
    totalQuestions,
    progress,
  };
}

// ── port of mapQuizQuestion ──────────────────────────────────────────────────
function mapQuizQuestion(q: AnyRec): AnyRec {
  const rawType = String(q.type || 'mcq').toLowerCase();
  let options: string[] = ((q.options as unknown[]) || [])
    .map((opt) => {
      if (typeof opt === 'string') return opt;
      if (opt && typeof opt === 'object') {
        const o = opt as AnyRec;
        return String(o.text || o.label || o.value || '');
      }
      return String(opt || '');
    })
    .filter((s) => s.trim().length > 0);
  if (rawType === 'true_false' && options.length < 2) options = ['True', 'False'];

  let type = 'MCQ';
  if (rawType === 'true_false') type = 'TrueFalse';
  else if (rawType === 'multi_select') type = 'MultiSelect';
  else if (rawType === 'fill_blank') type = 'FillBlank';
  else if (rawType === 'drag_drop') type = 'Match';

  let correctAnswerIndex: number | number[] = 0;
  if (q.correctAnswer !== undefined) {
    if (typeof q.correctAnswer === 'boolean') correctAnswerIndex = q.correctAnswer ? 0 : 1;
    else if (typeof q.correctAnswer === 'number') correctAnswerIndex = q.correctAnswer;
    else if (Array.isArray(q.correctAnswer)) {
      const arr = q.correctAnswer as unknown[];
      if (arr.length > 0 && typeof arr[0] === 'string') {
        correctAnswerIndex = (arr as string[])
          .map((id) => ((q.options as AnyRec[]) || []).findIndex((opt) => typeof opt === 'object' && opt.id === id))
          .filter((idx) => idx >= 0);
      } else {
        correctAnswerIndex = arr as number[];
      }
    }
  } else if (q.correctAnswerIndex !== undefined) {
    correctAnswerIndex = q.correctAnswerIndex as number | number[];
  }

  const mapped: AnyRec = {
    text: q.text || q.question || '',
    type,
    options,
    correctAnswerIndex,
    explanation: q.explanation || '',
    points: q.points || 1,
  };
  if (rawType === 'fill_blank') {
    const blanks = q.blanks as string[] | undefined;
    mapped.blanks = blanks && blanks.length > 0 ? blanks : [''];
  }
  if (rawType === 'drag_drop') {
    const pairs = (q.dragDropPairs || q.matchPairs || q.pairs || []) as AnyRec[];
    mapped.dragDropPairs = pairs.map((p) => ({
      id: p.id || `pair_${Math.random().toString(36).slice(2, 10)}`,
      left: p.left || p.leftItem || p.key || '',
      right: p.right || p.rightItem || p.value || '',
    }));
  }
  if (q.imageUrl) mapped.imageUrl = q.imageUrl;
  if (q.audioUrl) mapped.audioUrl = q.audioUrl;
  return mapped;
}
