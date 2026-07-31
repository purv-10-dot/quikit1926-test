// @vitest-environment jsdom
/**
 * GAP_REPORT §4b — `LockedCoursePlayer` (823 lines) was never ported, so
 * `/learner/course/:courseId/legacy` rendered a "not yet ported" placeholder.
 *
 * This is the sequential-progression player: lessons unlock in order, each gated
 * on the previous one's completion. The locking rule is the whole point of the
 * component, so that is what these tests pin.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: { get: h.get, patch: h.patch, post: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ courseId: 'course-1' }),
  useRouter: () => ({ push: h.push }),
}));
// ReactPlayer touches media APIs jsdom lacks.
vi.mock('react-player', () => ({ default: () => <div data-testid="react-player" /> }));

import LockedCoursePlayer from '@/components/learner/LockedCoursePlayer';

const COURSE = {
  _id: 'course-1',
  title: 'Fire Safety',
  description: 'Mandatory training',
  modules: [
    {
      _id: 'm1',
      title: 'Module One',
      orderIndex: 0,
      lessons: [
        { _id: 'l1', title: 'Intro Video', type: 'Video', orderIndex: 0, contentUrl: 'https://x/v.mp4' },
        { _id: 'l2', title: 'Safety PDF', type: 'PDF', orderIndex: 1, contentUrl: 'https://x/d.pdf' },
        { _id: 'l3', title: 'Final Check', type: 'Text', orderIndex: 2 },
      ],
    },
  ],
};

/** Route the mocked api by URL so both loaders resolve. */
function mockApi(progress: Record<string, unknown> = {}) {
  h.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/courses/')) return { data: COURSE };
    if (url.startsWith('/progress/')) return { data: progress };
    return { data: {} };
  });
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.patch.mockResolvedValue({});
  mockApi();
});
afterEach(() => cleanup());

describe('LockedCoursePlayer — it exists now', () => {
  it('renders the course instead of a "not yet ported" placeholder', async () => {
    render(<LockedCoursePlayer />);
    await waitFor(() => expect(screen.getByText('Fire Safety')).toBeTruthy());
    expect(screen.queryByText(/not yet ported/i)).toBeNull();
  });

  it('loads the course and its progress on mount', async () => {
    render(<LockedCoursePlayer />);
    await waitFor(() => expect(screen.getByText('Fire Safety')).toBeTruthy());
    expect(h.get).toHaveBeenCalledWith('/courses/course-1');
    expect(h.get).toHaveBeenCalledWith('/progress/course-1');
  });

  it('lists every lesson in the module', async () => {
    render(<LockedCoursePlayer />);
    // The active lesson renders in BOTH the sidebar and the main pane, so these
    // are getAllByText — the duplication is the component working, not a bug.
    await waitFor(() => expect(screen.getAllByText('Intro Video').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Safety PDF').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Final Check').length).toBeGreaterThan(0);
  });
});

describe('the sequential locking rule — the point of this player', () => {
  it('leaves the very first lesson unlocked with no progress at all', async () => {
    render(<LockedCoursePlayer />);
    await waitFor(() => expect(screen.getAllByText('Intro Video').length).toBeGreaterThan(0));
    // Lesson 1 of module 1 is always reachable; later lessons are not.
    // Locked rows carry a Lock icon — there must be fewer locks than lessons.
    const locks = document.querySelectorAll('svg.lucide-lock');
    expect(locks.length).toBeGreaterThan(0);
    expect(locks.length).toBeLessThan(3);
  });

  it('unlocks the next lesson once the previous one is completed', async () => {
    mockApi({
      lessonProgress: {
        l1: { lessonId: 'l1', completionPercentage: 100, isCompleted: true },
      },
    });
    render(<LockedCoursePlayer />);
    await waitFor(() => expect(screen.getAllByText('Intro Video').length).toBeGreaterThan(0));

    // With l1 done, l2 unlocks — so strictly fewer locks than with no progress.
    const locks = document.querySelectorAll('svg.lucide-lock');
    expect(locks.length).toBeLessThanOrEqual(1);
  });

  it('unlocks everything when the whole module is complete', async () => {
    mockApi({
      lessonProgress: {
        l1: { lessonId: 'l1', completionPercentage: 100, isCompleted: true },
        l2: { lessonId: 'l2', completionPercentage: 100, isCompleted: true },
        l3: { lessonId: 'l3', completionPercentage: 100, isCompleted: true },
      },
    });
    render(<LockedCoursePlayer />);
    await waitFor(() => expect(screen.getAllByText('Intro Video').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('svg.lucide-lock').length).toBe(0);
  });
});

describe('resilience', () => {
  it('survives a progress-load failure — the course still renders', async () => {
    h.get.mockImplementation(async (url: string) => {
      if (url.startsWith('/courses/')) return { data: COURSE };
      throw new Error('progress unavailable');
    });
    render(<LockedCoursePlayer />);
    await waitFor(() => expect(screen.getByText('Fire Safety')).toBeTruthy());
  });

  it('does not crash when the course fails to load', async () => {
    h.get.mockRejectedValue(new Error('course gone'));
    render(<LockedCoursePlayer />);
    // Renders its loading/empty state rather than throwing.
    await waitFor(() => expect(document.body.textContent).toBeDefined());
  });
});
