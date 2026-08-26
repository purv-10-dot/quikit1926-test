// @vitest-environment jsdom
/**
 * CHARACTERIZATION TESTS — the save payload must round-trip losslessly.
 *
 * WHY THIS FILE EXISTS
 *
 * `MasterCourseStudio.buildApiPayload` sends `modules: src.modules` — the
 * ENTIRE module tree, wholesale. The server writes it wholesale too. So the
 * saved course is exactly whatever sits in React state at save time, and any
 * field the Studio fails to hydrate on load is silently DELETED on save. No
 * warning, no undo.
 *
 * That is not hypothetical. The 1,126-line wizard this route used to hold did
 * exactly that — it kept only the first video-ish resource per sub-module, so
 * opening a Studio-built course and pressing Save destroyed its quizzes, its
 * non-video resources, and its whole sub-module structure. See the header of
 * `app/(tenant-admin)/create-course/page.tsx`.
 *
 * Before the Studio UI is restructured, these tests pin the current, correct
 * behaviour: load a course carrying every content shape we support, save it
 * untouched, and assert the outbound payload still carries all of it. They are
 * deliberately about DATA, not about layout — they must keep passing no matter
 * how the UI is rearranged. If a refactor breaks one of these, it is about to
 * eat somebody's course.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

// The API client is the seam: `get` hydrates the Studio, `post` receives the
// payload under test.
vi.mock('@/lib/api', () => ({
  api: {
    get: h.get,
    post: h.post,
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// react-beautiful-dnd measures real DOM boxes; jsdom has none. Passthrough
// stubs keep the tree renderable without touching any course data.
vi.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
    children(
      { innerRef: () => {}, droppableProps: {}, placeholder: null },
      { isDraggingOver: false },
    ),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
    children(
      { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
      { isDragging: false },
    ),
}));

// The two child editors are separate surfaces with their own tests. Stubbing
// them keeps this file focused on the payload contract.
vi.mock('@/components/QuizBuilderAdvanced', () => ({ default: () => null }));
vi.mock('@/components/SubModuleResourceEngine', () => ({ default: () => null }));

vi.mock('@/lib/upload-client', () => ({
  uploadFileWithPreview: vi.fn(),
  SERVER_UPLOAD_MAX_BYTES: 100 * 1024 * 1024,
}));

import MasterCourseStudio from '@/components/MasterCourseStudio';

/**
 * A course exercising every shape the content model supports. Each field here
 * is a thing a real author can lose:
 *   - a module-end quiz (summative, gates completion via progress-service)
 *   - a sub-module quiz (formative checkpoint)
 *   - five resource types, incl. SCORM with its version/entrypoint metadata
 *   - two modules and two sub-modules, so ordering is observable
 */
const FIXTURE = {
  _id: 'course-1',
  title: 'Workplace Safety',
  description: 'Annual compliance training',
  category: 'Compliance',
  level: 'Intermediate',
  thumbnailUrl: 'https://cdn.example.com/thumb.png',
  aiGeneratedThumbnail: false,
  status: 'Published',
  selectedTenants: ['tenant-a', 'tenant-b'],
  tags: ['safety', 'annual'],
  estimatedDuration: 120,
  settings: {
    sequentialProgression: true,
    certificateEnabled: true,
    certificateTemplateId: 'tpl-9',
    passingScore: 80,
    allowRevisit: false,
    showProgressBar: true,
    validityDays: 365,
  },
  modules: [
    {
      id: 'mod-1',
      title: 'Fire Safety',
      description: 'Extinguishers and evacuation',
      learningObjective: 'Evacuate safely',
      orderIndex: 0,
      estimatedDuration: 60,
      thumbnailUrl: 'https://cdn.example.com/mod1.png',
      moduleEndQuiz: {
        id: 'quiz-mod-1',
        title: 'Fire Safety Assessment',
        questions: [
          {
            id: 'q-1',
            text: 'Where is the assembly point?',
            type: 'mcq',
            options: [
              { id: 'o1', text: 'Car park' },
              { id: 'o2', text: 'Roof' },
            ],
            correctAnswer: 0,
            explanation: 'Ground level, away from the building.',
            points: 5,
            negativeMarks: 0,
            tags: ['evac'],
          },
        ],
        additionalQuestions: [
          {
            id: 'q-bonus',
            text: 'Which extinguisher for electrical fires?',
            type: 'mcq',
            options: [
              { id: 'b1', text: 'CO2' },
              { id: 'b2', text: 'Water' },
            ],
            correctAnswer: 0,
            points: 5,
            negativeMarks: 1,
            tags: [],
          },
        ],
        settings: {
          randomizeQuestions: true,
          randomizeOptions: false,
          passingScore: 75,
          timeLimit: 900,
          maxAttempts: 3,
          showCorrectAnswers: true,
          showExplanations: true,
          negativeMarkingEnabled: true,
          questionsToShow: 10,
          useQuestionBank: true,
          additionalQuestionsToInclude: 2,
        },
      },
      subModules: [
        {
          id: 'sub-1',
          title: 'Using an Extinguisher',
          description: 'PASS technique',
          learningObjective: 'Operate an extinguisher',
          orderIndex: 0,
          estimatedDuration: 30,
          isPreviewable: true,
          completionThreshold: 90,
          resources: [
            {
              id: 'res-video',
              type: 'video',
              title: 'PASS demo',
              url: 'https://cdn.example.com/pass.mp4',
              duration: 300,
              fileSize: 52428800,
              ffmpegCompressed: true,
              orderIndex: 0,
            },
            {
              id: 'res-scorm',
              type: 'scorm',
              title: 'Interactive drill',
              url: 'https://cdn.example.com/drill.zip',
              scormVersion: '2004',
              scormEntryPoint: 'index_lms.html',
              metadata: { manifestId: 'drill-001' },
              orderIndex: 1,
            },
            {
              id: 'res-doc',
              type: 'document',
              title: 'Checklist',
              url: 'https://cdn.example.com/checklist.pdf',
              fileSize: 204800,
              orderIndex: 2,
            },
            {
              id: 'res-link',
              type: 'link',
              title: 'Regulator guidance',
              url: 'https://example.gov/fire-safety',
              orderIndex: 3,
            },
            {
              id: 'res-rich',
              type: 'richtext',
              title: 'Key points',
              content: '<p>Pull, Aim, Squeeze, Sweep.</p>',
              orderIndex: 4,
            },
          ],
          quiz: {
            id: 'quiz-sub-1',
            title: 'Checkpoint',
            questions: [
              {
                id: 'q-sub-1',
                text: 'PASS stands for Pull, Aim, Squeeze, Sweep.',
                type: 'true_false',
                options: [],
                correctAnswer: true,
                points: 2,
                negativeMarks: 0,
                tags: [],
              },
            ],
            settings: {
              randomizeQuestions: false,
              randomizeOptions: false,
              passingScore: 70,
              maxAttempts: 1,
              showCorrectAnswers: false,
              showExplanations: false,
              negativeMarkingEnabled: false,
              useQuestionBank: false,
            },
          },
        },
        {
          id: 'sub-2',
          title: 'Evacuation Routes',
          orderIndex: 1,
          isPreviewable: false,
          completionThreshold: 100,
          resources: [],
        },
      ],
    },
    {
      id: 'mod-2',
      title: 'First Aid',
      orderIndex: 1,
      subModules: [
        {
          id: 'sub-3',
          title: 'CPR Basics',
          orderIndex: 0,
          isPreviewable: false,
          completionThreshold: 100,
          resources: [
            {
              id: 'res-audio',
              type: 'audio',
              title: 'Compression rhythm',
              url: 'https://cdn.example.com/rhythm.mp3',
              duration: 120,
              orderIndex: 0,
            },
          ],
        },
      ],
    },
  ],
};

/** The payload handed to `api.post` by the most recent save. */
const savedPayload = () => {
  const call = h.post.mock.calls.at(-1);
  return call?.[1] as Record<string, any>;
};

/** Mount the Studio on an existing course and wait for hydration. */
async function openExistingCourse() {
  h.get.mockImplementation((url: string) => {
    if (url.startsWith('/master-courses/')) {
      return Promise.resolve({ success: true, data: structuredClone(FIXTURE) });
    }
    // Tenant list for the Distribution panel.
    return Promise.resolve({ data: [] });
  });
  h.post.mockResolvedValue({ success: true, data: structuredClone(FIXTURE) });

  render(
    <MasterCourseStudio
      courseId="course-1"
      isTenantAdmin
      approvalEnabled={false}
      onClose={() => {}}
      onSuccess={() => {}}
    />,
  );

  await waitFor(() => expect(h.get).toHaveBeenCalled());
  // findAll, not find: a tenant author sees the course title in two places —
  // the always-visible header field and the Identity tab. Asserting on one of
  // them would couple this data test to where the title happens to be rendered,
  // which is exactly what these tests must survive.
  await screen.findAllByDisplayValue('Workplace Safety');
}

/** Press the tenant-admin save button and wait for the request to go out. */
async function save() {
  const btn = await screen.findByRole('button', { name: /save & publish|save changes/i });
  await act(async () => {
    btn.click();
  });
  await waitFor(() => expect(h.post).toHaveBeenCalled());
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
});
afterEach(cleanup);

describe('save payload — load then save must not lose anything', () => {
  it('round-trips the entire module tree byte-for-byte when nothing is edited', async () => {
    await openExistingCourse();
    await save();

    // The strongest possible statement of "nothing was dropped".
    expect(savedPayload().modules).toEqual(FIXTURE.modules);
  });

  it('preserves the module-end quiz, including its bonus pool and settings', async () => {
    await openExistingCourse();
    await save();

    const mod = savedPayload().modules[0];
    expect(mod.moduleEndQuiz).toBeDefined();
    expect(mod.moduleEndQuiz.id).toBe('quiz-mod-1');
    expect(mod.moduleEndQuiz.questions).toHaveLength(1);
    // The bonus pool and question-bank settings are easy to drop in a rewrite
    // and impossible for an author to notice until a retake looks wrong.
    expect(mod.moduleEndQuiz.additionalQuestions).toHaveLength(1);
    expect(mod.moduleEndQuiz.settings.useQuestionBank).toBe(true);
    expect(mod.moduleEndQuiz.settings.additionalQuestionsToInclude).toBe(2);
  });

  it('preserves the sub-module checkpoint quiz', async () => {
    await openExistingCourse();
    await save();

    const sub = savedPayload().modules[0].subModules[0];
    expect(sub.quiz).toBeDefined();
    expect(sub.quiz.id).toBe('quiz-sub-1');
    expect(sub.quiz.questions[0].correctAnswer).toBe(true);
  });

  it('preserves every resource type, not just the video', async () => {
    await openExistingCourse();
    await save();

    const resources = savedPayload().modules[0].subModules[0].resources;
    // This is the exact shape of the old wizard's data-loss bug: it kept only
    // the first video-ish resource and silently dropped the rest.
    expect(resources).toHaveLength(5);
    expect(resources.map((r: { type: string }) => r.type)).toEqual([
      'video',
      'scorm',
      'document',
      'link',
      'richtext',
    ]);
  });

  it('preserves SCORM packaging metadata', async () => {
    await openExistingCourse();
    await save();

    const scorm = savedPayload().modules[0].subModules[0].resources[1];
    expect(scorm.scormVersion).toBe('2004');
    expect(scorm.scormEntryPoint).toBe('index_lms.html');
    expect(scorm.metadata).toEqual({ manifestId: 'drill-001' });
  });

  it('preserves sub-module structure and ordering', async () => {
    await openExistingCourse();
    await save();

    const modules = savedPayload().modules;
    expect(modules).toHaveLength(2);
    expect(modules[0].subModules.map((s: { id: string }) => s.id)).toEqual(['sub-1', 'sub-2']);
    expect(modules[1].subModules.map((s: { id: string }) => s.id)).toEqual(['sub-3']);
    // A sub-module with no resources must survive as an empty list, not vanish.
    expect(modules[0].subModules[1].resources).toEqual([]);
  });

  it('preserves per-sub-module gating fields', async () => {
    await openExistingCourse();
    await save();

    const sub = savedPayload().modules[0].subModules[0];
    expect(sub.isPreviewable).toBe(true);
    expect(sub.completionThreshold).toBe(90);
    expect(sub.learningObjective).toBe('Operate an extinguisher');
  });

  it('preserves course-level settings, tags and tenant selection', async () => {
    await openExistingCourse();
    await save();

    const payload = savedPayload();
    expect(payload.settings).toEqual(FIXTURE.settings);
    expect(payload.tags).toEqual(['safety', 'annual']);
    expect(payload.selectedTenants).toEqual(['tenant-a', 'tenant-b']);
    expect(payload.estimatedDuration).toBe(120);
    expect(payload.category).toBe('Compliance');
    expect(payload.level).toBe('Intermediate');
    expect(payload.thumbnailUrl).toBe('https://cdn.example.com/thumb.png');
  });

  it('sends the edit to the /save endpoint for an existing course', async () => {
    await openExistingCourse();
    await save();

    expect(h.post.mock.calls.at(-1)?.[0]).toBe('/master-courses/course-1/save');
  });
});
