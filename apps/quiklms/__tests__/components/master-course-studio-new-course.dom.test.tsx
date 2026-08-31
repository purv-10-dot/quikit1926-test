// @vitest-environment jsdom
/**
 * Studio entry state — how few clicks stand between opening the Studio and
 * doing real work.
 *
 * A tenant author used to pay three clicks before authoring anything:
 * "Open Course Studio" on an interstitial, then "Add New Module", then
 * "New Submodule" — with an "EMPTY SYLLABUS" placeholder in between. None of
 * those clicks carried a decision: nobody opens /create-course without wanting
 * the Studio, and nobody builds a course with zero modules.
 *
 * These tests pin the reduced entry path, and — just as importantly — pin the
 * two boundaries that keep it safe:
 *   - editing must never have structure injected into it (that would write a
 *     phantom module into a real course on the next save)
 *   - the super-admin master-course builder keeps its blank-slate behaviour,
 *     because this change was scoped to the tenant route only.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

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

/** An existing course with its own structure — used to prove nothing is injected. */
const EXISTING = {
  _id: 'course-7',
  title: 'Existing Course',
  level: 'Beginner',
  aiGeneratedThumbnail: false,
  status: 'Draft',
  selectedTenants: [],
  tags: [],
  settings: {
    sequentialProgression: false,
    certificateEnabled: false,
    passingScore: 70,
    allowRevisit: true,
    showProgressBar: true,
  },
  modules: [
    {
      id: 'existing-mod',
      title: 'Already Here',
      orderIndex: 0,
      subModules: [
        {
          id: 'existing-sub',
          title: 'Already Here Too',
          orderIndex: 0,
          resources: [],
          isPreviewable: false,
          completionThreshold: 80,
        },
      ],
    },
  ],
};

const noop = () => {};

/** Type a title into the header field and press the tenant save button. */
async function saveWithTitle(title: string) {
  const field = await screen.findByLabelText('Course title');
  fireEvent.change(field, { target: { value: title } });

  const btn = await screen.findByRole('button', { name: /save & publish|submit for approval/i });
  await act(async () => {
    btn.click();
  });
  await waitFor(() => expect(h.post).toHaveBeenCalled());
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.get.mockResolvedValue({ data: [] });
});
afterEach(cleanup);

describe('a tenant author opening a NEW course', () => {
  beforeEach(() => {
    render(<MasterCourseStudio isTenantAdmin approvalEnabled={false} onClose={noop} onSuccess={noop} />);
  });

  it('lands on Modules & Content, where the work actually starts', async () => {
    // The Add-module control only renders on the modules tab.
    expect(await screen.findByText(/Add New Module/i)).toBeTruthy();
    // The Identity tab's title field is not mounted, so we did not land there.
    expect(screen.queryByPlaceholderText('e.g. Modern Web Development')).toBeNull();
  });

  it('drops the author straight into the sub-module editor', async () => {
    // The seeded sub-module is pre-selected, so the right-hand pane is already
    // the stepped editor rather than the "EMPTY SYLLABUS" placeholder.
    expect(await screen.findByText('Details')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.getByText('Checkpoint quiz')).toBeTruthy();
    // Three steps, not four. Per-sub-module access settings moved to the
    // Settings tab — they are set once and were sitting in the way of the work.
    expect(screen.queryByText('Advanced settings')).toBeNull();
    expect(screen.queryByText(/EMPTY SYLLABUS/i)).toBeNull();
    // Named in two places by design: the syllabus tree on the left and the
    // collapsed step-1 summary on the right.
    expect(screen.getAllByText('Sub-Module 1').length).toBeGreaterThanOrEqual(2);
  });

  it('seeds exactly one module holding exactly one sub-module', async () => {
    // Asserted through the save payload rather than the DOM: what matters is
    // the structure that gets PERSISTED. A missing once-only guard would write
    // duplicate modules here without necessarily looking wrong on screen.
    await screen.findByText('Content');
    await saveWithTitle('Some Course');

    const modules = h.post.mock.calls.at(-1)![1].modules;
    expect(modules).toHaveLength(1);
    expect(modules[0].title).toBe('Module 1');
    expect(modules[0].subModules).toHaveLength(1);
    expect(modules[0].subModules[0].title).toBe('Sub-Module 1');
    // Same defaults addSubModule would have produced by hand.
    expect(modules[0].subModules[0].completionThreshold).toBe(80);
    expect(modules[0].subModules[0].resources).toEqual([]);
  });

  it('offers the course title in the header so Modules-first cannot strand it', async () => {
    const title = await screen.findByLabelText('Course title');
    // Empty and ready to type into — handleSave refuses to save without it.
    expect((title as HTMLInputElement).value).toBe('');
    expect((title as HTMLInputElement).placeholder).toBe('Untitled course');
  });

  it('saves the header title without the author ever opening Course Identity', async () => {
    await screen.findByText('Content');
    await saveWithTitle('Typed In The Header');

    expect(h.post.mock.calls.at(-1)![1].title).toBe('Typed In The Header');
    // A create goes to the collection endpoint, not /save.
    expect(h.post.mock.calls.at(-1)![0]).toBe('/master-courses');
  });

  it('does not call the course endpoint — there is nothing to load yet', async () => {
    await screen.findByText('Content');
    const courseFetches = h.get.mock.calls.filter((c) => String(c[0]).startsWith('/master-courses/'));
    expect(courseFetches).toHaveLength(0);
  });
});

describe('a tenant author EDITING an existing course', () => {
  beforeEach(() => {
    h.get.mockImplementation((url: string) =>
      url.startsWith('/master-courses/')
        ? Promise.resolve({ success: true, data: structuredClone(EXISTING) })
        : Promise.resolve({ data: [] }),
    );
    render(
      <MasterCourseStudio
        courseId="course-7"
        isTenantAdmin
        approvalEnabled={false}
        onClose={noop}
        onSuccess={noop}
      />,
    );
  });

  it('never injects a seeded module into a real course', async () => {
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await screen.findAllByDisplayValue('Existing Course');
    // The seed must not fire here. If it did, the phantom module would be
    // written into the course on the next save.
    expect(screen.queryByDisplayValue('Module 1')).toBeNull();
    expect(screen.queryByDisplayValue('Sub-Module 1')).toBeNull();
  });

  it('opens on Course Identity, not Modules', async () => {
    await screen.findAllByDisplayValue('Existing Course');
    // Editing starts by reviewing what the course IS; the Identity field mounts.
    expect(screen.getByPlaceholderText('e.g. Modern Web Development')).toBeTruthy();
  });
});

describe('the super-admin master-course builder is untouched', () => {
  it('still opens a blank slate with no seeded structure', async () => {
    render(<MasterCourseStudio onClose={noop} onSuccess={noop} />);

    await waitFor(() => expect(h.get).toHaveBeenCalled());
    // This change was scoped to the tenant route. The super admin keeps the
    // blank-slate behaviour, and keeps the "Master Course Studio" header.
    expect(screen.queryByDisplayValue('Module 1')).toBeNull();
    expect(screen.getByText('Master Course Studio')).toBeTruthy();
    expect(screen.queryByLabelText('Course title')).toBeNull();
  });
});
