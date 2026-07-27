/**
 * A QUIZ MAY ONLY BE COMPLETED BY SITTING IT.
 *
 * `updateProgress` / `syncProgress` take a `lessonId` and a completion figure
 * straight from the caller, and three public endpoints reach them:
 *   PATCH /api/player/sync
 *   POST  /api/progress
 *   POST  /api/progress/:courseId/lesson/:lessonId/complete
 *
 * Nothing checked what KIND of lesson was being completed. Since
 * `calculateOverallCourseProgress` counts quiz ids as lessons, posting
 * `{ lessonId: <quiz id>, completionPercentage: 100, status: 'Completed' }` for
 * every item took the course to 100% — which fires
 * `generateCertificateForCompletion`. A certificate, with zero questions
 * answered.
 *
 * That was not hypothetical: the retired `/course-player/:courseId` page could
 * not render a quiz, so it showed a plain "Mark Complete" button that did
 * exactly this, and it was the destination of the learner sidebar's
 * "My Courses" → Continue button.
 *
 * The gate lives in the service, not the player, because these are public
 * endpoints — a hand-rolled request bypasses any client-side fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  progressFindFirst: vi.fn(),
  progressFindUnique: vi.fn(),
  progressUpsert: vi.fn(),
  assignmentFindFirst: vi.fn(),
  masterFindUnique: vi.fn(),
  moduleFindMany: vi.fn(),
  generateCertificate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/services/certificates-service', () => ({
  generateCertificateForCompletion: h.generateCertificate,
  getLearnerCertificates: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsProgress: {
      findFirst: h.progressFindFirst,
      findUnique: h.progressFindUnique,
      upsert: h.progressUpsert,
      findMany: vi.fn(),
      update: vi.fn(),
    },
    lmsCourseAssignment: { findFirst: h.assignmentFindFirst },
    lmsCourse: { findFirst: vi.fn(), findUnique: vi.fn() },
    lmsMasterCourse: { findUnique: h.masterFindUnique, findMany: vi.fn() },
    lmsModule: { findMany: h.moduleFindMany },
    lmsLesson: { findMany: vi.fn() },
  },
}));

import { syncProgress, updateProgress } from '@/lib/services/progress-service';

const QUIZ_ID = 'quiz-abc';
const VIDEO_ID = 'video-abc';

/**
 * A master course with one video sub-module and one quiz. `extractLessonEntries…`
 * walks exactly this shape, so the ids below are the ids the engine counts.
 */
const MASTER_COURSE = {
  modules: [
    {
      id: 'm1',
      subModules: [
        {
          id: VIDEO_ID,
          resourceType: 'upload',
          resourceData: { videoUrl: 'https://example.test/v.mp4' },
          quiz: { id: QUIZ_ID, questions: [{ text: 'q1' }] },
        },
      ],
    },
  ],
};

const lessonProgressWritten = () =>
  (h.progressUpsert.mock.calls[0][0].update.lessonProgress ?? {}) as Record<
    string,
    Record<string, unknown>
  >;

const completionWritten = () => h.progressUpsert.mock.calls[0][0].update.completionPercentage;
const statusWritten = () => h.progressUpsert.mock.calls[0][0].update.status;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.progressFindFirst.mockResolvedValue(null);
  h.progressFindUnique.mockResolvedValue(null);
  h.assignmentFindFirst.mockResolvedValue(null);
  h.masterFindUnique.mockResolvedValue(MASTER_COURSE);
  h.moduleFindMany.mockResolvedValue([]);
  h.generateCertificate.mockResolvedValue(undefined);
  h.progressUpsert.mockImplementation(async ({ update }: never) => ({
    id: 'p1',
    status: (update as Record<string, unknown>).status,
    ...(update as Record<string, unknown>),
  }));
});

const sync = (over: Record<string, unknown>) =>
  syncProgress({ orgId: 'org-1', learnerId: 'u1', courseId: 'c1', ...over } as never);

describe('syncProgress — quiz completion gate', () => {
  it('refuses to complete a quiz lesson for an ordinary caller', async () => {
    await sync({ lessonId: QUIZ_ID, completionPercentage: 100, status: 'Completed' });
    expect(lessonProgressWritten()[QUIZ_ID]).toBeUndefined();
  });

  it('does not bank a partial score for the refused quiz either', async () => {
    // Downgrading `isCompleted` alone would not be enough: the stored
    // percentage is what `calculateOverallCourseProgress` averages, so a
    // rejected 100% must not be recorded as a 100-point score.
    await sync({ lessonId: QUIZ_ID, completionPercentage: 100, status: 'Completed' });
    expect(completionWritten()).toBeLessThan(100);
    expect(statusWritten()).not.toBe('Completed');
  });

  it('never issues a certificate off a faked quiz completion', async () => {
    await sync({ lessonId: QUIZ_ID, completionPercentage: 100, status: 'Completed' });
    expect(h.generateCertificate).not.toHaveBeenCalled();
  });

  it('ALLOWS the grader — quizGraded: true — to complete it', async () => {
    await sync({
      lessonId: QUIZ_ID,
      completionPercentage: 100,
      status: 'Completed',
      quizGraded: true,
    });
    expect(lessonProgressWritten()[QUIZ_ID]).toMatchObject({ isCompleted: true });
  });

  it('leaves an already-graded attempt untouched rather than overwriting it', async () => {
    h.progressFindUnique.mockResolvedValue({
      id: 'p1',
      status: 'InProgress',
      lessonProgress: {
        [QUIZ_ID]: { lessonId: QUIZ_ID, isCompleted: false, attempted: true, completionPercentage: 40 },
      },
    });
    await sync({ lessonId: QUIZ_ID, completionPercentage: 100, status: 'Completed' });
    expect(lessonProgressWritten()[QUIZ_ID]).toMatchObject({
      isCompleted: false,
      completionPercentage: 40,
    });
  });

  it('does NOT block ordinary content — a video still completes', async () => {
    await sync({ lessonId: VIDEO_ID, completionPercentage: 100, status: 'Completed' });
    expect(lessonProgressWritten()[VIDEO_ID]).toMatchObject({ isCompleted: true });
  });

  it('leaves sub-95% quiz heartbeats alone (no gate lookup, no write of completion)', async () => {
    await sync({ lessonId: QUIZ_ID, completionPercentage: 10 });
    expect(lessonProgressWritten()[QUIZ_ID]).toMatchObject({ isCompleted: false });
  });

  it('recognises the module-end quiz too', async () => {
    h.masterFindUnique.mockResolvedValue({
      modules: [
        {
          id: 'm1',
          subModules: [{ id: VIDEO_ID, resourceType: 'upload', resourceData: { videoUrl: 'u' } }],
          moduleEndQuiz: { id: 'end-quiz', questions: [{ text: 'q' }] },
        },
      ],
    });
    await sync({ lessonId: 'end-quiz', completionPercentage: 100, status: 'Completed' });
    expect(lessonProgressWritten()['end-quiz']).toBeUndefined();
  });

  it('gates relational courses via Module.assessmentId', async () => {
    h.masterFindUnique.mockResolvedValue(null); // not a master course
    h.moduleFindMany.mockResolvedValue([
      { assessmentId: 'assess-1', lessons: [{ id: 'l1', type: 'Video' }] },
    ]);
    await sync({ lessonId: 'assess-1', completionPercentage: 100, status: 'Completed' });
    expect(lessonProgressWritten()['assess-1']).toBeUndefined();
  });

  it('gates a relational lesson typed Quiz', async () => {
    h.masterFindUnique.mockResolvedValue(null);
    h.moduleFindMany.mockResolvedValue([
      { assessmentId: null, lessons: [{ id: 'l-quiz', type: 'Quiz' }] },
    ]);
    await sync({ lessonId: 'l-quiz', completionPercentage: 100, status: 'Completed' });
    expect(lessonProgressWritten()['l-quiz']).toBeUndefined();
  });

  it('fails OPEN on a lookup fault — a DB blip must not block real progress', async () => {
    h.masterFindUnique.mockRejectedValue(new Error('db down'));
    h.moduleFindMany.mockRejectedValue(new Error('db down'));
    await sync({ lessonId: VIDEO_ID, completionPercentage: 100, status: 'Completed' });
    expect(lessonProgressWritten()[VIDEO_ID]).toMatchObject({ isCompleted: true });
  });
});

describe('updateProgress — quiz completion gate', () => {
  const update = (over: Record<string, unknown>) =>
    updateProgress({ orgId: 'org-1', learnerId: 'u1', courseId: 'c1', ...over } as never);

  it('refuses to complete a quiz lesson from POST /api/progress', async () => {
    await update({ lessonId: QUIZ_ID, duration: 100, currentPosition: 100 });
    expect(lessonProgressWritten()[QUIZ_ID]).toBeUndefined();
    expect(h.generateCertificate).not.toHaveBeenCalled();
  });

  it('still completes a video lesson at full position', async () => {
    await update({ lessonId: VIDEO_ID, duration: 100, currentPosition: 100 });
    expect(lessonProgressWritten()[VIDEO_ID]).toMatchObject({ isCompleted: true });
  });
});
