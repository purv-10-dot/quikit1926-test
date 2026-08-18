/**
 * Regression — certificates that could never be downloaded.
 *
 * THE DEFECT. `generateCertificateForCompletion` built its pass-criteria
 * snapshot from `progress.scorePercentage`, which is lesson-COMPLETION percent
 * (`progress-service.ts:409` writes `courseProgress.percentage` into it), not a
 * grade. Every learner who finishes a course has it set, including on courses
 * with no quiz at all. Meanwhile `isPassed` is `Boolean @default(false)` and is
 * written only by the grader, so on a no-quiz course it is `false` — meaning
 * "never sat one", not "failed".
 *
 * Combining the two stamped `passed: false` onto a certificate the issuance
 * guard (`:644`, which reads `quizScore`) had just decided to award.
 * `downloadGateBlocked` then refused it with "You need to meet the passing
 * criteria to download the certificate.", and because the snapshot is frozen at
 * issue time no retake or re-completion ever cleared it — the certificate was
 * un-downloadable forever.
 *
 * The learner never saw that message: the four download call sites saved the
 * error body to disk as `<Course>_Certificate.pdf`, so it surfaced as a corrupt
 * PDF ("Failed to load PDF document") instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  progressFindUnique: vi.fn(),
  certFindFirst: vi.fn(),
  certCreate: vi.fn(),
  certUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  courseFindFirst: vi.fn(),
  masterCourseFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  assignmentFindFirst: vi.fn(),
  templateFindMany: vi.fn(),
  templateFindUnique: vi.fn(),
  attemptFindFirst: vi.fn(),
  assessmentFindFirst: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({
  putObject: vi.fn(async () => undefined),
  getObjectBufferFrom: vi.fn(async () => null),
  S3_BUCKET: 'test-bucket',
  presignGet: vi.fn(async () => 'https://signed.test/x'),
  presignFromUrlOrKey: vi.fn(async () => 'https://signed.test/x'),
}));
vi.mock('@/lib/email', () => ({ sendTemplateEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsProgress: { findUnique: h.progressFindUnique },
    lmsCertificateIssued: { findFirst: h.certFindFirst, create: h.certCreate, update: h.certUpdate },
    lmsUser: { findUnique: h.userFindUnique },
    lmsCourse: { findFirst: h.courseFindFirst },
    lmsMasterCourse: { findUnique: h.masterCourseFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
    lmsCourseAssignment: { findFirst: h.assignmentFindFirst },
    lmsCertificate: { findMany: h.templateFindMany, findUnique: h.templateFindUnique },
    lmsQuizAttempt: { findFirst: h.attemptFindFirst },
    lmsAssessment: { findFirst: h.assessmentFindFirst },
  },
}));

import {
  downloadGateBlocked,
  generateCertificateForCompletion,
} from '@/lib/services/certificates-service';

describe('downloadGateBlocked', () => {
  it('does NOT block a certificate with no recorded score', () => {
    // The no-assessment course. Nothing to fail, so nothing to block on.
    expect(downloadGateBlocked({ passed: null, score: null, passingScore: null })).toBe(false);
  });

  it('does NOT block when `passed: false` has no score behind it', () => {
    // Precisely the poisoned shape the old snapshot produced. A stray boolean
    // must not revoke an awarded certificate on its own.
    expect(downloadGateBlocked({ passed: false, score: null, passingScore: 70 })).toBe(false);
  });

  it('blocks a genuine recorded failure', () => {
    expect(downloadGateBlocked({ passed: false, score: 40, passingScore: 70 })).toBe(true);
    expect(downloadGateBlocked({ passed: null, score: 40, passingScore: 70 })).toBe(true);
  });

  it('allows a genuine pass', () => {
    expect(downloadGateBlocked({ passed: true, score: 92, passingScore: 70 })).toBe(false);
  });

  it('treats a missing certificate as not blocked', () => {
    expect(downloadGateBlocked(null)).toBe(false);
  });
});

describe('generateCertificateForCompletion — pass-criteria snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.certFindFirst.mockResolvedValue(null);
    h.userFindUnique.mockResolvedValue({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.dev' });
    h.courseFindFirst.mockResolvedValue({ title: 'abc' });
    h.tenantFindUnique.mockResolvedValue({ id: 'org-1', featureConfig: {}, corporateConfig: {}, contactRoleInOrganization: 'Head' });
    h.assignmentFindFirst.mockResolvedValue(null);
    h.templateFindMany.mockResolvedValue([]);
    h.attemptFindFirst.mockResolvedValue(null);
    h.assessmentFindFirst.mockResolvedValue(null);
    h.certCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'i1', ...data,
    }));
    h.certUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'i1', ...data }));
  });

  /** The exact production shape: course finished, no quiz anywhere in it. */
  const NO_QUIZ_PROGRESS = {
    id: 'p1',
    orgId: 'org-1',
    learnerId: 'u1',
    courseId: 'c1',
    status: 'Completed',
    completionPercentage: 100,
    scorePercentage: 100, // lesson-completion percent, NOT a grade
    quizScore: null,
    isPassed: false, // schema default — the grader never ran
    completedAt: new Date('2026-08-13T00:00:00Z'),
  };

  it('does not stamp `passed: false` when the course has no quiz', async () => {
    h.progressFindUnique.mockResolvedValue(NO_QUIZ_PROGRESS);

    await generateCertificateForCompletion('org-1', 'u1', 'c1');

    expect(h.certCreate).toHaveBeenCalledTimes(1);
    const data = h.certCreate.mock.calls[0][0].data;
    expect(data.passed).toBeNull();
    // `scorePercentage` must not leak into the grade snapshot.
    expect(data.score).toBeNull();
    expect(downloadGateBlocked(data as never)).toBe(false);
  });

  it('records a real grade when the learner did sit a quiz', async () => {
    h.progressFindUnique.mockResolvedValue({ ...NO_QUIZ_PROGRESS, quizScore: 92, isPassed: true });
    h.attemptFindFirst.mockResolvedValue({ assessmentId: 'a1' });
    h.assessmentFindFirst.mockResolvedValue({ passingScore: 70 });

    await generateCertificateForCompletion('org-1', 'u1', 'c1');

    const data = h.certCreate.mock.calls[0][0].data;
    expect(data.score).toBe(92);
    expect(data.passingScore).toBe(70);
    expect(data.passed).toBe(true);
    expect(downloadGateBlocked(data as never)).toBe(false);
  });

  it('still refuses to issue at all when the learner failed the quiz', async () => {
    h.progressFindUnique.mockResolvedValue({ ...NO_QUIZ_PROGRESS, quizScore: 40, isPassed: false });

    await generateCertificateForCompletion('org-1', 'u1', 'c1');

    expect(h.certCreate).not.toHaveBeenCalled();
  });
});
