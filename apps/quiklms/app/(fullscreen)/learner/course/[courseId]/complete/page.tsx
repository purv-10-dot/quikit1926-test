'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, Play, Award, Clock, BookOpen, ArrowLeft } from 'lucide-react';
import VideoPlayerWithProgress from '@/components/learner/VideoPlayerWithProgress';
import QuizTakingComponent from '@/components/learner/QuizTakingComponent';
import QuizResultsComponent from '@/components/learner/QuizResultsComponent';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/app/providers';

interface Lesson {
  _id: string;
  title: string;
  type: 'Video' | 'PDF' | 'SCORM' | 'Quiz' | 'Text';
  contentUrl?: string;
  orderIndex: number;
  description?: string;
  duration?: number;
  assessmentId?: string;
}

interface Module {
  _id: string;
  title: string;
  orderIndex: number;
  assessmentId?: string;
  lessons: Lesson[];
}

interface Course {
  _id: string;
  title: string;
  description?: string;
  modules: Module[];
}

interface QuizResult {
  passed: boolean;
  percentage: number;
  score?: number;
  correctCount?: number;
  wrongCount?: number;
  totalQuestions?: number;
}

const CompleteLessonPage: React.FC = () => {
  const params = useParams();
  const courseId = params.courseId as string;
  const lessonId = params.lessonId as string | undefined;
  const router = useRouter();
  const { user } = useCurrentUser();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [progress, setProgress] = useState<any>(null);

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadCourse = async () => {
    try {
      const response = await api.get<any>(`/courses/${courseId}`);
      if (response.success) {
        setCourse(response.data);
        if (lessonId && response.data.modules) {
          for (const module of response.data.modules) {
            const lesson = module.lessons.find((l: Lesson) => l._id === lessonId || l.title === lessonId);
            if (lesson) {
              setCurrentLesson(lesson);
              break;
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to load course:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async () => {
    if (!courseId) return;
    try {
      const response = await api.get<any>(`/progress/${courseId}`);
      if (response.success) setProgress(response.data);
    } catch (error: any) {
      console.error('Failed to load progress:', error);
    }
  };

  // Resolve the assessment to take: the current lesson's own assessment, else
  // the first quiz lesson / module quiz available in the course.
  const resolveAssessmentId = (): string | null => {
    if (currentLesson?.assessmentId) return currentLesson.assessmentId;
    if (!course) return null;
    for (const module of course.modules) {
      if (module.assessmentId) return module.assessmentId;
      const quizLesson = module.lessons.find((l) => l.assessmentId);
      if (quizLesson?.assessmentId) return quizLesson.assessmentId;
    }
    return null;
  };

  const assessmentId = resolveAssessmentId();

  const handleVideoComplete = () => {
    setVideoCompleted(true);
    if (assessmentId) setShowQuiz(true);
  };

  const handleQuizComplete = (result: QuizResult) => {
    setQuizResult(result);
    setShowQuiz(false);
    setShowResult(true);
    // The submit-quiz engine issues the real certificate server-side on pass;
    // refresh progress so the on-screen state reflects completion.
    loadProgress();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Course not found</p>
          <button
            onClick={() => router.push('/learner/dashboard')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz results screen ──────────────────────────────────────────────────
  if (showResult && quizResult) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <QuizResultsComponent
            result={quizResult}
            onContinue={() => {
              if (quizResult.passed) {
                router.push('/learner/certificates');
              } else {
                setShowResult(false);
                setShowQuiz(true);
              }
            }}
            onRetry={!quizResult.passed ? () => { setShowResult(false); setShowQuiz(true); } : undefined}
          />
          {quizResult.passed && (
            <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6 text-center">
              <Award className="w-10 h-10 text-green-600 dark:text-green-400 mx-auto mb-2" />
              <p className="font-semibold text-gray-900 dark:text-white">Course completed — certificate issued!</p>
              <button
                onClick={() => router.push('/learner/certificates')}
                className="mt-3 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
              >
                View &amp; download certificate
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Quiz taking screen (real questions via assessmentId) ─────────────────
  if (showQuiz && assessmentId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <QuizTakingComponent
            assessmentId={assessmentId}
            courseId={courseId}
            onComplete={handleQuizComplete}
            onCancel={() => {
              setShowQuiz(false);
              router.push(`/learner/course/${courseId}`);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/learner/course/${courseId}`)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {currentLesson?.title || 'Lesson'}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">{course.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {videoCompleted && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-semibold">Video Completed</span>
                </div>
              )}
              {quizResult?.passed && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Award className="w-5 h-5" />
                  <span className="text-sm font-semibold">Quiz Passed</span>
                </div>
              )}
            </div>
          </div>

          {progress && currentLesson && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>Lesson Progress</span>
                <span>
                  {Math.round(progress.lessonProgress?.[currentLesson._id || currentLesson.title]?.completionPercentage || 0)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.lessonProgress?.[currentLesson._id || currentLesson.title]?.completionPercentage || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {currentLesson?.type === 'Video' && currentLesson.contentUrl ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <VideoPlayerWithProgress
              videoUrl={currentLesson.contentUrl}
              courseId={courseId}
              lessonId={currentLesson._id || currentLesson.title}
              lessonTitle={currentLesson.title}
              onComplete={handleVideoComplete}
            />
            {videoCompleted && !showQuiz && assessmentId && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setShowQuiz(true)}
                  className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg transition-colors flex items-center gap-3 mx-auto"
                >
                  <Award className="w-6 h-6" />
                  Take Quiz
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              {currentLesson ? `Lesson type: ${currentLesson.type}` : 'No lesson selected'}
            </p>
            {assessmentId && (
              <button
                onClick={() => setShowQuiz(true)}
                className="mt-6 px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors inline-flex items-center gap-3"
              >
                <Award className="w-6 h-6" />
                Take Quiz
              </button>
            )}
          </div>
        )}

        {/* Course Info Card */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Course Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Play className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Type</p>
                <p className="font-semibold text-gray-900 dark:text-white">{currentLesson?.type || 'Lesson'}</p>
              </div>
            </div>
            {currentLesson?.duration && (
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Duration</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{Math.floor(currentLesson.duration / 60)} min</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                <p className="font-semibold text-gray-900 dark:text-white">{videoCompleted ? 'Completed' : 'In Progress'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompleteLessonPage;
