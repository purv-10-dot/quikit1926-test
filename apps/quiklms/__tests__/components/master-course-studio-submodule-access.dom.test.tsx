// @vitest-environment jsdom
/**
 * Per-sub-module access settings, after moving off the sub-module editor.
 *
 * `isPreviewable` and `completionThreshold` belong to each SubModule, not to
 * the course. So when they were pulled out of the editor they were listed per
 * sub-module on the Settings tab rather than folded into a course-level
 * setting — folding them would have changed what they mean and stranded the
 * values already saved against individual sub-modules.
 *
 * What matters here is that the move did not quietly break them: each row must
 * still write to ITS OWN sub-module, and the values must still reach the save
 * payload. A table that edits the wrong row is worse than the step it replaced.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';

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

/** Two sub-modules across two modules, with DIFFERENT starting values. */
const COURSE = {
  _id: 'course-1',
  title: 'Workplace Safety',
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
      id: 'mod-1',
      title: 'Fire Safety',
      orderIndex: 0,
      subModules: [
        {
          id: 'sub-1',
          title: 'Extinguishers',
          orderIndex: 0,
          resources: [],
          isPreviewable: false,
          completionThreshold: 80,
        },
      ],
    },
    {
      id: 'mod-2',
      title: 'First Aid',
      orderIndex: 1,
      subModules: [
        {
          id: 'sub-2',
          title: 'CPR Basics',
          orderIndex: 0,
          resources: [],
          isPreviewable: true,
          completionThreshold: 60,
        },
      ],
    },
  ],
};

const noop = () => {};

async function openSettings() {
  h.get.mockImplementation((url: string) =>
    url.startsWith('/master-courses/')
      ? Promise.resolve({ success: true, data: structuredClone(COURSE) })
      : Promise.resolve({ data: [] }),
  );
  h.post.mockResolvedValue({ success: true, data: structuredClone(COURSE) });

  render(
    <MasterCourseStudio
      courseId="course-1"
      isTenantAdmin
      approvalEnabled={false}
      onClose={noop}
      onSuccess={noop}
    />,
  );

  await waitFor(() => expect(h.get).toHaveBeenCalled());
  await screen.findAllByDisplayValue('Workplace Safety');
  await act(async () => {
    screen.getByText('Settings').click();
  });
}

async function save() {
  await act(async () => {
    screen.getByRole('button', { name: /save & publish|save changes/i }).click();
  });
  await waitFor(() => expect(h.post).toHaveBeenCalled());
}

const savedSub = (moduleIndex: number) =>
  h.post.mock.calls.at(-1)![1].modules[moduleIndex].subModules[0];

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
});
afterEach(cleanup);

describe('the sub-module access table on Settings', () => {
  it('lists every sub-module with the module it belongs to', async () => {
    await openSettings();

    expect(await screen.findByText('Sub-module access')).toBeTruthy();
    // Both sub-modules, across both modules — reviewable in one pass, which the
    // old per-sub-module step could never do.
    expect(screen.getByText('Extinguishers')).toBeTruthy();
    expect(screen.getByText('CPR Basics')).toBeTruthy();
  });

  it('shows each sub-module its OWN current values, not a shared default', async () => {
    await openSettings();

    const first = screen.getByLabelText('Preview without enrolling — Extinguishers');
    const second = screen.getByLabelText('Preview without enrolling — CPR Basics');
    expect(first.getAttribute('aria-checked')).toBe('false');
    expect(second.getAttribute('aria-checked')).toBe('true');

    expect((screen.getByLabelText('Pass mark percent — Extinguishers') as HTMLInputElement).value).toBe('80');
    expect((screen.getByLabelText('Pass mark percent — CPR Basics') as HTMLInputElement).value).toBe('60');
  });

  it('writes a preview toggle to that row only', async () => {
    await openSettings();
    await act(async () => {
      screen.getByLabelText('Preview without enrolling — Extinguishers').click();
    });
    await save();

    expect(savedSub(0).isPreviewable).toBe(true);
    // The other row must be untouched — the failure mode of a table like this
    // is every row editing the first sub-module.
    expect(savedSub(1).isPreviewable).toBe(true);
    expect(savedSub(1).completionThreshold).toBe(60);
  });

  it('writes a pass mark to that row only', async () => {
    await openSettings();
    fireEvent.change(screen.getByLabelText('Pass mark percent — CPR Basics'), {
      target: { value: '95' },
    });
    await save();

    expect(savedSub(1).completionThreshold).toBe(95);
    expect(savedSub(0).completionThreshold).toBe(80);
  });

  it('keeps the rest of each sub-module intact when editing access', async () => {
    await openSettings();
    await act(async () => {
      screen.getByLabelText('Preview without enrolling — Extinguishers').click();
    });
    await save();

    // updateSubModule merges — it must not replace the sub-module wholesale.
    expect(savedSub(0)).toMatchObject({
      id: 'sub-1',
      title: 'Extinguishers',
      orderIndex: 0,
      resources: [],
    });
  });
});
