'use client';
/**
 * QuizCreator — ported from the old QuikSkills frontend
 * (`src/components/QuizCreator.tsx`).
 *
 * Modal quiz authoring form (react-hook-form) used to create or edit an
 * assessment attached to a module:
 *   - main question bank (MCQ single/multi-select and True/False),
 *   - optional randomization (serve a random subset per attempt),
 *   - optional "additional questions" bonus pool mixed into each attempt,
 *   - paste-to-quiz import via PasteQuestionsModal + parseQuizPaste.
 *
 * Behaviour is a 1:1 port; only the axios → fetch api-client semantics and the
 * Next.js client-component boilerplate differ.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { api } from '@/lib/api';
import PasteQuestionsModal from '@/components/PasteQuestionsModal';
import type { ParsedQuestion } from '@/lib/utils/parseQuizPaste';

interface QuizCreatorProps {
  moduleId: string;
  onClose: () => void;
  onSuccess: () => void;
  assessmentId?: string; // For editing existing quiz
}

interface QuestionForm {
  text: string;
  type: 'MCQ' | 'True/False';
  options: string[];
  correctAnswerIndex: number | number[]; // Array for multi-select
  explanation?: string;
  points: number;
  isMultiSelect?: boolean; // Toggle for single vs multi-select
}

interface QuizForm {
  title: string;
  questions: QuestionForm[];
  passingScore: number;
  retryLimit: number;
  timeLimit?: number;
  // Randomization — when checked, the quiz serves a random subset of
  // `questionsToShow` questions per attempt. Unchecked → every question
  // is shown in the order created.
  randomizeQuestions?: boolean;
  questionsToShow?: number;
  // Optional bonus pool — sampled per attempt and mixed into the quiz
  // to make retakes feel less predictable.
  additionalQuestions: QuestionForm[];
  additionalQuestionsToInclude?: number;
}

/** Response BODY of GET /assessments/:id */
interface AssessmentResponse {
  success?: boolean;
  data: any;
}

const QuizCreator: React.FC<QuizCreatorProps> = ({ moduleId, onClose, onSuccess, assessmentId }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!assessmentId);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<QuizForm>({
    defaultValues: {
      title: '',
      questions: [
        {
          text: '',
          type: 'MCQ',
          options: ['', ''],
          correctAnswerIndex: 0,
          points: 1,
          isMultiSelect: false,
        },
      ],
      passingScore: 80,
      retryLimit: 3,
      randomizeQuestions: false,
      additionalQuestions: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'questions',
  });

  const {
    fields: additionalFields,
    append: appendAdditional,
    remove: removeAdditional,
    replace: replaceAdditional,
  } = useFieldArray({
    control,
    name: 'additionalQuestions',
  });

  const [additionalOpen, setAdditionalOpen] = useState(false);

  const loadQuizData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<AssessmentResponse>(`/assessments/${assessmentId}`);
      const assessment = response.data;

      const mapQ = (q: any): QuestionForm => ({
        text: q.text || '',
        type: q.type || 'MCQ',
        options: q.options && q.options.length > 0 ? q.options : ['', ''],
        correctAnswerIndex: Array.isArray(q.correctAnswerIndex)
          ? q.correctAnswerIndex
          : (q.correctAnswerIndex !== undefined && q.correctAnswerIndex !== null)
            ? q.correctAnswerIndex
            : 0,
        explanation: q.explanation || '',
        points: q.points || 1,
        isMultiSelect: Array.isArray(q.correctAnswerIndex),
      });

      // Map questions from API response
      const mappedQuestions = assessment.questions?.length > 0
        ? assessment.questions.map(mapQ)
        : [
          {
            text: '',
            type: 'MCQ' as const,
            options: ['', ''],
            correctAnswerIndex: 0,
            points: 1,
            isMultiSelect: false,
          },
        ];

      const mappedAdditional: QuestionForm[] = (assessment.additionalQuestions || []).map(mapQ);

      // Reset form with all data
      reset({
        title: assessment.title || '',
        passingScore: assessment.passingScore || 80,
        retryLimit: assessment.retryLimit || 3,
        timeLimit: assessment.timeLimit || undefined,
        randomizeQuestions: !!assessment.randomizeQuestions,
        questionsToShow: assessment.questionsToShow || undefined,
        questions: mappedQuestions,
        additionalQuestions: mappedAdditional,
        additionalQuestionsToInclude: assessment.additionalQuestionsToInclude || undefined,
      });

      // Replace field array to ensure questions are displayed
      replace(mappedQuestions);
      replaceAdditional(mappedAdditional);
      if (mappedAdditional.length > 0) setAdditionalOpen(true);
    } catch (err: unknown) {
      console.error('Error loading quiz data:', err);
      setError((err as { message?: string })?.message || 'Failed to load quiz data');
    } finally {
      setLoading(false);
    }
  }, [assessmentId, reset, replace]);

  // Load existing quiz data when editing
  useEffect(() => {
    if (assessmentId) {
      loadQuizData();
    } else {
      // Reset to default when not editing
      reset({
        title: '',
        questions: [
          {
            text: '',
            type: 'MCQ',
            options: ['', ''],
            correctAnswerIndex: 0,
            points: 1,
            isMultiSelect: false,
          },
        ],
        passingScore: 80,
        retryLimit: 3,
      });
      replace([
        {
          text: '',
          type: 'MCQ',
          options: ['', ''],
          correctAnswerIndex: 0,
          points: 1,
          isMultiSelect: false,
        },
      ]);
    }
  }, [assessmentId, loadQuizData, reset, replace, replaceAdditional]);

  const onSubmit = async (data: QuizForm) => {
    setSubmitting(true);
    setError(null);

    try {
      // Validate questions
      const validQuestions = data.questions.filter(
        (q) => q.text.trim() && q.options.filter((o) => o.trim()).length >= 2,
      );

      if (validQuestions.length === 0) {
        setError('Please add at least one valid question');
        setSubmitting(false);
        return;
      }

      const toPayload = (q: QuestionForm) => ({
        text: q.text,
        type: q.type,
        options: q.options.filter((o) => o.trim()),
        correctAnswerIndex: q.isMultiSelect && Array.isArray(q.correctAnswerIndex)
          ? q.correctAnswerIndex
          : Array.isArray(q.correctAnswerIndex)
            ? q.correctAnswerIndex[0]
            : q.correctAnswerIndex,
        explanation: q.explanation,
        points: q.points || 1,
      });
      const questionsPayload = validQuestions.map(toPayload);

      // Additional questions are optional; only valid entries (with text +
      // at least 2 options) are sent so empty rows don't pollute the pool.
      const validAdditional = (data.additionalQuestions || []).filter(
        (q) => q.text.trim() && q.options.filter((o) => o.trim()).length >= 2,
      );
      const additionalPayload = validAdditional.map(toPayload);
      const additionalToInclude =
        additionalPayload.length > 0 &&
        data.additionalQuestionsToInclude &&
        data.additionalQuestionsToInclude > 0
          ? Number(data.additionalQuestionsToInclude)
          : undefined;

      // Randomization is only meaningful when the toggle is on AND a subset
      // size has been chosen. Send `randomizeQuestions=false` and a null
      // `questionsToShow` otherwise so the backend serves all questions.
      const randomizeOn = !!data.randomizeQuestions;
      const questionsToShow = randomizeOn && data.questionsToShow && data.questionsToShow > 0
        ? Number(data.questionsToShow)
        : undefined;

      const payload: any = {
        title: data.title,
        questions: questionsPayload,
        passingScore: data.passingScore,
        retryLimit: data.retryLimit,
        timeLimit: data.timeLimit || undefined,
        randomizeQuestions: randomizeOn,
        questionsToShow,
        additionalQuestions: additionalPayload,
        additionalQuestionsToInclude: additionalToInclude,
      };

      if (assessmentId) {
        await api.put(`/assessments/${assessmentId}`, payload);
      } else {
        await api.post('/assessments', { ...payload, moduleId });
      }

      onSuccess();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || `Failed to ${assessmentId ? 'update' : 'create'} quiz`);
      setSubmitting(false);
    }
  };

  const blankQuestion = (): QuestionForm => ({
    text: '',
    type: 'MCQ',
    options: ['', ''],
    correctAnswerIndex: 0,
    points: 1,
    isMultiSelect: false,
  });

  const addQuestion = () => {
    append(blankQuestion());
  };

  const addAdditionalQuestion = () => {
    appendAdditional(blankQuestion());
  };

  /**
   * Convert ParsedQuestion → QuestionForm and append to the form state.
   * If the only question currently in the form is the empty placeholder
   * (created by useForm's defaultValues), replace it with the first
   * parsed question instead of appending — so the author doesn't end up
   * with a stray blank question above their pasted content.
   */
  const applyParsedQuestions = (parsed: ParsedQuestion[]) => {
    if (parsed.length === 0) return;
    const mapped = parsed.map(q => ({
      text: q.text,
      type: q.type,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      points: 1,
      isMultiSelect: q.isMultiSelect,
    }));
    const current = watch('questions') || [];
    const onlyOnePlaceholder =
      current.length === 1 &&
      !(current[0]?.text || '').trim() &&
      (current[0]?.options || []).every(o => !(o || '').trim());
    if (onlyOnePlaceholder) {
      replace(mapped);
    } else {
      mapped.forEach(q => append(q));
    }
  };

  type QuestionsBasePath = 'questions' | 'additionalQuestions';

  const addOption = (basePath: QuestionsBasePath, questionIndex: number) => {
    const optionsPath = `${basePath}.${questionIndex}.options` as const;
    const currentOptions = watch(optionsPath as any) as string[];
    const newOptions = [...currentOptions, ''];
    setValue(optionsPath as any, newOptions as any);
  };

  const removeOption = (basePath: QuestionsBasePath, questionIndex: number, optionIndex: number) => {
    const optionsPath = `${basePath}.${questionIndex}.options` as const;
    const correctPath = `${basePath}.${questionIndex}.correctAnswerIndex` as const;
    const multiPath = `${basePath}.${questionIndex}.isMultiSelect` as const;
    const currentOptions = watch(optionsPath as any) as string[];
    const newOptions = currentOptions.filter((_, idx) => idx !== optionIndex);
    setValue(optionsPath as any, newOptions as any);

    // Also update correctAnswerIndex if the removed option was selected
    const currentCorrectAnswers = watch(correctPath as any) as number | number[];
    const isMultiSelect = watch(multiPath as any) as boolean;

    if (isMultiSelect && Array.isArray(currentCorrectAnswers)) {
      const updatedAnswers = currentCorrectAnswers
        .filter((idx: number) => idx !== optionIndex)
        .map((idx: number) => idx > optionIndex ? idx - 1 : idx);
      setValue(correctPath as any, updatedAnswers as any);
    } else if (!isMultiSelect && typeof currentCorrectAnswers === 'number' && currentCorrectAnswers === optionIndex) {
      setValue(correctPath as any, 0 as any);
    } else if (!isMultiSelect && typeof currentCorrectAnswers === 'number' && currentCorrectAnswers > optionIndex) {
      setValue(correctPath as any, (currentCorrectAnswers - 1) as any);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {assessmentId ? 'Edit Quiz' : 'Create Quiz'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="label-field">
                  Quiz Title <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('title', { required: 'Quiz title is required' })}
                  className="input-field"
                  placeholder="Enter quiz title"
                  disabled={submitting}
                />
                {errors.title && (
                  <p className="error-message">{errors.title.message}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label-field">
                    Passing Score (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    {...register('passingScore', {
                      required: true,
                      min: 0,
                      max: 100,
                    })}
                    className="input-field"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="label-field">Retry Limit</label>
                  <input
                    type="number"
                    {...register('retryLimit', { min: 0 })}
                    className="input-field"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="label-field">Time Limit (minutes)</label>
                  <input
                    type="number"
                    {...register('timeLimit', { min: 0 })}
                    className="input-field"
                    placeholder="Optional"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Randomization toggle — only ask "questions to show" when enabled. */}
              {(() => {
                const randomizeChecked = !!watch('randomizeQuestions');
                const questionCount = (watch('questions') || []).length;
                return (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        {...register('randomizeQuestions')}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        disabled={submitting}
                      />
                      <span>
                        <span className="block font-semibold text-gray-900 text-sm">
                          Randomize questions on retake
                        </span>
                        <span className="block text-xs text-gray-500 mt-0.5">
                          When enabled, every attempt shows a random subset of the questions you create. Otherwise all questions are shown in order.
                        </span>
                      </span>
                    </label>
                    {randomizeChecked && (
                      <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="text-xs text-gray-600 self-end pb-2">
                          Question bank: <span className="font-bold text-gray-900">{questionCount}</span> question{questionCount === 1 ? '' : 's'} created
                        </div>
                        <div>
                          <label className="label-field text-xs">Questions to show per attempt</label>
                          <input
                            type="number"
                            {...register('questionsToShow', { min: 1 })}
                            className="input-field"
                            placeholder={`e.g. ${Math.max(1, Math.min(questionCount, 10))}`}
                            min={1}
                            disabled={submitting}
                          />
                          <p className="text-[11px] text-gray-500 mt-1">
                            If you ask for more than the bank holds, the learner sees all available questions.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                /**
                 * Render a single question editor row. Used for both the main
                 * question list and the optional additional pool — the
                 * basePath argument switches the RHF field paths between
                 * `questions` and `additionalQuestions`.
                 */
                const renderQuestionEditor = (
                  basePath: QuestionsBasePath,
                  field: { id: string },
                  questionIndex: number,
                  total: number,
                  onRemove: (idx: number) => void,
                  allowRemove: boolean,
                  labelPrefix: string,
                  radioGroupSuffix: string,
                ) => {
                  const questionType = watch(`${basePath}.${questionIndex}.type` as any) as 'MCQ' | 'True/False';
                  const options = (watch(`${basePath}.${questionIndex}.options` as any) as string[]) || [];
                  const isMultiSelect = !!watch(`${basePath}.${questionIndex}.isMultiSelect` as any);
                  const currentCorrectAnswers = watch(`${basePath}.${questionIndex}.correctAnswerIndex` as any) as number | number[];

                  return (
                    <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-4">
                        <h4 className="font-medium text-gray-900">
                          {labelPrefix} {questionIndex + 1}
                        </h4>
                        {allowRemove && (
                          <button
                            type="button"
                            onClick={() => onRemove(questionIndex)}
                            className="text-red-600 hover:text-red-700 text-sm"
                            disabled={submitting}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="label-field">Question Text</label>
                          <textarea
                            {...register(`${basePath}.${questionIndex}.text` as any, { required: 'Question text is required' })}
                            className="input-field"
                            rows={2}
                            placeholder="Enter your question"
                            disabled={submitting}
                          />
                        </div>

                        <div>
                          <label className="label-field">Question Type</label>
                          <select
                            {...register(`${basePath}.${questionIndex}.type` as any)}
                            className="input-field"
                            disabled={submitting}
                          >
                            <option value="MCQ">Multiple Choice</option>
                            <option value="True/False">True/False</option>
                          </select>
                        </div>

                        {questionType === 'MCQ' && (
                          <div>
                            <div className="mb-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                              <label className="label-field mb-3 block font-semibold text-gray-900">
                                Answer Selection Type <span className="text-red-500">*</span>
                              </label>
                              <div className="flex items-center gap-4">
                                <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${!isMultiSelect
                                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                                    : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                                  }`}>
                                  <input
                                    type="radio"
                                    name={`answerType-${radioGroupSuffix}-${questionIndex}`}
                                    checked={!isMultiSelect}
                                    onChange={() => {
                                      setValue(`${basePath}.${questionIndex}.isMultiSelect` as any, false as any);
                                      setValue(`${basePath}.${questionIndex}.correctAnswerIndex` as any, 0 as any);
                                    }}
                                    className="w-4 h-4 text-primary-600"
                                    disabled={submitting}
                                  />
                                  <span className="font-medium">Single Select</span>
                                </label>
                                <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${isMultiSelect
                                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                                    : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                                  }`}>
                                  <input
                                    type="radio"
                                    name={`answerType-${radioGroupSuffix}-${questionIndex}`}
                                    checked={isMultiSelect}
                                    onChange={() => {
                                      setValue(`${basePath}.${questionIndex}.isMultiSelect` as any, true as any);
                                      setValue(`${basePath}.${questionIndex}.correctAnswerIndex` as any, [] as any);
                                    }}
                                    className="w-4 h-4 text-primary-600"
                                    disabled={submitting}
                                  />
                                  <span className="font-medium">Multi Select</span>
                                </label>
                              </div>
                              <p className="text-sm text-gray-600 mt-2">
                                {isMultiSelect
                                  ? '✓ Multiple answers can be selected as correct (checkboxes will be shown to learners)'
                                  : '✓ Only one answer can be selected as correct (radio buttons will be shown to learners)'}
                              </p>
                            </div>
                            <label className="label-field">Options</label>
                            {options.map((_, optionIndex) => {
                              const correctAnswersArray = Array.isArray(currentCorrectAnswers)
                                ? currentCorrectAnswers
                                : [currentCorrectAnswers].filter(v => v !== undefined);
                              const isChecked = isMultiSelect
                                ? correctAnswersArray.includes(optionIndex)
                                : currentCorrectAnswers === optionIndex;

                              return (
                                <div key={optionIndex} className="flex items-center gap-2 mb-2">
                                  <input
                                    type={isMultiSelect ? 'checkbox' : 'radio'}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (isMultiSelect) {
                                        const currentAnswers = Array.isArray(currentCorrectAnswers)
                                          ? currentCorrectAnswers
                                          : [];
                                        if (e.target.checked) {
                                          setValue(`${basePath}.${questionIndex}.correctAnswerIndex` as any, [...currentAnswers, optionIndex] as any);
                                        } else {
                                          setValue(`${basePath}.${questionIndex}.correctAnswerIndex` as any, currentAnswers.filter((idx: number) => idx !== optionIndex) as any);
                                        }
                                      } else {
                                        setValue(`${basePath}.${questionIndex}.correctAnswerIndex` as any, optionIndex as any);
                                      }
                                    }}
                                    className={`w-4 h-4 text-primary-600 ${isMultiSelect ? 'rounded' : ''}`}
                                    disabled={submitting}
                                  />
                                  <input
                                    {...register(`${basePath}.${questionIndex}.options.${optionIndex}` as any, { required: 'Option text is required' })}
                                    className="input-field flex-1"
                                    placeholder={`Option ${optionIndex + 1}`}
                                    disabled={submitting}
                                  />
                                  {options.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() => removeOption(basePath, questionIndex, optionIndex)}
                                      className="text-red-600 hover:text-red-700"
                                      disabled={submitting}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => addOption(basePath, questionIndex)}
                              className="text-sm text-primary-600 hover:text-primary-700 mt-2"
                              disabled={submitting}
                            >
                              + Add Option
                            </button>
                          </div>
                        )}

                        {questionType === 'True/False' && (
                          <div>
                            <label className="label-field">Correct Answer</label>
                            <select
                              {...register(`${basePath}.${questionIndex}.correctAnswerIndex` as any)}
                              className="input-field"
                              disabled={submitting}
                            >
                              <option value={0}>True</option>
                              <option value={1}>False</option>
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="label-field">Points</label>
                          <input
                            type="number"
                            {...register(`${basePath}.${questionIndex}.points` as any, { min: 1, valueAsNumber: true })}
                            className="input-field"
                            defaultValue={1}
                            disabled={submitting}
                          />
                        </div>

                        <div>
                          <label className="label-field">Explanation (Optional)</label>
                          <textarea
                            {...register(`${basePath}.${questionIndex}.explanation` as any)}
                            className="input-field"
                            rows={2}
                            placeholder="Explanation shown after quiz submission"
                            disabled={submitting}
                          />
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">Questions</h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPasteModalOpen(true)}
                            className="text-sm px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold transition-colors"
                            disabled={submitting}
                            title="Paste a block of text — the parser will extract the question, options, and correct answer."
                          >
                            📋 Paste Questions
                          </button>
                          <button
                            type="button"
                            onClick={addQuestion}
                            className="btn-primary text-sm"
                            disabled={submitting}
                          >
                            + Add Question
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {fields.map((field, questionIndex) =>
                          renderQuestionEditor(
                            'questions',
                            field,
                            questionIndex,
                            fields.length,
                            remove,
                            fields.length > 1,
                            'Question',
                            'main',
                          ),
                        )}
                      </div>
                    </div>

                    {/* Optional bonus pool — sampled per attempt to make retakes feel fresh. */}
                    <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 p-4">
                      <button
                        type="button"
                        onClick={() => setAdditionalOpen(o => !o)}
                        className="w-full flex items-center justify-between text-left"
                        disabled={submitting}
                      >
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            Additional Questions <span className="text-sm font-normal text-gray-500">(Optional)</span>
                          </h3>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Bonus pool — extras swap into some of the main slots each attempt to add variety on retakes. They replace main questions, they don&apos;t grow the quiz. {additionalFields.length > 0 && (
                              <span className="font-semibold text-indigo-700">{additionalFields.length} added.</span>
                            )}
                          </p>
                        </div>
                        <span className="text-2xl text-indigo-700">{additionalOpen ? '−' : '+'}</span>
                      </button>

                      {additionalOpen && (
                        <div className="mt-4 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="label-field text-xs">Extras to include per attempt</label>
                              <input
                                type="number"
                                {...register('additionalQuestionsToInclude', { min: 1 })}
                                className="input-field"
                                placeholder={additionalFields.length > 0 ? `e.g. ${Math.min(additionalFields.length, 3)}` : 'Leave blank for all'}
                                min={1}
                                disabled={submitting}
                              />
                              <p className="text-[11px] text-gray-500 mt-1">
                                Blank = mix roughly half. Capped by the pool size and the served total.
                              </p>
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={addAdditionalQuestion}
                                className="btn-secondary text-sm"
                                disabled={submitting}
                              >
                                + Add Additional Question
                              </button>
                            </div>
                          </div>

                          {additionalFields.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">No additional questions yet. Click &quot;Add Additional Question&quot; to start a bonus pool.</p>
                          ) : (
                            <div className="space-y-6">
                              {additionalFields.map((field, questionIndex) =>
                                renderQuestionEditor(
                                  'additionalQuestions',
                                  field,
                                  questionIndex,
                                  additionalFields.length,
                                  removeAdditional,
                                  true,
                                  'Extra',
                                  'additional',
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800">{error}</p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1"
                >
                  {submitting
                    ? (assessmentId ? 'Updating Quiz...' : 'Creating Quiz...')
                    : (assessmentId ? 'Update Quiz' : 'Create Quiz')}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <PasteQuestionsModal
        open={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        onApply={applyParsedQuestions}
      />
    </div>
  );
};

export default QuizCreator;
