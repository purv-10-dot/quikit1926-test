'use client';
/**
 * VideoQuiz — ported from the old QuikSkills frontend
 * (`src/components/learner/VideoQuiz.tsx`). Replaces the previous
 * "coming soon" stub, keeping both the named `VideoQuiz` export and the
 * default export so existing importers continue to work.
 *
 * A self-contained in-video quiz:
 *   - multiple-choice / true-false questions, each carrying its own points and
 *     `correctAnswer` index,
 *   - optional countdown that auto-submits at zero, plus a running time-taken
 *     ticker,
 *   - scores locally (earnedPoints / totalPoints, rounded), passes at
 *     `passingScore` (default 70), posts the attempt to /assessments/submit and
 *     still reports the result to `onQuizComplete` if that POST fails,
 *   - offers an unlimited "Retry Quiz" whenever the learner did not pass.
 *
 * Behaviour is a 1:1 port; only the axios → fetch api-client semantics and the
 * Next.js client-component boilerplate differ.
 */
import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, ArrowRight, ArrowLeft, Loader2, Award, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Question {
  id: string;
  question: string;
  type: 'multiple-choice' | 'true-false';
  options: string[];
  correctAnswer: number | boolean;
  points: number;
  explanation?: string;
}

interface VideoQuizProps {
  questions: Question[];
  courseId: string;
  lessonId: string;
  learnerId: string;
  passingScore?: number; // Default 70
  timeLimit?: number; // in seconds, optional
  onQuizComplete?: (score: number, passed: boolean, timeTaken: number) => void;
  onCancel?: () => void;
}

export const VideoQuiz: React.FC<VideoQuizProps> = ({
  questions,
  courseId,
  lessonId,
  learnerId,
  passingScore = 70,
  timeLimit,
  onQuizComplete,
  onCancel,
}) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(timeLimit || null);
  const [timeTaken, setTimeTaken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (timeRemaining !== null && !submitted) {
      if (timeRemaining <= 0) {
        handleSubmit();
        return;
      }

      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 0) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, submitted]);

  useEffect(() => {
    if (!submitted) {
      const interval = setInterval(() => {
        setTimeTaken(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [submitted, startTime]);

  const handleAnswerSelect = (questionIndex: number, answer: number | boolean) => {
    if (submitted) return;
    setAnswers((prev) => ({
      ...prev,
      [questionIndex]: answer,
    }));
  };

  const handleSubmit = async () => {
    if (submitted) return;

    setSubmitting(true);

    // Calculate score
    let correctCount = 0;
    let totalPoints = 0;
    let earnedPoints = 0;

    questions.forEach((question, index) => {
      totalPoints += question.points;
      const userAnswer = answers[index];
      const isCorrect = userAnswer === question.correctAnswer;

      if (isCorrect) {
        correctCount++;
        earnedPoints += question.points;
      }
    });

    const finalScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const finalPassed = finalScore >= passingScore;

    setScore(finalScore);
    setPassed(finalPassed);
    setSubmitted(true);

    // Save quiz attempt to backend
    try {
      await api.post('/assessments/submit', {
        learnerId,
        courseId,
        lessonId,
        score: finalScore,
        passed: finalPassed,
        answers,
        timeTaken: timeTaken,
        totalQuestions: questions.length,
        correctAnswers: correctCount,
      });

      if (onQuizComplete) {
        onQuizComplete(finalScore, finalPassed, timeTaken);
      }
    } catch (error: unknown) {
      console.error('Failed to submit quiz:', error);
      // Still call onQuizComplete even if backend save fails
      if (onQuizComplete) {
        onQuizComplete(finalScore, finalPassed, timeTaken);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQuestionData = questions[currentQuestion];
  const isAnswered = answers[currentQuestion] !== undefined;

  if (submitted && score !== null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          <div className="text-center">
            <div className="mb-6">
              <div className={`w-24 h-24 ${(score || 0) >= 80 ? 'bg-green-100 dark:bg-green-900' : (score || 0) >= 50 ? 'bg-amber-100 dark:bg-amber-900' : 'bg-orange-100 dark:bg-orange-900'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <CheckCircle className={`w-16 h-16 ${(score || 0) >= 80 ? 'text-green-600 dark:text-green-400' : (score || 0) >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-orange-600 dark:text-orange-400'}`} />
              </div>
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Quiz Completed</h2>
              <p className="text-xl text-gray-700 dark:text-gray-300">You scored {score}%</p>
              {!passed && (
                <p className="text-sm text-gray-500 mt-2">This score will be reflected in your final course completion percentage.</p>
              )}
            </div>

            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 mb-6 text-white">
              <div className="text-6xl font-bold mb-2">{score}%</div>
              <div className="text-lg">Your Score</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {Object.values(answers).filter((_, idx) => answers[idx] === questions[idx].correctAnswer).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Correct Answers</div>
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{formatTime(timeTaken)}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Time Taken</div>
              </div>
            </div>

            {!passed && (
              <button
                onClick={() => {
                  setCurrentQuestion(0);
                  setAnswers({});
                  setSubmitted(false);
                  setScore(null);
                  setPassed(false);
                  setTimeTaken(0);
                  setTimeRemaining(timeLimit || null);
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
              >
                Retry Quiz
              </button>
            )}

            {onCancel && (
              <button
                onClick={onCancel}
                className="ml-4 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quiz</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Question {currentQuestion + 1} of {questions.length}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {timeRemaining !== null && (
              <div className="flex items-center gap-2 bg-red-100 dark:bg-red-900 px-4 py-2 rounded-lg">
                <Clock className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="text-red-600 dark:text-red-400 font-bold">{formatTime(timeRemaining)}</span>
              </div>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Progress</span>
            <span>{Math.round(((currentQuestion + 1) / questions.length) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {currentQuestionData.question}
            </h2>
            {currentQuestionData.points > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Points: {currentQuestionData.points}
              </p>
            )}
          </div>

          {/* Answer Options */}
          <div className="space-y-3">
            {currentQuestionData.options.map((option, index) => {
              const isSelected = answers[currentQuestion] === index;
              const isCorrect = submitted && index === currentQuestionData.correctAnswer;
              const isWrong = submitted && isSelected && index !== currentQuestionData.correctAnswer;

              return (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(currentQuestion, index)}
                  disabled={submitted}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600'
                  } ${
                    isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''
                  } ${
                    isWrong ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''
                  } ${submitted ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-3">
                    {submitted && (isCorrect || isWrong) && (
                      <div className="flex-shrink-0">
                        {isCorrect ? (
                          <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                    )}
                    <span className="text-gray-900 dark:text-white">{option}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {submitted && currentQuestionData.explanation && (
            <div className="mt-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Explanation:</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{currentQuestionData.explanation}</p>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handlePrevious}
            disabled={currentQuestion === 0}
            className="flex items-center gap-2 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            <ArrowLeft className="w-5 h-5" />
            Previous
          </button>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            {Object.keys(answers).length} of {questions.length} answered
          </div>

          {currentQuestion === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={!isAnswered || submitting || Object.keys(answers).length < questions.length}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Award className="w-5 h-5" />
                  Submit Quiz
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Next
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoQuiz;
