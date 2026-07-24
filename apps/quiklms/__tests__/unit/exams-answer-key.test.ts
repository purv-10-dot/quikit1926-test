/**
 * A learner could read the answer key by calling `GET /exams/:id` before
 * starting: the response carried `correctAnswer`, `explanation`, and each
 * option's `isCorrect` flag.
 *
 * This leak exists identically in the NestJS original, so closing it is a
 * DELIBERATE DEVIATION from parity, taken on the product owner's instruction
 * (2026-07-18). These tests are what stops a future "restore parity" pass from
 * silently reopening it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/auth/context', () => ({
  tenantWhere: (_u: unknown, w: object) => ({ ...w, orgId: 'org-1' }),
  assertTenantMatch: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsExam: { findFirst: h.findFirst, findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    lmsQuestion: { findMany: vi.fn() },
    lmsExamQuestion: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { findOneExam } from '@/lib/services/exams-service';

const EXAM = {
  id: 'e1',
  orgId: 'org-1',
  title: 'Midterm',
  batchId: 'b1',
  batch: { name: 'B', grade: '10', subject: 'Maths' },
  questions: [
    {
      questionId: 'q1',
      points: 5,
      order: 1,
      question: {
        id: 'q1',
        text: 'What is 2+2?',
        type: 'mcq',
        correctAnswer: '4',
        explanation: 'Because arithmetic.',
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
        ],
      },
    },
  ],
};

const learner = { id: 'u1', role: 'LEARNER', secondaryRole: null, orgId: 'org-1' } as never;
const teacher = { id: 't1', role: 'TEACHER', secondaryRole: null, orgId: 'org-1' } as never;

beforeEach(() => {
  h.findFirst.mockReset();
  h.findFirst.mockResolvedValue(EXAM);
});

const firstQuestion = (exam: Record<string, unknown>) =>
  (exam.questions as Array<{ questionId: Record<string, unknown> }>)[0].questionId;

describe('a LEARNER never receives the answer key', () => {
  it('strips correctAnswer', async () => {
    const q = firstQuestion(await findOneExam(learner, 'e1'));
    expect(q.correctAnswer).toBeUndefined();
  });

  it('strips explanation', async () => {
    const q = firstQuestion(await findOneExam(learner, 'e1'));
    expect(q.explanation).toBeUndefined();
  });

  it('strips the isCorrect flag from every option', async () => {
    const q = firstQuestion(await findOneExam(learner, 'e1'));
    for (const opt of q.options as Array<Record<string, unknown>>) {
      expect(opt.isCorrect).toBeUndefined();
    }
  });

  it('still shows the option TEXT — the learner has to see the choices', async () => {
    const q = firstQuestion(await findOneExam(learner, 'e1'));
    expect((q.options as Array<{ text: string }>).map((o) => o.text)).toEqual(['3', '4']);
  });

  it('keeps the question text and type', async () => {
    const q = firstQuestion(await findOneExam(learner, 'e1'));
    expect(q.text).toBe('What is 2+2?');
    expect(q.type).toBe('mcq');
  });

  it('leaves the rest of the exam intact', async () => {
    const exam = await findOneExam(learner, 'e1');
    expect(exam.title).toBe('Midterm');
    expect(exam.batchId).toMatchObject({ name: 'B' });
  });
});

describe('staff keep the full view', () => {
  it('a TEACHER still receives correctAnswer and explanation', async () => {
    const q = firstQuestion(await findOneExam(teacher, 'e1'));
    expect(q.correctAnswer).toBe('4');
    expect(q.explanation).toBe('Because arithmetic.');
    expect((q.options as Array<{ isCorrect?: boolean }>)[1].isCorrect).toBe(true);
  });

  it('a TENANT_ADMIN keeps it too', async () => {
    const admin = { id: 'a1', role: 'TENANT_ADMIN', secondaryRole: null, orgId: 'org-1' } as never;
    expect(firstQuestion(await findOneExam(admin, 'e1')).correctAnswer).toBe('4');
  });

  it('honours a staff SECONDARY role', async () => {
    const dual = { id: 'd1', role: 'LEARNER', secondaryRole: 'TEACHER', orgId: 'org-1' } as never;
    expect(firstQuestion(await findOneExam(dual, 'e1')).correctAnswer).toBe('4');
  });
});
