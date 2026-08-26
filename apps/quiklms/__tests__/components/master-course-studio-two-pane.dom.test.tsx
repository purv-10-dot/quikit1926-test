// @vitest-environment jsdom
/**
 * Sub-module editor: two-pane layout.
 *
 * The editor was a vertical accordion. That gave every section the same short,
 * fixed-height drawer, which was survivable for a title field and broke the
 * resource engine outright: choosing "Add URL" or "Rich Text" rendered a whole
 * form into ~19rem, so the form clipped its own heading and grew a second inner
 * scrollbar. A form needs a pane, not a drawer.
 *
 * Now: a fixed section rail on the left, one section rendered full-size beside
 * it. These tests cover the acceptance criteria that carry real risk —
 * particularly that switching sections does NOT lose typed input, and that only
 * one section is mounted at a time so nothing bleeds through.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act, within } from '@testing-library/react';

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
vi.mock('@/lib/upload-client', () => ({
  uploadFileWithPreview: vi.fn(),
  SERVER_UPLOAD_MAX_BYTES: 100 * 1024 * 1024,
}));

import MasterCourseStudio from '@/components/MasterCourseStudio';

const noop = () => {};

/* Scoped to the rail: the Studio tab bar also carries a "Modules & Content"
   button, so an unscoped /Content/ query matches two different things. */
const rail = () => within(screen.getByLabelText('Sub-module sections'));
const section = (name: string) => rail().getByRole('button', { name: new RegExp(name, 'i') });

async function go(name: string) {
  await act(async () => {
    section(name).click();
  });
}

/**
 * The Details pane's editable Title field, as opposed to the tree label.
 * queryAll, not getAll: absence is a valid answer here — that is exactly what
 * "Details is no longer mounted" looks like.
 */
const titleInput = (value: string) =>
  screen.queryAllByDisplayValue(value).find((el) => el.tagName === 'INPUT') as
    | HTMLInputElement
    | undefined;

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.get.mockResolvedValue({ data: [] });
  h.post.mockResolvedValue({ success: true, data: { _id: 'c1', modules: [] } });
  render(<MasterCourseStudio isTenantAdmin approvalEnabled={false} onClose={noop} onSuccess={noop} />);
});
afterEach(cleanup);

describe('the section rail', () => {
  it('lists all three sections and stays visible in every one', async () => {
    await screen.findByLabelText('Sub-module sections');
    for (const s of ['Details', 'Content', 'Checkpoint quiz']) {
      expect(rail().getByText(s)).toBeTruthy();
    }

    await go('Content');
    // The rail is persistent — it must not be swapped out with the pane.
    for (const s of ['Details', 'Content', 'Checkpoint quiz']) {
      expect(rail().getByText(s)).toBeTruthy();
    }
  });

  it('opens on Details by default', async () => {
    await screen.findByLabelText('Sub-module sections');
    expect(section('Details').getAttribute('aria-current')).toBe('true');
    expect(section('Content').getAttribute('aria-current')).toBeNull();
  });

  it('moves the active marker as sections are selected', async () => {
    await screen.findByLabelText('Sub-module sections');
    await go('Content');

    expect(section('Content').getAttribute('aria-current')).toBe('true');
    expect(section('Details').getAttribute('aria-current')).toBeNull();
  });

  it('shows a per-section completion state', async () => {
    await screen.findByLabelText('Sub-module sections');
    // The seeded sub-module has a title but no resources and no quiz.
    expect(section('Details').textContent).toContain('Sub-Module 1');
    expect(section('Content').textContent).toContain('0 resources');
    expect(section('Checkpoint quiz').textContent).toContain('Optional');
  });
});

describe('only one section is mounted at a time', () => {
  it('does not leave Details rendered behind Content', async () => {
    await screen.findByLabelText('Sub-module sections');
    expect(titleInput('Sub-Module 1')).toBeTruthy();

    await go('Content');

    expect(screen.getByText('Add URL')).toBeTruthy();
    // The syllabus tree still names the sub-module, so assert specifically that
    // the editable field is gone rather than the text.
    expect(titleInput('Sub-Module 1')).toBeUndefined();
  });

  it('does not leave Content rendered behind the quiz section', async () => {
    await screen.findByLabelText('Sub-module sections');
    await go('Content');
    expect(screen.getByText('Add URL')).toBeTruthy();

    await go('Checkpoint quiz');
    expect(screen.queryByText('Add URL')).toBeNull();
    expect(screen.getByText(/set up quiz/i)).toBeTruthy();
  });
});

describe('state survives switching sections', () => {
  it('keeps a typed title after leaving and returning', async () => {
    await screen.findByLabelText('Sub-module sections');

    fireEvent.change(titleInput('Sub-Module 1')!, {
      target: { value: 'Fire extinguisher basics' },
    });

    await go('Content');
    await go('Details');

    // The whole point of the criterion: nothing resets until save or close.
    expect(titleInput('Fire extinguisher basics')).toBeTruthy();
  });

  it('carries an edit made in one section into the save payload', async () => {
    await screen.findByLabelText('Sub-module sections');
    fireEvent.change(titleInput('Sub-Module 1')!, { target: { value: 'Renamed here' } });

    await go('Content');
    fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'A Course' } });
    await act(async () => {
      screen.getByRole('button', { name: /save & publish/i }).click();
    });
    await waitFor(() => expect(h.post).toHaveBeenCalled());

    expect(h.post.mock.calls.at(-1)![1].modules[0].subModules[0].title).toBe('Renamed here');
  });
});

describe('the Add-Link form renders inside the Content pane', () => {
  it('shows the form inline, not as a second modal', async () => {
    await screen.findByLabelText('Sub-module sections');
    await go('Content');

    await act(async () => {
      screen.getByText('Add URL').click();
    });

    // The form is on screen...
    expect(screen.getByPlaceholderText('https://example.com/resource')).toBeTruthy();
    // ...and the rail is still beside it, which would not be true of an overlay
    // stacked on top of the Studio.
    expect(rail().getByText('Checkpoint quiz')).toBeTruthy();
    expect(section('Content').getAttribute('aria-current')).toBe('true');
  });
});
