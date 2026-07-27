/**
 * COURSE COMPLETION MUST BE REACHABLE — and must require the quiz.
 *
 * Two independent walks of the same MasterCourse JSON decide whether a learner
 * can ever finish a course:
 *
 *   `transformMasterCourseForPlayer` (courses-service) — produces the lesson
 *      list the PLAYER renders and reports progress against, keyed by `_id`.
 *   `extractLessonEntriesFromMasterCourse` (progress-service) — produces the
 *      lesson list the ENGINE counts when deciding `allAccessed`.
 *
 * They are hand-mirrored: same traversal order, same `lesson_M_N` / `quiz_M_N` /
 * `module_quiz_M` fallback naming, same de-duplication. If they ever drift by a
 * single id, `completedLessons === totalLessons` can never hold and the course
 * sticks below 100% forever — no completion, no certificate, and nothing in the
 * UI to explain why. Live data showed zero `Completed` progress rows, so this is
 * not a theoretical failure mode.
 *
 * This test drives the REAL transform into the REAL engine and asserts the two
 * agree, then asserts the quiz genuinely gates the result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  progressFindUnique: vi.fn(),
  progressUpsert: vi.fn(),
  assignmentFindFirst: vi.fn(),
  masterFindUnique: vi.fn(),
  moduleFindMany: vi.fn(),
  generateCertificate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/s3', () => ({
  presignFromUrlOrKey: vi.fn(async (v: string) => v),
  isManagedStorageUrl: () => false,
  S3_BUCKET: 'b',
}));
vi.mock('@/lib/services/certificates-service', () => ({
  generateCertificateForCompletion: h.generateCertificate,
  getLearnerCertificates: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsProgress: {
      findUnique: h.progressFindUnique,
      findFirst: vi.fn(),
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

import { transformMasterCourseForPlayer } from '@/lib/services/courses-service';
import { syncProgress } from '@/lib/services/progress-service';

/**
 * Deliberately exercises every branch both walks have to agree on:
 *   - a `resources[]` sub-module (multiple lessons from one sub-module)
 *   - a `resourceType`/`resourceData` sub-module
 *   - a text-only sub-module
 *   - a sub-module quiz
 *   - a module-end quiz
 *   - a second module, so the `_M_` index in the fallback ids matters
 */
const MASTER_COURSE = {
  id: 'course-1',
  title: 'Workplace Safety',
  modules: [
    {
      id: 'mod-1',
      title: 'Basics',
      subModules: [
        {
          id: 'sm-1',
          title: 'Intro',
          resources: [
            { id: 'res-1', title: 'Welcome', type: 'video', url: 'https://example.test/a.mp4' },
            { id: 'res-2', title: 'Handbook', type: 'pdf', url: 'https://example.test/a.pdf' },
          ],
        },
        {
          id: 'sm-2',
          title: 'Deep dive',
          resourceType: 'upload',
          resourceData: { videoUrl: 'https://example.test/b.mp4' },
          quiz: { id: 'quiz-sm2', title: 'Check', questions: [{ text: 'q1' }] },
        },
        { id: 'sm-3', title: 'Notes', learningObjective: 'Remember the rules' },
      ],
      moduleEndQuiz: { id: 'quiz-mod1', title: 'Module test', questions: [{ text: 'q2' }] },
    },
    {
      id: 'mod-2',
      title: 'Advanced',
      subModules: [
        {
          id: 'sm-4',
          title: 'Advanced video',
          resourceType: 'youtube',
          resourceData: { youtubeUrl: 'https://youtu.be/xyz' },
        },
      ],
    },
  ],
};

/** Every lesson id the PLAYER would render, in player order. */
function playerLessonIds(): string[] {
  const course = transformMasterCourseForPlayer(MASTER_COURSE as never) as {
    modules: Array<{ lessons: Array<{ _id: string; type: string }> }>;
  };
  return course.modules.flatMap((m) => m.lessons.map((l) => l._id));
}

function playerQuizIds(): string[] {
  const course = transformMasterCourseForPlayer(MASTER_COURSE as never) as {
    modules: Array<{ lessons: Array<{ _id: string; type: string }> }>;
  };
  return course.modules.flatMap((m) => m.lessons.filter((l) => l.type === 'Quiz').map((l) => l._id));
}

/** A lessonProgress map marking the given ids complete, as a real attempt would. */
function completed(ids: string[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const id of ids) {
    out[id] = { lessonId: id, isCompleted: true, completionPercentage: 100, attempted: true };
  }
  return out;
}

const written = () => h.progressUpsert.mock.calls[0][0].update;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.assignmentFindFirst.mockResolvedValue(null);
  h.masterFindUnique.mockResolvedValue(MASTER_COURSE);
  h.moduleFindMany.mockResolvedValue([]);
  h.generateCertificate.mockResolvedValue(undefined);
  h.progressUpsert.mockImplementation(async ({ update }: never) => ({
    id: 'p1',
    ...(update as Record<string, unknown>),
  }));
});

const sync = (lessonProgress: Record<string, unknown>, over: Record<string, unknown> = {}) => {
  h.progressFindUnique.mockResolvedValue({
    id: 'p1',
    status: 'InProgress',
    completionPercentage: 50,
    lessonProgress,
  });
  return syncProgress({
    orgId: 'org-1',
    learnerId: 'u1',
    courseId: 'course-1',
    ...over,
  } as never);
};

describe('the player and the progress engine agree on the lesson set', () => {
  it('produces a non-trivial lesson list covering every sub-module shape', () => {
    const ids = playerLessonIds();
    // 2 resources + 1 upload + 1 sub-quiz + 1 text + 1 module quiz + 1 youtube
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7); // no duplicate keys
    expect(playerQuizIds()).toEqual(['quiz-sm2', 'quiz-mod1']);
  });

  it('reaches 100% and Completed when every player lesson is done', async () => {
    await sync(completed(playerLessonIds()), { lessonId: 'res-1', completionPercentage: 100 });
    expect(written().completionPercentage).toBe(100);
    expect(written().status).toBe('Completed');
  });

  it('issues the certificate on that first completion', async () => {
    await sync(completed(playerLessonIds()), { lessonId: 'res-1', completionPercentage: 100 });
    expect(h.generateCertificate).toHaveBeenCalledWith('org-1', 'u1', 'course-1');
  });

  it('stays below 100% while a single content lesson is outstanding', async () => {
    const all = playerLessonIds();
    await sync(completed(all.slice(0, -1)), { lessonId: 'res-1', completionPercentage: 100 });
    expect(written().completionPercentage).toBeLessThan(100);
    expect(written().status).not.toBe('Completed');
  });
});

describe('the quiz genuinely gates completion', () => {
  it('stays below 100% while the sub-module quiz is unpassed', async () => {
    const withoutQuiz = playerLessonIds().filter((id) => id !== 'quiz-sm2');
    await sync(completed(withoutQuiz), { lessonId: 'res-1', completionPercentage: 100 });
    expect(written().completionPercentage).toBeLessThan(100);
    expect(h.generateCertificate).not.toHaveBeenCalled();
  });

  it('stays below 100% while the module-end quiz is unpassed', async () => {
    const withoutQuiz = playerLessonIds().filter((id) => id !== 'quiz-mod1');
    await sync(completed(withoutQuiz), { lessonId: 'res-1', completionPercentage: 100 });
    expect(written().completionPercentage).toBeLessThan(100);
    expect(h.generateCertificate).not.toHaveBeenCalled();
  });

  it('a FAILED quiz attempt does not count as completion', async () => {
    const progress = completed(playerLessonIds());
    progress['quiz-sm2'] = {
      lessonId: 'quiz-sm2',
      isCompleted: false, // graded, but below the passing score
      completionPercentage: 40,
      attempted: true,
    };
    await sync(progress, { lessonId: 'res-1', completionPercentage: 100 });
    expect(written().completionPercentage).toBeLessThan(100);
    expect(written().status).not.toBe('Completed');
  });

  it('cannot be finished by faking the quiz through the sync endpoint', async () => {
    // Everything except the quiz is legitimately done; the client then tries to
    // complete the quiz itself — the exact shape the retired /course-player
    // "Mark Complete" button sent.
    const withoutQuiz = playerLessonIds().filter((id) => id !== 'quiz-sm2');
    await sync(completed(withoutQuiz), {
      lessonId: 'quiz-sm2',
      completionPercentage: 100,
      status: 'Completed',
    });
    expect(written().completionPercentage).toBeLessThan(100);
    expect(written().status).not.toBe('Completed');
    expect(h.generateCertificate).not.toHaveBeenCalled();
  });

  it('IS finished when the grader completes that same last quiz', async () => {
    const withoutQuiz = playerLessonIds().filter((id) => id !== 'quiz-sm2');
    await sync(completed(withoutQuiz), {
      lessonId: 'quiz-sm2',
      completionPercentage: 100,
      status: 'Completed',
      quizGraded: true,
    });
    expect(written().completionPercentage).toBe(100);
    expect(written().status).toBe('Completed');
    expect(h.generateCertificate).toHaveBeenCalledWith('org-1', 'u1', 'course-1');
  });
});
