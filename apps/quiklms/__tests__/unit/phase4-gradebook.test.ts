/**
 * gradebook — three defects, one of them silent grade corruption.
 *
 * G1: `finalScore ?? score ?? 0` counted UNGRADED submissions as zero. Mongo's
 *     `$avg` with `$ifNull` drops nulls from both numerator and denominator
 *     (`gradebook.service.ts:63-73`), so `[80, ungraded]` averaged 80 there and
 *     **40** here — turning a B into an F, then feeding class rankings.
 * G2: Postgres sorts NULLS FIRST on DESC, Mongo sorts them last, so ungraded
 *     students ranked #1.
 * G3: find-then-write replaced an atomic upsert, so two concurrent computes
 *     collided on the composite unique and 500'd mid-batch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  batchFindFirst: vi.fn(),
  subFindMany: vi.fn(),
  attFindMany: vi.fn(),
  gradeFindFirst: vi.fn(),
  gradeFindMany: vi.fn(),
  gradeCreate: vi.fn(),
  gradeUpdate: vi.fn(),
  transaction: vi.fn(),
  userFindMany: vi.fn(),
  batchFindMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsBatch: { findFirst: h.batchFindFirst, findMany: h.batchFindMany },
    lmsHomeworkSubmission: { findMany: h.subFindMany },
    lmsAttendance: { findMany: h.attFindMany },
    lmsGradeRecord: {
      findFirst: h.gradeFindFirst,
      findMany: h.gradeFindMany,
      create: h.gradeCreate,
      update: h.gradeUpdate,
    },
    lmsUser: { findMany: h.userFindMany },
    lmsBatchStudent: { findMany: vi.fn() },
    $transaction: h.transaction,
  },
}));

import { computeStudentGrades, getClassRanking } from '@/lib/services/gradebook-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.batchFindFirst.mockResolvedValue({ id: 'b1', orgId: 'org-1', subject: 'Maths', academicYear: '2026-2027', term: null });
  h.attFindMany.mockResolvedValue([{ status: 'present' }, { status: 'present' }]); // 100% attendance
  h.gradeFindFirst.mockResolvedValue(null);
  h.gradeFindMany.mockResolvedValue([]);
  h.gradeCreate.mockImplementation(async ({ data }: any) => ({ id: 'g1', ...data }));
  h.gradeUpdate.mockImplementation(async ({ data }: any) => ({ id: 'g1', ...data }));
  h.userFindMany.mockResolvedValue([]);
  h.batchFindMany.mockResolvedValue([]);
  h.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ lmsGradeRecord: { findFirst: h.gradeFindFirst, create: h.gradeCreate, update: h.gradeUpdate } }),
  );
});

describe('G1 — ungraded submissions are excluded, not counted as zero', () => {
  it('averages [80, ungraded] as 80, not 40', async () => {
    h.subFindMany.mockResolvedValue([
      { finalScore: 80, score: null },
      { finalScore: null, score: null }, // ungraded
    ]);
    const out = await computeStudentGrades('org-1', 'u1', 'b1');
    expect(out.homeworkAverage).toBe(80);
    // 80*0.7 + 100*0.3 = 86 — a B, not the F the zero-coercion produced.
    expect(out.overallPercentage).toBe(86);
  });

  it('prefers finalScore over score, as $ifNull did', async () => {
    h.subFindMany.mockResolvedValue([{ finalScore: 90, score: 50 }]);
    const out = await computeStudentGrades('org-1', 'u1', 'b1');
    expect(out.homeworkAverage).toBe(90);
  });

  it('falls back to score when finalScore is null', async () => {
    h.subFindMany.mockResolvedValue([{ finalScore: null, score: 60 }]);
    const out = await computeStudentGrades('org-1', 'u1', 'b1');
    expect(out.homeworkAverage).toBe(60);
  });

  it('keeps a genuine zero — 0 is a grade, null is not', async () => {
    h.subFindMany.mockResolvedValue([{ finalScore: 0, score: null }, { finalScore: 100, score: null }]);
    const out = await computeStudentGrades('org-1', 'u1', 'b1');
    expect(out.homeworkAverage).toBe(50);
  });

  it('averages 0 when every submission is ungraded (no divide-by-zero)', async () => {
    h.subFindMany.mockResolvedValue([{ finalScore: null, score: null }]);
    const out = await computeStudentGrades('org-1', 'u1', 'b1');
    expect(out.homeworkAverage).toBe(0);
  });
});

describe('G2 — ungraded students rank last, not first', () => {
  it('orders by overallPercentage desc with NULLS LAST', async () => {
    await getClassRanking('org-1', 'b1');
    expect(h.gradeFindMany.mock.calls[0][0].orderBy).toEqual({
      overallPercentage: { sort: 'desc', nulls: 'last' },
    });
  });
});

describe('G3 — the grade write is atomic', () => {
  it('runs find-then-write inside a transaction', async () => {
    h.subFindMany.mockResolvedValue([{ finalScore: 70, score: null }]);
    await computeStudentGrades('org-1', 'u1', 'b1');
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it('recovers from a concurrent-create race instead of failing the batch', async () => {
    h.subFindMany.mockResolvedValue([{ finalScore: 70, score: null }]);
    // The transaction loses the race with P2002...
    h.transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    // ...then the retry finds the row the winner wrote and updates it.
    h.gradeFindFirst.mockResolvedValue({ id: 'g-existing' });

    const out = await computeStudentGrades('org-1', 'u1', 'b1');
    expect(h.gradeUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g-existing' } }));
    expect(out).toBeDefined();
  });

  it('rethrows a non-P2002 failure rather than masking it', async () => {
    h.subFindMany.mockResolvedValue([{ finalScore: 70, score: null }]);
    h.transaction.mockRejectedValue(new Error('connection lost'));
    await expect(computeStudentGrades('org-1', 'u1', 'b1')).rejects.toThrow('connection lost');
  });
});
