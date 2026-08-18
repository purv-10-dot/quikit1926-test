// @vitest-environment jsdom
/**
 * `UniversalLMSPlayer` rendered `ProctoredQuizWrapper` for EVERY Quiz lesson,
 * with no feature check — while `LockedCoursePlayer` (the sibling player) has
 * always branched on `features.showQuizProctoring`.
 *
 * Corporate tenants resolve `showQuizProctoring:false` (`lib/features.ts`), and
 * so does any org whose `LmsTenant` row is missing — `requireQuizProctoring`
 * fails CLOSED on purpose. Every `/api/quiz-proctoring/*` route 403s for them.
 * So the learner got the proctoring disclosure screen, clicked "Accept & Start",
 * and `POST /quiz-proctoring/start` came back
 * "Quiz proctoring is not enabled for your organization." — printed into the
 * wrapper's error box. There was no path past that screen: the quiz was
 * unreachable for the whole org.
 *
 * These pin the surface each org actually gets.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
  // MUTATED in place, never reassigned. The player runs
  // `useEffect(() => setUser(currentUser), [currentUser])`, so a context hook
  // that returns a fresh object literal per render re-fires it forever — the
  // component renders until the worker dies of heap exhaustion. The real
  // providers hold both in state, so their identity is stable across renders.
  featureState: { features: {} as Record<string, boolean>, tenantType: 'corporate', loaded: true },
  userState: { user: { id: 'u1', _id: 'u1', orgId: 'org-1' } },
}));

vi.mock('@/lib/api', () => ({ api: { get: h.get, post: h.post, patch: h.patch } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ courseId: 'course-1' }),
  useRouter: () => ({ push: h.push }),
}));
vi.mock('@/app/providers', () => ({
  useFeatures: () => h.featureState,
  useCurrentUser: () => h.userState,
}));
// Stand-ins for the two quiz surfaces — the assertion is *which one* mounts.
vi.mock('@/components/learner/ProctoredQuizWrapper', () => ({
  default: () => <div data-testid="proctored-quiz" />,
}));
vi.mock('@/components/learner/QuizTakingComponent', () => ({
  default: () => <div data-testid="plain-quiz" />,
  QuizTakingComponent: () => <div data-testid="plain-quiz" />,
}));

import UniversalLMSPlayer from '@/components/learner/UniversalLMSPlayer';

const COURSE = {
  _id: 'course-1',
  title: 'Fire Safety',
  description: 'Mandatory training',
  modules: [
    {
      _id: 'm1',
      title: 'Module One',
      orderIndex: 0,
      // Quiz first in module 0 — `isQuizLocked(0, 0)` is false, so the
      // "Start Quiz" prompt surfaces with no prior progress.
      lessons: [
        { _id: 'l1', title: 'Knowledge Check', type: 'Quiz', orderIndex: 0, assessmentId: 'a1' },
      ],
    },
  ],
};

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.patch.mockReset();
  h.push.mockReset();
  h.featureState.features = { showQuizProctoring: false };
  h.featureState.loaded = true;
  h.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/courses/')) return { data: COURSE };
    if (url.startsWith('/progress/')) return { data: {} };
    return { data: {} };
  });
  h.patch.mockResolvedValue({});
  h.post.mockResolvedValue({ data: {} });
});
afterEach(() => cleanup());

/** Render, then click through the "Are you ready?" prompt onto the quiz surface. */
async function startQuiz() {
  render(<UniversalLMSPlayer />);
  const start = await screen.findByRole('button', { name: /start quiz/i });
  fireEvent.click(start);
}

describe('UniversalLMSPlayer — quiz surface follows showQuizProctoring', () => {
  it('runs a plain quiz when the org does NOT have quiz proctoring', async () => {
    h.featureState.features = { showQuizProctoring: false };
    await startQuiz();
    await waitFor(() => expect(screen.getByTestId('plain-quiz')).toBeTruthy());
    // The regression: this used to mount and 403 on "Accept & Start".
    expect(screen.queryByTestId('proctored-quiz')).toBeNull();
  });

  it('runs the proctored wrapper when the org DOES have quiz proctoring', async () => {
    h.featureState.features = { showQuizProctoring: true };
    await startQuiz();
    await waitFor(() => expect(screen.getByTestId('proctored-quiz')).toBeTruthy());
    expect(screen.queryByTestId('plain-quiz')).toBeNull();
  });

  it('mounts neither surface until the flags have loaded', async () => {
    // Pre-fetch, `features` is `{}` — indistinguishable from proctoring-off.
    // Acting on it would start a school learner's quiz unproctored.
    h.featureState.loaded = false;
    h.featureState.features = {};
    await startQuiz();
    await waitFor(() => expect(screen.queryByTestId('plain-quiz')).toBeNull());
    expect(screen.queryByTestId('proctored-quiz')).toBeNull();
  });

  it('falls back to the plain quiz when the features fetch failed', async () => {
    // providers.tsx sets `loaded:true` with `features:{}` on a failed fetch.
    // A learner must still be able to sit the quiz — proctoring is the extra,
    // not the gate.
    h.featureState.loaded = true;
    h.featureState.features = {};
    await startQuiz();
    await waitFor(() => expect(screen.getByTestId('plain-quiz')).toBeTruthy());
    expect(screen.queryByTestId('proctored-quiz')).toBeNull();
  });
});
