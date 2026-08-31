'use client';
/**
 * InteractiveQuizComponent — ported from the old QuikLMSs frontend
 * (`src/components/learner/InteractiveQuizComponent.tsx`).
 *
 * Renders the full interactive quiz-taking experience:
 *   - loads the assessment (optionally scoped to an active proctoring session
 *     so the backend serves the randomized question subset locked in at start),
 *   - supports MCQ / MultiSelect / TrueFalse / FillBlank / Match questions,
 *   - counts down the optional time limit and auto-submits at zero,
 *   - submits to /learner/submit-quiz and syncs completion to player progress.
 *
 * Behaviour is a 1:1 port; only the axios → fetch api-client semantics and the
 * Next.js client-component boilerplate differ.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Clock, CheckCircle,
  AlertCircle, ChevronRight, ChevronLeft, ArrowLeft
} from 'lucide-react';
import { api } from '@/lib/api';

interface DragDropPair {
  id: string;
  left: string;
  right: string;
}

interface Question {
  text: string;
  type: string;
  options: (string | { text?: string; label?: string; value?: string; id?: string })[];
  correctAnswerIndex: number | number[];
  explanation?: string;
  points: number;
  blanks?: string[];
  dragDropPairs?: DragDropPair[];
  imageUrl?: string;
  audioUrl?: string;
}

interface Assessment {
  _id: string;
  title: string;
  questions: Question[];
  passingScore: number;
  retryLimit: number;
  timeLimit?: number; // in minutes
}

interface QuizResult {
  passed: boolean;
  percentage: number;
  score: number;
  totalPoints: number;
  // Counts surfaced on the post-quiz screen.
  correctCount?: number;
  wrongCount?: number;
  totalQuestions?: number;
  // Passing score used to compute pass/fail — creator-defined value, or 75 by default.
  passingScore?: number;
  attemptsRemaining?: number;
  certificateUrl?: string;
}

/** Shape of a single lessonProgress entry returned by /progress/:courseId. */
interface LessonProgressEntry {
  lessonId?: string;
  isCompleted?: boolean;
}

/** Payload returned by POST /learner/submit-quiz. */
interface SubmitQuizData {
  passed: boolean;
  percentage: number;
  score?: number;
  totalPoints?: number;
  correctCount?: number;
  wrongCount?: number;
  totalQuestions?: number;
  passingScore?: number;
  certificateUrl?: string;
}

interface SubmitAnswer {
  questionId: string;
  selectedAnswerIndex: number;
  textAnswer?: string;
  matchAnswers?: { left: string; right: string }[];
}

interface InteractiveQuizComponentProps {
  assessmentId: string;
  courseId: string;
  lessonId?: string;
  // When true, skip the "already attempted" gate so the learner can retake the quiz.
  retakeMode?: boolean;
  // Active proctoring session — used so the backend can serve the
  // randomized question subset that was locked in at session start, and so
  // the submit endpoint scores against the same subset.
  sessionId?: string;
  onComplete: (result: QuizResult) => void;
  onCancel: () => void;
}

const InteractiveQuizComponent: React.FC<InteractiveQuizComponentProps> = ({
  assessmentId,
  courseId,
  lessonId,
  // retakeMode is accepted for API compatibility with ProctoredQuizWrapper
  // but no longer consumed — the client-side "already completed" gate was removed.
  retakeMode: _retakeMode,
  sessionId,
  onComplete,
  onCancel,
}) => {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [answers, setAnswers] = useState<Record<number, number | number[]>>({});
  const [textAnswers, setTextAnswers] = useState<Record<number, string>>({});
  const [matchAnswers, setMatchAnswers] = useState<Record<number, Record<string, string>>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);


  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAssessment();
    loadAttemptsRemaining();
  }, [assessmentId, courseId]);

  useEffect(() => {
    if (assessment?.timeLimit && timeRemaining !== null) {
      if (timeRemaining <= 0) {
        handleSubmit();
        return;
      }
      timerInterval.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 0) {
            if (timerInterval.current) {
              clearInterval(timerInterval.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
        }
      };
    }
  }, [timeRemaining, assessment]);

  const loadAssessment = async () => {
    try {
      console.log(`[InteractiveQuiz] Loading assessment: ${assessmentId}`);
      // Pass the active proctoring session so the backend can serve only the
      // randomized question subset locked in at session start.
      const url = sessionId
        ? `/assessments/${assessmentId}?sessionId=${encodeURIComponent(sessionId)}`
        : `/assessments/${assessmentId}`;
      const response = await api.get<{ success: boolean; data: Assessment | null }>(url);
      console.log(`[InteractiveQuiz] Response:`, response);
      const assessmentData = response.data;
      console.log(`[InteractiveQuiz] Assessment data:`, {
        title: assessmentData?.title,
        questionsCount: assessmentData?.questions?.length,
        hasQuestions: !!assessmentData?.questions,
      });

      if (!assessmentData) {
        throw new Error('Assessment data is null or undefined');
      }

      if (!assessmentData.questions || assessmentData.questions.length === 0) {
        throw new Error('Assessment has no questions');
      }

      setAssessment(assessmentData);

      if (assessmentData.timeLimit) {
        setTimeRemaining(assessmentData.timeLimit * 60); // Convert minutes to seconds
      }
    } catch (error: unknown) {
      console.error(`[InteractiveQuiz] Error loading assessment:`, error);
      setError((error as { message?: string })?.message || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  };

  const loadAttemptsRemaining = async () => {
    try {
      let fromProgress = false;
      try {
        const progressRes = await api.get<{ data?: { lessonProgress?: Record<string, LessonProgressEntry> } }>(`/progress/${courseId}`);
        const lp = progressRes.data?.lessonProgress || {};
        fromProgress = !!(
          lp[assessmentId]?.isCompleted === true ||
          Object.values(lp).some(
            (p) =>
              p &&
              (p.lessonId === assessmentId || String(p.lessonId) === String(assessmentId)) &&
              p.isCompleted === true,
          )
        );
      } catch {
        // progress optional
      }

      const response = await api.get<{ data?: unknown[] }>(`/learner/assessments/${assessmentId}/attempts`);
      const attempts = response.data || [];
      const alreadyTaken = attempts.length >= 1 || fromProgress;
      // Learners get at most one scored submission per quiz (matches backend).
      setAttemptsRemaining(alreadyTaken ? 0 : 1);
    } catch (error) {
      console.error('Failed to load attempts:', error);
      try {
        const progressRes = await api.get<{ data?: { lessonProgress?: Record<string, LessonProgressEntry> } }>(`/progress/${courseId}`);
        const lp = progressRes.data?.lessonProgress || {};
        const fromProgress = !!(
          lp[assessmentId]?.isCompleted === true ||
          Object.values(lp).some(
            (p) =>
              p &&
              (p.lessonId === assessmentId || String(p.lessonId) === String(assessmentId)) &&
              p.isCompleted === true,
          )
        );
        setAttemptsRemaining(fromProgress ? 0 : 1);
      } catch {
        setAttemptsRemaining(1);
      }
    }
  };

  const handleAnswerSelect = (questionIndex: number, answerIndex: number) => {
    const question = assessment?.questions[questionIndex];
    const isMultiSelect = question && Array.isArray(question.correctAnswerIndex);

    if (isMultiSelect) {
      setAnswers((prev) => {
        const currentAnswers = Array.isArray(prev[questionIndex])
          ? prev[questionIndex] as number[]
          : prev[questionIndex] !== undefined
            ? [prev[questionIndex] as number]
            : [];

        const newAnswers = currentAnswers.includes(answerIndex)
          ? currentAnswers.filter(idx => idx !== answerIndex)
          : [...currentAnswers, answerIndex];

        return {
          ...prev,
          [questionIndex]: newAnswers.length > 0 ? newAnswers : [],
        };
      });
    } else {
      setAnswers((prev) => ({
        ...prev,
        [questionIndex]: answerIndex,
      }));
    }
  };

  const handleNext = () => {
    if (assessment && currentQuestion < assessment.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const proceedWithSubmit = async () => {
    if (!assessment) return;

    // Clear timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }

    setSubmitting(true);
    try {
      const submitAnswers = assessment.questions.flatMap((question, index): SubmitAnswer[] => {
        const qType = (question.type || 'MCQ').toLowerCase();
        const answer = answers[index];

        if (qType === 'fillblank') {
          return [{
            questionId: index.toString(),
            selectedAnswerIndex: -1,
            textAnswer: textAnswers[index] || '',
          }];
        }

        if (qType === 'match') {
          const pairs = matchAnswers[index] || {};
          return [{
            questionId: index.toString(),
            selectedAnswerIndex: -1,
            matchAnswers: Object.entries(pairs).map(([left, right]) => ({ left, right })),
          }];
        }

        const isMultiSelect = qType === 'multiselect' || Array.isArray(question.correctAnswerIndex);

        if (isMultiSelect && Array.isArray(answer)) {
          return answer.map(selectedIndex => ({
            questionId: index.toString(),
            selectedAnswerIndex: selectedIndex,
          }));
        } else if (typeof answer === 'number') {
          return [{
            questionId: index.toString(),
            selectedAnswerIndex: answer ?? -1,
          }];
        } else {
          return [{
            questionId: index.toString(),
            selectedAnswerIndex: -1,
          }];
        }
      });

      // Submit to learner endpoint
      // Use the original assessmentId prop (UUID) instead of assessment._id (which might be a transformed ObjectId)
      const response = await api.post<{ data: SubmitQuizData }>('/learner/submit-quiz', {
        assessmentId: assessmentId, // Use the prop, not assessment._id
        courseId: courseId,
        answers: submitAnswers,
        // Forward the active proctoring session so the backend scores
        // against the same question subset that was shown to the learner.
        sessionId: sessionId,
      });

      // Resolve the passing score: prefer the value the backend returns, then the
      // creator-defined value on the assessment, and fall back to 75% by default.
      const resolvedPassingScore =
        typeof response.data.passingScore === 'number'
          ? response.data.passingScore
          : (typeof assessment.passingScore === 'number' && assessment.passingScore > 0
            ? assessment.passingScore
            : 75);

      const quizResult: QuizResult = {
        passed: response.data.passed,
        percentage: response.data.percentage,
        score: response.data.score || 0,
        totalPoints: response.data.totalPoints || assessment.questions.reduce((sum, q) => sum + q.points, 0),
        correctCount: response.data.correctCount,
        wrongCount: response.data.wrongCount,
        totalQuestions: response.data.totalQuestions,
        passingScore: resolvedPassingScore,
        attemptsRemaining: attemptsRemaining !== null ? Math.max(0, (attemptsRemaining || 0) - 1) : undefined,
        certificateUrl: response.data.certificateUrl,
      };

      // Sync quiz lesson completion to player progress immediately
      // Pass the actual quiz score so it factors into the weighted course average
      try {
        await api.patch('/player/sync', {
          courseId,
          lessonId: lessonId || assessmentId,
          completionPercentage: quizResult.percentage,
          status: 'completed',
        });
        console.log(`[Quiz] Synced quiz completion (score: ${quizResult.percentage}%) to player progress: ${lessonId || assessmentId}`);
      } catch (syncErr) {
        console.error(`[Quiz] Failed to sync quiz completion:`, syncErr);
      }

      setSubmitting(false);
      onComplete(quizResult);
    } catch (error: unknown) {
      setError((error as { message?: string })?.message || 'Failed to submit quiz');
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!assessment) return;
    proceedWithSubmit();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Loading State
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assessment...</p>
        </div>
      </div>
    );
  }

  // Error State — light theme
  if (error && !assessment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-200/40 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-200/40 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="relative bg-white border border-gray-200 rounded-2xl shadow-xl p-8 max-w-md w-full animate-fade-in">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-200/60 rounded-full blur-xl animate-pulse"></div>
              <div className="relative bg-red-50 border border-red-200 rounded-full p-4">
                <AlertCircle className="w-12 h-12 text-red-500" />
              </div>
            </div>
          </div>

          <h3 className="text-2xl font-bold text-gray-900 text-center mb-3">
            Unable to Load Quiz
          </h3>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-center leading-relaxed">
              {error}
            </p>
          </div>

          <button
            onClick={onCancel}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Go Back to Course
          </button>
        </div>
      </div>
    );
  }

  // Quiz Taking Screen
  if (!assessment) {
    console.log(`[InteractiveQuiz] Assessment is null, loading: ${loading}, error: ${error}`);
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assessment...</p>
          {error && (
            <p className="text-red-600 mt-2">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // The "Quiz already completed" gate has been removed — retakes are allowed.
  // The backend enforces the assessment's retryLimit, so any over-limit attempt
  // surfaces as an inline error from the submission API instead of a hard popup.

  const question = assessment.questions[currentQuestion];
  const progress = ((currentQuestion + 1) / assessment.questions.length) * 100;
  const answeredCount = assessment.questions.filter((q, idx) => {
    const qType = (q.type || 'MCQ').toLowerCase();
    if (qType === 'fillblank') return !!textAnswers[idx]?.trim();
    if (qType === 'match') return matchAnswers[idx] && Object.keys(matchAnswers[idx]).length > 0;
    const answer = answers[idx];
    if (Array.isArray(answer)) return answer.length > 0;
    return answer !== undefined && answer !== null;
  }).length;
  const isLastQuestion = currentQuestion === assessment.questions.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* ── Main column ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Slim header */}
          <div className="relative bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white px-6 sm:px-8 py-5 overflow-hidden">
            <div className="absolute -top-12 -right-12 w-44 h-44 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 mb-2 bg-white/15 border border-white/20 rounded-full text-[11px] font-semibold uppercase tracking-wider backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  Assessment
                </div>
                <h2 className="text-xl sm:text-2xl font-bold leading-tight truncate">{assessment.title}</h2>
              </div>
              {timeRemaining !== null && (
                <div className="flex items-center gap-2 bg-white/15 border border-white/20 backdrop-blur-md px-4 py-2 rounded-xl shadow">
                  <Clock className="w-4 h-4" />
                  <span className="text-lg font-bold tabular-nums">
                    {formatTime(timeRemaining)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Question Content */}
          <div className="p-6 sm:p-10">
            {/* Question meta + progress */}
            <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold tracking-wide">
                Question {currentQuestion + 1} <span className="text-indigo-400 font-normal">of {assessment.questions.length}</span>
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {answeredCount} / {assessment.questions.length} answered · {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden mb-8">
              <div
                className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            <div className="mb-8">
              {/* Question image / audio */}
              {question.imageUrl && (
                <img src={question.imageUrl} alt="Question" className="max-h-64 rounded-xl mx-auto mb-5 object-contain" />
              )}
              {question.audioUrl && (
                <audio controls className="w-full mb-5"><source src={question.audioUrl} /></audio>
              )}

              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 leading-snug mb-7 text-left">
                {question.text}
              </h3>

              {/* ─── True / False ─── */}
              {(question.type === 'TrueFalse' || question.type === 'True/False') ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['True', 'False'].map((label, index) => {
                    const isSelected = answers[currentQuestion] === index;
                    return (
                      <button
                        key={label}
                        onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion]: index }))}
                        className={`p-6 rounded-xl border-2 text-left transition-all duration-200 ${isSelected
                          ? 'border-primary-600 bg-primary-50 shadow-lg scale-105'
                          : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50 hover:shadow-md'
                          }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${isSelected ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
                            }`}>
                            {label === 'True' ? '✓' : '✗'}
                          </div>
                          <p className="text-xl text-gray-900 font-medium">{label}</p>
                          {isSelected && <CheckCircle className="w-6 h-6 text-primary-600 ml-auto" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                /* ─── Fill in the Blank ─── */
              ) : question.type === 'FillBlank' ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500 italic">Type your answer below:</p>
                  {(question.blanks && question.blanks.length > 1) ? (
                    question.blanks.map((_blank, bIdx) => (
                      <div key={bIdx} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-600 w-16">Blank {bIdx + 1}:</span>
                        <input
                          type="text"
                          value={(textAnswers[currentQuestion] || '').split('|||')[bIdx] || ''}
                          onChange={(e) => {
                            setTextAnswers(prev => {
                              const parts = (prev[currentQuestion] || '').split('|||');
                              while (parts.length <= bIdx) parts.push('');
                              parts[bIdx] = e.target.value;
                              return { ...prev, [currentQuestion]: parts.join('|||') };
                            });
                          }}
                          placeholder={`Answer for blank ${bIdx + 1}...`}
                          className="flex-1 p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                        />
                      </div>
                    ))
                  ) : (
                    <input
                      type="text"
                      value={textAnswers[currentQuestion] || ''}
                      onChange={(e) => setTextAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
                      placeholder="Your answer..."
                      className="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                    />
                  )}
                </div>

                /* ─── Match / Drag-Drop ─── */
              ) : question.type === 'Match' ? (
                <div className="space-y-4">
                  {question.dragDropPairs && question.dragDropPairs.length > 0 ? (
                    <>
                      <p className="text-sm text-gray-500 italic mb-4">Match each item on the left to the correct item on the right:</p>
                      {question.dragDropPairs.map((pair) => {
                        const leftKey = pair.left || pair.id || '';
                        const currentMatch = matchAnswers[currentQuestion]?.[leftKey] || '';
                        const rightOptions = question.dragDropPairs!.map(p => p.right).filter(Boolean);
                        return (
                          <div key={pair.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex-1 font-medium text-gray-900 bg-white p-3 rounded-lg border border-gray-200">
                              {pair.left || 'Item'}
                            </div>
                            <span className="text-gray-400 text-xl">→</span>
                            <select
                              value={currentMatch}
                              onChange={(e) => {
                                setMatchAnswers(prev => ({
                                  ...prev,
                                  [currentQuestion]: { ...(prev[currentQuestion] || {}), [leftKey]: e.target.value },
                                }));
                              }}
                              className="flex-1 p-3 text-base border-2 border-gray-200 rounded-lg focus:border-primary-500 outline-none bg-white"
                            >
                              <option value="">Select match...</option>
                              {rightOptions.map((r, i) => (
                                <option key={i} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-lg font-medium mb-2">Matching pairs not configured</p>
                      <p className="text-sm">This question does not have matching pairs defined. Please contact your instructor.</p>
                    </div>
                  )}
                </div>

                /* ─── MCQ / MultiSelect (default) ─── */
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {(() => {
                      const isMultiSelect = question.type === 'MultiSelect' || Array.isArray(question.correctAnswerIndex);
                      const currentAnswer = answers[currentQuestion];
                      const selectedAnswers = isMultiSelect && Array.isArray(currentAnswer)
                        ? currentAnswer
                        : typeof currentAnswer === 'number'
                          ? [currentAnswer]
                          : [];

                      return question.options.map((option, index) => {
                        const isSelected = selectedAnswers.includes(index);
                        const optionText = typeof option === 'string'
                          ? option
                          : (typeof option === 'object' && option !== null
                            ? ((option as { text?: string; label?: string; value?: string }).text ||
                              (option as { text?: string; label?: string; value?: string }).label ||
                              (option as { text?: string; label?: string; value?: string }).value ||
                              String(option))
                            : String(option || ''));

                        return (
                          <button
                            key={index}
                            onClick={() => handleAnswerSelect(currentQuestion, index)}
                            className={`group p-5 rounded-2xl border-2 text-left transition-all duration-200 ${isSelected
                              ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-md ring-2 ring-indigo-200/60'
                              : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md hover:-translate-y-0.5'
                              }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base transition-all ${isSelected
                                ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200'
                                : 'bg-gray-100 text-gray-600 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                                }`}>
                                {isMultiSelect ? (
                                  <input type="checkbox" checked={isSelected} readOnly className="w-5 h-5 rounded text-indigo-600" />
                                ) : (
                                  String.fromCharCode(65 + index)
                                )}
                              </div>
                              <p className={`text-base sm:text-lg flex-1 ${isSelected ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>{optionText}</p>
                              {isSelected && <CheckCircle className="w-6 h-6 text-indigo-600 flex-shrink-0" />}
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  {(question.type === 'MultiSelect' || Array.isArray(question.correctAnswerIndex)) && (
                    <p className="text-sm text-gray-500 mt-4 italic text-center">
                      This is a multi-select question. You can select multiple answers.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-100">
              <button
                onClick={handlePrevious}
                disabled={currentQuestion === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>

              <div className="flex gap-3">
                {!isLastQuestion ? (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02]"
                  >
                    Next Question
                    <ChevronRight className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        Submit Quiz
                        <CheckCircle className="w-5 h-5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

          </div>

          {error && (
            <div className="mx-6 sm:mx-8 mb-8 bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar: question palette + summary ──────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 bg-white rounded-2xl shadow-md border border-gray-100 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              Question palette
            </h4>
            <div className="grid grid-cols-5 gap-2 mb-5">
              {assessment.questions.map((q, index) => {
                const qType = (q.type || 'MCQ').toLowerCase();
                const isAnswered = qType === 'fillblank'
                  ? !!textAnswers[index]?.trim()
                  : qType === 'match'
                    ? matchAnswers[index] && Object.keys(matchAnswers[index]).length > 0
                    : answers[index] !== undefined;
                return (
                  <button
                    key={index}
                    onClick={() => setCurrentQuestion(index)}
                    className={`aspect-square rounded-lg border font-semibold text-xs transition-all flex items-center justify-center ${index === currentQuestion
                      ? 'border-indigo-500 bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200 scale-110'
                      : isAnswered
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-100 text-xs">
              <div className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded bg-gradient-to-br from-indigo-500 to-violet-500" />
                Current
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded border border-emerald-300 bg-emerald-50" />
                Answered ({answeredCount})
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="w-3 h-3 rounded border border-gray-200 bg-white" />
                Unanswered ({assessment.questions.length - answeredCount})
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default InteractiveQuizComponent;
