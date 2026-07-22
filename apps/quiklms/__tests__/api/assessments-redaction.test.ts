/**
 * GAP_REPORT §2.4 — `GET /api/assessments/:id` lost its answer-key redaction.
 *
 * The legacy sliced the response to the exact question subset the proctoring
 * session locked in at start and deleted `additionalQuestions` from the wire
 * (`assessments.controller.ts:58-77`). The port ignored `sessionId` and returned
 * the full row, so proctored learners received `correctAnswerIndex` for every
 * question plus the entire bonus pool — strictly worse than the original.
 *
 * The stated rationale ("quiz-proctoring module not ported") was stale:
 * `lib/services/quiz-proctoring-service.ts` exists and serves the manifest.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findOne: vi.fn(),
  sessionFindUnique: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: vi.fn(),
  userHasRole: (u: any, r: string) => u?.role === r || u?.secondaryRole === r,
  tenantWhere: (_u: unknown, extra: object) => extra,
  assertTenantMatch: vi.fn(),
}));
// `redactAnswerKey` / `shouldRedactAnswerKey` are deliberately NOT stubbed —
// the real implementations run, so these tests exercise the actual redaction
// rather than a mock of it. Only the DB-touching `findOne` is faked.
vi.mock('@/lib/services/assessments-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/assessments-service')>();
  return { ...actual, findOne: h.findOne, update: vi.fn() };
});
vi.mock('@/lib/prisma', () => ({
  prisma: { lmsQuizProctoringSession: { findUnique: h.sessionFindUnique } },
}));

import { GET } from '@/app/api/assessments/[id]/route';

const ctx = { params: { id: 'a1' } };
const learner = { id: 'u1', role: 'LEARNER', secondaryRole: null, orgId: 'org-1', isActive: true };

/** q0..q3 main pool, b0..b1 bonus pool — each carrying its answer key. */
const assessment = {
  id: 'a1',
  title: 'Quiz',
  passingScore: 75,
  questions: [
    { q: 'q0', correctAnswerIndex: 0 },
    { q: 'q1', correctAnswerIndex: 1 },
    { q: 'q2', correctAnswerIndex: 2 },
    { q: 'q3', correctAnswerIndex: 3 },
  ],
  additionalQuestions: [
    { q: 'b0', correctAnswerIndex: 0 },
    { q: 'b1', correctAnswerIndex: 1 },
  ],
};

function req(sessionId?: string) {
  const qs = sessionId ? `?sessionId=${sessionId}` : '';
  return new Request(`http://x/api/assessments/a1${qs}`) as never;
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(learner);
  h.findOne.mockResolvedValue(assessment);
});

describe('GET /api/assessments/:id?sessionId=', () => {
  it('slices to the session manifest and hides the bonus pool', async () => {
    h.sessionFindUnique.mockResolvedValue({
      questionManifest: [
        { pool: 'main', index: 2 },
        { pool: 'additional', index: 1 },
        { pool: 'main', index: 0 },
      ],
      selectedQuestionIndices: [],
    });

    const res = await GET(req('sess-1'), ctx);
    const { data } = await res.json();

    // Exactly the locked-in subset, in manifest order.
    expect(data.questions.map((q: any) => q.q)).toEqual(['q2', 'b1', 'q0']);
    // The raw bonus pool must never reach the wire.
    expect(data).not.toHaveProperty('additionalQuestions');
    expect(JSON.stringify(data)).not.toContain('b0');
  });

  it('falls back to selectedQuestionIndices as the main pool', async () => {
    h.sessionFindUnique.mockResolvedValue({
      questionManifest: null,
      selectedQuestionIndices: [1, 3],
    });

    const { data } = await (await GET(req('sess-1'), ctx)).json();
    expect(data.questions.map((q: any) => q.q)).toEqual(['q1', 'q3']);
    expect(data).not.toHaveProperty('additionalQuestions');
  });

  it('prefers questionManifest over selectedQuestionIndices', async () => {
    h.sessionFindUnique.mockResolvedValue({
      questionManifest: [{ pool: 'main', index: 0 }],
      selectedQuestionIndices: [1, 2, 3],
    });
    const { data } = await (await GET(req('sess-1'), ctx)).json();
    expect(data.questions.map((q: any) => q.q)).toEqual(['q0']);
  });

  it('drops out-of-range manifest entries rather than emitting null', async () => {
    h.sessionFindUnique.mockResolvedValue({
      questionManifest: [
        { pool: 'main', index: 0 },
        { pool: 'main', index: 99 },
        { pool: 'main', index: -1 },
      ],
      selectedQuestionIndices: [],
    });
    const { data } = await (await GET(req('sess-1'), ctx)).json();
    expect(data.questions.map((q: any) => q.q)).toEqual(['q0']);
  });

  it('returns the same subset on a mid-attempt refresh', async () => {
    h.sessionFindUnique.mockResolvedValue({
      questionManifest: [{ pool: 'main', index: 3 }, { pool: 'main', index: 1 }],
      selectedQuestionIndices: [],
    });
    const first = await (await GET(req('sess-1'), ctx)).json();
    const second = await (await GET(req('sess-1'), ctx)).json();
    expect(first.data.questions).toEqual(second.data.questions);
  });

  /**
   * CONTRACT CORRECTED (F-008).
   *
   * These three previously asserted that the no-manifest branches return "the
   * full assessment", and passed — which is precisely why the answer-key leak
   * survived a green test suite. Slicing and redaction are different concerns:
   * the manifest decides WHICH questions a learner sees, redaction decides
   * whether the answers travel with them. The old contract only pinned the
   * first, so `correctAnswerIndex` shipped to the browser on every branch.
   *
   * The question COUNT expectations are kept (that part was always right); what
   * changes is that a learner must never receive the key on any branch.
   */
  it('returns every question with no sessionId, but WITHOUT the answer key', async () => {
    const { data } = await (await GET(req(), ctx)).json();
    expect(data.questions).toHaveLength(4);
    expect(data.additionalQuestions).toHaveLength(2);
    expect(h.sessionFindUnique).not.toHaveBeenCalled();
    expect(JSON.stringify(data)).not.toContain('correctAnswerIndex');
  });

  it('returns every question when the session has no manifest, still without the key', async () => {
    h.sessionFindUnique.mockResolvedValue({ questionManifest: null, selectedQuestionIndices: [] });
    const { data } = await (await GET(req('sess-1'), ctx)).json();
    expect(data.questions).toHaveLength(4);
    expect(JSON.stringify(data)).not.toContain('correctAnswerIndex');
  });

  it('returns every question when the session id is unknown, still without the key', async () => {
    h.sessionFindUnique.mockResolvedValue(null);
    const { data } = await (await GET(req('bogus'), ctx)).json();
    expect(data.questions).toHaveLength(4);
    expect(JSON.stringify(data)).not.toContain('correctAnswerIndex');
  });

  it('redacts the key on the sliced/proctored branch too', async () => {
    h.sessionFindUnique.mockResolvedValue({
      questionManifest: [{ pool: 'main', index: 2 }, { pool: 'additional', index: 1 }],
      selectedQuestionIndices: [],
    });
    const { data } = await (await GET(req('sess-1'), ctx)).json();
    expect(data.questions).toHaveLength(2);
    expect(JSON.stringify(data)).not.toContain('correctAnswerIndex');
  });

  it('serves the answer key to staff, who author and grade', async () => {
    h.requireAuth.mockResolvedValue({ ...learner, role: 'TEACHER' });
    const { data } = await (await GET(req(), ctx)).json();
    expect(JSON.stringify(data)).toContain('correctAnswerIndex');
  });

  it('does not mutate the cached assessment row across requests', async () => {
    h.sessionFindUnique.mockResolvedValue({
      questionManifest: [{ pool: 'main', index: 0 }],
      selectedQuestionIndices: [],
    });
    await GET(req('sess-1'), ctx);
    // The service's object must still be intact for the next caller.
    expect(assessment.questions).toHaveLength(4);
    expect(assessment.additionalQuestions).toHaveLength(2);
  });
});
