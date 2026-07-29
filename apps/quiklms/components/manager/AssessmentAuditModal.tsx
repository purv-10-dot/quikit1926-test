'use client';

import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface QuizResult {
  userId: string;
  userName: string;
  courseId: string;
  courseTitle: string;
  quizScore?: number | null;
  isPassed: boolean;
  completionPercentage: number;
  attemptDate?: string | null;
  questions: Array<{
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation?: string;
  }>;
}

interface Props {
  userId: string;
  courseId: string;
  onClose: () => void;
}

export function AssessmentAuditModal({ userId, courseId, onClose }: Props) {
  const [results, setResults] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ data: QuizResult }>(`/manager/quiz-results/${userId}/${courseId}`);
        setResults(res.data || null);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, courseId]);

  const correctCount = results?.questions.filter((q) => q.isCorrect).length ?? 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-4xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Quiz Results</h2>
            {results && <p className="text-gray-500 mt-1">{results.userName} — {results.courseTitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : !results ? (
          <p className="text-gray-500 text-center py-8">No quiz results available</p>
        ) : (
          <>
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 mb-6 border border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Quiz Score</p>
                  <p className={`text-3xl font-bold ${results.isPassed ? 'text-green-600' : 'text-red-600'}`}>
                    {results.quizScore != null ? `${results.quizScore}%` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Status</p>
                  <div className="mt-1">
                    {results.isPassed ? (
                      <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                        <CheckCircle className="w-5 h-5" /> Passed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <XCircle className="w-5 h-5" /> Failed
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Completion</p>
                  <p className="text-3xl font-bold text-gray-900">{results.completionPercentage}%</p>
                </div>
                {results.attemptDate && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Attempt Date</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(results.attemptDate).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500">{new Date(results.attemptDate).toLocaleTimeString()}</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Question Breakdown</h3>
                {results.questions.length > 0 && (
                  <span className="text-sm text-gray-500">
                    {correctCount} / {results.questions.length} Correct
                  </span>
                )}
              </div>
              {results.questions.length > 0 ? (
                <div className="space-y-4">
                  {results.questions.map((q, i) => (
                    <div
                      key={i}
                      className={`border-2 rounded-lg p-5 ${
                        q.isCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-0.5">
                          {q.isCorrect ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-3 gap-3">
                            <p className="font-semibold text-gray-900">
                              Question {i + 1}: {q.question}
                            </p>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${
                                q.isCorrect ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                              }`}
                            >
                              {q.isCorrect ? 'Correct' : 'Incorrect'}
                            </span>
                          </div>
                          <div className="space-y-2 bg-white rounded p-3 border border-gray-200">
                            <div>
                              <span className="text-sm font-medium text-gray-700">User Answer: </span>
                              <span className={`text-sm font-semibold ${q.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                {q.userAnswer}
                              </span>
                            </div>
                            {!q.isCorrect && (
                              <div>
                                <span className="text-sm font-medium text-gray-700">Correct Answer: </span>
                                <span className="text-sm font-semibold text-green-700">{q.correctAnswer}</span>
                              </div>
                            )}
                            {q.explanation && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <span className="text-xs font-medium text-gray-600">Explanation: </span>
                                <span className="text-xs text-gray-700">{q.explanation}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                  <AlertCircle className="w-16 h-16 mx-auto mb-3 text-gray-400" />
                  <p className="font-medium text-gray-700 mb-1">Detailed question breakdown is not available</p>
                  <p className="text-sm text-gray-500">
                    {results.quizScore != null ? `Quiz score: ${results.quizScore}%` : 'No quiz attempt recorded yet'}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AssessmentAuditModal;
