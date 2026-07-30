/**
 * progress — `syncProgress` inlined a three-way status derivation copied from
 * `PlayerService.syncProgress`, which was DEAD CODE in the original:
 * `PlayerController` routed `PATCH /player/sync` to `ProgressService.syncProgress`
 * (`player.controller.ts:54`), which calls the lifecycle helpers
 * (`progress.service.ts:1035-1041`). The port merged the two files and kept the
 * dead one's logic.
 *
 * Two live consequences:
 *  1. STATUS FLAP — every write path wrote `InProgress` for a past-due learner;
 *     `getProgress` then recomputed `Overdue` and persisted it, so the badge
 *     flipped on every interaction and two endpoints disagreed about one record.
 *  2. SILENT DOWNGRADE — the inline branch only tested `'InProgress'`, so an
 *     existing `Overdue` row at 0% was written back as `NotStarted`, erasing the
 *     flag and under-counting overdue learners in compliance/manager reports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  progressFindFirst: vi.fn(),
  progressFindUnique: vi.fn(),
  progressUpsert: vi.fn(),
  assignmentFindFirst: vi.fn(),
  courseFindFirst: vi.fn(),
  masterFindUnique: vi.fn(),
  masterFindMany: vi.fn(),
  lessonFindMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/services/certificates-service', () => ({
  generateCertificateForCompletion: vi.fn(),
  getLearnerCertificates: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsProgress: { findFirst: h.progressFindFirst, findUnique: h.progressFindUnique, upsert: h.progressUpsert, findMany: vi.fn() },
    lmsCourseAssignment: { findFirst: h.assignmentFindFirst },
    lmsCourse: { findFirst: h.courseFindFirst, findUnique: vi.fn() },
    lmsMasterCourse: { findUnique: h.masterFindUnique, findMany: h.masterFindMany },
    lmsLesson: { findMany: h.lessonFindMany },
    lmsModule: { findMany: vi.fn() },
  },
}));

import { syncProgress } from '@/lib/services/progress-service';

const PAST = new Date(Date.now() - 7 * 86_400_000);
const FUTURE = new Date(Date.now() + 7 * 86_400_000);

const statusWritten = () => h.progressUpsert.mock.calls[0][0].update.status;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.progressFindFirst.mockResolvedValue(null);
  h.progressFindUnique.mockResolvedValue(null);
  h.assignmentFindFirst.mockResolvedValue(null); // no due date by default
  h.courseFindFirst.mockResolvedValue(null);
  h.masterFindUnique.mockResolvedValue(null);
  h.masterFindMany.mockResolvedValue([]);
  h.lessonFindMany.mockResolvedValue([]);
  h.progressUpsert.mockImplementation(async ({ update }: any) => ({ id: 'p1', ...update }));
});

const sync = (over: Record<string, unknown> = {}) =>
  syncProgress({ orgId: 'org-1', learnerId: 'u1', courseId: 'c1', ...over } as never);

describe('syncProgress honours the due date', () => {
  it('writes Overdue for a past-due learner instead of InProgress', async () => {
    h.assignmentFindFirst.mockResolvedValue({ dueDate: PAST });
    await sync({ completionPercentage: 40 });
    expect(statusWritten()).toBe('Overdue');
  });

  it('writes InProgress when the due date is still ahead', async () => {
    h.assignmentFindFirst.mockResolvedValue({ dueDate: FUTURE });
    await sync({ completionPercentage: 40 });
    expect(statusWritten()).toBe('InProgress');
  });

  it('does NOT downgrade an existing Overdue row to NotStarted at 0%', async () => {
    h.progressFindUnique.mockResolvedValue({ id: 'p1', status: 'Overdue', lessonProgress: {} });
    h.assignmentFindFirst.mockResolvedValue(null); // due date since removed
    await sync({ completionPercentage: 0 });
    expect(statusWritten()).not.toBe('NotStarted');
    expect(statusWritten()).toBe('InProgress');
  });

  it('Completed still wins over a past due date', async () => {
    h.assignmentFindFirst.mockResolvedValue({ dueDate: PAST });
    await sync({ completionPercentage: 100 });
    expect(statusWritten()).toBe('Completed');
  });

  it('stays NotStarted at 0% with no due date and no prior status', async () => {
    await sync({ completionPercentage: 0 });
    expect(statusWritten()).toBe('NotStarted');
  });

  it('looks the due date up for this learner + course', async () => {
    await sync({ completionPercentage: 10 });
    expect(h.assignmentFindFirst.mock.calls[0][0].where).toMatchObject({
      orgId: 'org-1', targetType: 'USER', targetId: 'u1', courseId: 'c1',
    });
  });
});
