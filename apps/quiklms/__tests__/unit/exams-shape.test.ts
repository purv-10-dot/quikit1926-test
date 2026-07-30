/**
 * exams — the `.populate()` shape regression and its consequences.
 *
 * Mongoose `.populate('batchId', ...)` REPLACES the field. The port added the
 * relation under a NEW key (`batch`, `question`) and left the scalar FK a raw
 * uuid, which broke three things in the UI — the worst being that opening a
 * draft exam and saving it DESTROYED the batch assignment, after which the exam
 * became visible to every learner in the org.
 *
 * Also covered: `updateExam` atomicity (a failure used to commit the question
 * delete and leave the exam empty) and duplicate-question de-duplication.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  questionFindMany: vi.fn(),
  examQuestionDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/auth/context', () => ({
  tenantWhere: (_u: unknown, w: object) => ({ ...w, orgId: 'org-1' }),
  assertTenantMatch: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsExam: { findMany: h.findMany, findFirst: h.findFirst, update: h.update, create: h.create },
    lmsQuestion: { findMany: h.questionFindMany },
    lmsExamQuestion: { deleteMany: h.examQuestionDeleteMany },
    $transaction: h.transaction,
  },
}));

import { findAllExams, findOneExam, updateExam } from '@/lib/services/exams-service';

const USER = { id: 'u1', role: 'TENANT_ADMIN', orgId: 'org-1' } as never;

const EXAM = {
  id: 'e1',
  orgId: 'org-1',
  title: 'Midterm',
  status: 'draft',
  batchId: 'b1',
  batch: { name: 'Batch A', grade: '10', subject: 'Maths' },
  questions: [{ questionId: 'q1', points: 5, order: 1 }],
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.findMany.mockResolvedValue([EXAM]);
  h.findFirst.mockResolvedValue(EXAM);
  h.questionFindMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
  h.examQuestionDeleteMany.mockResolvedValue({ count: 1 });
  h.update.mockResolvedValue(EXAM);
  // Run the transaction callback against the same mocked client.
  h.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      lmsExam: { update: h.update },
      lmsExamQuestion: { deleteMany: h.examQuestionDeleteMany },
    }),
  );
});

describe('populate shape — batchId is the object, not a raw id', () => {
  it('GET /exams replaces batchId with the batch, as populate did', async () => {
    const [exam] = await findAllExams(USER, {});
    // exams/page.tsx:129 reads exam.batchId.name
    expect(exam.batchId).toEqual({ _id: 'b1', name: 'Batch A', grade: '10', subject: 'Maths' });
    expect(typeof exam.batchId).not.toBe('string');
  });

  it('GET /exams includes questions — otherwise every exam shows "Questions: 0"', async () => {
    const [exam] = await findAllExams(USER, {});
    expect(Array.isArray(exam.questions)).toBe(true);
    expect((exam.questions as unknown[]).length).toBe(1);
  });

  it('keeps batchId null (not an object) when the exam has no batch', async () => {
    h.findMany.mockResolvedValue([{ ...EXAM, batchId: null, batch: null }]);
    const [exam] = await findAllExams(USER, {});
    expect(exam.batchId).toBeNull();
  });

  it('exposes _id on the populated batch, so create/page.tsx:76 can round-trip it', async () => {
    // `batchId: exam.batchId?._id || ''` — on a raw string this yielded '',
    // and saving then DISCONNECTED the batch. That is the data-loss path.
    const [exam] = await findAllExams(USER, {});
    expect((exam.batchId as { _id: string })._id).toBe('b1');
  });

  it('GET /exams/:id replaces questions[].questionId with the question doc', async () => {
    h.findFirst.mockResolvedValue({
      ...EXAM,
      questions: [{ questionId: 'q1', points: 5, order: 1, question: { text: 'What is 2+2?', type: 'mcq' } }],
    });
    const exam = await findOneExam(USER, 'e1');
    const q = (exam.questions as Array<{ questionId: { _id: string; text: string } }>)[0];
    // create/page.tsx:85 sets _question = q.questionId and renders _question.text
    expect(q.questionId).toEqual({ _id: 'q1', text: 'What is 2+2?', type: 'mcq' });
  });

  it('leaves questionId a raw id when the relation was not loaded', async () => {
    const [exam] = await findAllExams(USER, {});
    expect((exam.questions as Array<{ questionId: unknown }>)[0].questionId).toBe('q1');
  });
});

describe('updateExam — atomicity and duplicates', () => {
  it('runs the question replacement inside a transaction', async () => {
    await updateExam(USER, 'e1', { questions: [{ questionId: 'q1', points: 1, order: 1 }] });
    expect(h.transaction).toHaveBeenCalled();
    // The delete must happen inside the callback, not before it.
    expect(h.examQuestionDeleteMany).toHaveBeenCalledWith({ where: { examId: 'e1' } });
  });

  it('does not delete the questions when the payload omits them', async () => {
    await updateExam(USER, 'e1', { title: 'New title' });
    expect(h.examQuestionDeleteMany).not.toHaveBeenCalled();
  });

  it('de-duplicates repeated questionIds instead of 500ing on the unique constraint', async () => {
    await updateExam(USER, 'e1', {
      questions: [
        { questionId: 'q1', points: 5, order: 1 },
        { questionId: 'q1', points: 5, order: 2 },
        { questionId: 'q2', points: 3, order: 3 },
      ],
    });
    const created = h.update.mock.calls[0][0].data.questions.create;
    expect(created.map((q: { questionId: string }) => q.questionId)).toEqual(['q1', 'q2']);
  });

  it('totalMarks counts the deduped set, not the raw payload', async () => {
    await updateExam(USER, 'e1', {
      questions: [
        { questionId: 'q1', points: 5, order: 1 },
        { questionId: 'q1', points: 5, order: 2 },
      ],
    });
    expect(h.update.mock.calls[0][0].data.totalMarks).toBe(5);
  });

  it('still rejects another tenant’s questions', async () => {
    h.questionFindMany.mockResolvedValue([]); // none owned
    await expect(
      updateExam(USER, 'e1', { questions: [{ questionId: 'foreign', points: 1, order: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(h.transaction).not.toHaveBeenCalled(); // validated before any write
  });

  it('returns the populated shape', async () => {
    h.update.mockResolvedValue(EXAM);
    const out = await updateExam(USER, 'e1', { title: 'x' });
    expect(out.batchId).toEqual({ _id: 'b1', name: 'Batch A', grade: '10', subject: 'Maths' });
  });
});
