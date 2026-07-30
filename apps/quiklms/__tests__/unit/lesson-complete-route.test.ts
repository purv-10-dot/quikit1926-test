/**
 * `POST /progress/:courseId/lesson/:lessonId/complete` has NO counterpart in the
 * NestJS original — the port invented it, and its hand-rolled implementation
 * wrote a progress shape nothing reads:
 *
 *   - stored `{ completed: true }`, but `isResourceCompleted` only looks at
 *     `isCompleted` / `completionPercentage`, so the lesson still counted as
 *     incomplete;
 *   - overwrote `completionPercentage` with a naive lesson count that ignored
 *     quizzes;
 *   - hardcoded the status, so it could not produce `Overdue` and would
 *     silently downgrade one;
 *   - never triggered certificate issuance; and
 *   - collapsed every error into `success: true`.
 *
 * It now delegates to `syncProgress`, the engine every other write path uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ requireAuth: vi.fn(), syncProgress: vi.fn() }));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/services/progress-service', () => ({ syncProgress: h.syncProgress }));
vi.mock('@/lib/db', () => ({ db: {} }));

import { POST } from '@/app/api/progress/[courseId]/lesson/[lessonId]/complete/route';

const req = () => new Request('http://x/api/progress/c1/lesson/l1/complete', { method: 'POST' }) as never;
const ctx = { params: { courseId: 'c1', lessonId: 'l1' } };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue({ id: 'u1', orgId: 'org-1', role: 'LEARNER' });
  h.syncProgress.mockResolvedValue({ completionPercentage: 40, status: 'InProgress' });
});

describe('lesson-complete delegates to the real progress engine', () => {
  it('calls syncProgress with the lesson marked complete', async () => {
    await POST(req(), ctx);
    expect(h.syncProgress).toHaveBeenCalledWith({
      orgId: 'org-1',
      learnerId: 'u1',
      courseId: 'c1',
      lessonId: 'l1',
      completionPercentage: 100,
      status: 'Completed',
    });
  });

  it('returns the ENGINE-computed percentage, not a naive lesson count', async () => {
    h.syncProgress.mockResolvedValue({ completionPercentage: 73, status: 'InProgress' });
    const body = await (await POST(req(), ctx)).json();
    expect(body.data.completionPercentage).toBe(73);
  });

  it('surfaces the derived status, including Overdue', async () => {
    h.syncProgress.mockResolvedValue({ completionPercentage: 50, status: 'Overdue' });
    const body = await (await POST(req(), ctx)).json();
    expect(body.data.status).toBe('Overdue');
  });

  it('no longer swallows a failure as success', async () => {
    h.syncProgress.mockRejectedValue(new Error('db down'));
    // route() converts the throw into a 500 envelope; the point is that it is
    // NOT reported as { success: true }.
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ statusCode: 500 });
  });

  it('400s without tenant context instead of writing under an empty orgId', async () => {
    h.requireAuth.mockResolvedValue({ id: 'u1', orgId: null, role: 'LEARNER' });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(400);
    expect(h.syncProgress).not.toHaveBeenCalled();
  });
});
