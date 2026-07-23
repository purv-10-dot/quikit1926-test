/**
 * `POST /api/learner/submit-quiz` is the ONLY caller permitted to complete a
 * quiz lesson.
 *
 * `progress-service.quizCompletionAllowed` refuses to mark a quiz lesson done
 * unless the write carries `quizGraded: true`, because the progress endpoints
 * are public API and a client-side fix cannot close the hole on its own (see
 * `__tests__/unit/progress-quiz-gate.test.ts`). This route is where that flag is
 * set, immediately after `submitQuiz` has graded the attempt against the real
 * answer key.
 *
 * The flag is therefore load-bearing in BOTH directions, which is why it has its
 * own test:
 *   - drop it, and no learner can ever finish a course that ends in a quiz;
 *   - set it anywhere else, and the gate is meaningless.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  submitQuiz: vi.fn(),
  syncProgress: vi.fn(),
  generateCertificateForCompletion: vi.fn(),
  getLearnerCertificates: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/assessments-service', () => ({ submitQuiz: h.submitQuiz }));
vi.mock('@/lib/services/progress-service', () => ({ syncProgress: h.syncProgress }));
vi.mock('@/lib/services/certificates-service', () => ({
  generateCertificateForCompletion: h.generateCertificateForCompletion,
  getLearnerCertificates: h.getLearnerCertificates,
  getPresignedDownloadUrl: h.getPresignedDownloadUrl,
}));

import { POST } from '@/app/api/learner/submit-quiz/route';

const body = {
  assessmentId: 'quiz-abc',
  courseId: 'course-1',
  answers: [{ questionId: '0', selectedAnswerIndex: 1 }],
};

const req = () =>
  new Request('http://x/api/learner/submit-quiz', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue({ id: 'u1', orgId: 'org-1', role: 'LEARNER' });
  h.submitQuiz.mockResolvedValue({
    percentage: 90,
    passed: true,
    attemptsRemaining: 2,
    score: 9,
    totalPoints: 10,
  });
  h.syncProgress.mockResolvedValue({ completionPercentage: 100 });
  h.getLearnerCertificates.mockResolvedValue([]);
  h.generateCertificateForCompletion.mockResolvedValue(undefined);
});

describe('submit-quiz is the grader', () => {
  it('re-syncs the course WITH quizGraded so the gate lets the quiz through', async () => {
    await POST(req(), { params: {} } as never);

    expect(h.syncProgress).toHaveBeenCalledTimes(1);
    expect(h.syncProgress.mock.calls[0][0]).toMatchObject({
      orgId: 'org-1',
      learnerId: 'u1',
      courseId: 'course-1',
      lessonId: 'quiz-abc',
      completionPercentage: 90,
      status: 'Completed',
      quizGraded: true,
    });
  });

  it('grades BEFORE it syncs — the flag must never precede a real attempt', async () => {
    const order: string[] = [];
    h.submitQuiz.mockImplementation(async () => {
      order.push('grade');
      return { percentage: 90, passed: true, attemptsRemaining: 2 };
    });
    h.syncProgress.mockImplementation(async () => {
      order.push('sync');
      return { completionPercentage: 100 };
    });

    await POST(req(), { params: {} } as never);
    expect(order).toEqual(['grade', 'sync']);
  });

  it('still passes quizGraded on a FAILED attempt (the lesson is sat, not passed)', async () => {
    // A failure must reach the engine too: `submitQuiz` stores isCompleted=false
    // for it, and the sync is what re-derives the course percentage. Skipping it
    // on failure would freeze the course at its pre-attempt figure.
    h.submitQuiz.mockResolvedValue({ percentage: 20, passed: false, attemptsRemaining: 1 });
    h.syncProgress.mockResolvedValue({ completionPercentage: 60 });

    await POST(req(), { params: {} } as never);
    expect(h.syncProgress.mock.calls[0][0]).toMatchObject({
      completionPercentage: 20,
      quizGraded: true,
    });
  });

  it('does not issue a certificate below 100% course completion', async () => {
    h.syncProgress.mockResolvedValue({ completionPercentage: 80 });
    await POST(req(), { params: {} } as never);
    expect(h.generateCertificateForCompletion).not.toHaveBeenCalled();
  });

  it('issues the certificate once the course reaches 100%', async () => {
    h.syncProgress.mockResolvedValue({ completionPercentage: 100 });
    await POST(req(), { params: {} } as never);
    expect(h.generateCertificateForCompletion).toHaveBeenCalledWith('org-1', 'u1', 'course-1');
  });
});
