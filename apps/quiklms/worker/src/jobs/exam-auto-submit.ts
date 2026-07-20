/**
 * exam-auto-submit — grade + finalize an exam session whose serverDeadline has
 * passed (or that the timer forced). Ported scoring covers single/multi MCQ,
 * true/false, and short/one-word text answers, with negative marking.
 */
import { prisma } from '../db.js';

type Answer = { selectedOptionIndices?: number[]; textAnswer?: string };

type QuestionLike = {
  type: string;
  options: unknown;
  correctAnswer: unknown;
  points: number;
  negativeMarks: number;
};

/**
 * Correctness check — kept BYTE-FOR-BYTE equivalent to
 * `lib/services/exam-sessions-service.ts:checkAnswer`.
 *
 * This job previously carried its own, DIFFERENT grader, so the same student
 * with the same answers got two different scores depending on whether they
 * clicked Submit or ran out of time. It diverged on five points:
 *   - it ignored the per-exam `LmsExamQuestion.points` override;
 *   - it applied negative marking unconditionally, where the service gates it on
 *     `settings.negativeMarkingEnabled`;
 *   - it AUTO-GRADED `short_answer`, which the service routes to manual grading
 *     — so a timed-out essay exam was scored 0 on every essay and stamped
 *     `passed: false`, permanently, with no "awaiting grading" state;
 *   - `match_column` fell through to 0 instead of being compared;
 *   - it always wrote a boolean `passed`, where the service leaves it null while
 *     manual grading is pending.
 *
 * If you change one of these, change both.
 */
function checkAnswer(question: QuestionLike, answer: Answer): boolean {
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

export async function autoSubmitSession(sessionId: string): Promise<void> {
  const session = await prisma.lmsExamSession.findUnique({ where: { id: sessionId } });

  /**
   * ONLY an in-progress session may be auto-submitted.
   *
   * The legacy filtered on `status: IN_PROGRESS` in the query itself
   * (`exam-sessions.service.ts:223-228`), so a voided session was invisible to
   * auto-submit. This guard only excluded already-finished states, letting
   * `voided` and `not_started` fall through: a teacher voided a cheating
   * student's session, the next sweep saw an expired deadline, re-graded it, and
   * wrote `auto_submitted` with a real passing score — silently undoing the
   * void. The socket path calls this directly with no status filter, so the
   * check has to live here.
   */
  if (!session || session.status !== 'in_progress') return;

  const exam = await prisma.lmsExam.findUnique({ where: { id: session.examId } });
  const assigned = (session.assignedQuestions as unknown as { questionId: string; order: number }[]) || [];
  const answers = (session.answers as Record<string, Answer>) || {};

  const questionIds = assigned.map((q) => q.questionId);
  const bank = await prisma.lmsQuestion.findMany({ where: { id: { in: questionIds } } });
  const byId = new Map(bank.map((q) => [q.id, q]));

  const examQuestions = exam
    ? await prisma.lmsExamQuestion.findMany({ where: { examId: exam.id }, select: { questionId: true, points: true } })
    : [];
  const overridePoints = new Map(examQuestions.map((eq) => [eq.questionId, eq.points]));
  const settings = (exam?.settings as { passingScore?: number; negativeMarkingEnabled?: boolean } | null) || {};

  let score = 0;
  let totalPoints = 0;
  let hasManualGrading = false;

  for (const item of assigned) {
    const q = byId.get(item.questionId);
    if (!q) continue;

    // Per-exam override first, then the bank's own points — as the service does.
    const points = overridePoints.get(item.questionId) || q.points || 1;
    totalPoints += points;

    const a = answers[item.questionId];
    if (!a) continue;

    // Free-text goes to a human, never to the auto-grader.
    if (q.type === 'short_answer' || q.type === 'long_answer') {
      hasManualGrading = true;
      continue;
    }

    if (checkAnswer(q as unknown as QuestionLike, a)) {
      score += points;
    } else if (settings.negativeMarkingEnabled && q.negativeMarks > 0) {
      score = Math.max(0, score - q.negativeMarks);
    }
  }

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
  const passingScore = settings.passingScore || 40;
  // null while a human still has to grade — not a premature `false`.
  const passed = !hasManualGrading ? percentage >= passingScore : null;

  await prisma.lmsExamSession.update({
    where: { id: sessionId },
    data: {
      status: 'auto_submitted',
      endedAt: new Date(),
      score,
      totalPoints,
      percentage,
      passed,
    },
  });
}

/** Sweep all in-progress sessions past their deadline (cron + queue safety net). */
export async function sweepExpiredSessions(): Promise<number> {
  const expired = await prisma.lmsExamSession.findMany({
    where: { status: 'in_progress', serverDeadline: { lt: new Date() } },
    select: { id: true },
  });
  for (const s of expired) await autoSubmitSession(s.id).catch(() => {});
  return expired.length;
}
