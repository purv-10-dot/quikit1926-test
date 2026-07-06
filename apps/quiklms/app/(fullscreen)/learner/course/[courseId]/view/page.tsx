'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, CheckCircle, Clock, FileText, Video, Award, Lock, AlertCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import QuizTakingComponent from '@/components/learner/QuizTakingComponent';
import QuizResultsComponent from '@/components/learner/QuizResultsComponent';
import VideoPlayerWithProgress from '@/components/learner/VideoPlayerWithProgress';

interface Lesson {
  _id?: string;
  title: string;
  type: string;
  contentUrl?: string;
  orderIndex: number;
  description?: string;
  duration?: number;
  scormPackageId?: string;
}

interface Module {
  _id: string;
  title: string;
  orderIndex: number;
  lessons: Lesson[];
  assessmentId?: string;
}

interface Course {
  _id: string;
  title: string;
  description?: string;
  modules: Module[];
}

interface ModuleProgress {
  moduleId: string;
  completionPercentage: number;
  lessonsCompleted: number;
  totalLessons: number;
}

const CourseViewerPage = () => {
  const params = useParams();
  const courseId = params.courseId as string;
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [moduleProgress, setModuleProgress] = useState<Record<string, ModuleProgress>>({});
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showQuizResults, setShowQuizResults] = useState(false);
  const [quizResult, setQuizResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<string, number>>({});
  const [lessonSavedPositions, setLessonSavedPositions] = useState<Record<string, number>>({});

  const progressSaveInterval = useRef<NodeJS.Timeout | null>(null);
  const lastSavedProgress = useRef<number>(0);

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadProgress();
    }

    progressSaveInterval.current = setInterval(() => {
      if (progress && lastSavedProgress.current !== progress.completionPercentage) {
        saveProgress();
      }
    }, 30000);

    const handleBeforeUnload = () => {
      if (progress) {
        saveProgress();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [courseId]);

  const loadCourse = async () => {
    try {
      const response = await api.get<any>(`/courses/${courseId}`);
      setCourse(response.data);

      if (response.data?.modules) {
        const initialModuleProgress: Record<string, ModuleProgress> = {};
        response.data.modules.forEach((module: Module) => {
          initialModuleProgress[module._id] = {
            moduleId: module._id,
            completionPercentage: 0,
            lessonsCompleted: 0,
            totalLessons: module.lessons.length,
          };
        });
        setModuleProgress(initialModuleProgress);
      }
    } catch (error: any) {
      console.error('Failed to load course:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async () => {
    try {
      const response = await api.get<any>(`/progress/${courseId}`);
      const progressData = response.data;
      setProgress(progressData);
      lastSavedProgress.current = progressData?.completionPercentage || 0;

      if (course && progressData) {
        updateModuleProgress(progressData);
      }

      if (progressData?.lessonProgress) {
        const lessonProg: Record<string, number> = {};
        const lessonPositions: Record<string, number> = {};

        Object.entries(progressData.lessonProgress || {}).forEach(([lessonId, prog]: [string, any]) => {
          lessonProg[lessonId] = prog.percentage || 0;
          lessonPositions[lessonId] = prog.currentPosition || 0;
        });

        setLessonProgress(lessonProg);
        setLessonSavedPositions(lessonPositions);
      }
    } catch (error: any) {
      console.error('Failed to load progress:', error);
    }
  };

  useEffect(() => {
    if (course && progress) {
      updateModuleProgress(progress);
    }
  }, [course, progress]);

  const updateModuleProgress = (progressData: any) => {
    if (!course) return;

    const updatedModuleProgress: Record<string, ModuleProgress> = {};

    course.modules.forEach((module) => {
      const estimatedModuleProgress = progressData.completionPercentage || 0;

      updatedModuleProgress[module._id] = {
        moduleId: module._id,
        completionPercentage: estimatedModuleProgress,
        lessonsCompleted: Math.floor((estimatedModuleProgress / 100) * module.lessons.length),
        totalLessons: module.lessons.length,
      };
    });

    setModuleProgress(updatedModuleProgress);
  };

  const saveProgress = useCallback(async () => {
    if (!courseId || !progress) return;

    try {
      const currentProgress = progress.completionPercentage || 0;

      await api.post<any>('/progress', {
        courseId,
        completionPercentage: currentProgress,
        status: currentProgress >= 100 ? 'completed' : 'in_progress',
      });

      lastSavedProgress.current = currentProgress;
    } catch (error: any) {
      console.error('Failed to save progress:', error);
    }
  }, [courseId, progress]);

  const handleLessonProgress = async (lessonId: string, watchedPercentage: number) => {
    if (!course) return;

    const currentModule = course.modules[currentModuleIndex];
    if (!currentModule) return;

    const lessonIndex = currentModule.lessons.findIndex(l => l._id === lessonId || l.title === lessonId);
    if (lessonIndex === -1) return;

    const updatedModuleProgress = { ...moduleProgress };
    const moduleProg = updatedModuleProgress[currentModule._id] || {
      moduleId: currentModule._id,
      completionPercentage: 0,
      lessonsCompleted: 0,
      totalLessons: currentModule.lessons.length,
    };

    if (watchedPercentage >= 95) {
      if (lessonIndex >= moduleProg.lessonsCompleted) {
        moduleProg.lessonsCompleted = lessonIndex + 1;
      }
    }

    moduleProg.completionPercentage = Math.min(
      100,
      (moduleProg.lessonsCompleted / moduleProg.totalLessons) * 100
    );

    updatedModuleProgress[currentModule._id] = moduleProg;
    setModuleProgress(updatedModuleProgress);

    const totalModules = course.modules.length;
    const totalModuleProgress = Object.values(updatedModuleProgress).reduce(
      (sum, mp) => sum + mp.completionPercentage,
      0
    );
    const overallProgress = totalModuleProgress / totalModules;

    const updatedProgress = {
      ...progress,
      completionPercentage: Math.min(100, overallProgress),
      status: overallProgress >= 100 ? 'completed' : 'in_progress',
    };
    setProgress(updatedProgress);

    try {
      await api.post<any>('/progress', {
        courseId,
        lessonId,
        completionPercentage: overallProgress,
        status: overallProgress >= 100 ? 'completed' : 'in_progress',
      });
      lastSavedProgress.current = overallProgress;
    } catch (error: any) {
      console.error('Failed to save progress:', error);
    }
  };

  const handleLessonComplete = async () => {
    await loadProgress();
  };

  const handleQuizComplete = (result: { passed: boolean; percentage: number }) => {
    setQuizResult(result);
    setShowQuiz(false);
    setShowQuizResults(true);
    loadProgress();
  };

  const getModuleProgress = (module: Module) => {
    const moduleProg = moduleProgress[module._id];
    return moduleProg?.completionPercentage || 0;
  };

  const isModuleCompleted = (module: Module) => {
    const moduleProg = moduleProgress[module._id];
    return moduleProg?.completionPercentage >= 100;
  };

  const isQuizLocked = (module: Module) => {
    const moduleProg = moduleProgress[module._id];
    if (!moduleProg) return true;
    return moduleProg.completionPercentage < 95;
  };

  const getQuizLockReason = (module: Module) => {
    const moduleProg = moduleProgress[module._id];
    if (!moduleProg) return 'Complete the module content to unlock the quiz.';

    const remaining = 95 - moduleProg.completionPercentage;
    return `Complete ${remaining.toFixed(0)}% more of the module content to unlock the quiz.`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>
        <div className="text-center relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading course...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400 text-lg mb-4">Course not found</p>
          <button
            onClick={() => router.push('/learner/dashboard')}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-indigo-500/50 transition-all duration-300 hover:scale-105"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentModule = course.modules[currentModuleIndex];
  const currentLesson = currentModule?.lessons[currentLessonIndex];
  const quizLocked = currentModule?.assessmentId ? isQuizLocked(currentModule) : false;

  if (showQuiz && currentModule?.assessmentId && !quizLocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] p-4 relative">
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => setShowQuiz(false)}
            className="mb-4 text-gray-300 hover:text-white transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Course
          </button>
          <QuizTakingComponent
            assessmentId={currentModule.assessmentId}
            courseId={courseId}
            onComplete={handleQuizComplete}
            onCancel={() => setShowQuiz(false)}
          />
        </div>
      </div>
    );
  }

  if (showQuizResults && quizResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] p-4 relative">
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => {
              setShowQuizResults(false);
              setQuizResult(null);
            }}
            className="mb-4 text-gray-300 hover:text-white transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Course
          </button>
          <QuizResultsComponent
            result={quizResult}
            onContinue={() => {
              setShowQuizResults(false);
              setQuizResult(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] text-gray-50 relative">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Header */}
      <div className="bg-gray-900/80 backdrop-blur-2xl border-b border-white/10 shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/learner/dashboard')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-50">{course.title}</h1>
                {progress && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-48 bg-white/10 rounded-full h-3 overflow-hidden backdrop-blur-sm">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-500 shadow-lg shadow-indigo-500/50"
                          style={{ width: `${progress.completionPercentage || 0}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-300 font-medium">
                        {progress.completionPercentage || 0}% Complete
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {progress?.isPassed && (
              <div className="flex items-center gap-2 bg-gradient-to-r from-amber-600/30 to-orange-600/30 backdrop-blur-xl border border-amber-500/40 px-4 py-2 rounded-xl shadow-lg shadow-amber-500/30">
                <Award className="w-5 h-5 text-amber-400" />
                <span className="font-semibold text-amber-200">Certificate Earned</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {/* Sidebar - Modules */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 sticky top-24">
              <h2 className="text-lg font-semibold text-gray-100 mb-4">Course Modules</h2>
              <div className="space-y-2">
                {course.modules.map((module, index) => {
                  const moduleProg = getModuleProgress(module);
                  const completed = isModuleCompleted(module);

                  return (
                    <button
                      key={module._id}
                      onClick={() => {
                        setCurrentModuleIndex(index);
                        setCurrentLessonIndex(0);
                      }}
                      className={`w-full text-left p-3 rounded-xl transition-all duration-300 ${index === currentModuleIndex
                          ? 'bg-gradient-to-r from-indigo-600/30 to-violet-600/30 border border-indigo-500/40 shadow-lg shadow-indigo-500/30'
                          : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-100 text-sm">{module.title}</span>
                        {completed && (
                          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="w-full bg-white/10 rounded-full h-2 mr-2">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all"
                            style={{ width: `${moduleProg}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-400">{Math.round(moduleProg)}%</span>
                      </div>
                      {module.assessmentId && (
                        <span className="text-xs text-gray-400 mt-1 block flex items-center gap-1">
                          {isQuizLocked(module) ? (
                            <>
                              <Lock className="w-3 h-3" />
                              Quiz Locked
                            </>
                          ) : (
                            <>
                              <FileText className="w-3 h-3" />
                              Quiz Available
                            </>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {currentModule && (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-100">
                    {currentModule.title}
                  </h2>
                  <div className="text-sm text-gray-400">
                    Module {currentModuleIndex + 1} of {course.modules.length}
                  </div>
                </div>

                {/* Lessons List */}
                <div className="space-y-3 mb-6">
                  {currentModule.lessons.map((lesson, index) => (
                    <div
                      key={index}
                      className={`border rounded-xl p-4 transition-all duration-300 ${index === currentLessonIndex
                          ? 'border-indigo-500/50 bg-indigo-600/20 shadow-lg shadow-indigo-500/30'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {lesson.type === 'Video' ? (
                            <div className="p-2 bg-blue-500/20 rounded-lg backdrop-blur-sm border border-blue-500/30">
                              <Video className="w-5 h-5 text-blue-300 flex-shrink-0" />
                            </div>
                          ) : lesson.type === 'SCORM' ? (
                            <div className="p-2 bg-purple-500/20 rounded-lg backdrop-blur-sm border border-purple-500/30">
                              <FileText className="w-5 h-5 text-purple-300 flex-shrink-0" />
                            </div>
                          ) : (
                            <div className="p-2 bg-gray-500/20 rounded-lg backdrop-blur-sm border border-gray-500/30">
                              <FileText className="w-5 h-5 text-gray-300 flex-shrink-0" />
                            </div>
                          )}
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-100">{lesson.title}</h3>
                            {lesson.description && (
                              <p className="text-sm text-gray-400 mt-1">{lesson.description}</p>
                            )}
                          </div>
                        </div>
                        {lesson.duration && (
                          <div className="flex items-center gap-1 text-sm text-gray-400 ml-4">
                            <Clock className="w-4 h-4" />
                            {lesson.duration} min
                          </div>
                        )}
                      </div>
                      {(lesson.contentUrl || (lesson as any).content) && (
                        <div className="mt-3">
                          <button
                            onClick={() => {
                              if (lesson.type === 'Video') {
                                setSelectedLesson(lesson);
                                handleLessonProgress(lesson._id || lesson.title, 0);
                              } else {
                                router.push(`/learner/course/${courseId}`);
                              }
                            }}
                            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium px-4 py-2 rounded-xl shadow-lg hover:shadow-indigo-500/50 transition-all duration-300 text-sm inline-flex items-center gap-2"
                          >
                            <Play className="w-4 h-4" />
                            {lesson.type === 'Video' ? 'Watch Video' : lesson.type === 'SCORM' ? 'Launch SCORM' : 'View Content'}
                            {lessonProgress[lesson._id || lesson.title] >= 95 && (
                              <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                Ready
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Quiz Button */}
                {currentModule.assessmentId && (
                  <div className="border-t border-white/10 pt-4">
                    {quizLocked ? (
                      <div className="bg-amber-600/20 border border-amber-500/30 rounded-xl p-4 backdrop-blur-xl">
                        <div className="flex items-start gap-3">
                          <Lock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h3 className="font-semibold text-amber-200 mb-1">Quiz Locked</h3>
                            <p className="text-sm text-amber-300">
                              {getQuizLockReason(currentModule)}
                            </p>
                            <div className="mt-3">
                              <div className="flex items-center gap-2 text-sm text-amber-300">
                                <div className="w-32 bg-amber-500/20 rounded-full h-2">
                                  <div
                                    className="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full transition-all"
                                    style={{ width: `${getModuleProgress(currentModule)}%` }}
                                  ></div>
                                </div>
                                <span className="font-medium">
                                  {Math.round(getModuleProgress(currentModule))}% / 95% required
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setShowQuiz(true)}
                          className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-indigo-500/50 transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
                        >
                          <FileText className="w-5 h-5" />
                          Take Quiz
                        </button>
                        {progress?.quizScore !== undefined && progress.quizScore !== null && (
                          <p className="text-sm text-gray-400 mt-2 text-center">
                            Last Score: {progress.quizScore}%{' '}
                            {progress.isPassed ? (
                              <span className="text-emerald-400 font-medium">Passed</span>
                            ) : (
                              <span className="text-red-400 font-medium">Failed</span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Video Player Modal */}
      {selectedLesson && selectedLesson.type === 'Video' && selectedLesson.contentUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-6xl relative">
            <button
              onClick={() => {
                setSelectedLesson(null);
                loadProgress();
              }}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors z-10 bg-white/10 backdrop-blur-xl rounded-lg p-2"
            >
              <X className="w-6 h-6" />
            </button>
            <VideoPlayerWithProgress
              videoUrl={selectedLesson.contentUrl}
              courseId={courseId}
              lessonId={selectedLesson._id || selectedLesson.title}
              lessonTitle={selectedLesson.title}
              initialPosition={lessonSavedPositions[selectedLesson._id || selectedLesson.title] || 0}
              onProgressUpdate={(watchedPercentage: number) => {
                const lessonKey = selectedLesson._id || selectedLesson.title;
                setLessonProgress(prev => ({
                  ...prev,
                  [lessonKey]: watchedPercentage,
                }));
                handleLessonProgress(lessonKey, watchedPercentage);
              }}
              onComplete={() => {
                handleLessonProgress(selectedLesson._id || selectedLesson.title, 100);
                loadProgress();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseViewerPage;
