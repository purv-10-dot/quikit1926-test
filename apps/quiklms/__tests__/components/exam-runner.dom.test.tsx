// @vitest-environment jsdom
/**
 * GAP_REPORT §4b — `ExamRunner` had proctoring and a timer but NO question UI.
 * It rendered the literal placeholder "Exam question surface —" beside a debug
 * `tick` button, so a learner could not answer an exam at all.
 *
 * These tests drive the real component through disclosure → exam → submitted and
 * assert on rendered output + the API calls it makes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  proctoring: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: { post: h.post, patch: h.patch, get: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: h.replace }) }));
vi.mock('@/hooks/useProctoringEngine', () => ({ useProctoringEngine: h.proctoring }));

import ExamRunner from '@/components/players/ExamRunner';

const SESSION = {
  sessionId: 'sess-1',
  examTitle: 'Physics Final',
  duration: 60,
  totalMarks: 10,
  proctoringLevel: 'soft',
  instructions: '',
  status: 'in_progress',
  remainingSeconds: 600,
  answers: {},
  questions: [
    { _id: 'q1', text: 'What is 2+2?', type: 'mcq', points: 2, order: 0, options: [{ text: '3' }, { text: '4' }] },
    { _id: 'q2', text: 'The sky is blue.', type: 'true_false', points: 1, order: 1 },
    { _id: 'q3', text: 'Name a planet.', type: 'short_answer', points: 3, order: 2 },
    { _id: 'q4', text: 'Explain gravity.', type: 'long_answer', points: 4, order: 3 },
  ],
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.post.mockResolvedValue({ data: SESSION });
  h.patch.mockResolvedValue({});
  // jsdom implements neither fullscreen API.
  (document.documentElement as any).requestFullscreen = vi.fn().mockResolvedValue(undefined);
  (document as any).exitFullscreen = vi.fn().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

/** An MCQ option's label — a <span>. Disambiguates from the navigator buttons,
 *  which render the same digits. */
const option = (label: string) => screen.getByText(label, { selector: 'span' });

/** Click through the disclosure gate into the exam. */
async function startExam() {
  render(<ExamRunner examId="exam-1" />);
  fireEvent.click(screen.getByText('Accept & Start Exam'));
  await waitFor(() => expect(screen.getByText('Physics Final')).toBeTruthy());
}

describe('disclosure phase', () => {
  it('shows the rules and does NOT start the session on mount', async () => {
    render(<ExamRunner examId="exam-1" />);

    expect(screen.getByText('Proctored Exam')).toBeTruthy();
    // The session — and therefore the server-authoritative timer — must not
    // begin before the learner accepts.
    expect(h.post).not.toHaveBeenCalled();
  });

  it('starts the session only after Accept & Start', async () => {
    await startExam();
    expect(h.post).toHaveBeenCalledWith('/exam-sessions/exam-1/start');
  });

  it('surfaces a start failure instead of a blank screen', async () => {
    h.post.mockRejectedValue({ message: 'Exam is not open yet' });
    render(<ExamRunner examId="exam-1" />);
    fireEvent.click(screen.getByText('Accept & Start Exam'));
    await waitFor(() => expect(screen.getByText('Exam is not open yet')).toBeTruthy());
  });

  it('Go Back leaves without starting', () => {
    render(<ExamRunner examId="exam-1" />);
    fireEvent.click(screen.getByText('Go Back'));
    expect(h.replace).toHaveBeenCalledWith('/learner/exams');
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe('exam phase — the question surface that did not exist', () => {
  it('renders the first question with its options', async () => {
    await startExam();
    expect(screen.getByText('What is 2+2?')).toBeTruthy();
    expect(option('4')).toBeTruthy();
    expect(screen.getByText('Question 1 of 4')).toBeTruthy();
    expect(screen.getByText('2 points')).toBeTruthy();
  });

  it('no longer renders the placeholder or the debug tick button', async () => {
    await startExam();
    expect(screen.queryByText(/Exam question surface/)).toBeNull();
    expect(screen.queryByText('tick')).toBeNull();
  });

  it('records an MCQ answer and updates the answered count', async () => {
    await startExam();
    expect(screen.getByText('0/4 answered')).toBeTruthy();
    fireEvent.click(option('4'));
    await waitFor(() => expect(screen.getByText('1/4 answered')).toBeTruthy());
  });

  it('MCQ is single-select — a second choice replaces the first', async () => {
    await startExam();
    fireEvent.click(option('3'));
    fireEvent.click(option('4'));
    await waitFor(() => expect(screen.getByText('1/4 answered')).toBeTruthy());
  });

  it('navigates between questions and renders each answer type', async () => {
    await startExam();

    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('True')).toBeTruthy()); // true_false
    expect(screen.getByText('False')).toBeTruthy();

    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByPlaceholderText('Type your answer...')).toBeTruthy()); // short_answer

    fireEvent.click(screen.getByText('Next'));
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write your detailed answer...')).toBeTruthy(), // long_answer
    );
  });

  it('records a typed answer', async () => {
    await startExam();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    const input = await screen.findByPlaceholderText('Type your answer...');
    fireEvent.change(input, { target: { value: 'Mars' } });
    await waitFor(() => expect(screen.getByText('1/4 answered')).toBeTruthy());
  });

  it('whitespace alone does not count as answered', async () => {
    await startExam();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    const input = await screen.findByPlaceholderText('Type your answer...');
    fireEvent.change(input, { target: { value: '   ' } });
    await waitFor(() => expect(screen.getByText('0/4 answered')).toBeTruthy());
  });

  it('the navigator jumps to any question', async () => {
    await startExam();
    fireEvent.click(screen.getByText('4', { selector: 'button.w-8' }));
    await waitFor(() => expect(screen.getByText('Question 4 of 4')).toBeTruthy());
  });

  it('shows Review & Submit on the last question instead of Next', async () => {
    await startExam();
    fireEvent.click(screen.getByText('4', { selector: 'button.w-8' }));
    await waitFor(() => expect(screen.getByText('Review & Submit')).toBeTruthy());
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('resumes previously saved answers from the session', async () => {
    h.post.mockResolvedValue({ data: { ...SESSION, answers: { q1: { selectedOptionIndices: [1] } } } });
    await startExam();
    expect(screen.getByText('1/4 answered')).toBeTruthy();
  });

  it('renders the timer from the server-supplied remainingSeconds', async () => {
    await startExam();
    expect(screen.getByText('10:00')).toBeTruthy();
  });
});

describe('submit flow', () => {
  it('confirms before submitting, and warns about unanswered questions', async () => {
    await startExam();
    fireEvent.click(screen.getByText('Submit'));
    await waitFor(() => expect(screen.getByText('Submit Exam?')).toBeTruthy());
    expect(screen.getByText(/Some questions are unanswered/)).toBeTruthy();
  });

  it('Continue Exam aborts the submit', async () => {
    await startExam();
    fireEvent.click(screen.getByText('Submit'));
    fireEvent.click(await screen.findByText('Continue Exam'));
    await waitFor(() => expect(screen.queryByText('Submit Exam?')).toBeNull());
    expect(h.post).toHaveBeenCalledTimes(1); // start only
  });

  it('saves answers then submits, and shows the confirmation screen', async () => {
    await startExam();
    fireEvent.click(option('4')); // answer q1 so autosave has a delta
    fireEvent.click(screen.getByText('Submit'));
    fireEvent.click(await screen.findByText('Confirm Submit'));

    await waitFor(() => expect(screen.getByText('Exam Submitted!')).toBeTruthy());
    // Answers are flushed BEFORE submit — otherwise the last edits are lost.
    expect(h.patch).toHaveBeenCalledWith('/exam-sessions/sess-1/save', expect.objectContaining({ answers: expect.any(Object) }));
    expect(h.post).toHaveBeenCalledWith('/exam-sessions/sess-1/submit');
  });

  it('offers the exits from the submitted screen', async () => {
    await startExam();
    fireEvent.click(screen.getByText('Submit'));
    fireEvent.click(await screen.findByText('Confirm Submit'));
    await screen.findByText('Exam Submitted!');

    fireEvent.click(screen.getByText('My Exams'));
    expect(h.push).toHaveBeenCalledWith('/learner/exams');
  });
});

describe('proctoring wiring', () => {
  it('is disabled during disclosure and enabled once the exam starts', async () => {
    await startExam();
    const calls = h.proctoring.mock.calls.map((c) => c[0]);
    // First render (disclosure): no session, disabled.
    expect(calls[0]).toMatchObject({ sessionId: null, enabled: false });
    // After start: session bound and enabled.
    expect(calls.at(-1)).toMatchObject({ sessionId: 'sess-1', enabled: true });
  });

  it('stays disabled when the exam is not proctored', async () => {
    h.post.mockResolvedValue({ data: { ...SESSION, proctoringLevel: 'none' } });
    await startExam();
    expect(h.proctoring.mock.calls.at(-1)![0]).toMatchObject({ enabled: false });
  });
});
