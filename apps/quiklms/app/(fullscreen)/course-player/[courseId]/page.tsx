'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Play,
  Circle,
  BookOpen,
  Clock,
  Loader2,
  AlertCircle,
  Award,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

// ── Types ────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  title: string;
  videoUrl?: string;
  duration?: string;
  description?: string;
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

interface PlayerData {
  course: { id: string; title: string; description?: string };
  modules: Module[];
  progress: Record<string, boolean>;
}

// ── Helper: detect youtube ────────────────────────────────────────────────────

function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function toYouTubeEmbedUrl(url: string): string {
  // Handle youtu.be/ID
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  // Handle watch?v=ID
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  // Already an embed URL
  if (url.includes('/embed/')) return url;
  return url;
}

// ── Video Player component ────────────────────────────────────────────────────

interface VideoPlayerProps {
  lesson: Lesson;
  onAutoComplete: () => void;
  isCompleted: boolean;
}

function VideoPlayer({ lesson, onAutoComplete, isCompleted }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoCompletedRef = useRef(false);

  // Reset auto-complete flag when lesson changes
  useEffect(() => {
    autoCompletedRef.current = false;
  }, [lesson.id]);

  const handleTimeUpdate = useCallback(() => {
    if (autoCompletedRef.current || isCompleted) return;
    const el = videoRef.current;
    if (!el || !el.duration || el.duration === 0) return;
    const pct = el.currentTime / el.duration;
    if (pct > 0.8) {
      autoCompletedRef.current = true;
      onAutoComplete();
    }
  }, [isCompleted, onAutoComplete]);

  if (!lesson.videoUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 gap-4">
        <BookOpen className="w-16 h-16 text-gray-500" />
        <p className="text-gray-400 text-lg font-medium">No video for this lesson</p>
        {lesson.description && (
          <p className="text-gray-500 text-sm max-w-md text-center px-4">{lesson.description}</p>
        )}
      </div>
    );
  }

  if (isYouTubeUrl(lesson.videoUrl)) {
    const embedUrl = toYouTubeEmbedUrl(lesson.videoUrl);
    return (
      <iframe
        src={embedUrl}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={lesson.title}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      className="w-full h-full object-contain"
      src={lesson.videoUrl}
      onTimeUpdate={handleTimeUpdate}
      key={lesson.id}
    />
  );
}

// ── Sidebar lesson row ────────────────────────────────────────────────────────

interface LessonRowProps {
  lesson: Lesson;
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
}

function LessonRow({ lesson, isActive, isCompleted, onClick }: LessonRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        isActive
          ? 'bg-blue-50 dark:bg-blue-950/40'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <span className="mt-0.5 shrink-0">
        {isCompleted ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : isActive ? (
          <Play className="w-5 h-5 text-blue-500" />
        ) : (
          <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600" />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-medium leading-snug truncate ${
            isActive
              ? 'text-blue-700 dark:text-blue-300'
              : 'text-gray-800 dark:text-gray-200'
          }`}
        >
          {lesson.title}
        </span>
        {lesson.duration && (
          <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
            <Clock className="w-3 h-3" />
            {lesson.duration}
          </span>
        )}
      </span>
    </button>
  );
}

// ── Module accordion ──────────────────────────────────────────────────────────

interface ModuleAccordionProps {
  module: Module;
  moduleIndex: number;
  activeModuleIndex: number;
  activeLessonIndex: number;
  progress: Record<string, boolean>;
  onLessonClick: (moduleIndex: number, lessonIndex: number) => void;
  primaryColor: string;
}

function ModuleAccordion({
  module,
  moduleIndex,
  activeModuleIndex,
  activeLessonIndex,
  progress,
  onLessonClick,
  primaryColor,
}: ModuleAccordionProps) {
  const isOpen = moduleIndex === activeModuleIndex;
  const lessons = module.lessons ?? [];
  const completedCount = lessons.filter((l) => progress[l.id]).length;
  const totalCount = lessons.length;

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <button
        type="button"
        onClick={() => onLessonClick(moduleIndex, 0)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {module.title}
          </span>
          <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {completedCount}/{totalCount} lessons
          </span>
        </span>
      </button>

      {isOpen && lessons.length > 0 && (
        <div className="pb-2 px-2 space-y-0.5">
          {lessons.map((lesson, lIdx) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              isActive={moduleIndex === activeModuleIndex && lIdx === activeLessonIndex}
              isCompleted={!!progress[lesson.id]}
              onClick={() => onLessonClick(moduleIndex, lIdx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoursePlayerPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { branding } = useBranding();

  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [markingComplete, setMarkingComplete] = useState(false);

  // ── Load player data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseId) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load course structure
        const courseRes = await api.get<{ success: boolean; data: { _id?: string; id?: string; title: string; description?: string; modules?: Module[] } }>(
          `/courses/${courseId}`
        );
        const courseData = courseRes.data;

        const modules: Module[] = (courseData.modules ?? []).map((m: any) => ({
          id: m._id || m.id || '',
          title: m.title || 'Module',
          lessons: (m.lessons ?? []).map((l: any) => ({
            id: l._id || l.id || '',
            title: l.title || 'Lesson',
            videoUrl: l.videoUrl || l.url || l.contentUrl || '',
            duration: l.duration || l.estimatedDuration || '',
            description: l.description || '',
          })),
        }));

        // Load progress (course-level progress contains the per-lesson map)
        let progressMap: Record<string, boolean> = {};
        try {
          const progressRes = await api.get<{ success: boolean; data: { lessonProgress?: Record<string, unknown> } }>(
            `/progress/${courseId}`
          );
          // Build from lesson progress
          const lp = (progressRes as any)?.data?.lessonProgress as Record<string, Record<string, unknown>> | undefined;
          if (lp) {
            for (const [lessonId, val] of Object.entries(lp)) {
              const v = val as Record<string, unknown>;
              progressMap[lessonId] =
                v.isCompleted === true || ((v.completionPercentage as number) || 0) >= 95;
            }
          }
        } catch {
          // progress load failure is non-fatal
        }

        if (!mounted) return;
        setData({
          course: {
            id: courseData._id || courseData.id || courseId,
            title: courseData.title,
            description: courseData.description,
          },
          modules,
          progress: progressMap,
        });
        setProgress(progressMap);

        // Resume at first incomplete lesson
        let foundModule = 0;
        let foundLesson = 0;
        outer: for (let mi = 0; mi < modules.length; mi++) {
          const lessons = modules[mi].lessons ?? [];
          for (let li = 0; li < lessons.length; li++) {
            if (!progressMap[lessons[li].id]) {
              foundModule = mi;
              foundLesson = li;
              break outer;
            }
          }
        }
        setActiveModuleIndex(foundModule);
        setActiveLessonIndex(foundLesson);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load course');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [courseId]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const allLessons: { lesson: Lesson; moduleIndex: number; lessonIndex: number }[] = [];
  (data?.modules ?? []).forEach((m, mi) => {
    (m.lessons ?? []).forEach((l, li) => {
      allLessons.push({ lesson: l, moduleIndex: mi, lessonIndex: li });
    });
  });

  const totalLessons = allLessons.length;
  const completedLessons = allLessons.filter(({ lesson }) => progress[lesson.id]).length;
  const completionPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const activeModule = data?.modules?.[activeModuleIndex] ?? null;
  const activeLesson = activeModule?.lessons?.[activeLessonIndex] ?? null;

  const currentFlatIndex = allLessons.findIndex(
    (x) => x.moduleIndex === activeModuleIndex && x.lessonIndex === activeLessonIndex
  );
  const hasPrev = currentFlatIndex > 0;
  const hasNext = currentFlatIndex < allLessons.length - 1;

  // ── Navigation ──────────────────────────────────────────────────────────────

  const navigateToFlat = useCallback(
    (flatIndex: number) => {
      const target = allLessons[flatIndex];
      if (!target) return;
      setActiveModuleIndex(target.moduleIndex);
      setActiveLessonIndex(target.lessonIndex);
    },
    [allLessons]
  );

  const handleLessonClick = useCallback((moduleIndex: number, lessonIndex: number) => {
    setActiveModuleIndex(moduleIndex);
    setActiveLessonIndex(lessonIndex);
  }, []);

  // ── Mark complete ───────────────────────────────────────────────────────────

  const markComplete = useCallback(
    async (lessonId: string) => {
      if (!lessonId || progress[lessonId]) return;
      setMarkingComplete(true);
      try {
        await api.patch('/player/sync', {
          courseId,
          lessonId,
          completionPercentage: 100,
          status: 'Completed',
        });
        setProgress((prev) => ({ ...prev, [lessonId]: true }));
      } catch {
        // Optimistic: mark anyway in UI
        setProgress((prev) => ({ ...prev, [lessonId]: true }));
      } finally {
        setMarkingComplete(false);
      }
    },
    [courseId, progress]
  );

  const handleAutoComplete = useCallback(() => {
    if (activeLesson) {
      void markComplete(activeLesson.id);
    }
  }, [activeLesson, markComplete]);

  // ── Render states ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
          <p className="text-gray-400 text-sm">Loading course…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-red-800/40 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-200 font-semibold mb-1">Failed to load course</p>
          <p className="text-gray-400 text-sm mb-5">{error || 'Unknown error'}</p>
          <button
            type="button"
            onClick={() => router.push('/learner/course-status')}
            className="text-blue-400 hover:text-blue-300 text-sm underline"
          >
            Back to My Courses
          </button>
        </div>
      </div>
    );
  }

  const isCurrentLessonComplete = activeLesson ? !!progress[activeLesson.id] : false;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center gap-4 px-4 border-b border-gray-800 bg-gray-900 shrink-0 z-10">
        {/* Back link */}
        <button
          type="button"
          onClick={() => router.push('/learner/course-status')}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm font-medium whitespace-nowrap"
        >
          <ChevronLeft className="w-4 h-4" />
          My Courses
        </button>

        {/* Course title */}
        <h1 className="flex-1 text-center text-sm font-semibold text-gray-100 truncate px-2">
          {data.course.title}
        </h1>

        {/* Completion badge */}
        <div className="flex items-center gap-2 shrink-0">
          {completionPct === 100 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-300 bg-yellow-900/40 border border-yellow-700/50 px-2.5 py-1 rounded-full">
              <Award className="w-3.5 h-3.5" />
              Completed
            </span>
          )}
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${branding.primaryColor}22`, color: branding.primaryColor, border: `1px solid ${branding.primaryColor}44` }}
          >
            {completionPct}% Complete
          </span>
        </div>
      </header>

      {/* ── MAIN AREA ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 bg-gray-900 border-r border-gray-800 overflow-y-auto flex flex-col">
          {/* Sidebar header */}
          <div className="px-4 py-4 border-b border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Course Content</p>
            <p className="text-sm font-bold text-gray-100 leading-snug">{data.course.title}</p>
            {/* Overall progress bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{completedLessons}/{totalLessons} lessons</span>
                <span className="text-xs font-semibold" style={{ color: branding.primaryColor }}>
                  {completionPct}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${completionPct}%`, backgroundColor: branding.primaryColor }}
                />
              </div>
            </div>
          </div>

          {/* Module list */}
          <div className="flex-1">
            {(data.modules ?? []).map((module, moduleIndex) => (
              <ModuleAccordion
                key={module.id}
                module={module}
                moduleIndex={moduleIndex}
                activeModuleIndex={activeModuleIndex}
                activeLessonIndex={activeLessonIndex}
                progress={progress}
                onLessonClick={handleLessonClick}
                primaryColor={branding.primaryColor}
              />
            ))}
          </div>
        </aside>

        {/* ── RIGHT MAIN ─────────────────────────────────────────────────────── */}
        <main className="flex-1 bg-gray-950 overflow-y-auto flex flex-col">
          {activeLesson ? (
            <>
              {/* 16:9 Video area */}
              <div className="w-full bg-black" style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 14rem)' }}>
                <div className="w-full h-full">
                  <VideoPlayer
                    key={activeLesson.id}
                    lesson={activeLesson}
                    onAutoComplete={handleAutoComplete}
                    isCompleted={isCurrentLessonComplete}
                  />
                </div>
              </div>

              {/* Lesson info */}
              <div className="flex-1 px-6 py-5 max-w-4xl">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-100 leading-tight">{activeLesson.title}</h2>
                    {activeLesson.duration && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        {activeLesson.duration}
                      </span>
                    )}
                  </div>
                  {isCurrentLessonComplete && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400 bg-green-900/30 border border-green-700/40 px-2.5 py-1 rounded-full shrink-0 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Completed
                    </span>
                  )}
                </div>

                {activeLesson.description && (
                  <p className="text-sm text-gray-400 leading-relaxed">{activeLesson.description}</p>
                )}

                {/* Module info */}
                {activeModule && (
                  <p className="text-xs text-gray-600 mt-3 font-medium uppercase tracking-wide">
                    {activeModule.title}
                  </p>
                )}
              </div>

              {/* Bottom action bar */}
              <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between gap-3 shrink-0">
                {/* Prev */}
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => navigateToFlat(currentFlatIndex - 1)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                {/* Mark Complete */}
                <button
                  type="button"
                  disabled={isCurrentLessonComplete || markingComplete}
                  onClick={() => activeLesson && void markComplete(activeLesson.id)}
                  className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isCurrentLessonComplete ? '#16a34a' : branding.primaryColor,
                  }}
                >
                  {markingComplete ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCurrentLessonComplete ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : null}
                  {isCurrentLessonComplete ? 'Lesson Complete' : 'Mark as Complete'}
                </button>

                {/* Next */}
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => navigateToFlat(currentFlatIndex + 1)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            /* Empty state when no lesson selected */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
              <BookOpen className="w-16 h-16 text-gray-700" />
              <p className="text-gray-500 text-lg font-medium">Select a lesson to begin</p>
              <p className="text-gray-600 text-sm">
                Choose a lesson from the sidebar to start learning.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
