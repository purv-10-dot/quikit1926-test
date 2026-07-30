'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Question {
  text: string;
  type: string; // MCQ | MultiSelect | TrueFalse | FillBlank | Match
  options: string[];
  correctAnswerIndex: number | number[];
  explanation?: string;
  points: number;
  blanks?: string[];
}

interface Assessment {
  _id: string;
  title: string;
  questions: Question[];
  passingScore: number;
  retryLimit: number;
  timeLimit?: number;
}

interface QuizResult {
  passed: boolean;
  percentage: number;
  score?: number;
  correctCount?: number;
  wrongCount?: number;
  totalQuestions?: number;
}

interface QuizTakingComponentProps {
  assessmentId: string;
  courseId: string;
  onComplete: (result: QuizResult) => void | Promise<void>;
  onCancel: () => void;
  /** Optional — used by ProctoredQuizWrapper / lesson-scoped flows. */
  lessonId?: string;
  retakeMode?: boolean;
  sessionId?: string;
}

type AnswerValue = number | number[] | string;

interface SubmitAnswer {
  questionId: string;
  selectedAnswerIndex?: number;
  textAnswer?: string;
}

const isMulti = (q: Question) => q.type === 'MultiSelect' || Array.isArray(q.correctAnswerIndex);
const isText = (q: Question) => q.type === 'FillBlank';

export function QuizTakingComponent({ assessmentId, courseId, onComplete, onCancel, sessionId }: QuizTakingComponentProps) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // The proctoring session is what pins the randomized question subset.
        // WITHOUT `sessionId` the server has no manifest to serve from, so it
        // returns the FULL bank in author order — which broke three things at
        // once: randomization looked dead, the answer key leaked (the redaction
        // only runs on the sessionId branch), and scoring silently mismatched,
        // because submit sends answers keyed by DISPLAYED index while the server
        // scores against the manifest's shuffled, shorter list.
        const url = sessionId
          ? `/assessments/${assessmentId}?sessionId=${encodeURIComponent(sessionId)}`
          : `/assessments/${assessmentId}`;
        const res = await api.get<{ success: boolean; data: Assessment }>(url);
        if (!active) return;
        const data = res?.data;
        setAssessment(data);
        if (data?.timeLimit) setTimeRemaining(data.timeLimit * 60);
      } catch (e) {
        if (active) setError((e as { message?: string })?.message || 'Failed to load assessment');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // `sessionId` arrives asynchronously from ProctoredQuizWrapper's start call,
    // so it MUST be a dependency — otherwise the first render fetches without it
    // and the unsliced bank sticks for the whole attempt.
  }, [assessmentId, sessionId]);

  const buildSubmitAnswers = useCallback((): SubmitAnswer[] => {
    if (!assessment) return [];
    return assessment.questions.flatMap((question, index): SubmitAnswer[] => {
      const answer = answers[index];
      if (isText(question)) {
        return [{ questionId: index.toString(), textAnswer: typeof answer === 'string' ? answer : '' }];
      }
      if (isMulti(question) && Array.isArray(answer)) {
        if (answer.length === 0) return [{ questionId: index.toString(), selectedAnswerIndex: -1 }];
        return answer.map((selectedIndex) => ({ questionId: index.toString(), selectedAnswerIndex: selectedIndex }));
      }
      if (typeof answer === 'number') {
        return [{ questionId: index.toString(), selectedAnswerIndex: answer }];
      }
      return [{ questionId: index.toString(), selectedAnswerIndex: -1 }];
    });
  }, [assessment, answers]);

  const handleSubmit = useCallback(async () => {
    if (!assessment || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: QuizResult; message?: string }>('/learner/submit-quiz', {
        assessmentId: assessment._id || assessmentId,
        courseId,
        answers: buildSubmitAnswers(),
        ...(sessionId ? { sessionId } : {}),
      });
      const data = res?.data;
      if (!data) throw new Error('No result returned');
      onComplete(data);
    } catch (e) {
      setError((e as { message?: string })?.message || 'Failed to submit quiz');
      setSubmitting(false);
    }
  }, [assessment, assessmentId, courseId, buildSubmitAnswers, onComplete, submitting, sessionId]);

  // Timer countdown — auto-submit at zero.
  useEffect(() => {
    if (timeRemaining === null) return;
    if (timeRemaining <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setTimeRemaining((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeRemaining, handleSubmit]);

  const handleSelect = (qIndex: number, optIndex: number) => {
    const question = assessment!.questions[qIndex];
    if (isMulti(question)) {
      setAnswers((prev) => {
        const cur = Array.isArray(prev[qIndex]) ? (prev[qIndex] as number[]) : [];
        const next = cur.includes(optIndex) ? cur.filter((i) => i !== optIndex) : [...cur, optIndex];
        return { ...prev, [qIndex]: next };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [qIndex]: optIndex }));
    }
  };

  const handleText = (qIndex: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [qIndex]: value }));
  };

  const confirmAndSubmit = () => {
    if (!assessment) return;
    const unanswered = assessment.questions.filter((q, i) => {
      const a = answers[i];
      if (isText(q)) return !a || (typeof a === 'string' && a.trim() === '');
      if (Array.isArray(a)) return a.length === 0;
      return a === undefined;
    });
    if (unanswered.length > 0) {
      const ok = window.confirm(`You have ${unanswered.length} unanswered question(s). Submit anyway?`);
      if (!ok) return;
    }
    handleSubmit();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 shadow-sm">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error && !assessment) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
        <button onClick={onCancel} className="mt-4 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
          Go Back
        </button>
      </div>
    );
  }

  if (!assessment) return null;

  const question = assessment.questions[currentQuestion];
  const progressPct = ((currentQuestion + 1) / assessment.questions.length) * 100;
  const answeredCount = assessment.questions.filter((q, i) => {
    const a = answers[i];
    if (isText(q)) return typeof a === 'string' && a.trim() !== '';
    if (Array.isArray(a)) return a.length > 0;
    return a !== undefined;
  }).length;

  const multi = isMulti(question);
  const currentAnswer = answers[currentQuestion];
  const selected = Array.isArray(currentAnswer)
    ? currentAnswer
    : typeof currentAnswer === 'number'
      ? [currentAnswer]
      : [];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">{assessment.title}</h2>
          {timeRemaining !== null && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-4 py-2 rounded-xl">
              <Clock className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-red-700">{formatTime(timeRemaining)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Question {currentQuestion + 1} of {assessment.questions.length}
          </span>
          <span className="text-sm text-gray-500">
            {answeredCount} / {assessment.questions.length} answered
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-6 rounded-xl bg-gray-50 border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{question.text}</h3>

        {isText(question) ? (
          <input
            type="text"
            value={typeof currentAnswer === 'string' ? currentAnswer : ''}
            onChange={(e) => handleText(currentQuestion, e.target.value)}
            placeholder="Type your answer..."
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
          />
        ) : (
          <div className="space-y-3">
            {question.options.map((option, index) => {
              const isSelected = selected.includes(index);
              return (
                <label
                  key={index}
                  className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 bg-white'
                  }`}
                >
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name={`question-${currentQuestion}`}
                    checked={isSelected}
                    onChange={() => handleSelect(currentQuestion, index)}
                    className="w-4 h-4 mr-3 accent-indigo-500"
                  />
                  <span className="text-gray-900">{option}</span>
                </label>
              );
            })}
            {multi && (
              <p className="text-xs text-gray-500 italic mt-2">
                Multi-select question — you can choose more than one answer.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          onClick={() => setCurrentQuestion((q) => Math.max(0, q - 1))}
          disabled={currentQuestion === 0}
          className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>

        {currentQuestion < assessment.questions.length - 1 ? (
          <button
            onClick={() => setCurrentQuestion((q) => Math.min(assessment.questions.length - 1, q + 1))}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium hover:from-indigo-700 hover:to-violet-700 transition"
          >
            Next Question
          </button>
        ) : (
          <button
            onClick={confirmAndSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-60 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </button>
        )}
      </div>

      {/* Question dots */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        {assessment.questions.map((q, index) => {
          const a = answers[index];
          const isAnswered = isText(q)
            ? typeof a === 'string' && a.trim() !== ''
            : Array.isArray(a)
              ? a.length > 0
              : a !== undefined;
          return (
            <button
              key={index}
              onClick={() => setCurrentQuestion(index)}
              className={`w-10 h-10 rounded-full border-2 text-sm font-medium transition-all ${
                index === currentQuestion
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : isAnswered
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}

export default QuizTakingComponent;
