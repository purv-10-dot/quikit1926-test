'use client';
/**
 * LockedCoursePlayer — ported from the old QuikSkills frontend
 * (`src/components/learner/LockedCoursePlayer.tsx`), which served the
 * `/learner/course/:courseId/legacy` route.
 *
 * The sequential-progression player: lessons unlock in order, gated on the
 * previous one's completion. Mounted here via `@/components/players/CoursePlayer`
 * (`mode="legacy"`), which previously rendered a "not yet ported" placeholder.
 *
 * Browser-only (ssr:false) — it touches window/document and ReactPlayer.
 *
 * Porting deviations (all behavior-preserving):
 *  - react-router-dom `useParams`/`useNavigate` → next/navigation
 *    `useParams`/`useRouter`.
 *  - axios → the app's fetch wrapper (`@/lib/api`), which returns the response
 *    BODY directly, so every `res.data.data` collapses to `res.data`.
 *
 * KNOWN DEAD PATH, reproduced: `loadSCORMPackage` GETs `/scorm/packages/:id`,
 * which **has never existed** — not in this app, and not in the NestJS backend
 * either (its scorm controller only ever exposed parse/extract/validate). The
 * call 404s and the catch falls back to a constructed `/scorm/{id}/index.html`
 * URL. Faithful to the original; see the note in GAP_REPORT §4b.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactPlayer from 'react-player';
import {
  ArrowLeft, Play, Pause, CheckCircle, Lock, Video, FileText,
  Award, Clock, AlertCircle, X, ChevronDown, ChevronRight, WifiOff
} from 'lucide-react';
import { api } from '@/lib/api';
import QuizTakingComponent from '@/components/learner/QuizTakingComponent';
import QuizResultsComponent from '@/components/learner/QuizResultsComponent';
import InteractiveQuizComponent from '@/components/learner/InteractiveQuizComponent';
import ProctoredQuizWrapper from '@/components/learner/ProctoredQuizWrapper';
import OfflineAlert from '@/components/learner/OfflineAlert';
import PdfProgressViewer from '@/components/learner/PdfProgressViewer';

interface Lesson {
  _id?: string;
  title: string;
  type: 'Video' | 'PDF' | 'SCORM' | 'Quiz' | 'Text';
  contentUrl?: string;
  orderIndex: number;
  description?: string;
  duration?: number;
  scormPackageId?: string;
  assessmentId?: string;
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

interface LessonProgress {
  lessonId: string;
  completionPercentage: number;
  isCompleted: boolean;
  currentPosition?: number;
  lastAccessedAt?: string;
}

const LockedCoursePlayer: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [showQuiz, setShowQuiz] = useState(false);
  const [showQuizResults, setShowQuizResults] = useState(false);
  const [quizResult, setQuizResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
  
  // Video player state
  const playerRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  // `navigator` is read in a useState initializer, which runs during render —
  // guarded so the module is safe even if it is ever imported without
  // `dynamic(ssr:false)`. Defaults to online, matching a browser's normal state.
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  
  // Auto-save interval
  const syncInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadProgress();
    }

    // Set up auto-save every 15 seconds (only when online)
    syncInterval.current = setInterval(() => {
      if (isOnline) {
        syncProgress();
      }
    }, 15000);

    // Monitor online/offline status
    const handleOnline = () => {
      setIsOnline(true);
      // Sync progress when back online
      syncProgress();
    };
    const handleOffline = () => {
      setIsOnline(false);
      // Pause video if playing
      if (playing && playerRef.current) {
        playerRef.current.getInternalPlayer()?.pause();
        setPlaying(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Save on unmount
    return () => {
      if (syncInterval.current) {
        clearInterval(syncInterval.current);
      }
      if (isOnline) {
        syncProgress(); // Final save only if online
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [courseId]);

  const loadCourse = async () => {
    try {
      const response = await api.get<{ data: Course }>(`/courses/${courseId}`);
      setCourse(response.data);

      // Expand first module by default
      if (response.data?.modules?.[0]) {
        setExpandedModules(new Set([response.data.modules[0]._id]));
      }
    } catch (error) {
      console.error('Failed to load course:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async () => {
    try {
      const response = await api.get<{ data: any }>(`/progress/${courseId}`);
      const progressData = response.data;
      setProgress(progressData);

      // Load lesson-level progress
      if (progressData?.lessonProgress) {
        setLessonProgress(progressData.lessonProgress);
      }
    } catch (error) {
      console.error('Failed to load progress:', error);
    }
  };

  const syncProgress = useCallback(async () => {
    if (!courseId || !course) return;

    const currentModule = course.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];
    
    if (!currentLesson) return;

    try {
      const lessonProg = lessonProgress[currentLesson._id || currentLesson.title] || {
        lessonId: currentLesson._id || currentLesson.title,
        completionPercentage: 0,
        isCompleted: false,
      };

      await api.patch('/learner/sync-progress', {
        courseId,
        moduleId: currentModule._id,
        lessonId: currentLesson._id || currentLesson.title,
        completionPercentage: lessonProg.completionPercentage,
        currentPosition: currentLesson.type === 'Video' ? played * duration : undefined,
        status: lessonProg.isCompleted ? 'completed' : 'in_progress',
      });
    } catch (error) {
      console.error('Failed to sync progress:', error);
    }
  }, [courseId, course, currentModuleIndex, currentLessonIndex, lessonProgress, played, duration]);

  // Check if a lesson is locked
  const isLessonLocked = (moduleIndex: number, lessonIndex: number): boolean => {
    if (moduleIndex === 0 && lessonIndex === 0) return false; // First lesson is always unlocked

    const module = course?.modules[moduleIndex];
    if (!module) return true;

    // Check if previous lesson in same module is completed
    if (lessonIndex > 0) {
      const previousLesson = module.lessons[lessonIndex - 1];
      const prevProg = lessonProgress[previousLesson._id || previousLesson.title];
      if (!prevProg?.isCompleted) return true;
    }

    // Check if previous module is completed (if this is first lesson of a module)
    if (lessonIndex === 0 && moduleIndex > 0) {
      const previousModule = course.modules[moduleIndex - 1];
      const lastLesson = previousModule.lessons[previousModule.lessons.length - 1];
      const lastProg = lessonProgress[lastLesson._id || lastLesson.title];
      if (!lastProg?.isCompleted) return true;
    }

    return false;
  };

  const isQuizLocked = (moduleIndex: number, lessonIndex: number): boolean => {
    const module = course?.modules[moduleIndex];
    if (!module) return true;

    const lesson = module.lessons[lessonIndex];
    if (lesson.type !== 'Quiz') return false;

    if (lessonIndex > 0) {
      const previousLesson = module.lessons[lessonIndex - 1];
      const prevProg = lessonProgress[previousLesson._id || previousLesson.title];
      return !prevProg?.isCompleted;
    }

    return true;
  };

  const handleLessonClick = (moduleIndex: number, lessonIndex: number) => {
    if (isLessonLocked(moduleIndex, lessonIndex)) {
      showToast('Please complete the previous lesson to unlock this content.', 'error');
      return;
    }

    if (course?.modules[moduleIndex].lessons[lessonIndex].type === 'Quiz') {
      if (isQuizLocked(moduleIndex, lessonIndex)) {
        showToast('Please complete at least 95% of the previous content to unlock this quiz.', 'error');
        return;
      }
      setShowQuiz(true);
      return;
    }

    setCurrentModuleIndex(moduleIndex);
    setCurrentLessonIndex(lessonIndex);
    
    // Expand module if collapsed
    const module = course?.modules[moduleIndex];
    if (module) {
      setExpandedModules(prev => new Set(prev).add(module._id));
    }

    // Load saved position for video
    const lesson = module?.lessons[lessonIndex];
    if (lesson?.type === 'Video' && lesson.contentUrl) {
      const lessonProg = lessonProgress[lesson._id || lesson.title];
      if (lessonProg?.currentPosition) {
        setPlayed(lessonProg.currentPosition / (lesson.duration || 1));
      }
    }
  };

  const showToast = (message: string, type: 'error' | 'info' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleVideoProgress = (state: { played: number; playedSeconds: number }) => {
    if (!seeking) {
      setPlayed(state.played);
      
      // Update lesson progress
      const currentModule = course?.modules[currentModuleIndex];
      const currentLesson = currentModule?.lessons[currentLessonIndex];
      if (currentLesson) {
        const completionPercentage = state.played * 100;
        updateLessonProgress(currentLesson._id || currentLesson.title, {
          completionPercentage,
          isCompleted: completionPercentage >= 95,
          currentPosition: state.playedSeconds,
        });
      }
    }
  };

  const handleVideoEnd = () => {
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];
    if (currentLesson) {
      updateLessonProgress(currentLesson._id || currentLesson.title, {
        completionPercentage: 100,
        isCompleted: true,
      });
      showToast('Lesson completed! You can now proceed to the next lesson.', 'info');
    }
  };

  const updateLessonProgress = (lessonId: string, progress: Partial<LessonProgress>) => {
    setLessonProgress(prev => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        lessonId,
        ...progress,
      },
    }));
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlayed(parseFloat(e.target.value));
  };

  const handleSeekMouseDown = () => {
    setSeeking(true);
  };

  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    setSeeking(false);
    if (playerRef.current) {
      const seekTo = parseFloat(e.currentTarget.value);
      playerRef.current.seekTo(seekTo);
      showToast('Please watch the full content to proceed.', 'error');
    }
  };

  const handleQuizComplete = (result: { passed: boolean; percentage: number }) => {
    setQuizResult(result);
    setShowQuiz(false);
    setShowQuizResults(true);
    
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];
    if (currentLesson) {
      updateLessonProgress(currentLesson._id || currentLesson.title, {
        completionPercentage: result.percentage,
        isCompleted: true,
      });
    }
    
    loadProgress();
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) {
        newSet.delete(moduleId);
      } else {
        newSet.add(moduleId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Loading course...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Course not found</p>
          <button
            onClick={() => router.push('/learner/dashboard')}
            className="mt-4 btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentModule = course.modules[currentModuleIndex];
  const currentLesson = currentModule?.lessons[currentLessonIndex];

  if (showQuiz && currentLesson?.type === 'Quiz' && currentLesson.assessmentId) {
    return (
      <div className="min-h-screen bg-gray-900">
        <ProctoredQuizWrapper
          assessmentId={currentLesson.assessmentId}
          courseId={courseId!}
          lessonId={currentLesson._id || currentLesson.title}
          quizTitle={currentLesson.title}
          onComplete={(result) => {
            handleQuizComplete({
              passed: result.passed,
              percentage: result.percentage,
            });
          }}
          onCancel={() => setShowQuiz(false)}
        />
      </div>
    );
  }

  if (showQuizResults && quizResult) {
    return (
      <div className="min-h-screen bg-gray-900 p-4">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => {
              setShowQuizResults(false);
              setQuizResult(null);
            }}
            className="mb-4 text-gray-400 hover:text-white flex items-center gap-2"
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
    <div className="h-screen flex bg-gray-900 text-white overflow-hidden">
      {/* Offline Alert */}
      <OfflineAlert
        onReconnect={() => {
          // Sync progress when back online
          syncProgress();
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        } text-white animate-slide-in`}>
          {toast.message}
        </div>
      )}

      {/* Sidebar - Course Map */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => router.push('/learner/dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>
          <h1 className="text-lg font-bold text-white line-clamp-2" title={course.title}>{course.title}</h1>
          {progress && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Overall Progress</span>
                <span>{(progress.completionPercentage || 0).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-primary-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${progress.completionPercentage || 0}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Course Map */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {course.modules.map((module, moduleIndex) => {
              const isExpanded = expandedModules.has(module._id);
              const moduleProgress = module.lessons.reduce((acc, lesson) => {
                const prog = lessonProgress[lesson._id || lesson.title];
                return acc + (prog?.completionPercentage || 0);
              }, 0) / module.lessons.length;

              return (
                <div key={module._id} className="border border-gray-700 rounded-lg overflow-hidden">
                  {/* Module Header */}
                  <button
                    onClick={() => toggleModule(module._id)}
                    className="w-full p-3 bg-gray-750 hover:bg-gray-700 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium text-white truncate" title={module.title}>{module.title}</span>
                    </div>
                    <div className="text-xs text-gray-400">{Math.round(moduleProgress)}%</div>
                  </button>

                  {/* Module Lessons */}
                  {isExpanded && (
                    <div className="bg-gray-800">
                      {module.lessons.map((lesson, lessonIndex) => {
                        const isLocked = isLessonLocked(moduleIndex, lessonIndex);
                        const isQuiz = lesson.type === 'Quiz';
                        const isQuizLockedState = isQuiz && isQuizLocked(moduleIndex, lessonIndex);
                        const lessonProg = lessonProgress[lesson._id || lesson.title];
                        const isActive = currentModuleIndex === moduleIndex && currentLessonIndex === lessonIndex;

                        return (
                          <button
                            key={lessonIndex}
                            onClick={() => handleLessonClick(moduleIndex, lessonIndex)}
                            disabled={isLocked || isQuizLockedState}
                            className={`w-full p-3 text-left border-t border-gray-700 flex items-center gap-3 transition-colors ${
                              isActive
                                ? 'bg-primary-600/20 border-l-4 border-l-primary-500'
                                : isLocked || isQuizLockedState
                                ? 'bg-gray-800/50 opacity-50 cursor-not-allowed'
                                : 'hover:bg-gray-700'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {isLocked || isQuizLockedState ? (
                                <Lock className="w-4 h-4 text-gray-500" />
                              ) : lessonProg?.isCompleted ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : lesson.type === 'Video' ? (
                                <Video className="w-4 h-4 text-blue-400" />
                              ) : lesson.type === 'Quiz' ? (
                                <Award className="w-4 h-4 text-yellow-400" />
                              ) : (
                                <FileText className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${
                                isLocked || isQuizLockedState ? 'text-gray-500' : 'text-gray-300'
                              }`} title={lesson.title}>
                                {lesson.title}
                              </p>
                              {lessonProg && !isLocked && lesson.type !== 'Quiz' && (
                                <div className="mt-1 w-full bg-gray-700 rounded-full h-1">
                                  <div
                                    className="bg-primary-500 h-1 rounded-full transition-all"
                                    style={{ width: `${lessonProg.completionPercentage}%` }}
                                  ></div>
                                </div>
                              )}
                            </div>
                            {lesson.duration && (
                              <Clock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area - Dark Mode Player */}
      <div className="flex-1 flex flex-col bg-gray-900">
        {currentLesson ? (
          <>
            {/* Lesson Header */}
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-2xl font-bold text-white mb-2">{currentLesson.title}</h2>
              {currentLesson.description && (
                <p className="text-gray-400">{currentLesson.description}</p>
              )}
            </div>

            {/* Player Area */}
            <div className="flex-1 flex items-center justify-center p-6 bg-black">
              {currentLesson.type === 'Video' && currentLesson.contentUrl ? (
                <div className="w-full max-w-6xl">
                  <div className="relative">
                    {!isOnline && (
                      <div className="absolute inset-0 bg-black/80 z-10 flex items-center justify-center">
                        <div className="text-center text-white p-6">
                          <WifiOff className="w-16 h-16 mx-auto mb-4" />
                          <p className="text-xl font-semibold mb-2">Connection Lost</p>
                          <p className="text-gray-300">
                            Progress will sync once you are back online.
                          </p>
                        </div>
                      </div>
                    )}
                    <ReactPlayer
                      ref={playerRef}
                      url={currentLesson.contentUrl}
                      playing={playing && isOnline}
                      controls={false} // Hide default controls to prevent seeking
                      width="100%"
                      height="100%"
                      onProgress={(state: any) => {
                        if (state && typeof state === 'object' && 'played' in state) {
                          handleVideoProgress(state);
                        }
                      }}
                      onEnded={handleVideoEnd}
                      onDuration={setDuration}
                      onPlay={() => {
                        if (isOnline) {
                          setPlaying(true);
                        } else {
                          showToast('Please check your internet connection.', 'error');
                        }
                      }}
                      onPause={() => setPlaying(false)}
                      onSeek={(_seconds: any) => {
                        // Prevent seeking - show toast
                        showToast('Please watch the full content to proceed.', 'error');
                        // Reset to previous position
                        if (playerRef.current) {
                          playerRef.current.seekTo(played);
                        }
                      }}
                      config={{
                        youtube: {
                          // @ts-ignore - ReactPlayer type definitions
                          playerVars: {
                            // @ts-ignore - ReactPlayer type definitions
                            controls: 0, // Hide YouTube controls
                            disablekb: 1, // Disable keyboard controls
                            modestbranding: 1,
                            rel: 0,
                          },
                        },
                        file: {
                          attributes: {
                            controlsList: 'nodownload',
                            onContextMenu: (e: any) => e.preventDefault(),
                          },
                        },
                      }}
                    />
                    {/* Custom Controls Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => {
                            if (playerRef.current) {
                              if (playing) {
                                playerRef.current.getInternalPlayer()?.pause();
                              } else {
                                playerRef.current.getInternalPlayer()?.play();
                              }
                            }
                          }}
                          className="text-white hover:text-gray-300 transition-colors"
                        >
                          {playing ? (
                            <Pause className="w-6 h-6" />
                          ) : (
                            <Play className="w-6 h-6" />
                          )}
                        </button>
                        <div className="flex-1 text-white text-sm">
                          {Math.floor((played * duration) / 60)}:{(Math.floor(played * duration) % 60).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{(Math.floor(duration) % 60).toString().padStart(2, '0')}
                        </div>
                      </div>
                      {/* Progress bar (read-only, no seeking) */}
                      <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                        <div
                          className="bg-primary-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${played * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : currentLesson.type === 'SCORM' && currentLesson.scormPackageId ? (
                <SCORMPlayer
                  scormPackageId={currentLesson.scormPackageId}
                  courseId={courseId!}
                  lessonId={currentLesson._id || currentLesson.title}
                  onComplete={() => {
                    updateLessonProgress(currentLesson._id || currentLesson.title, {
                      completionPercentage: 100,
                      isCompleted: true,
                    });
                    showToast('SCORM content completed!', 'info');
                  }}
                  onProgressUpdate={(percentage) => {
                    updateLessonProgress(currentLesson._id || currentLesson.title, {
                      completionPercentage: percentage,
                      isCompleted: percentage >= 95,
                    });
                  }}
                />
              ) : currentLesson.type === 'PDF' && currentLesson.contentUrl ? (
                <PdfProgressViewer
                  fileUrl={currentLesson.contentUrl}
                  courseId={courseId!}
                  lessonId={currentLesson._id || currentLesson.title}
                  title={currentLesson.title}
                  onComplete={() => {
                    updateLessonProgress(currentLesson._id || currentLesson.title, {
                      completionPercentage: 100,
                      isCompleted: true,
                    });
                    showToast('PDF completed! You can now proceed to the next lesson.', 'info');
                  }}
                />
              ) : (
                <div className="text-center text-gray-400">
                  <FileText className="w-16 h-16 mx-auto mb-4" />
                  <p>Content not available</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Play className="w-16 h-16 mx-auto mb-4" />
              <p>Select a lesson to begin</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// SCORM Player Component
interface SCORMPlayerProps {
  scormPackageId: string;
  courseId: string;
  lessonId: string;
  onComplete: () => void;
  onProgressUpdate: (percentage: number) => void;
}

const SCORMPlayer: React.FC<SCORMPlayerProps> = ({
  scormPackageId,
  courseId,
  lessonId,
  onComplete,
  onProgressUpdate,
}) => {
  const [scormUrl, setScormUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    loadSCORMPackage();
    
    // Set up SCORM API communication
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'scorm') {
        handleSCORMEvent(event.data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [scormPackageId]);

  const loadSCORMPackage = async () => {
    try {
      // Get SCORM package URL from S3
      // See the docblock: this endpoint has never existed on either backend. The
      // call 404s and the catch below supplies the fallback URL. Reproduced.
      // Typed `any` because the source's axios response was untyped: with a
      // precise type the `url || packageUrl` chain narrows to `string | undefined`
      // and clashes with the `string | null` state — a compile error the original
      // never had. Tightening it here would mean changing the runtime expression.
      const response = await api.get<{ data?: any }>(`/scorm/packages/${scormPackageId}`);
      setScormUrl(response.data?.url || response.data?.packageUrl);
    } catch (error) {
      console.error('Failed to load SCORM package:', error);
      // Fallback: try to construct URL from package ID
      // In production, this would come from your S3 bucket
      setScormUrl(`/scorm/${scormPackageId}/index.html`);
    } finally {
      setLoading(false);
    }
  };

  const handleSCORMEvent = (data: any) => {
    if (data.action === 'LMSSetValue') {
      if (data.element === 'cmi.core.lesson_status') {
        if (data.value === 'completed' || data.value === 'passed') {
          onComplete();
        }
      } else if (data.element === 'cmi.core.score.raw') {
        // Update progress based on score
        const percentage = parseFloat(data.value) || 0;
        onProgressUpdate(percentage);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!scormUrl) {
    return (
      <div className="text-center text-gray-400">
        <AlertCircle className="w-16 h-16 mx-auto mb-4" />
        <p>SCORM package not found</p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={scormUrl}
      className="w-full h-full border-0"
      title="SCORM Content"
      allow="fullscreen"
    />
  );
};

export default LockedCoursePlayer;

