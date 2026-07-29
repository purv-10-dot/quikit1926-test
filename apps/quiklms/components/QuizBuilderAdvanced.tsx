'use client';
/**
 * QuizBuilderAdvanced — ported from the old QuikSkills frontend
 * (`src/components/QuizBuilderAdvanced.tsx`).
 *
 * The authoring surface for quizzes. Two tabs:
 *   1. questions — a pool toggle (main / additional "extras"), a question-type
 *                  palette, a drag-reorderable question list, and a per-question
 *                  editor that defines the answer key.
 *   2. settings  — randomization, question banking, scoring, time & attempts,
 *                  and feedback toggles.
 *
 * Supported question types: 'mcq' | 'multi_select' | 'true_false' |
 * 'drag_drop' | 'fill_blank'. Bulk authoring is delegated to
 * PasteQuestionsModal, whose ParsedQuestion output is mapped onto the
 * builder's Question shape by `applyPastedQuestions`.
 */
import { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Image,
  Music,
  CheckCircle,
  Circle,
  Square,
  Check,
  ArrowLeftRight,
  Type,
  Settings,
  Save,
  AlertCircle,
  HelpCircle,
  Shuffle,
  Clock,
  Target,
  Minus,
  Pencil,
  RefreshCw,
  Sparkles,
  Zap,
  BookOpen,
  BarChart3,
  ListChecks,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { v4 as uuidv4 } from 'uuid';
import PasteQuestionsModal from '@/components/PasteQuestionsModal';
import type { ParsedQuestion } from '@/lib/utils/parseQuizPaste';

interface QuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
}

interface DragDropPair {
  id: string;
  left: string;
  right: string;
}

interface Question {
  id: string;
  text: string;
  type: 'mcq' | 'multi_select' | 'true_false' | 'drag_drop' | 'fill_blank';
  options: QuestionOption[];
  dragDropPairs?: DragDropPair[];
  blanks?: string[];
  correctAnswer: number | number[] | boolean | string[];
  imageUrl?: string;
  audioUrl?: string;
  explanation?: string;
  points: number;
  negativeMarks: number;
  branchingSubModuleId?: string;
  tags: string[];
}

interface QuizSettings {
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  passingScore: number;
  timeLimit?: number;
  maxAttempts: number;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
  negativeMarkingEnabled: boolean;
  questionsToShow?: number;
  useQuestionBank: boolean;
  // How many extras to pull from `Quiz.additionalQuestions` per attempt.
  // Unset → all of them (capped at the pool size).
  additionalQuestionsToInclude?: number;
}

interface Quiz {
  id: string;
  title: string;
  questions: Question[];
  // Optional bonus pool. Sampled per attempt and mixed in alongside the main
  // questions so retakes feel less repetitive. Empty by default. Marked
  // optional on the interface so quizzes saved before this field shipped
  // are still accepted as props; state normalises to `[]` on mount.
  additionalQuestions?: Question[];
  settings: QuizSettings;
}

type QuestionPool = 'main' | 'additional';

interface Props {
  quiz?: Quiz;
  onSave: (quiz: Quiz) => void;
  onClose: () => void;
  onDelete?: () => void;
}

const QuizBuilderAdvanced = ({ quiz, onSave, onClose, onDelete }: Props) => {
  // Internal state always has `additionalQuestions` materialised so we don't
  // pepper the component with `?? []` everywhere.
  type QuizState = Omit<Quiz, 'additionalQuestions'> & { additionalQuestions: Question[] };
  const [quizData, setQuizData] = useState<QuizState>(() => {
    if (quiz) {
      // Older quizzes may not have the additionalQuestions field — normalise.
      return { ...quiz, additionalQuestions: quiz.additionalQuestions || [] };
    }
    return {
      id: uuidv4(),
      title: 'New Quiz',
      questions: [],
      additionalQuestions: [],
      settings: {
        // Randomization is OFF by default — every learner sees the questions
        // in the order the creator added them. Authors can opt-in via the
        // Settings tab when they want randomized retakes.
        randomizeQuestions: false,
        randomizeOptions: false,
        passingScore: 70,
        maxAttempts: 3,
        showCorrectAnswers: false,
        showExplanations: true,
        negativeMarkingEnabled: false,
        useQuestionBank: false,
      },
    };
  });

  const [activeTab, setActiveTab] = useState<'questions' | 'settings'>('questions');
  // Which pool the Questions tab is currently viewing/editing. Persisted as a
  // pill toggle at the top of the Questions tab.
  const [viewPool, setViewPool] = useState<QuestionPool>('main');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);

  // ── Pool-aware lookups ──
  // Most mutating helpers look up a question by id. Routing by id (rather
  // than threading a pool argument through every callsite) keeps the diff
  // small and ensures click handlers still work after switching pools.
  const poolList = (pool: QuestionPool): Question[] =>
    pool === 'main' ? quizData.questions : quizData.additionalQuestions;

  const findQuestion = (id: string): { question?: Question; pool: QuestionPool } => {
    const inMain = quizData.questions.find((q) => q.id === id);
    if (inMain) return { question: inMain, pool: 'main' };
    const inAdditional = quizData.additionalQuestions.find((q) => q.id === id);
    return { question: inAdditional, pool: 'additional' };
  };

  const updatePool = (pool: QuestionPool, mapper: (list: Question[]) => Question[]) => {
    setQuizData((prev) =>
      pool === 'main'
        ? { ...prev, questions: mapper(prev.questions) }
        : { ...prev, additionalQuestions: mapper(prev.additionalQuestions) },
    );
  };

  const currentQuestions = poolList(viewPool);

  const questionTypes = [
    { type: 'mcq', label: 'Single Choice', icon: Circle, color: 'from-blue-500 to-cyan-500', desc: 'One correct answer' },
    { type: 'multi_select', label: 'Multi Choice', icon: ListChecks, color: 'from-purple-500 to-pink-500', desc: 'Multiple correct answers' },
    { type: 'true_false', label: 'True/False', icon: CheckCircle, color: 'from-emerald-500 to-green-500', desc: 'Binary choice' },
    { type: 'drag_drop', label: 'Matching', icon: ArrowLeftRight, color: 'from-amber-500 to-orange-500', desc: 'Match pairs' },
    { type: 'fill_blank', label: 'Fill Blanks', icon: Type, color: 'from-rose-500 to-red-500', desc: 'Text input' },
  ];

  const addQuestion = (type: Question['type']) => {
    const newQuestion: Question = {
      id: uuidv4(),
      text: '',
      type,
      options: type === 'mcq' || type === 'multi_select'
        ? [
            { id: uuidv4(), text: '' },
            { id: uuidv4(), text: '' },
            { id: uuidv4(), text: '' },
            { id: uuidv4(), text: '' },
          ]
        : [],
      dragDropPairs: type === 'drag_drop'
        ? [
            { id: uuidv4(), left: '', right: '' },
            { id: uuidv4(), left: '', right: '' },
          ]
        : undefined,
      blanks: type === 'fill_blank' ? [''] : undefined,
      correctAnswer: type === 'true_false' ? true : type === 'multi_select' ? [] : 0,
      points: 1,
      negativeMarks: 0,
      tags: [],
    };

    // New questions land in whichever pool is currently being viewed.
    updatePool(viewPool, (list) => [...list, newQuestion]);
    setSelectedQuestionId(newQuestion.id);
  };

  /**
   * Convert ParsedQuestion (from the paste parser) into this builder's
   * Question shape and append to the quiz. Detects single-choice vs.
   * multi-select vs. true/false from the parser flags.
   */
  const applyPastedQuestions = (parsed: ParsedQuestion[]) => {
    if (parsed.length === 0) return;
    const mapped: Question[] = parsed.map((p) => {
      const isTrueFalse = p.type === 'True/False';
      const isMulti = p.isMultiSelect;
      const type: Question['type'] = isTrueFalse ? 'true_false' : isMulti ? 'multi_select' : 'mcq';

      let correctAnswer: Question['correctAnswer'];
      if (isTrueFalse) {
        // For True/False, the correct answer is `true` if the parser flagged
        // the option whose text reads as "true"/"yes" (case-insensitive).
        const correctIdx = Array.isArray(p.correctAnswerIndex)
          ? p.correctAnswerIndex[0] ?? 0
          : p.correctAnswerIndex;
        const optText = (p.options[correctIdx] || '').toLowerCase().trim();
        correctAnswer = /^(true|yes|t)\.?$/.test(optText);
      } else if (isMulti) {
        correctAnswer = Array.isArray(p.correctAnswerIndex)
          ? p.correctAnswerIndex
          : [p.correctAnswerIndex];
      } else {
        correctAnswer = Array.isArray(p.correctAnswerIndex)
          ? p.correctAnswerIndex[0] ?? 0
          : p.correctAnswerIndex;
      }

      return {
        id: uuidv4(),
        text: p.text,
        type,
        options: isTrueFalse
          ? []
          : p.options.map((t) => ({ id: uuidv4(), text: t })),
        correctAnswer,
        points: 1,
        negativeMarks: 0,
        tags: [],
      };
    });

    // Paste lands questions in whichever pool is currently being viewed.
    updatePool(viewPool, (list) => [...list, ...mapped]);
    if (mapped.length > 0) {
      setSelectedQuestionId(mapped[0].id);
    }
  };

  const updateQuestion = (questionId: string, updates: Partial<Question>) => {
    const { pool } = findQuestion(questionId);
    updatePool(pool, (list) =>
      list.map((q) => (q.id === questionId ? { ...q, ...updates } : q)),
    );
  };

  const deleteQuestion = (questionId: string) => {
    const { pool } = findQuestion(questionId);
    updatePool(pool, (list) => list.filter((q) => q.id !== questionId));
    if (selectedQuestionId === questionId) {
      setSelectedQuestionId(null);
    }
  };

  const addOption = (questionId: string) => {
    const { question } = findQuestion(questionId);
    if (!question) return;

    updateQuestion(questionId, {
      options: [...question.options, { id: uuidv4(), text: '' }],
    });
  };

  const updateOption = (questionId: string, optionId: string, text: string) => {
    const { question } = findQuestion(questionId);
    if (!question) return;

    updateQuestion(questionId, {
      options: question.options.map((o) =>
        o.id === optionId ? { ...o, text } : o
      ),
    });
  };

  const deleteOption = (questionId: string, optionId: string) => {
    const { question } = findQuestion(questionId);
    if (!question || question.options.length <= 2) return;

    const optionIndex = question.options.findIndex((o) => o.id === optionId);
    let newCorrectAnswer = question.correctAnswer;

    if (question.type === 'mcq') {
      if (typeof question.correctAnswer === 'number') {
        if (question.correctAnswer === optionIndex) {
          newCorrectAnswer = 0;
        } else if (question.correctAnswer > optionIndex) {
          newCorrectAnswer = (question.correctAnswer as number) - 1;
        }
      }
    } else if (question.type === 'multi_select') {
      if (Array.isArray(question.correctAnswer)) {
        newCorrectAnswer = (question.correctAnswer as number[])
          .filter((i) => i !== optionIndex)
          .map((i) => (i > optionIndex ? i - 1 : i));
      }
    }

    updateQuestion(questionId, {
      options: question.options.filter((o) => o.id !== optionId),
      correctAnswer: newCorrectAnswer,
    });
  };

  const addDragDropPair = (questionId: string) => {
    const { question } = findQuestion(questionId);
    if (!question || !question.dragDropPairs) return;

    updateQuestion(questionId, {
      dragDropPairs: [
        ...question.dragDropPairs,
        { id: uuidv4(), left: '', right: '' },
      ],
    });
  };

  const updateDragDropPair = (
    questionId: string,
    pairId: string,
    field: 'left' | 'right',
    value: string
  ) => {
    const { question } = findQuestion(questionId);
    if (!question || !question.dragDropPairs) return;

    updateQuestion(questionId, {
      dragDropPairs: question.dragDropPairs.map((p) =>
        p.id === pairId ? { ...p, [field]: value } : p
      ),
    });
  };

  const deleteDragDropPair = (questionId: string, pairId: string) => {
    const { question } = findQuestion(questionId);
    if (!question || !question.dragDropPairs || question.dragDropPairs.length <= 2) return;

    updateQuestion(questionId, {
      dragDropPairs: question.dragDropPairs.filter((p) => p.id !== pairId),
    });
  };

  const addBlank = (questionId: string) => {
    const { question } = findQuestion(questionId);
    if (!question || !question.blanks) return;

    updateQuestion(questionId, {
      blanks: [...question.blanks, ''],
    });
  };

  const updateBlank = (questionId: string, index: number, value: string) => {
    const { question } = findQuestion(questionId);
    if (!question || !question.blanks) return;

    const newBlanks = [...question.blanks];
    newBlanks[index] = value;
    updateQuestion(questionId, { blanks: newBlanks });
  };

  const deleteBlank = (questionId: string, index: number) => {
    const { question } = findQuestion(questionId);
    if (!question || !question.blanks || question.blanks.length <= 1) return;

    updateQuestion(questionId, {
      blanks: question.blanks.filter((_, i) => i !== index),
    });
  };

  const setCorrectAnswer = (questionId: string, answer: number | number[] | boolean) => {
    updateQuestion(questionId, { correctAnswer: answer });
  };

  const toggleMultiSelectAnswer = (questionId: string, optionIndex: number) => {
    const { question } = findQuestion(questionId);
    if (!question || question.type !== 'multi_select') return;

    const currentAnswers = (question.correctAnswer as number[]) || [];
    const newAnswers = currentAnswers.includes(optionIndex)
      ? currentAnswers.filter((i) => i !== optionIndex)
      : [...currentAnswers, optionIndex].sort((a, b) => a - b);

    setCorrectAnswer(questionId, newAnswers);
  };

  // Drag-reorder operates on the pool currently being viewed.
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const reordered = Array.from(currentQuestions);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    updatePool(viewPool, () => reordered);
  };

  const handleSave = () => {
    if (!quizData.title.trim()) {
      setError('Quiz title is required');
      return;
    }

    // Main pool must have at least one question. The additional pool is
    // optional — empty is fine.
    if (quizData.questions.length === 0) {
      setError('Add at least one question');
      return;
    }

    const emptyMain = quizData.questions.find((q) => !q.text.trim());
    if (emptyMain) {
      setError('All questions must have text');
      setSelectedQuestionId(emptyMain.id);
      setViewPool('main');
      return;
    }
    const emptyExtra = quizData.additionalQuestions.find((q) => !q.text.trim());
    if (emptyExtra) {
      setError('All additional questions must have text');
      setSelectedQuestionId(emptyExtra.id);
      setViewPool('additional');
      return;
    }

    onSave(quizData);
  };

  const selectedQuestion = findQuestion(selectedQuestionId || '').question;
  const totalPoints = quizData.questions.reduce((sum, q) => sum + q.points, 0);
  const extraPoints = quizData.additionalQuestions.reduce((sum, q) => sum + q.points, 0);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900/95 via-emerald-900/30 to-slate-900/95 backdrop-blur-sm flex items-center justify-center z-[60] p-0 sm:p-3 lg:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-none sm:rounded-2xl lg:rounded-3xl w-full max-w-6xl h-screen sm:h-[95vh] lg:h-[90vh] flex flex-col shadow-2xl overflow-hidden border-0 sm:border border-gray-200/50 dark:border-slate-700/50">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-500 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 shrink-0">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwdi02aC02djZoNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl shrink-0 hidden sm:flex">
                <HelpCircle className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={quizData.title}
                  onChange={(e) => setQuizData((prev) => ({ ...prev, title: e.target.value }))}
                  className="text-lg sm:text-2xl font-bold bg-transparent border-none focus:outline-none text-white placeholder-white/60 w-full truncate"
                  placeholder="Enter quiz title..."
                />
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-white/80 text-xs sm:text-sm">
                    <BookOpen className="w-3 h-3 sm:w-4 sm:h-4" />
                    {quizData.questions.length} main
                    {quizData.additionalQuestions.length > 0 && (
                      <span className="ml-1">+ {quizData.additionalQuestions.length} extras</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-white/80 text-xs sm:text-sm">
                    <Target className="w-3 h-3 sm:w-4 sm:h-4" />
                    {totalPoints + extraPoints} points
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 bg-white text-emerald-600 font-semibold rounded-xl hover:bg-white/90 transition-all shadow-lg shadow-emerald-500/25 text-sm"
              >
                <Save className="w-4 h-4" />
                <span className="hidden xs:inline">Save Quiz</span>
                <span className="xs:hidden">Save</span>
              </button>
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-500/80 hover:bg-red-600 text-white font-semibold rounded-xl transition-all text-sm"
                  title="Delete this quiz from the course"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete Quiz</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 sm:p-2.5 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 shrink-0">
          <button
            onClick={() => setActiveTab('questions')}
            className={`flex-1 flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 font-medium transition-all relative ${
              activeTab === 'questions'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <div className={`p-1.5 sm:p-2 rounded-xl transition-colors ${
              activeTab === 'questions'
                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                : 'bg-gray-100 dark:bg-slate-700'
            }`}>
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="font-semibold text-sm sm:text-base">Questions ({quizData.questions.length})</span>
            {activeTab === 'questions' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 font-medium transition-all relative ${
              activeTab === 'settings'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <div className={`p-1.5 sm:p-2 rounded-xl transition-colors ${
              activeTab === 'settings'
                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                : 'bg-gray-100 dark:bg-slate-700'
            }`}>
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="font-semibold text-sm sm:text-base">Settings</span>
            {activeTab === 'settings' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-3 sm:mx-6 mt-3 sm:mt-4 p-3 sm:p-4 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800/50 rounded-xl sm:rounded-2xl flex items-center gap-3 shrink-0">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="flex-1 text-red-800 dark:text-red-300 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl">
              <X className="w-4 h-4 text-red-600 dark:text-red-400" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {activeTab === 'questions' && (
            <>
              {/* Questions List — full-width on mobile, fixed sidebar on md+ */}
              <div className="w-full md:w-72 lg:w-80 md:border-r border-b md:border-b-0 border-gray-200 dark:border-slate-700 flex flex-col bg-gray-50/50 dark:bg-slate-800/30 md:max-h-full overflow-hidden shrink-0">
                {/* Pool toggle — switch between main questions and the optional extras pool. */}
                <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
                  <div className="flex rounded-xl bg-gray-100 dark:bg-slate-800 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => { setViewPool('main'); setSelectedQuestionId(null); }}
                      className={`flex-1 px-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                        viewPool === 'main'
                          ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 shadow'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                      }`}
                    >
                      Main ({quizData.questions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViewPool('additional'); setSelectedQuestionId(null); }}
                      className={`flex-1 px-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                        viewPool === 'additional'
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                      }`}
                      title="Optional bonus pool — sampled per attempt to make retakes feel fresh."
                    >
                      Extras ({quizData.additionalQuestions.length})
                    </button>
                  </div>
                  {viewPool === 'additional' && (
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-300 mt-2 leading-snug">
                      Optional. Items added here are sampled randomly each attempt and mixed into the quiz.
                    </p>
                  )}
                </div>
                {/* Question type buttons — scrollable so short viewports don't clip them */}
                <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700 overflow-y-auto flex-shrink-0" style={{ maxHeight: 'min(52%, 260px)' }}>
                  <button
                    type="button"
                    onClick={() => setPasteModalOpen(true)}
                    className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-semibold text-sm transition-colors"
                    title="Paste a block of text — the parser extracts the question, options, and correct answer."
                  >
                    📋 Paste Questions
                  </button>
                  <p className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Add {viewPool === 'additional' ? 'Extra' : 'Question'} Type
                  </p>
                  <div className="space-y-1.5 sm:space-y-2">
                    {questionTypes.map((qt) => (
                      <button
                        key={qt.type}
                        onClick={() => addQuestion(qt.type as Question['type'])}
                        className="w-full flex items-center gap-3 p-2.5 sm:p-3 text-left border-2 border-gray-200 dark:border-slate-600 rounded-xl hover:border-emerald-400 dark:hover:border-emerald-500 transition-all group"
                      >
                        <div className={`p-2 rounded-xl bg-gradient-to-br ${qt.color} text-white shadow-lg shrink-0`}>
                          <qt.icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{qt.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{qt.desc}</p>
                        </div>
                        <Plus className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question list — scrollable */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId={`questions-${viewPool}`}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="space-y-2"
                        >
                          {currentQuestions.map((question, index) => {
                            const qType = questionTypes.find(qt => qt.type === question.type);
                            return (
                              <Draggable
                                key={question.id}
                                draggableId={question.id}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    onClick={() => setSelectedQuestionId(question.id)}
                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                                      selectedQuestionId === question.id
                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-500 shadow-lg'
                                        : 'bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                                    } ${snapshot.isDragging ? 'shadow-xl' : ''}`}
                                  >
                                    <div {...provided.dragHandleProps} className="p-1">
                                      <GripVertical className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${qType?.color || 'from-gray-400 to-gray-500'} flex items-center justify-center text-white text-sm font-bold shadow`}>
                                      {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                        {question.text || 'Untitled question'}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {qType?.label} • {question.points} pt{question.points !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedQuestionId(question.id);
                                      }}
                                      className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500 rounded-lg"
                                      title="Edit question"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteQuestion(question.id);
                                      }}
                                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg"
                                      title="Delete question"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>

                  {currentQuestions.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-2xl flex items-center justify-center">
                        <HelpCircle className="w-8 h-8 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {viewPool === 'additional' ? 'No additional questions yet' : 'No questions yet'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {viewPool === 'additional'
                          ? 'Optional — add extras here to randomise retakes.'
                          : 'Click a type above to add'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Question Editor — always scrollable, responsive padding */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-white dark:bg-slate-900 min-h-0">
                {selectedQuestion ? (
                  <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
                    {/* Question Type Badge */}
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl bg-gradient-to-br ${questionTypes.find(qt => qt.type === selectedQuestion.type)?.color || 'from-gray-400 to-gray-500'} text-white shadow-lg`}>
                        {(() => {
                          const Icon = questionTypes.find(qt => qt.type === selectedQuestion.type)?.icon || HelpCircle;
                          return <Icon className="w-5 h-5" />;
                        })()}
                      </div>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {questionTypes.find(qt => qt.type === selectedQuestion.type)?.label}
                      </span>
                    </div>

                    {/* Question Text */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Question Text <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={selectedQuestion.text}
                        onChange={(e) =>
                          updateQuestion(selectedQuestion.id, { text: e.target.value })
                        }
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all min-h-[120px] resize-none"
                        placeholder="Enter your question..."
                      />
                    </div>

                    {/* Rich Media */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="p-4 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-xl border border-pink-200 dark:border-pink-800/50">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          <Image className="w-4 h-4 text-pink-500" />
                          Image URL
                        </label>
                        <input
                          type="text"
                          value={selectedQuestion.imageUrl || ''}
                          onChange={(e) =>
                            updateQuestion(selectedQuestion.id, { imageUrl: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-pink-200 dark:border-pink-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                          placeholder="https://..."
                        />
                      </div>
                      <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-200 dark:border-violet-800/50">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          <Music className="w-4 h-4 text-violet-500" />
                          Audio URL
                        </label>
                        <input
                          type="text"
                          value={selectedQuestion.audioUrl || ''}
                          onChange={(e) =>
                            updateQuestion(selectedQuestion.id, { audioUrl: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    {/* MCQ / Multi-Select Options */}
                    {(selectedQuestion.type === 'mcq' || selectedQuestion.type === 'multi_select') && (
                      <div className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-2xl border border-blue-200 dark:border-blue-800/50">
                        <div className="flex items-center justify-between mb-4">
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Answer Options {selectedQuestion.type === 'multi_select' && '(Select all correct)'}
                          </label>
                          <button
                            onClick={() => addOption(selectedQuestion.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Add Option
                          </button>
                        </div>
                        <div className="space-y-3">
                          {selectedQuestion.options.map((option, index) => (
                            <div key={option.id} className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  if (selectedQuestion.type === 'mcq') {
                                    setCorrectAnswer(selectedQuestion.id, index);
                                  } else {
                                    toggleMultiSelectAnswer(selectedQuestion.id, index);
                                  }
                                }}
                                className={`p-2.5 rounded-xl transition-all ${
                                  selectedQuestion.type === 'mcq'
                                    ? selectedQuestion.correctAnswer === index
                                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                      : 'bg-white dark:bg-slate-800 text-gray-400 border-2 border-gray-200 dark:border-slate-600 hover:border-emerald-400'
                                    : (selectedQuestion.correctAnswer as number[]).includes(index)
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                    : 'bg-white dark:bg-slate-800 text-gray-400 border-2 border-gray-200 dark:border-slate-600 hover:border-emerald-400'
                                }`}
                              >
                                {selectedQuestion.type === 'mcq' ? (
                                  selectedQuestion.correctAnswer === index ? (
                                    <CheckCircle className="w-5 h-5" />
                                  ) : (
                                    <Circle className="w-5 h-5" />
                                  )
                                ) : (selectedQuestion.correctAnswer as number[]).includes(index) ? (
                                  <Check className="w-5 h-5" />
                                ) : (
                                  <Square className="w-5 h-5" />
                                )}
                              </button>
                              <div className="flex-1 relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                                  {String.fromCharCode(65 + index)}.
                                </span>
                                <input
                                  type="text"
                                  value={option.text}
                                  onChange={(e) =>
                                    updateOption(selectedQuestion.id, option.id, e.target.value)
                                  }
                                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                                />
                              </div>
                              {selectedQuestion.options.length > 2 && (
                                <button
                                  onClick={() => deleteOption(selectedQuestion.id, option.id)}
                                  className="p-2.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-xl"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* True/False */}
                    {selectedQuestion.type === 'true_false' && (
                      <div className="p-5 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/50">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                          Correct Answer
                        </label>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          {[true, false].map((value) => (
                            <button
                              key={value.toString()}
                              onClick={() => setCorrectAnswer(selectedQuestion.id, value)}
                              className={`py-4 px-6 rounded-xl font-bold text-lg transition-all ${
                                selectedQuestion.correctAnswer === value
                                  ? value
                                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30'
                                    : 'bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-lg shadow-rose-500/30'
                                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                              }`}
                            >
                              {value ? '✓ True' : '✗ False'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Drag & Drop Matching */}
                    {selectedQuestion.type === 'drag_drop' && selectedQuestion.dragDropPairs && (
                      <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl border border-amber-200 dark:border-amber-800/50">
                        <div className="flex items-center justify-between mb-4">
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Matching Pairs
                          </label>
                          <button
                            onClick={() => addDragDropPair(selectedQuestion.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Add Pair
                          </button>
                        </div>
                        <div className="space-y-3">
                          {selectedQuestion.dragDropPairs.map((pair, index) => (
                            <div key={pair.id} className="flex items-center gap-3">
                              <input
                                type="text"
                                value={pair.left}
                                onChange={(e) =>
                                  updateDragDropPair(selectedQuestion.id, pair.id, 'left', e.target.value)
                                }
                                className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                placeholder="Left item"
                              />
                              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                                <ArrowLeftRight className="w-5 h-5 text-amber-600" />
                              </div>
                              <input
                                type="text"
                                value={pair.right}
                                onChange={(e) =>
                                  updateDragDropPair(selectedQuestion.id, pair.id, 'right', e.target.value)
                                }
                                className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                placeholder="Right item"
                              />
                              {selectedQuestion.dragDropPairs!.length > 2 && (
                                <button
                                  onClick={() => deleteDragDropPair(selectedQuestion.id, pair.id)}
                                  className="p-2.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-xl"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fill in the Blanks */}
                    {selectedQuestion.type === 'fill_blank' && selectedQuestion.blanks && (
                      <div className="p-5 bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 rounded-2xl border border-rose-200 dark:border-rose-800/50">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Correct Answers
                            </label>
                            <p className="text-xs text-gray-500 mt-0.5">Use ___ in question for blanks</p>
                          </div>
                          <button
                            onClick={() => addBlank(selectedQuestion.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Add Blank
                          </button>
                        </div>
                        <div className="space-y-3">
                          {selectedQuestion.blanks.map((blank, index) => (
                            <div key={index} className="flex items-center gap-3">
                              <span className="w-20 text-sm font-semibold text-gray-500">Blank {index + 1}:</span>
                              <input
                                type="text"
                                value={blank}
                                onChange={(e) =>
                                  updateBlank(selectedQuestion.id, index, e.target.value)
                                }
                                className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                                placeholder="Correct answer"
                              />
                              {selectedQuestion.blanks!.length > 1 && (
                                <button
                                  onClick={() => deleteBlank(selectedQuestion.id, index)}
                                  className="p-2.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-xl"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Explanation */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Explanation (shown after answer)
                      </label>
                      <textarea
                        value={selectedQuestion.explanation || ''}
                        onChange={(e) =>
                          updateQuestion(selectedQuestion.id, { explanation: e.target.value })
                        }
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all min-h-[80px] resize-none"
                        placeholder="Explain why this is the correct answer..."
                      />
                    </div>

                    {/* Points & Negative Marks */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          <Target className="w-4 h-4 text-emerald-500" />
                          Points
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={selectedQuestion.points}
                          onChange={(e) =>
                            updateQuestion(selectedQuestion.id, {
                              points: parseInt(e.target.value) || 1,
                            })
                          }
                          className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 rounded-lg text-center font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div className="p-4 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-xl border border-red-200 dark:border-red-800/50">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          <Minus className="w-4 h-4 text-red-500" />
                          Negative Marks
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={selectedQuestion.negativeMarks}
                          onChange={(e) =>
                            updateQuestion(selectedQuestion.id, {
                              negativeMarks: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-700 rounded-lg text-center font-bold text-red-600 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        />
                      </div>
                    </div>

                    {/* Tags */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Tags (for question banking)
                      </label>
                      <input
                        type="text"
                        value={selectedQuestion.tags.join(', ')}
                        onChange={(e) =>
                          updateQuestion(selectedQuestion.id, {
                            tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                          })
                        }
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="e.g., chapter-1, easy, concept-a"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-2xl flex items-center justify-center">
                        <HelpCircle className="w-10 h-10 text-emerald-500" />
                      </div>
                      <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Select a question to edit</p>
                      <p className="text-sm text-gray-500 mt-2">or add a new question from the left panel</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-white dark:bg-slate-900 min-h-0">
              <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
                {/* Randomization */}
                <div className="p-5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl border border-purple-200 dark:border-purple-800/50">
                  <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-3 mb-5">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                      <Shuffle className="w-5 h-5 text-purple-600" />
                    </div>
                    Randomization
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Randomize question order</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizData.settings.randomizeQuestions}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, randomizeQuestions: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-pink-500"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Randomize option order</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizData.settings.randomizeOptions}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, randomizeOptions: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-pink-500"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Question Banking */}
                <div className="p-5 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-2xl border border-cyan-200 dark:border-cyan-800/50">
                  <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-3 mb-5">
                    <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl">
                      <RefreshCw className="w-5 h-5 text-cyan-600" />
                    </div>
                    Question Banking
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable question banking</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizData.settings.useQuestionBank}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, useQuestionBank: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-cyan-500 peer-checked:to-blue-500"></div>
                      </label>
                    </div>
                    {quizData.settings.useQuestionBank && (
                      <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Questions to show (from pool of {quizData.questions.length})
                        </span>
                        <input
                          type="number"
                          min="1"
                          max={quizData.questions.length}
                          value={quizData.settings.questionsToShow || quizData.questions.length}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, questionsToShow: parseInt(e.target.value) || undefined },
                            }))
                          }
                          className="w-20 px-3 py-2 border border-cyan-300 dark:border-cyan-700 rounded-lg text-center font-bold text-cyan-600"
                        />
                      </div>
                    )}
                    {/* Additional pool sampling — only relevant when extras have been added. */}
                    {quizData.additionalQuestions.length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Extras to include per attempt (pool: {quizData.additionalQuestions.length})
                        </span>
                        <input
                          type="number"
                          min="1"
                          max={quizData.additionalQuestions.length}
                          placeholder="half"
                          value={quizData.settings.additionalQuestionsToInclude || ''}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: {
                                ...prev.settings,
                                additionalQuestionsToInclude: parseInt(e.target.value) || undefined,
                              },
                            }))
                          }
                          className="w-20 px-3 py-2 border border-indigo-300 dark:border-indigo-700 rounded-lg text-center font-bold text-indigo-600"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Scoring */}
                <div className="p-5 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/50">
                  <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-3 mb-5">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                      <Target className="w-5 h-5 text-emerald-600" />
                    </div>
                    Scoring
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Passing score</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={quizData.settings.passingScore}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, passingScore: parseInt(e.target.value) || 70 },
                            }))
                          }
                          className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <span className="w-12 px-2 py-1 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-center font-bold text-emerald-600">
                          {quizData.settings.passingScore}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable negative marking</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizData.settings.negativeMarkingEnabled}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, negativeMarkingEnabled: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-emerald-500 peer-checked:to-green-500"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Time & Attempts */}
                <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl border border-amber-200 dark:border-amber-800/50">
                  <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-3 mb-5">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    Time & Attempts
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Time limit (minutes)</span>
                      <input
                        type="number"
                        min="1"
                        value={quizData.settings.timeLimit || ''}
                        onChange={(e) =>
                          setQuizData((prev) => ({
                            ...prev,
                            settings: { ...prev.settings, timeLimit: e.target.value ? parseInt(e.target.value) : undefined },
                          }))
                        }
                        className="w-24 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg text-center font-bold text-amber-600"
                        placeholder="∞"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Maximum attempts</span>
                      <input
                        type="number"
                        min="1"
                        value={quizData.settings.maxAttempts}
                        onChange={(e) =>
                          setQuizData((prev) => ({
                            ...prev,
                            settings: { ...prev.settings, maxAttempts: parseInt(e.target.value) || 3 },
                          }))
                        }
                        className="w-24 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg text-center font-bold text-amber-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                <div className="p-5 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-2xl border border-indigo-200 dark:border-indigo-800/50">
                  <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-3 mb-5">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                      <CheckCircle className="w-5 h-5 text-indigo-600" />
                    </div>
                    Feedback
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Show correct answers after submission</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizData.settings.showCorrectAnswers}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, showCorrectAnswers: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-violet-500"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Show explanations</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizData.settings.showExplanations}
                          onChange={(e) =>
                            setQuizData((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, showExplanations: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-violet-500"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <PasteQuestionsModal
        open={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        onApply={applyPastedQuestions}
      />
    </div>
  );
};

export default QuizBuilderAdvanced;
