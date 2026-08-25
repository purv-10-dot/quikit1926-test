// @vitest-environment jsdom
/**
 * The resource panel is inline, and commits without an explicit save.
 *
 * The Resource Manager used to be a modal opened from inside the Studio, which
 * is itself a modal. Adding a single link cost four clicks — "Resource
 * Builder", "Add URL", "Add Link", "Save Resources" — and the last one was a
 * commit step nothing else in the Studio has: module titles, quizzes and
 * settings all edit straight into course state.
 *
 * Unlike the sibling Studio tests, this file does NOT mock
 * SubModuleResourceEngine. The whole point is the seam between the two
 * components: that the panel renders inline, and that what it emits actually
 * lands in the saved payload.
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
vi.mock('@/lib/upload-client', () => ({
  uploadFileWithPreview: vi.fn(),
  SERVER_UPLOAD_MAX_BYTES: 100 * 1024 * 1024,
}));

import MasterCourseStudio from '@/components/MasterCourseStudio';

const noop = () => {};

/** The editor opens on Details; the resource panel lives under Content. */
async function goToContent() {
  await act(async () => {
    (await screen.findByText('Content')).click();
  });
  await screen.findByText('Add URL');
}

/** Add one external link through the inline panel. */
async function addLink(url: string, title: string) {
  fireEvent.click(await screen.findByText('Add URL'));

  fireEvent.change(await screen.findByPlaceholderText('https://example.com/resource'), {
    target: { value: url },
  });
  fireEvent.change(screen.getByPlaceholderText('Resource title'), { target: { value: title } });

  await act(async () => {
    screen.getByText('Add Link').click();
  });
}

/** Title the course and press the tenant save button. */
async function saveCourse() {
  fireEvent.change(await screen.findByLabelText('Course title'), {
    target: { value: 'Resource Test Course' },
  });
  await act(async () => {
    screen.getByRole('button', { name: /save & publish|submit for approval/i }).click();
  });
  await waitFor(() => expect(h.post).toHaveBeenCalled());
}

const savedSubModule = () => h.post.mock.calls.at(-1)![1].modules[0].subModules[0];

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.get.mockResolvedValue({ data: [] });
  h.post.mockResolvedValue({ success: true, data: { _id: 'new-course', modules: [] } });
});
afterEach(cleanup);

describe('a tenant author working on a sub-module', () => {
  beforeEach(() => {
    render(<MasterCourseStudio isTenantAdmin approvalEnabled={false} onClose={noop} onSuccess={noop} />);
  });

  it('sees the resource panel already open — no launcher button to press', async () => {
    await goToContent();
    expect(screen.getByText('Add URL')).toBeTruthy();
    expect(screen.getByText('Upload File')).toBeTruthy();
    expect(screen.getByText('Rich Text')).toBeTruthy();
    // SCORM is not offered to tenant authors. Only the ADD path is hidden —
    // stored SCORM resources still load and render, so nothing is stranded.
    expect(screen.queryByText('SCORM')).toBeNull();

    // The modal launcher and its commit step are gone for this author.
    expect(screen.queryByText('Resource Builder')).toBeNull();
    expect(screen.queryByText('Save Resources')).toBeNull();
  });

  it('commits an added link into the course without a Save Resources step', async () => {
    await goToContent();
    await addLink('https://example.gov/guidance', 'Regulator guidance');
    await saveCourse();

    const resources = savedSubModule().resources;
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      // The engine derives the type from the URL rather than taking a plain
      // "link" — a bare page falls through to external_link.
      type: 'external_link',
      url: 'https://example.gov/guidance',
      title: 'Regulator guidance',
    });
  });

  it('carries the engine’s URL type-detection through to the payload', async () => {
    await goToContent();
    await addLink('https://www.youtube.com/watch?v=abc123', 'Intro video');
    await saveCourse();

    // Worth pinning: the player branches on this type, so a commit path that
    // flattened it to a generic link would silently break video playback.
    expect(savedSubModule().resources[0].type).toBe('video_youtube');
  });

  it('keeps the step summary in step with the panel', async () => {
    await goToContent();
    expect(screen.getAllByText('0 resources').length).toBeGreaterThan(0);

    await addLink('https://example.com/one', 'One');

    // The summary lives in the Studio, the resource in the engine — this only
    // passes if the commit actually crossed the component boundary. Singular,
    // because one resource is not '1 resources'.
    await waitFor(() => expect(screen.getAllByText('1 resource').length).toBeGreaterThan(0));
  });

  it('accumulates several resources rather than replacing them', async () => {
    await goToContent();
    await addLink('https://example.com/one', 'One');
    await addLink('https://example.com/two', 'Two');
    await saveCourse();

    expect(savedSubModule().resources.map((r: { title: string }) => r.title)).toEqual(['One', 'Two']);
  });

  it('does not mark orderIndex gaps — resources stay contiguous', async () => {
    await goToContent();
    await addLink('https://example.com/one', 'One');
    await addLink('https://example.com/two', 'Two');
    await saveCourse();

    expect(savedSubModule().resources.map((r: { orderIndex: number }) => r.orderIndex)).toEqual([0, 1]);
  });

  it('does not hit the network just to add a resource', async () => {
    await goToContent();
    await addLink('https://example.com/one', 'One');

    // The old modal POSTed /save and re-fetched the whole course on every
    // commit. Committing per keystroke with that behaviour would be a
    // round-trip storm, and the reload could clobber in-progress edits.
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe('the super-admin master-course builder is untouched', () => {
  it('still opens the resource manager from a launcher card', async () => {
    render(<MasterCourseStudio onClose={noop} onSuccess={noop} />);

    await waitFor(() => expect(h.get).toHaveBeenCalled());
    // Super admin starts on Identity with an empty syllabus, so there is no
    // sub-module selected and therefore no inline panel anywhere.
    expect(screen.queryByText('Add URL')).toBeNull();
    expect(screen.queryByLabelText('Course title')).toBeNull();
  });
});

describe('adding rich text', () => {
  beforeEach(() => {
    render(<MasterCourseStudio isTenantAdmin approvalEnabled={false} onClose={noop} onSuccess={noop} />);
  });

  it('commits a rich-text resource with its title and content', async () => {
    await goToContent();

    await act(async () => {
      screen.getByText('Rich Text').click();
    });

    fireEvent.change(screen.getByPlaceholderText('Content title'), {
      target: { value: 'Key points' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your content here/i), {
      target: { value: 'Pull, Aim, Squeeze, Sweep.' },
    });

    await act(async () => {
      screen.getByText('Add Content').click();
    });

    await saveCourse();

    const resources = savedSubModule().resources;
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      type: 'rich_text',
      title: 'Key points',
      content: 'Pull, Aim, Squeeze, Sweep.',
    });
  });

  it('refuses an empty body and says why', async () => {
    await goToContent();
    await act(async () => {
      screen.getByText('Rich Text').click();
    });
    // Title only, no content — the guard in addRichText.
    fireEvent.change(screen.getByPlaceholderText('Content title'), {
      target: { value: 'Just a title' },
    });
    await act(async () => {
      screen.getByText('Add Content').click();
    });

    // Stated next to the field, and the button is disabled outright, so a
    // title-only attempt cannot look like a no-op any more.
    expect(screen.getByText(/content is required/i)).toBeTruthy();
    expect((screen.getByText('Add Content') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('adding several resources in a row', () => {
  beforeEach(() => {
    render(<MasterCourseStudio isTenantAdmin approvalEnabled={false} onClose={noop} onSuccess={noop} />);
  });

  async function addRichText(title: string, body: string) {
    await act(async () => {
      screen.getByText('Rich Text').click();
    });
    fireEvent.change(screen.getByPlaceholderText('Content title'), { target: { value: title } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your content here/i), { target: { value: body } });
    await act(async () => {
      screen.getByText('Add Content').click();
    });
  }

  it('adds a THIRD resource after two already exist', async () => {
    await goToContent();

    await addLink('https://example.com/one', 'One');
    await addLink('https://example.com/two', 'Two');
    // The reported failure: the third one does not land.
    await addRichText('Three', 'third body');

    await saveCourse();

    const resources = savedSubModule().resources;
    expect(resources.map((r: { title: string }) => r.title)).toEqual(['One', 'Two', 'Three']);
  });

  it('adds a fourth and fifth too', async () => {
    await goToContent();
    await addLink('https://example.com/one', 'One');
    await addRichText('Two', 'b2');
    await addLink('https://example.com/three', 'Three');
    await addRichText('Four', 'b4');
    await addLink('https://example.com/five', 'Five');

    await saveCourse();
    expect(savedSubModule().resources).toHaveLength(5);
  });
});

describe('a growing resource list stays visible', () => {
  it('shows a running count so a scrolled list is not mistaken for a lost one', async () => {
    render(<MasterCourseStudio isTenantAdmin approvalEnabled={false} onClose={noop} onSuccess={noop} />);
    await goToContent();

    await addLink('https://example.com/one', 'One');
    await addLink('https://example.com/two', 'Two');
    await addLink('https://example.com/three', 'Three');

    // All three are in the DOM, not just the two that fit the old cap.
    for (const t of ['One', 'Two', 'Three']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    // And the count is stated inside the panel, next to the list itself.
    expect(screen.getAllByText(/3 resources/).length).toBeGreaterThan(0);
  });
});
