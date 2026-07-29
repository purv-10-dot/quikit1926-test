/**
 * The author's attempt limit was authored, enforced, and then contradicted.
 *
 * `submitQuiz` enforces the cap correctly (`priorAttempts >= retryLimit`, with
 * `retryLimit <= 0` meaning unlimited, matching the legacy). But the submit
 * ROUTE derived its own `Math.max(0, 1 - attempts.length)` and shipped that to
 * the client as `attemptsRemaining`. So an author could set maxAttempts to 3,
 * the service would happily allow all 3, and the learner was told 0 remained
 * after the first — the Retake button never appeared and the setting looked
 * dead.
 *
 * `attemptsRemaining` now comes from the service, where the cap actually lives,
 * so the two cannot drift again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  assessmentFindFirst: vi.fn(),
  attemptFindMany: vi.fn(),
  attemptCreate: vi.fn(),
  progressFindFirst: vi.fn(),
  progressCreate: vi.fn(),
  progressUpdate: vi.fn(),
  courseFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({ presignFromUrlOrKey: vi.fn(), S3_BUCKET: 'b' }));
vi.mock('@/lib/services/quiz-proctoring-service', () => ({ getSessionManifest: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsAssessment: { findFirst: h.assessmentFindFirst },
    lmsQuizAttempt: { findMany: h.attemptFindMany, create: h.attemptCreate },
    lmsProgress: { findFirst: h.progressFindFirst, create: h.progressCreate, update: h.progressUpdate },
    lmsMasterCourse: { findMany: h.courseFindMany },
    $queryRaw: h.queryRaw,
  },
}));

import { submitQuiz } from '@/lib/services/assessments-service';

const QUESTION = { text: 'Q1', type: 'MCQ', options: ['a', 'b'], correctAnswerIndex: 0, points: 1 };

const assessment = (retryLimit: number) => ({
  id: 'a1',
  orgId: 'org-1',
  title: 'Safety',
  questions: [QUESTION],
  additionalQuestions: [],
  passingScore: 50,
  retryLimit,
});

const dto = { assessmentId: 'a1', courseId: 'c1', answers: [{ questionId: '0', selectedAnswerIndex: 0 }] };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.attemptFindMany.mockResolvedValue([]);
  h.attemptCreate.mockResolvedValue({ id: 'at1' });
  h.progressFindFirst.mockResolvedValue(null);
  h.progressCreate.mockResolvedValue({ id: 'p1', lessonProgress: {} });
  h.progressUpdate.mockResolvedValue({ id: 'p1' });
});

describe('attemptsRemaining reflects the author’s retryLimit', () => {
  it('reports 2 remaining after the first of 3 attempts', async () => {
    h.assessmentFindFirst.mockResolvedValue(assessment(3));
    const out = await submitQuiz('org-1', 'u1', dto as never);
    expect(out.attemptsRemaining).toBe(2);
  });

  it('reports 0 once the last attempt is used', async () => {
    h.assessmentFindFirst.mockResolvedValue(assessment(3));
    h.attemptFindMany.mockResolvedValue([{ id: 'x' }, { id: 'y' }]); // 2 prior
    const out = await submitQuiz('org-1', 'u1', dto as never);
    expect(out.attemptsRemaining).toBe(0);
  });

  it('reports 0 — not 1 — for a genuinely single-attempt quiz', async () => {
    h.assessmentFindFirst.mockResolvedValue(assessment(1));
    const out = await submitQuiz('org-1', 'u1', dto as never);
    expect(out.attemptsRemaining).toBe(0);
  });

  it('reports null for unlimited (retryLimit <= 0), preserving legacy semantics', async () => {
    h.assessmentFindFirst.mockResolvedValue(assessment(0));
    const out = await submitQuiz('org-1', 'u1', dto as never);
    expect(out.attemptsRemaining).toBeNull();
  });

  it('still refuses the attempt past the cap', async () => {
    h.assessmentFindFirst.mockResolvedValue(assessment(2));
    h.attemptFindMany.mockResolvedValue([{ id: 'x' }, { id: 'y' }]);
    await expect(submitQuiz('org-1', 'u1', dto as never)).rejects.toMatchObject({
      message: 'You have used all 2 attempts for this quiz.',
    });
  });

  it('returns passingScore and totalPoints, which the player reads to render the result', async () => {
    // Both were absent from the response while the UI declared them, so the
    // pass threshold shown to a learner was always undefined.
    h.assessmentFindFirst.mockResolvedValue(assessment(3));
    const out = await submitQuiz('org-1', 'u1', dto as never);
    expect(out.passingScore).toBe(50);
    expect(out.totalPoints).toBe(1);
  });
});

describe('master-course quizzes are found without scanning the catalogue', () => {
  const embedded = {
    modules: [
      {
        subModules: [
          { quiz: { id: 'quiz-uuid', title: 'Embedded', questions: [QUESTION], settings: { passingScore: 60, maxAttempts: 2 } } },
        ],
      },
    ],
  };

  it('probes for the owning course instead of loading every master course', async () => {
    h.assessmentFindFirst.mockResolvedValue(null);
    h.queryRaw.mockResolvedValue([{ id: 'course-1' }]);
    h.courseFindMany.mockResolvedValue([embedded]);

    const out = await submitQuiz('org-1', 'u1', { ...dto, assessmentId: 'quiz-uuid' } as never);
    expect(h.queryRaw).toHaveBeenCalled();
    // Scoped to the one row the probe returned — not an unfiltered findMany.
    expect(h.courseFindMany.mock.calls[0][0]).toMatchObject({ where: { id: 'course-1' } });
    expect(out.totalQuestions).toBe(1);
  });

  it('honours maxAttempts from the embedded quiz settings', async () => {
    h.assessmentFindFirst.mockResolvedValue(null);
    h.queryRaw.mockResolvedValue([{ id: 'course-1' }]);
    h.courseFindMany.mockResolvedValue([embedded]);

    const out = await submitQuiz('org-1', 'u1', { ...dto, assessmentId: 'quiz-uuid' } as never);
    expect(out.attemptsRemaining).toBe(1); // maxAttempts 2, first attempt just used
  });

  it('falls back to a full scan if the probe throws, rather than 404ing every quiz', async () => {
    h.assessmentFindFirst.mockResolvedValue(null);
    h.queryRaw.mockRejectedValue(new Error('jsonb_path_exists unavailable'));
    h.courseFindMany.mockResolvedValue([embedded]);

    const out = await submitQuiz('org-1', 'u1', { ...dto, assessmentId: 'quiz-uuid' } as never);
    expect(out.totalQuestions).toBe(1);
  });

  it('404s when the probe finds nothing', async () => {
    h.assessmentFindFirst.mockResolvedValue(null);
    h.queryRaw.mockResolvedValue([]);
    await expect(
      submitQuiz('org-1', 'u1', { ...dto, assessmentId: 'nope' } as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(h.courseFindMany).not.toHaveBeenCalled();
  });
});
