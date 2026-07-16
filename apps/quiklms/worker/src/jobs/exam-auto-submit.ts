/**
 * exam-auto-submit — grade + finalize an exam session whose serverDeadline has
 * passed (or that the timer forced). Ported scoring covers single/multi MCQ,
 * true/false, and short/one-word text answers, with negative marking.
 */
import { prisma } from '../db.js';

type Answer = { selectedOptionIndices?: number[]; textAnswer?: string };

function gradeQuestion(q: { type: string; options: { text: string; isCorrect: boolean }[]; correctAnswer: unknown; points: number; negativeMarks: number }, a: Answer): number {
  const correctIdx = q.options.map((o, i) => (o.isCorrect ? i : -1)).filter((i) => i >= 0);
  switch (q.type) {
    case 'mcq':
    case 'true_false': {
      const sel = a.selectedOptionIndices ?? [];
      const ok = sel.length === 1 && correctIdx.includes(sel[0]);
      return ok ? q.points : -(q.negativeMarks || 0);
    }
    case 'multi_select': {
      const sel = (a.selectedOptionIndices ?? []).slice().sort();
      const exp = correctIdx.slice().sort();
      const ok = sel.length === exp.length && sel.every((v, i) => v === exp[i]);
      return ok ? q.points : -(q.negativeMarks || 0);
    }
    case 'short_answer':
    case 'one_word':
    case 'fill_blank': {
      const expected = Array.isArray(q.correctAnswer) ? (q.correctAnswer as string[]) : [String(q.correctAnswer ?? '')];
      const got = (a.textAnswer ?? '').trim().toLowerCase();
      return expected.some((e) => String(e).trim().toLowerCase() === got) ? q.points : 0;
    }
    default:
      return 0; // long_answer / match_column → manual grading
  }
}

export async function autoSubmitSession(sessionId: string): Promise<void> {
  const session = await prisma.lmsExamSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === 'submitted' || session.status === 'auto_submitted' || session.status === 'timed_out') return;

  const exam = await prisma.lmsExam.findUnique({ where: { id: session.examId } });
  const assigned = (session.assignedQuestions as unknown as { questionId: string; order: number }[]) || [];
  const answers = (session.answers as Record<string, Answer>) || {};

  const questionIds = assigned.map((q) => q.questionId);
  const bank = await prisma.lmsQuestion.findMany({ where: { id: { in: questionIds } } });
  const byId = new Map(bank.map((q) => [q.id, q]));

  let score = 0;
  let totalPoints = 0;
  for (const item of assigned) {
    const q = byId.get(item.questionId);
    if (!q) continue;
    totalPoints += q.points;
    const a = answers[item.questionId];
    if (a) {
      score += gradeQuestion(
        { type: q.type, options: (q.options as { text: string; isCorrect: boolean }[]) || [], correctAnswer: q.correctAnswer, points: q.points, negativeMarks: q.negativeMarks },
        a,
      );
    }
  }
  score = Math.max(0, score);
  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
  const passingScore = ((exam?.settings as { passingScore?: number })?.passingScore) ?? 40;

  await prisma.lmsExamSession.update({
    where: { id: sessionId },
    data: {
      status: 'auto_submitted',
      endedAt: new Date(),
      score,
      totalPoints,
      percentage,
      passed: percentage >= passingScore,
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
