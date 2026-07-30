/**
 * assessments — `submitQuiz` graded against the raw main bank while the GET
 * route serves questions rebuilt from the proctoring manifest
 * (`app/api/assessments/[id]/route.ts:33-52`).
 *
 * The learner's answers are keyed by DISPLAYED position, so every proctored or
 * randomized attempt was graded against the WRONG questions: a learner who
 * answered correctly could be failed, and vice versa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  manifest: vi.fn(),
  findFirst: vi.fn(),
  masterFindMany: vi.fn(),
  progressFindFirst: vi.fn(),
  progressUpdate: vi.fn(),
  progressCreate: vi.fn(),
  attemptFindMany: vi.fn(),
  attemptCreate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/services/quiz-proctoring-service', () => ({ getSessionManifest: h.manifest }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsAssessment: { findFirst: h.findFirst },
    lmsMasterCourse: { findMany: h.masterFindMany },
    lmsProgress: { findFirst: h.progressFindFirst, update: h.progressUpdate, create: h.progressCreate },
    lmsQuizAttempt: { findMany: h.attemptFindMany, create: h.attemptCreate },
  },
}));

import { submitQuiz } from '@/lib/services/assessments-service';

/** Main bank: Q0 correct=0, Q1 correct=1. */
const ASSESSMENT = {
  id: 'a1', orgId: 'org-1', passingScore: 50, retryLimit: 0,
  questions: [
    { type: 'single', points: 1, correctAnswerIndex: 0 },
    { type: 'single', points: 1, correctAnswerIndex: 1 },
  ],
  additionalQuestions: [{ type: 'single', points: 1, correctAnswerIndex: 2 }],
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.findFirst.mockResolvedValue(ASSESSMENT);
  h.masterFindMany.mockResolvedValue([]);
  h.progressFindFirst.mockResolvedValue(null);
  h.attemptFindMany.mockResolvedValue([]);
  h.progressCreate.mockResolvedValue({ id: 'p1' });
  h.progressUpdate.mockResolvedValue({ id: 'p1' });
  h.attemptCreate.mockResolvedValue({ id: 'qa1' });
});

describe('submitQuiz grades the questions the learner was actually shown', () => {
  it('grades a proctored attempt by DISPLAYED position', async () => {
    // Manifest reorders to [Q1, Q0]. Learner answers pos0→1 (Q1 correct),
    // pos1→0 (Q0 correct). Both right ⇒ 100%.
    h.manifest.mockResolvedValue([{ pool: 'main', index: 1 }, { pool: 'main', index: 0 }]);
    const res = await submitQuiz('org-1', 'u1', {
      assessmentId: 'a1', courseId: 'c1', sessionId: 'sess1',
      answers: [{ questionId: '0', selectedAnswerIndex: 1 }, { questionId: '1', selectedAnswerIndex: 0 }],
    });
    expect(res.percentage).toBe(100);
    expect(res.passed).toBe(true);
  });

  it('the SAME answers against the raw bank would be all wrong — proof the manifest matters', async () => {
    const res = await submitQuiz('org-1', 'u1', {
      assessmentId: 'a1', courseId: 'c1',
      answers: [{ questionId: '0', selectedAnswerIndex: 1 }, { questionId: '1', selectedAnswerIndex: 0 }],
    });
    expect(res.percentage).toBe(0);
    expect(h.manifest).not.toHaveBeenCalled(); // no sessionId ⇒ no manifest lookup
  });

  it('pulls a question from the additional pool when the manifest says so', async () => {
    h.manifest.mockResolvedValue([{ pool: 'additional', index: 0 }]);
    const res = await submitQuiz('org-1', 'u1', {
      assessmentId: 'a1', courseId: 'c1', sessionId: 'sess1',
      answers: [{ questionId: '0', selectedAnswerIndex: 2 }], // additional Q correct=2
    });
    expect(res.percentage).toBe(100);
  });

  it('falls back to the raw bank when the session has no manifest', async () => {
    h.manifest.mockResolvedValue(undefined);
    const res = await submitQuiz('org-1', 'u1', {
      assessmentId: 'a1', courseId: 'c1', sessionId: 'sess1',
      answers: [{ questionId: '0', selectedAnswerIndex: 0 }, { questionId: '1', selectedAnswerIndex: 1 }],
    });
    expect(res.percentage).toBe(100);
  });

  it('drops out-of-range manifest entries instead of scoring undefined', async () => {
    h.manifest.mockResolvedValue([{ pool: 'main', index: 0 }, { pool: 'main', index: 99 }]);
    const res = await submitQuiz('org-1', 'u1', {
      assessmentId: 'a1', courseId: 'c1', sessionId: 'sess1',
      answers: [{ questionId: '0', selectedAnswerIndex: 0 }],
    });
    // Only the valid entry is scored — 1/1 ⇒ 100%.
    expect(res.percentage).toBe(100);
    expect(res.totalQuestions).toBe(1);
  });
});
