// @vitest-environment jsdom
/**
 * Tenant course authoring routes to the Master Course Studio.
 *
 * This page used to hold a reduced 1,126-line wizard whose lesson model was
 * `{title, videoUrl, duration, description}`. Two failures came out of that:
 *
 *  1. A tenant admin could not author a quiz at all — the wizard never emitted
 *     `quiz` or `moduleEndQuiz`, and this route is the ONLY course-authoring
 *     entry point linked from the tenant course list, My Submissions, and
 *     School Courses (6 links, all here).
 *  2. Editing an existing course DESTROYED it — the wizard kept only the first
 *     video-ish resource per sub-module, and save writes `modules` wholesale,
 *     so quizzes, non-video resources and sub-module structure were silently
 *     deleted.
 *
 * The Studio already accepted `isTenantAdmin` / `approvalEnabled` (it hides
 * Distribution and Publish, and switches the save label); it was just never
 * wired here. These assert the wiring, because the wiring IS the fix.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  params: new Map<string, string>(),
  studioProps: vi.fn(),
  config: { approvalWorkflowEnabled: true } as Record<string, unknown> | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => ({ get: (k: string) => h.params.get(k) ?? null }),
}));
vi.mock('@/app/providers', () => ({ useFeatures: () => ({ config: h.config }) }));
vi.mock('react-hot-toast', () => ({
  Toaster: () => null,
  default: { success: vi.fn(), error: vi.fn() },
}));
// Capture what the page hands the Studio — that contract is the whole fix.
vi.mock('@/components/MasterCourseStudio', () => ({
  default: (props: Record<string, unknown>) => {
    h.studioProps(props);
    return <div data-testid="studio">Master Course Studio</div>;
  },
}));

import TenantCourseCreatorPage from '@/app/(tenant-admin)/create-course/page';

beforeEach(() => {
  h.push.mockReset();
  h.studioProps.mockReset();
  h.params.clear();
  h.config = { approvalWorkflowEnabled: true };
});
afterEach(cleanup);

describe('creating a new course', () => {
  it('shows the launch screen before opening the studio', () => {
    render(<TenantCourseCreatorPage />);
    expect(screen.getByText('Open Course Studio')).toBeTruthy();
    expect(screen.queryByTestId('studio')).toBeNull();
  });

  it('advertises the quiz builder — the capability the wizard never had', () => {
    render(<TenantCourseCreatorPage />);
    expect(screen.getByText('Quiz Builder')).toBeTruthy();
  });

  it('opens the studio as a TENANT ADMIN, not as a super admin', () => {
    render(<TenantCourseCreatorPage />);
    fireEvent.click(screen.getByText('Open Course Studio'));

    expect(screen.getByTestId('studio')).toBeTruthy();
    expect(h.studioProps.mock.calls.at(-1)![0]).toMatchObject({
      isTenantAdmin: true,
      approvalEnabled: true,
      courseId: undefined,
    });
  });
});

describe('editing an existing course', () => {
  it('mounts the studio directly and passes the course id through', () => {
    h.params.set('courseId', 'course-42');
    render(<TenantCourseCreatorPage />);

    // No launch screen — the author already clicked Edit.
    expect(screen.getByTestId('studio')).toBeTruthy();
    expect(h.studioProps.mock.calls.at(-1)![0]).toMatchObject({
      courseId: 'course-42',
      isTenantAdmin: true,
    });
  });

  it('returns to My Submissions on success', () => {
    h.params.set('courseId', 'course-42');
    render(<TenantCourseCreatorPage />);
    (h.studioProps.mock.calls.at(-1)![0].onSuccess as () => void)();
    expect(h.push).toHaveBeenCalledWith('/my-submissions');
  });

  it('returns to My Submissions on close when editing', () => {
    h.params.set('courseId', 'course-42');
    render(<TenantCourseCreatorPage />);
    (h.studioProps.mock.calls.at(-1)![0].onClose as () => void)();
    expect(h.push).toHaveBeenCalledWith('/my-submissions');
  });

  it('closing a FRESH draft steps back rather than navigating away', () => {
    render(<TenantCourseCreatorPage />);
    fireEvent.click(screen.getByText('Open Course Studio'));
    // onClose flips state, so it must run inside act() to flush the re-render.
    act(() => (h.studioProps.mock.calls.at(-1)![0].onClose as () => void)());

    expect(h.push).not.toHaveBeenCalled();
    expect(screen.getByText('Open Course Studio')).toBeTruthy();
  });
});

describe('the approval workflow toggle', () => {
  it('warns that courses need approval by default', () => {
    render(<TenantCourseCreatorPage />);
    expect(screen.getByText('Approval Required:')).toBeTruthy();
    expect(screen.getByText('Requires Approval')).toBeTruthy();
  });

  it('says direct publish only when explicitly disabled', () => {
    h.config = { approvalWorkflowEnabled: false };
    render(<TenantCourseCreatorPage />);
    expect(screen.getByText('Direct Publish:')).toBeTruthy();
  });

  it('defaults to REQUIRING approval when config is absent — fail closed', () => {
    // Only an explicit `false` disables it, matching the reference. Defaulting
    // the other way would auto-publish tenant content on a config read failure.
    h.config = null;
    render(<TenantCourseCreatorPage />);
    expect(screen.getByText('Approval Required:')).toBeTruthy();
  });

  it('forwards the resolved flag to the studio', () => {
    h.config = { approvalWorkflowEnabled: false };
    render(<TenantCourseCreatorPage />);
    fireEvent.click(screen.getByText('Open Course Studio'));
    expect(h.studioProps.mock.calls.at(-1)![0]).toMatchObject({ approvalEnabled: false });
  });
});
