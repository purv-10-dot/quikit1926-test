// @vitest-environment jsdom
/**
 * The restyle is scoped to the tenant route.
 *
 * MasterCourseStudio is one component serving two surfaces: the tenant
 * /create-course route and the super-admin master-course builder. Only the
 * tenant one was in scope for the redesign, so `calm` branches the visual
 * language rather than replacing it.
 *
 * Asserting on classNames is normally a bad idea — it pins styling that ought
 * to be free to change. These tests deliberately assert on a *small, stable*
 * set of markers that encode the scope decision itself:
 *   - the tenant surface must not carry the decorative gradients
 *   - the super-admin surface must still carry them
 * If someone later restyles the super admin too, these should fail and make
 * that a conscious choice rather than an accident.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: h.get, post: h.post, put: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
    children({ innerRef: () => {}, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
    children({ innerRef: () => {}, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));
vi.mock('@/components/QuizBuilderAdvanced', () => ({ default: () => null }));
vi.mock('@/components/SubModuleResourceEngine', () => ({ default: () => null }));
vi.mock('@/lib/upload-client', () => ({
  uploadFileWithPreview: vi.fn(),
  SERVER_UPLOAD_MAX_BYTES: 100 * 1024 * 1024,
}));

import MasterCourseStudio from '@/components/MasterCourseStudio';

const noop = () => {};
const markup = () => document.body.innerHTML;

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.get.mockResolvedValue({ data: [] });
});
afterEach(cleanup);

describe('the tenant authoring surface', () => {
  beforeEach(async () => {
    render(<MasterCourseStudio isTenantAdmin approvalEnabled onClose={noop} onSuccess={noop} />);
    await screen.findByLabelText('Course title');
  });

  it('drops the decorative gradients', () => {
    expect(markup()).not.toContain('from-indigo-600 via-purple-600 to-pink-500');
    expect(markup()).not.toContain('bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500');
  });

  it('uses the tenant-themeable brand token rather than a hardcoded hue', () => {
    // brand-primary resolves from --brand-primary, which is set per tenant, so
    // the accent follows the tenant's own colour instead of a fixed purple.
    expect(markup()).toContain('bg-brand-primary');
  });

  it('keeps the tab strip to labels only', () => {
    expect(screen.getByText('Course Identity')).toBeTruthy();
    expect(screen.getByText('Modules & Content')).toBeTruthy();
    // The per-tab subtitles were navigation-weight decoration on a section switch.
    expect(screen.queryByText('Basic info & thumbnail')).toBeNull();
    expect(screen.queryByText('Structure your course')).toBeNull();
  });

  it('still states which workflow the course will follow — via the save button', () => {
    // The standalone approval note was removed as noise. The information is not
    // lost: the primary action names the workflow, which is where it actually
    // matters — at the moment the author is about to commit.
    expect(screen.getByRole('button', { name: /submit for approval/i })).toBeTruthy();
    expect(screen.queryByText(/approval is off/i)).toBeNull();
  });

  it('keeps the header free of counters the author can already see', () => {
    // The syllabus tree shows modules/sub-modules and each step shows its own
    // resource and quiz count, so repeating them above the title was noise
    // that pushed the actual work down the screen.
    expect(screen.queryByText(/1 modules/i)).toBeNull();
    expect(screen.queryByText(/1 sub-modules/i)).toBeNull();
    expect(screen.queryByText(/0 quizzes/i)).toBeNull();
    // NB: '0 resources' deliberately survives — that is step 2's own summary,
    // which is genuinely useful. Only the header duplicate was removed.
  });

  it('keeps the close control reachable by name', () => {
    // The icon-only button lost its visible label in the restyle, so it needs
    // an accessible one.
    expect(screen.getByLabelText('Close studio')).toBeTruthy();
  });
});

describe('the super-admin builder', () => {
  it('keeps its original gradient treatment and tab subtitles', async () => {
    render(<MasterCourseStudio onClose={noop} onSuccess={noop} />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());

    expect(markup()).toContain('from-indigo-600 via-purple-600 to-pink-500');
    expect(screen.getByText('Master Course Studio')).toBeTruthy();
    expect(screen.getByText('Basic info & thumbnail')).toBeTruthy();
  });
});
