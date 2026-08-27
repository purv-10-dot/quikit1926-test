// @vitest-environment jsdom
/**
 * The module-end assessment is opt-in, not removed.
 *
 * Tenant authors assess per sub-module (the Checkpoint Quiz); a module-tier
 * card sitting permanently in the module editor read as a step everyone had to
 * consider. So it is collapsed behind a disclosure — but deliberately NOT
 * deleted, and that distinction is what most of this file protects.
 *
 * `moduleEndQuiz` is live machinery, not decoration:
 *   - progress-service counts it as a required item and GATES module completion
 *   - courses-service turns it into a real lesson in the player
 *   - compliance-service and the proctoring service both read it
 *
 * So a course that already has one must keep showing it, keep it editable, and
 * keep it deletable. Hiding the only route to it would leave an assessment that
 * blocks completion and that nobody can reach — the failure this file exists to
 * prevent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  quizProps: vi.fn(),
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

// Capture what the quiz builder is opened with — that is how we prove the
// disclosure opens the MODULE-tier quiz and not the sub-module one.
vi.mock('@/components/QuizBuilderAdvanced', () => ({
  default: (props: Record<string, unknown>) => {
    h.quizProps(props);
    return <div data-testid="quiz-builder" />;
  },
}));
vi.mock('@/components/SubModuleResourceEngine', () => ({ default: () => null }));
vi.mock('@/lib/upload-client', () => ({
  uploadFileWithPreview: vi.fn(),
  SERVER_UPLOAD_MAX_BYTES: 100 * 1024 * 1024,
}));

import MasterCourseStudio from '@/components/MasterCourseStudio';

const MODULE_QUIZ = {
  id: 'quiz-mod-1',
  title: 'Fire Safety Assessment',
  questions: [
    {
      id: 'q1',
      text: 'Assembly point?',
      type: 'mcq',
      options: [{ id: 'o1', text: 'Car park' }],
      correctAnswer: 0,
      points: 5,
      negativeMarks: 0,
      tags: [],
    },
  ],
  settings: {
    randomizeQuestions: false,
    randomizeOptions: false,
    passingScore: 70,
    maxAttempts: 1,
    showCorrectAnswers: true,
    showExplanations: true,
    negativeMarkingEnabled: false,
    useQuestionBank: false,
  },
};

const courseWith = (moduleEndQuiz?: unknown) => ({
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
      ...(moduleEndQuiz ? { moduleEndQuiz } : {}),
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
  ],
});

const noop = () => {};

/** Mount on an existing course, go to Modules, and select the module itself. */
async function openModuleEditor(moduleEndQuiz?: unknown) {
  h.get.mockImplementation((url: string) =>
    url.startsWith('/master-courses/')
      ? Promise.resolve({ success: true, data: courseWith(moduleEndQuiz) })
      : Promise.resolve({ data: [] }),
  );

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

  // Editing opens on Identity; move to the syllabus and pick the module.
  await act(async () => {
    screen.getByText('Modules & Content').click();
  });
  await act(async () => {
    fireEvent.click(await screen.findByText('Fire Safety'));
  });
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.quizProps.mockReset();
  h.post.mockResolvedValue({ success: true, data: courseWith() });
});
afterEach(cleanup);

describe('a module with NO assessment', () => {
  it('hides the assessment card behind a quiet, optional disclosure', async () => {
    await openModuleEditor();

    expect(await screen.findByText('Add a module-end assessment')).toBeTruthy();
    // The card and its jargon are not competing for attention any more.
    expect(screen.queryByText('Module-End Quiz')).toBeNull();
    expect(screen.queryByText('Assessment Tier')).toBeNull();
    expect(screen.queryByText('Setup Quiz')).toBeNull();
    // Marked optional, so nobody reads it as a step they skipped.
    expect(screen.getByText(/optional/i)).toBeTruthy();
  });

  it('reveals the full card when the author asks for it', async () => {
    await openModuleEditor();
    await act(async () => {
      (await screen.findByText('Add a module-end assessment')).click();
    });

    expect(screen.getByText('Module-End Quiz')).toBeTruthy();
    expect(screen.getByText('Setup Quiz')).toBeTruthy();
    expect(screen.queryByText('Add a module-end assessment')).toBeNull();
  });

  it('opens a BLANK builder — there is nothing to edit yet', async () => {
    await openModuleEditor();
    await act(async () => {
      (await screen.findByText('Add a module-end assessment')).click();
    });
    await act(async () => {
      screen.getByText('Setup Quiz').click();
    });

    expect(screen.getByTestId('quiz-builder')).toBeTruthy();
    expect(h.quizProps.mock.calls.at(-1)![0].quiz).toBeUndefined();
  });

  it('lands what the builder saves on moduleEndQuiz, not the sub-module quiz', async () => {
    await openModuleEditor();
    await act(async () => {
      (await screen.findByText('Add a module-end assessment')).click();
    });
    await act(async () => {
      screen.getByText('Setup Quiz').click();
    });

    // The builder carries no tier flag in its props, so the only honest way to
    // prove the disclosure targets the MODULE tier is to save through it and
    // see where the quiz comes to rest.
    await act(async () => {
      (h.quizProps.mock.calls.at(-1)![0].onSave as (q: unknown) => void)(MODULE_QUIZ);
    });
    await act(async () => {
      screen.getByRole('button', { name: /save & publish|save changes/i }).click();
    });
    await waitFor(() => expect(h.post).toHaveBeenCalled());

    const savedModule = h.post.mock.calls.at(-1)![1].modules[0];
    expect(savedModule.moduleEndQuiz).toMatchObject({ id: 'quiz-mod-1' });
    expect(savedModule.subModules[0].quiz).toBeUndefined();
  });
});

describe('a module that ALREADY has an assessment', () => {
  it('shows the card straight away — never hidden behind the disclosure', async () => {
    await openModuleEditor(MODULE_QUIZ);

    // This is the important one. An existing moduleEndQuiz gates module
    // completion; if the disclosure hid it, the author would face an
    // assessment that blocks learners and that they cannot reach.
    expect(await screen.findByText('Module-End Quiz')).toBeTruthy();
    expect(screen.queryByText('Add a module-end assessment')).toBeNull();
  });

  it('offers Edit rather than Setup, so it can be changed or deleted', async () => {
    await openModuleEditor(MODULE_QUIZ);

    expect(await screen.findByText('Edit Assessment')).toBeTruthy();
    expect(screen.queryByText('Setup Quiz')).toBeNull();
  });

  it('hands the existing quiz to the builder for editing', async () => {
    await openModuleEditor(MODULE_QUIZ);
    await act(async () => {
      (await screen.findByText('Edit Assessment')).click();
    });

    // Not a blank builder — the saved questions come back for editing, which is
    // also the only route to deleting the quiz.
    expect(h.quizProps.mock.calls.at(-1)![0]).toMatchObject({
      quiz: expect.objectContaining({ id: 'quiz-mod-1' }),
    });
  });
});

describe('the super-admin master-course builder is untouched', () => {
  it('still shows the assessment card with no disclosure', async () => {
    h.get.mockImplementation((url: string) =>
      url.startsWith('/master-courses/')
        ? Promise.resolve({ success: true, data: courseWith() })
        : Promise.resolve({ data: [] }),
    );
    render(<MasterCourseStudio courseId="course-1" onClose={noop} onSuccess={noop} />);

    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await screen.findByDisplayValue('Workplace Safety');
    await act(async () => {
      screen.getByText('Modules & Content').click();
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Fire Safety'));
    });

    expect(await screen.findByText('Module-End Quiz')).toBeTruthy();
    expect(screen.queryByText('Add a module-end assessment')).toBeNull();
  });
});
