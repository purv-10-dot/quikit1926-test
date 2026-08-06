// @vitest-environment jsdom
/**
 * Randomized quizzes were completely inert in production, and — far worse —
 * scores were effectively random.
 *
 * `QuizTakingComponent` (the LIVE quiz UI, rendered by ProctoredQuizWrapper from
 * both players) fetched `/assessments/:id` with NO `sessionId`, even though it
 * received one as a prop and sent it on submit. The proctoring session is what
 * pins the randomized subset, so without it the server had no manifest and
 * returned the full bank in author order. Three failures followed from that one
 * omission:
 *
 *  1. `questionsToShow` / `randomizeQuestions` had no visible effect.
 *  2. SCORING MISMATCH — submit keys answers by DISPLAYED index, while the
 *     server rebuilds `questionsToScore` from the manifest (a shuffled, often
 *     shorter list) and matches by index. Index n of the full bank was graded
 *     against index n of the shuffled subset.
 *  3. Answer-key leak — the redaction in the route only runs on the `sessionId`
 *     branch, so `correctAnswerIndex` and the whole `additionalQuestions` pool
 *     went to the client.
 *
 * `InteractiveQuizComponent` had it right all along but is imported and never
 * rendered — the correct implementation was dead code while the broken one shipped.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: h.get, post: h.post } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { QuizTakingComponent } from '@/components/learner/QuizTakingComponent';

const ASSESSMENT = {
  _id: 'a1',
  title: 'Safety Quiz',
  passingScore: 70,
  questions: [
    { text: 'Q1', type: 'MCQ', options: ['a', 'b'], correctAnswerIndex: 0, points: 1 },
    { text: 'Q2', type: 'MCQ', options: ['a', 'b'], correctAnswerIndex: 1, points: 1 },
  ],
};

const props = {
  assessmentId: 'a1',
  courseId: 'c1',
  onComplete: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.get.mockResolvedValue({ success: true, data: ASSESSMENT });
});
afterEach(cleanup);

describe('the quiz fetch carries the proctoring session', () => {
  it('appends sessionId so the server can serve the pinned subset', async () => {
    render(<QuizTakingComponent {...props} sessionId="sess-123" />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(h.get.mock.calls[0][0]).toBe('/assessments/a1?sessionId=sess-123');
  });

  it('url-encodes a session id rather than splicing it in raw', async () => {
    render(<QuizTakingComponent {...props} sessionId="a/b c&d" />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(h.get.mock.calls[0][0]).toBe(`/assessments/a1?sessionId=${encodeURIComponent('a/b c&d')}`);
  });

  it('falls back to the bare path when there is genuinely no session', async () => {
    render(<QuizTakingComponent {...props} />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(h.get.mock.calls[0][0]).toBe('/assessments/a1');
  });

  it('refetches once the session id arrives — it resolves after first render', async () => {
    // ProctoredQuizWrapper starts the session asynchronously and passes the id
    // down on a later render. Without sessionId in the effect deps the component
    // keeps the unsliced bank for the whole attempt.
    const { rerender } = render(<QuizTakingComponent {...props} sessionId={undefined} />);
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(1));
    expect(h.get.mock.calls[0][0]).toBe('/assessments/a1');

    rerender(<QuizTakingComponent {...props} sessionId="sess-late" />);
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    expect(h.get.mock.calls[1][0]).toBe('/assessments/a1?sessionId=sess-late');
  });

  it('renders the questions the server returned, not a client-side selection', async () => {
    // The subset is the SERVER's decision — the client must not slice or reorder,
    // or the displayed indices stop matching the manifest the server scores against.
    h.get.mockResolvedValue({
      success: true,
      data: { ...ASSESSMENT, questions: [ASSESSMENT.questions[1]] },
    });
    render(<QuizTakingComponent {...props} sessionId="s1" />);
    await waitFor(() => expect(screen.getByText(/Q2/)).toBeTruthy());
    expect(screen.queryByText(/Q1/)).toBeNull();
  });
});
