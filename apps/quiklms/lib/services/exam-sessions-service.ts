/**
 * Exam sessions service — ported from ExamSessionsService (Mongo → Prisma).
 *
 * ExamSession.answers is a Json Map<questionId, AnswerEntry>; assignedQuestions
 * is a Json array of { questionId, order }. Scoring / question selection ported
 * faithfully in JS. The realtime timer + auto-submit job scheduling live in the
 * /worker (Phase 4) — these REST endpoints handle start/save/submit/grade.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, Forbidden, NotFound } from '@/lib/http';
import type { AuthUser } from '@/lib/auth/context';
import { tenantWhere, assertTenantMatch } from '@/lib/auth/context';

type AssignedQuestion = { questionId: string; order: number };
type AnswerEntry = { selectedOptionIndices?: number[]; textAnswer?: string; submittedAt?: string; [k: string]: unknown };
type AnswersMap = Record<string, AnswerEntry>;
type ExamSettings = {
  randomizeQuestions?: boolean;
  graceWindowMinutes?: number;
  passingScore?: number;
  negativeMarkingEnabled?: boolean;
  showCorrectAnswersAfter?: boolean;
};

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const examSettings = (s: Prisma.JsonValue | undefined): ExamSettings => (s as ExamSettings) || {};

export async function startSession(user: AuthUser, studentId: string, examId: string) {
  const tenantId = user.tenantId as string;

  const exam = await prisma.exam.findFirst({
    where: tenantWhere(user, { id: examId }),
    include: { questions: true },
  });
  if (!exam) throw NotFound('Exam not found');
  assertTenantMatch(user, exam.tenantId);

  if (!['published', 'active', 'completed'].includes(exam.status)) {
    throw BadRequest('Exam is not available');
  }

  if (exam.batchId) {
    const learner = await prisma.user.findFirst({
      where: tenantWhere(user, { id: studentId }),
      select: { grade: true },
    });

    const orConds: Prisma.BatchWhereInput[] = [{ students: { some: { studentId } } }];
    if (learner?.grade) orConds.push({ grade: learner.grade, status: 'active' });

    const eligibleBatch = await prisma.batch.findFirst({
      where: tenantWhere(user, { id: exam.batchId, OR: orConds }),
      select: { id: true },
    });
    if (!eligibleBatch) throw Forbidden('You are not eligible for this batch exam');
  }

  const now = new Date();
  if (exam.scheduledStartTime && now < exam.scheduledStartTime) throw BadRequest('Exam has not started yet');
  if (exam.scheduledEndTime && now > exam.scheduledEndTime) throw BadRequest('Exam window has ended');

  const existing = await prisma.examSession.findUnique({
    where: { tenantId_examId_studentId: { tenantId, examId, studentId } },
  });
  if (existing) {
    if (existing.status === 'in_progress') return getSessionWithQuestions(existing, exam);
    if (existing.status === 'submitted' || existing.status === 'auto_submitted') {
      throw BadRequest('You have already submitted this exam');
    }
  }

  // Assign questions in exam_questions order, optionally randomized
  let assignedQuestions: AssignedQuestion[] = exam.questions
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((q, i) => ({ questionId: q.questionId, order: i + 1 }));

  const settings = examSettings(exam.settings);
  if (settings.randomizeQuestions) {
    assignedQuestions = shuffleArray(assignedQuestions).map((q, i) => ({ ...q, order: i + 1 }));
  }

  const graceMinutes = settings.graceWindowMinutes || 5;
  const serverDeadline = new Date(now.getTime() + (exam.duration + graceMinutes) * 60 * 1000);

  const session = await prisma.examSession.create({
    data: {
      tenantId,
      examId,
      studentId,
      startedAt: now,
      serverDeadline,
      status: 'in_progress',
      assignedQuestions: assignedQuestions as unknown as Prisma.InputJsonValue,
      answers: {},
    },
  });

  if (exam.status === 'published') {
    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'active' } });
  }

  return getSessionWithQuestions(session, exam);
}

type SessionRecord = Prisma.ExamSessionGetPayload<object>;
type ExamRecord = Prisma.ExamGetPayload<object>;

async function getSessionWithQuestions(session: SessionRecord, examDoc?: ExamRecord) {
  const assigned = (session.assignedQuestions as unknown as AssignedQuestion[]) || [];
  const questionIds = assigned.map((q) => q.questionId);
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds }, tenantId: session.tenantId },
    select: { id: true, text: true, type: true, options: true, imageUrl: true, audioUrl: true, points: true },
  });
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  const orderedQuestions = assigned.map((aq) => {
    const q = questionMap.get(aq.questionId);
    const opts = (q?.options as { text: string }[] | undefined) || [];
    return {
      ...q,
      _id: aq.questionId,
      questionId: aq.questionId,
      order: aq.order,
      points: q?.points || 1,
      options: opts.map((o) => ({ text: o.text })),
    };
  });

  const exam = examDoc || (await prisma.exam.findUnique({ where: { id: session.examId } }));

  const now = new Date();
  const remainingMs = session.serverDeadline
    ? Math.max(0, session.serverDeadline.getTime() - now.getTime())
    : (exam?.duration || 60) * 60 * 1000;

  return {
    sessionId: session.id,
    examId: session.examId,
    examTitle: exam?.title || '',
    duration: exam?.duration || 60,
    totalMarks: exam?.totalMarks || 0,
    proctoringLevel: exam?.proctoringLevel || 'soft',
    instructions: exam?.instructions || '',
    status: session.status,
    startedAt: session.startedAt,
    serverDeadline: session.serverDeadline,
    remainingSeconds: Math.floor(remainingMs / 1000),
    answers: session.answers,
    questions: orderedQuestions,
    proctoringFlags: session.proctoringFlags,
  };
}

export async function saveAnswers(user: AuthUser, studentId: string, sessionId: string, answers: AnswersMap) {
  const tenantId = user.tenantId as string;
  const session = await prisma.examSession.findFirst({ where: { id: sessionId, tenantId, studentId } });
  if (!session) throw NotFound('Session not found');
  if (session.status !== 'in_progress') throw BadRequest('Session is not in progress');

  const now = new Date();
  if (session.serverDeadline && now > session.serverDeadline) throw BadRequest('Session has timed out');

  const current = (session.answers as unknown as AnswersMap) || {};
  for (const [qId, answer] of Object.entries(answers)) {
    current[qId] = { ...answer, submittedAt: now.toISOString() };
  }

  await prisma.examSession.update({
    where: { id: sessionId },
    data: { answers: current as unknown as Prisma.InputJsonValue, lastSavedAt: now },
  });

  return { saved: true, lastSavedAt: now };
}

export async function submitSession(user: AuthUser, studentId: string, sessionId: string) {
  const tenantId = user.tenantId as string;
  const session = await prisma.examSession.findFirst({ where: { id: sessionId, tenantId, studentId } });
  if (!session) throw NotFound('Session not found');
  if (session.status !== 'in_progress') throw BadRequest('Session is not in progress');
  return gradeAndFinalize(session, 'submitted');
}

type FinalStatus = 'submitted' | 'auto_submitted';

async function gradeAndFinalize(session: SessionRecord, status: FinalStatus) {
  const exam = await prisma.exam.findUnique({ where: { id: session.examId }, include: { questions: true } });
  if (!exam) throw NotFound('Exam not found');

  const assigned = (session.assignedQuestions as unknown as AssignedQuestion[]) || [];
  const answers = (session.answers as unknown as AnswersMap) || {};
  const questionIds = assigned.map((q) => q.questionId);
  const questions = await prisma.question.findMany({ where: { id: { in: questionIds }, tenantId: session.tenantId } });
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const settings = examSettings(exam.settings);

  let score = 0;
  let totalPoints = 0;
  let hasManualGrading = false;

  for (const aq of assigned) {
    const question = questionMap.get(aq.questionId);
    if (!question) continue;

    const examQ = exam.questions.find((eq) => eq.questionId === aq.questionId);
    const points = examQ?.points || question.points || 1;
    totalPoints += points;

    const answer = answers[aq.questionId];
    if (!answer) continue;

    if (question.type === 'short_answer' || question.type === 'long_answer') {
      hasManualGrading = true;
      continue;
    }

    const isCorrect = checkAnswer(question, answer);
    if (isCorrect) {
      score += points;
    } else if (settings.negativeMarkingEnabled && question.negativeMarks > 0) {
      score = Math.max(0, score - question.negativeMarks);
    }
  }

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
  const passingScore = settings.passingScore || 40;
  const passed = !hasManualGrading ? percentage >= passingScore : null;

  await prisma.examSession.update({
    where: { id: session.id },
    data: { score, totalPoints, percentage, passed, status, endedAt: new Date() },
  });

  return { sessionId: session.id, score, totalPoints, percentage, passed, status, hasManualGrading };
}

type QuestionRecord = Prisma.QuestionGetPayload<object>;

function checkAnswer(question: QuestionRecord, answer: AnswerEntry): boolean {
  const options = (question.options as { text: string; isCorrect: boolean }[]) || [];
  switch (question.type) {
    case 'mcq': {
      const correctIdx = options.findIndex((o) => o.isCorrect);
      return answer.selectedOptionIndices?.[0] === correctIdx;
    }
    case 'multi_select': {
      const correctIndices = options.map((o, i) => (o.isCorrect ? i : -1)).filter((i) => i >= 0).sort();
      const selected = [...(answer.selectedOptionIndices || [])].sort();
      return JSON.stringify(correctIndices) === JSON.stringify(selected);
    }
    case 'true_false': {
      if (answer.textAnswer != null) {
        const correctVal = question.correctAnswer;
        if (typeof correctVal === 'boolean') return answer.textAnswer === String(correctVal);
        const correctOpt = options.find((o) => o.isCorrect);
        return answer.textAnswer.toLowerCase() === (correctOpt?.text || '').toLowerCase();
      }
      const correctIdx = options.findIndex((o) => o.isCorrect);
      return answer.selectedOptionIndices?.[0] === correctIdx;
    }
    case 'fill_blank': {
      const ca = question.correctAnswer;
      const expected = Array.isArray(ca)
        ? (ca as string[]).map((a) => a.toLowerCase().trim())
        : [String(ca).toLowerCase().trim()];
      const given = (answer.textAnswer || '').toLowerCase().trim();
      return expected.includes(given);
    }
    case 'one_word': {
      const expected = String(question.correctAnswer || '').toLowerCase().trim();
      const given = (answer.textAnswer || '').toLowerCase().trim();
      return expected.length > 0 && expected === given;
    }
    case 'match_column': {
      if (question.correctAnswer == null || answer.textAnswer == null) return false;
      const expected = JSON.stringify(question.correctAnswer).toLowerCase().replace(/\s+/g, '');
      const given = JSON.stringify(answer.textAnswer).toLowerCase().replace(/\s+/g, '');
      return expected === given;
    }
    default:
      return false;
  }
}

export async function getSessionStatus(user: AuthUser, studentId: string, sessionId: string) {
  const tenantId = user.tenantId as string;
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId, tenantId, studentId },
    select: { status: true, startedAt: true, serverDeadline: true, answers: true, lastSavedAt: true, proctoringFlags: true },
  });
  if (!session) throw NotFound('Session not found');

  const now = new Date();
  const remainingMs = session.serverDeadline ? Math.max(0, session.serverDeadline.getTime() - now.getTime()) : 0;
  const answers = (session.answers as unknown as AnswersMap) || {};

  return {
    status: session.status,
    remainingSeconds: Math.floor(remainingMs / 1000),
    answeredCount: Object.keys(answers).length,
    lastSavedAt: session.lastSavedAt,
  };
}

export async function getResult(user: AuthUser, studentId: string, sessionId: string) {
  const tenantId = user.tenantId as string;
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId, tenantId, studentId },
    include: { exam: { select: { id: true, title: true, subject: true, totalMarks: true, settings: true, status: true } } },
  });
  if (!session) throw NotFound('Session not found');

  const exam = session.exam;
  const settings = examSettings(exam.settings);
  if (exam.status !== 'results_published' && settings.showCorrectAnswersAfter !== true) {
    throw Forbidden('Results have not been published yet');
  }

  return session;
}

export async function getSubmissions(user: AuthUser, examId: string) {
  const tenantId = user.tenantId as string;
  return prisma.examSession.findMany({
    where: { tenantId, examId },
    orderBy: { score: 'desc' },
  });
}

export async function evaluateSession(
  user: AuthUser,
  graderId: string,
  sessionId: string,
  data: { score: number; teacherRemarks?: string },
) {
  const tenantId = user.tenantId as string;
  const session = await prisma.examSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) throw NotFound('Session not found');

  const percentage = session.totalPoints ? Math.round((data.score / session.totalPoints) * 100) : 0;
  const exam = await prisma.exam.findUnique({ where: { id: session.examId }, select: { settings: true } });
  const passingScore = examSettings(exam?.settings).passingScore || 40;

  return prisma.examSession.update({
    where: { id: sessionId },
    data: {
      score: data.score,
      percentage,
      teacherRemarks: data.teacherRemarks,
      gradedBy: graderId,
      gradedAt: new Date(),
      passed: percentage >= passingScore,
    },
  });
}

export async function voidSession(user: AuthUser, sessionId: string) {
  const tenantId = user.tenantId as string;
  const existing = await prisma.examSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!existing) throw NotFound('Session not found');
  return prisma.examSession.update({
    where: { id: sessionId },
    data: { status: 'voided', endedAt: new Date() },
  });
}

export async function getMySession(user: AuthUser, studentId: string, examId: string) {
  const tenantId = user.tenantId as string;
  const session = await prisma.examSession.findFirst({ where: { examId, studentId, tenantId } });
  if (!session) return null;

  const exam = await prisma.exam.findUnique({
    where: { id: session.examId },
    select: { title: true, subject: true, totalMarks: true, settings: true, status: true },
  });
  const passingScore = examSettings(exam?.settings).passingScore || 40;

  return {
    sessionId: session.id,
    examId: session.examId,
    examTitle: exam?.title || '',
    subject: exam?.subject || '',
    totalMarks: exam?.totalMarks || session.totalPoints || 0,
    score: session.score,
    totalPoints: session.totalPoints,
    percentage: session.percentage,
    passed: session.passed,
    status: session.status,
    examStatus: exam?.status,
    teacherRemarks: session.teacherRemarks,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    passingScore,
  };
}

export async function getStudentResults(user: AuthUser, studentId: string) {
  const tenantId = user.tenantId as string;
  const sessions = await prisma.examSession.findMany({
    where: { studentId, tenantId, status: { in: ['submitted', 'auto_submitted'] } },
    include: { exam: { select: { id: true, title: true, subject: true, totalMarks: true, settings: true, status: true } } },
    orderBy: { endedAt: 'desc' },
  });

  return sessions.map((s) => {
    const exam = s.exam;
    const passingScore = examSettings(exam.settings).passingScore || 40;
    return {
      sessionId: s.id,
      examId: exam.id,
      examTitle: exam.title || '',
      subject: exam.subject || '',
      totalMarks: exam.totalMarks || s.totalPoints || 0,
      score: s.score,
      totalPoints: s.totalPoints,
      percentage: s.percentage,
      passed: s.passed,
      status: s.status,
      examStatus: exam.status,
      teacherRemarks: s.teacherRemarks,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      passingScore,
      resultsPublished: exam.status === 'results_published',
    };
  });
}

export async function getExamAnalytics(user: AuthUser, examId: string) {
  const tenantId = user.tenantId as string;
  const sessions = await prisma.examSession.findMany({
    where: { tenantId, examId, status: { in: ['submitted', 'auto_submitted'] } },
  });

  if (sessions.length === 0) return { totalSubmissions: 0 };

  const scores = sessions.map((s) => s.percentage || 0);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passedCount = sessions.filter((s) => s.passed).length;
  const distribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
  for (const pct of scores) {
    if (pct <= 20) distribution['0-20']++;
    else if (pct <= 40) distribution['21-40']++;
    else if (pct <= 60) distribution['41-60']++;
    else if (pct <= 80) distribution['61-80']++;
    else distribution['81-100']++;
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { questions: { include: { question: { select: { id: true, text: true, type: true, options: true, correctAnswer: true } } } } },
  });
  const questionAccuracy: unknown[] = [];
  if (exam) {
    for (const eq of exam.questions) {
      const populatedQ = eq.question;
      const qId = populatedQ.id;
      let correct = 0;
      let attempted = 0;
      for (const s of sessions) {
        const answersRaw = (s.answers as unknown as AnswersMap) || {};
        const ans = answersRaw[qId];
        if (ans) {
          attempted++;
          const qType = populatedQ.type;
          const options = (populatedQ.options as { text: string; isCorrect: boolean }[]) || [];
          if (qType === 'mcq' || qType === 'true_false') {
            const correctIdx = options.findIndex((o) => o.isCorrect);
            if (correctIdx >= 0 && ans.selectedOptionIndices?.[0] === correctIdx) correct++;
          } else if (qType === 'multi_select') {
            const correctIndices = options.map((o, idx) => (o.isCorrect ? idx : -1)).filter((i) => i >= 0).sort();
            const selected = [...(ans.selectedOptionIndices || [])].sort();
            if (JSON.stringify(selected) === JSON.stringify(correctIndices)) correct++;
          } else if (qType === 'short_answer' || qType === 'one_word' || qType === 'fill_blank') {
            const expected = String(populatedQ.correctAnswer || '').toLowerCase().trim();
            const given = String(ans.textAnswer || '').toLowerCase().trim();
            if (expected && given && expected === given) correct++;
          }
        }
      }
      questionAccuracy.push({
        questionId: qId,
        text: populatedQ.text || '',
        attempted,
        correct,
        incorrect: attempted - correct,
        total: sessions.length,
        correctPct: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
        incorrectPct: attempted > 0 ? Math.round(((attempted - correct) / attempted) * 100) : 0,
      });
    }
  }

  return {
    totalSubmissions: sessions.length,
    avgScore,
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    passedCount,
    failedCount: sessions.length - passedCount,
    passRate: Math.round((passedCount / sessions.length) * 100),
    distribution,
    questionAccuracy,
  };
}
