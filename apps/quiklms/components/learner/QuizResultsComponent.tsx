'use client';

import { CheckCircle, XCircle, Award, RotateCcw, ArrowRight } from 'lucide-react';

interface PerQuestion {
  questionText?: string;
  isCorrect?: boolean;
  explanation?: string;
}

interface QuizResult {
  passed: boolean;
  percentage: number;
  score?: number;
  correctCount?: number;
  wrongCount?: number;
  totalQuestions?: number;
  passingScore?: number;
  questions?: PerQuestion[];
}

interface QuizResultsComponentProps {
  result: QuizResult;
  onContinue: () => void;
  onRetry?: () => void;
}

export function QuizResultsComponent({ result, onContinue, onRetry }: QuizResultsComponentProps) {
  const passed = !!result.passed;
  const pct = Math.round(result.percentage ?? 0);

  const accentText = passed ? 'text-emerald-300' : 'text-red-300';
  const accentBg = passed ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-red-500/20 border-red-500/40';

  const correct = result.correctCount;
  const wrong = result.wrongCount;
  const total = result.totalQuestions ?? (typeof correct === 'number' && typeof wrong === 'number' ? correct + wrong : undefined);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl shadow-2xl max-w-2xl mx-auto">
      <div className="text-center">
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center border ${accentBg} mb-6`}>
          {passed ? (
            <CheckCircle className={`w-12 h-12 ${accentText}`} />
          ) : (
            <XCircle className={`w-12 h-12 ${accentText}`} />
          )}
        </div>

        <h2 className="text-3xl font-bold text-gray-50 mb-2">
          {passed ? 'Quiz Passed!' : 'Quiz Completed'}
        </h2>
        <p className={`text-lg font-semibold mb-1 ${accentText}`}>You scored {pct}%</p>
        {typeof result.passingScore === 'number' && (
          <p className="text-sm text-gray-400 mb-2">Passing score: {Math.round(result.passingScore)}%</p>
        )}
        {!passed && (
          <p className="text-sm text-gray-400 mb-4">
            This score is reflected in your course completion. You can retry to improve it.
          </p>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3 my-6">
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-xs text-gray-400 mb-1">Score</p>
            <p className={`text-2xl font-bold ${accentText}`}>{pct}%</p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-xs text-gray-400 mb-1">Correct</p>
            <p className="text-2xl font-bold text-emerald-300">
              {typeof correct === 'number' ? correct : '—'}
              {typeof total === 'number' && <span className="text-base text-gray-400">/{total}</span>}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-xs text-gray-400 mb-1">Status</p>
            <div className={`flex items-center justify-center gap-1 ${accentText}`}>
              <Award className="w-5 h-5" />
              <span className="text-lg font-semibold">{passed ? 'Passed' : 'Failed'}</span>
            </div>
          </div>
        </div>

        {/* Optional per-question review */}
        {Array.isArray(result.questions) && result.questions.length > 0 && (
          <div className="text-left space-y-2 mt-4 mb-6 max-h-72 overflow-y-auto pr-1">
            {result.questions.map((q, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 ${
                  q.isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  {q.isCorrect ? (
                    <CheckCircle className="w-4 h-4 text-emerald-300 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-300 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-100">
                      {q.questionText || `Question ${i + 1}`}
                    </p>
                    {q.explanation && <p className="text-xs text-gray-400 mt-1">{q.explanation}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-center mt-2">
          {!passed && onRetry && (
            <button
              onClick={onRetry}
              className="px-5 py-2.5 rounded-xl bg-white/10 text-gray-100 hover:bg-white/20 transition flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Retry Quiz
            </button>
          )}
          <button
            onClick={onContinue}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium hover:from-indigo-700 hover:to-violet-700 transition flex items-center gap-2"
          >
            Continue Course
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {passed && (
          <div className="mt-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <p className="text-sm text-indigo-200">
              Your progress has been updated. If you have completed the course, your certificate is now available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuizResultsComponent;
