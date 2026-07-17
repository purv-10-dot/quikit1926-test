'use client';
/**
 * UniversalLMSPlayer — ported from the old QuikSkills frontend
 * (`src/components/learner/UniversalLMSPlayer.tsx`), which served the
 * `/learner/course/:courseId` route. Mounted here via `@/components/players/CoursePlayer`
 * with `dynamic(..., { ssr:false })` — it touches window/document/fullscreen and
 * must never be server-rendered.
 *
 * This is the host for the SCORM API bridge that `/api/upload/scorm` injects into
 * every SCORM package's entry HTML. The `handleScormBridgeMessage` listener below
 * is the other half of that contract: the bridge posts
 * `{source:'scorm-bridge', type:'ready'|'init'|'commit'|'completed'|'score'|'finish'}`
 * and this listener replies `{source:'scorm-lms', type:'init-data'}` to restore
 * suspend_data. Both sides must agree byte-for-byte — see
 * `lib/services/scorm-service.ts:injectScormBridge`.
 *
 * Porting deviations from the Vite original (all behavior-preserving):
 *  - react-router-dom `useNavigate()` → next/navigation `useRouter()`/`router.push`.
 *  - axios → the app's fetch wrapper (`@/lib/api`), which returns the response
 *    BODY directly, so every `res.data.data` collapses to `res.data`.
 *  - The user came from `sessionStorage.getItem('user')`; auth is centralized now,
 *    so it comes from the existing `useCurrentUser()` context. `CurrentUser`
 *    carries both `id` and `_id`, so the downstream `user._id || user.id` reads
 *    are unchanged.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
// Using native HTML5 video instead of ReactPlayer for better compatibility and SCORM compliance
import {
  ArrowLeft, Play, Pause, CheckCircle, Lock, Video, FileText,
  Award, AlertCircle, ChevronDown, ChevronRight, Save,
  WifiOff, Maximize, Minimize, Clock, SkipForward, Presentation, Download
} from 'lucide-react';
import { api } from '@/lib/api';
import InteractiveQuizComponent from '@/components/learner/InteractiveQuizComponent';
import ProctoredQuizWrapper from '@/components/learner/ProctoredQuizWrapper';
import AudioPlayerResource from '@/components/learner/AudioPlayerResource';
import PdfProgressViewer from '@/components/learner/PdfProgressViewer';
import SlidesProgressViewer from '@/components/learner/SlidesProgressViewer';
import SCORMPresentationViewer from '@/components/learner/SCORMPresentationViewer';
import SCORMDocumentViewer from '@/components/learner/SCORMDocumentViewer';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { useFeatures, useCurrentUser } from '@/app/providers';

// ============================================================================
// SCORM CONTENT TYPE BEHAVIOR CONTRACT
// ============================================================================
// PPT Files: SLIDE-BASED, NO scroll, Next/Prev ONLY, complete on last slide
// PDF Files: SCROLL-BASED, free scroll, complete on 95% scroll depth
// DOC Files: Same as PDF (scroll-based)
// Video/Audio Files: TIME-BASED, track playback position
// ============================================================================

// ============================================================================
// SCORM LOCATION FORMAT UTILITIES
// ============================================================================
// SCORM lesson_location formats:
// - PPT/Slides: "slide:INDEX" (e.g., "slide:5")
// - PDF/DOC: "scroll:PIXELS" (e.g., "scroll:2450")
// - Video/Audio: "time:SECONDS" (e.g., "time:305")
// ============================================================================

/**
 * Parse SCORM location format to extract numeric value
 * Supports: slide:X, scroll:X, time:X, or raw numbers for backward compatibility
 */
const parseSCORMLocation = (location: string | number | undefined): number => {
  if (typeof location === 'number') return location;
  if (!location) return 0;
  const match = String(location).match(/^(slide|scroll|time):(\d+)$/);
  return match ? parseInt(match[2], 10) : parseInt(String(location), 10) || 0;
};

/**
 * Format video/audio position as SCORM-compliant lesson_location
 */
const formatTimeLocation = (seconds: number): string => {
  return `time:${Math.floor(seconds)}`;
};

// ============================================================================
// DEBUG UTILITY - Enable/disable debug logging globally
// ============================================================================
const DEBUG_ENABLED = false; // Set to false in production
const DEBUG_PREFIX = '[UniversalLMSPlayer]';

const debugLog = (category: string, message: string, data?: any) => {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `${timestamp} ${DEBUG_PREFIX} [${category}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

const debugError = (category: string, message: string, error?: any) => {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `${timestamp} ${DEBUG_PREFIX} [${category}] ERROR:`;
  console.error(`${prefix} ${message}`, error || '');
};

const debugWarn = (category: string, message: string, data?: any) => {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `${timestamp} ${DEBUG_PREFIX} [${category}] WARN:`;
  if (data !== undefined) {
    console.warn(`${prefix} ${message}`, data);
  } else {
    console.warn(`${prefix} ${message}`);
  }
};

// Declare YouTube Player types
declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, options: {
        videoId: string;
        playerVars?: Record<string, number | string>;
        events?: {
          onReady?: (event: { target: YTPlayer }) => void;
          onStateChange?: (event: { data: number; target: YTPlayer }) => void;
          onError?: (event: { data: number }) => void;
        };
      }) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getAvailablePlaybackRates: () => number[];
  destroy: () => void;
  loadModule: (module: string) => void;
  unloadModule: (module: string) => void;
  setOption: (module: string, option: string, value: any) => void;
  getOption: (module: string, option: string) => any;
}

interface Lesson {
  _id?: string;
  title: string;
  type: 'Video' | 'PDF' | 'SCORM' | 'Quiz' | 'Text' | 'Audio' | 'PPT' | 'Slides' | 'Document';
  contentUrl?: string;
  content?: string;
  orderIndex: number;
  description?: string;
  learningObjective?: string;
  duration?: number;
  scormPackageId?: string;
  scormVersion?: '1.2' | '2004';
  scormLaunchUrl?: string;
  scormEntryPoint?: string;
  assessmentId?: string;
  slideCount?: number;
  slideUrls?: string[];
  captions?: Array<{ language: string; label: string; url: string }>;
  quizData?: any;
}

interface Module {
  _id: string;
  title: string;
  description?: string;
  learningObjective?: string;
  orderIndex: number;
  lessons: Lesson[];
  assessmentId?: string;
}

interface CourseSettings {
  sequentialProgression?: boolean;
  certificateEnabled?: boolean;
  certificateTemplateId?: string;
  passingScore?: number;
  allowRevisit?: boolean;
  showProgressBar?: boolean;
}

interface Course {
  _id: string;
  title: string;
  description?: string;
  modules: Module[];
  settings?: CourseSettings;
}

interface LessonProgress {
  lessonId: string;
  completionPercentage: number;
  isCompleted: boolean;
  currentPosition?: string | number; // SCORM format: "slide:X", "scroll:X", "time:X", or raw number
  suspendData?: string; // SCORM suspend data
  scormData?: Record<string, string>; // Full SCORM data object
  lastAccessedAt?: string;
}

interface XAPIStatement {
  actor: {
    name: string;
    mbox: string;
  };
  verb: {
    id: string;
    display: { 'en-US': string };
  };
  object: {
    id: string;
    definition: {
      name: { 'en-US': string };
      type: string;
    };
  };
  timestamp: string;
  result?: {
    duration?: string;
    completion?: boolean;
    success?: boolean;
  };
}

// YouTube URL detection and ID extraction
const isYouTubeUrl = (url: string): boolean => {
  if (!url) return false;
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)/i;
  return youtubeRegex.test(url);
};

const isVimeoUrl = (url: string): boolean => {
  if (!url) return false;
  const vimeoRegex = /^(https?:\/\/)?(www\.)?(vimeo\.com\/)/i;
  return vimeoRegex.test(url);
};

const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  // Handle various YouTube URL formats:
  // - https://www.youtube.com/watch?v=VIDEO_ID
  // - https://youtu.be/VIDEO_ID
  // - https://www.youtube.com/embed/VIDEO_ID
  // - https://www.youtube.com/v/VIDEO_ID
  const patterns = [
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

const getVimeoVideoId = (url: string): string | null => {
  if (!url) return null;
  // Handle Vimeo URL format: https://vimeo.com/VIDEO_ID
  const match = url.match(/vimeo\.com\/(\d+)/i);
  return match ? match[1] : null;
};

const UniversalLMSPlayer: React.FC = () => {

  const { tenantType } = useFeatures();
  // The player uses a single light theme for every learner (corporate or
  // otherwise) so the new course-completion flow looks consistent. The
  // tenantType variable is still read for any downstream feature checks that
  // need it.
  void tenantType;
  const isCorporate = true;
  // All learners must finish a video to 100% before it counts as complete and
  // before the next resource unlocks.
  const VIDEO_COMPLETE_PCT = 100;
  const DEFAULT_PASSING_SCORE = 75;
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user: currentUser } = useCurrentUser();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [showQuiz, setShowQuiz] = useState(false);
  // Was a centered modal — kept the same trigger condition but render now
  // surfaces as a big celebratory toast at the top of the player.
  const [showCourseCompleteModal, setShowCourseCompleteModal] = useState(false);

  // Auto-dismiss the course-complete toast a few seconds after it appears
  // so the learner isn't stuck with a banner blocking the view.
  useEffect(() => {
    if (!showCourseCompleteModal) return;
    const t = setTimeout(() => setShowCourseCompleteModal(false), 6500);
    return () => clearTimeout(t);
  }, [showCourseCompleteModal]);
  const [quizAutoResumeBlockedForLesson, setQuizAutoResumeBlockedForLesson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
  const [resumeData, setResumeData] = useState<{ lastTime?: number; lastPage?: number; progress?: number; scrollPosition?: number } | null>(null);

  // Corporate-learner course-completion-flow state.
  // passingScoreByLesson: passing score for each quiz (creator-defined or default 75) — used to display pass/fail.
  // retakeMode: when true, next quiz launch bypasses the "already attempted" gate.
  // quizResultByLesson: correct / wrong / total counts for the most recent attempt of each quiz.
  const [passingScoreByLesson, setPassingScoreByLesson] = useState<Record<string, number>>({});
  const [retakeMode, setRetakeMode] = useState(false);
  const [quizResultByLesson, setQuizResultByLesson] = useState<Record<string, { correct: number; wrong: number; total: number }>>({});

  // Video player state - Native HTML5 video
  const playerRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [maxWatchedTime, setMaxWatchedTime] = useState(0); // SCORM compliance: track max watched position
  const [currentTime, setCurrentTime] = useState(0); // Current playback time
  const [sessionTime, setSessionTime] = useState(0); // Total time spent watching in this session (seconds)
  const sessionStartTimeRef = useRef<number | null>(null); // When current playing session started
  const [youtubeWatchTime, setYoutubeWatchTime] = useState(0); // Track YouTube watch time for compliance
  const youtubeTimerRef = useRef<NodeJS.Timeout | null>(null); // YouTube watch timer
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // Playback speed (1x, 1.25x, 1.5x, 2x)
  const [isFullscreen, setIsFullscreen] = useState(false); // Fullscreen state
  const [showSpeedDropdown, setShowSpeedDropdown] = useState(false); // Speed dropdown visibility
  const videoContainerRef = useRef<HTMLDivElement>(null); // Container ref for fullscreen
  const [captionsEnabled, setCaptionsEnabled] = useState(false); // CC toggle

  // YouTube Player API states
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const currentYtVideoIdRef = useRef<string | null>(null); // Track current video to prevent re-init
  const ytInitInProgressRef = useRef<{ videoId: string; timestamp: number } | null>(null); // Track init with timestamp
  const [ytReady, setYtReady] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const [ytMaxWatched, setYtMaxWatched] = useState(0);
  const [showWatchLaterModal, setShowWatchLaterModal] = useState(false);
  const ytProgressRef = useRef<NodeJS.Timeout | null>(null);
  const lastSeekTimeRef = useRef(0);

  // Format time helper
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Fullscreen toggle function
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;

    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error('Fullscreen error:', err);
        showToast('Could not enter fullscreen mode', 'error');
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Handle playback speed change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (playerRef.current) {
      playerRef.current.playbackRate = speed;
    }
  };

  // Helper function to get a valid lesson key for progress tracking
  // Handles cases where _id might be undefined, empty, or in different formats
  const getLessonKey = (lesson: Lesson): string => {
    // Prefer _id if it exists and is not empty
    if (lesson._id && typeof lesson._id === 'string' && lesson._id.trim() !== '') {
      return lesson._id.trim();
    }
    // Fall back to title
    return lesson.title;
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // YouTube API fallback state
  const [ytApiFailed, setYtApiFailed] = useState(false);

  // Reset all refs on mount (handles HMR preservation where refs persist but player is destroyed)
  useEffect(() => {
    ytInitInProgressRef.current = null;
    currentYtVideoIdRef.current = null;
    // Clear player ref too - HMR preserves it but the actual player is destroyed
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch (e) {
        // Ignore - player might already be destroyed
      }
      ytPlayerRef.current = null;
    }
  }, []);

  // Track if YouTube API is truly ready (via callback)
  const [ytApiReady, setYtApiReady] = useState(false);

  // Load YouTube IFrame API
  useEffect(() => {
    // Check if already loaded and ready
    if (window.YT && window.YT.Player && typeof window.YT.Player === 'function') {
      console.log('[YT API] Already loaded and ready');
      setYtApiReady(true);
      return;
    }

    // Check if script tag already exists
    const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (existingScript) {
      console.log('[YT API] Script already in DOM, waiting for ready callback');
    } else {
      console.log('[YT API] Adding script tag');
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }

    // CRITICAL: Set up the callback BEFORE or right after script load
    // This is what YouTube calls when API is truly ready
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      console.log('[YT API] onYouTubeIframeAPIReady FIRED!');
      setYtApiReady(true);
      if (previousCallback) previousCallback();
    };

    // Also poll as fallback (some browsers miss the callback)
    const pollInterval = setInterval(() => {
      if (window.YT && window.YT.Player && typeof window.YT.Player === 'function') {
        console.log('[YT API] Ready via polling');
        setYtApiReady(true);
        clearInterval(pollInterval);
      }
    }, 100);

    // Fallback timeout - if API doesn't load in 8s, mark as failed
    const fallbackTimeout = setTimeout(() => {
      clearInterval(pollInterval);
      if (!ytApiReady) {
        console.warn('[YT API] Failed to load after 8s, using fallback');
        setYtApiFailed(true);
        setYtReady(true);
      }
    }, 8000);

    return () => {
      clearTimeout(fallbackTimeout);
      clearInterval(pollInterval);
    };
  }, []);

  // Initialize YouTube player when lesson changes to a YouTube video
  useEffect(() => {
    const currentLesson = course?.modules?.[currentModuleIndex]?.lessons?.[currentLessonIndex];

    // Early exit if no lesson or not a video
    if (!currentLesson || currentLesson.type !== 'Video') {
      return;
    }

    const videoUrl = currentLesson.contentUrl || '';
    const isYT = isYouTubeUrl(videoUrl);

    if (!isYT) {
      return;
    }

    const videoId = getYouTubeVideoId(videoUrl);

    if (!videoId) {
      debugWarn('YOUTUBE', 'Could not extract video ID from URL:', videoUrl);
      return;
    }

    // CRITICAL: Check if init is in progress for this video
    // Use timestamp + iframe to determine if init is real vs stale HMR
    if (ytInitInProgressRef.current?.videoId === videoId) {
      const initAge = Date.now() - (ytInitInProgressRef.current.timestamp || 0);
      const container = document.getElementById('yt-player-container');
      const hasIframe = container?.querySelector('iframe') !== null;

      // Trust init ref if: iframe exists OR init started < 5 seconds ago
      if (hasIframe || initAge < 5000) {
        debugLog('YOUTUBE', `Video ${videoId} init trusted (iframe: ${hasIframe}, age: ${initAge}ms), skipping`);
        return;
      } else {
        // Init is > 3 seconds old and no iframe = stale/failed
        debugLog('YOUTUBE', `Init stale (${initAge}ms old, no iframe) - clearing refs`);
        ytInitInProgressRef.current = null;
        ytPlayerRef.current = null;
        currentYtVideoIdRef.current = null;
      }
    }

    // Check if player already exists and is for the same video
    if (ytPlayerRef.current && currentYtVideoIdRef.current === videoId) {
      debugLog('YOUTUBE', `Video ${videoId} already has active player, skipping`);
      return;
    }

    // Check if we already have a FUNCTIONAL player for this video
    // Test if player is actually functional by trying to call a method
    let hasActivePlayer = false;
    if (ytPlayerRef.current && currentYtVideoIdRef.current === videoId) {
      try {
        // Try to call getPlayerState() - will throw if player is destroyed/orphaned
        ytPlayerRef.current.getPlayerState();
        hasActivePlayer = true;
        debugLog('YOUTUBE', `Video ${videoId} has functional player, skipping`);
        return;
      } catch (e) {
        // Player is orphaned/destroyed - clear refs and proceed
        debugLog('YOUTUBE', 'Player is orphaned, clearing refs');
        ytPlayerRef.current = null;
        currentYtVideoIdRef.current = null;
        ytInitInProgressRef.current = null;
      }
    }

    // Also check if init is flagged as in progress but no actual player exists
    if (ytInitInProgressRef.current?.videoId === videoId && !ytPlayerRef.current) {
      debugLog('YOUTUBE', 'Init flag stale, clearing');
      ytInitInProgressRef.current = null;
    }

    // Mark initialization in progress with timestamp
    ytInitInProgressRef.current = { videoId, timestamp: Date.now() };

    debugLog('YOUTUBE', `*** INITIALIZING VIDEO: ${videoId} ***`);

    // Store videoId for this effect run (don't set ref until player is ready)
    const initializingVideoId = videoId;

    // Reset states for new video
    setYtReady(false);
    setYtPlaying(false);
    setYtCurrentTime(0);
    setYtDuration(0);
    setYtMaxWatched(0);
    setPlaybackSpeed(1);
    setYtApiFailed(false);
    setVideoError(null);
    lastSeekTimeRef.current = 0;

    // Cleanup previous player safely
    if (ytPlayerRef.current) {
      debugLog('YOUTUBE', 'Destroying previous player instance');
      try {
        ytPlayerRef.current.destroy();
      } catch (e) {
        debugWarn('YOUTUBE', 'Error destroying player (ignored)');
      }
      ytPlayerRef.current = null;
    }

    let attempts = 0;
    const maxAttempts = 100; // 10 seconds max
    let initTimeout: NodeJS.Timeout | null = null;
    let cancelled = false;

    const initPlayer = () => {
      if (cancelled) {
        debugLog('YOUTUBE', 'Init cancelled');
        return;
      }

      attempts++;

      // Fallback after max attempts
      if (attempts >= maxAttempts) {
        debugWarn('YOUTUBE', 'API timeout, giving up');
        setYtApiFailed(true);
        setYtReady(true);
        return;
      }

      // Wait for YouTube API
      if (!window.YT || !window.YT.Player) {
        initTimeout = setTimeout(initPlayer, 100);
        return;
      }

      // Wait for container element
      const container = document.getElementById('yt-player-container');
      if (!container) {
        initTimeout = setTimeout(initPlayer, 100);
        return;
      }

      // IMPORTANT: Check if container already has an iframe (from previous attempt)
      // If so, clear it to allow fresh player creation
      const existingIframe = container.querySelector('iframe');
      if (existingIframe) {
        debugLog('YOUTUBE', 'Clearing existing iframe from container');
        existingIframe.remove();
      }

      debugLog('YOUTUBE', `Creating player instance for: ${videoId}`);

      try {
        // Pass the actual DOM element instead of ID string for more reliable targeting
        // @ts-ignore - YouTube API accepts both string and HTMLElement
        ytPlayerRef.current = new window.YT.Player(container, {
          videoId: videoId,
          playerVars: {
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            autoplay: 0,
            showinfo: 0,
            cc_load_policy: 1,
            cc_lang_pref: 'en',
            autohide: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              // NOW we can mark this video as fully initialized
              currentYtVideoIdRef.current = initializingVideoId;
              ytInitInProgressRef.current = null; // Clear init-in-progress flag
              const duration = event.target.getDuration() || 0;
              debugLog('YOUTUBE', `✓ Player READY - Duration: ${duration}s`);
              setYtReady(true);
              setYtDuration(duration);
            },
            onStateChange: (event) => {
              if (cancelled) return;

              if (event.data === 1) { // PLAYING
                setYtPlaying(true);
              } else if (event.data === 2) { // PAUSED
                setYtPlaying(false);
              } else if (event.data === 0) { // ENDED - Video finished playing
                setYtPlaying(false);
                const finalDuration = ytPlayerRef.current?.getDuration() || 0;
                setYtCurrentTime(finalDuration);
                setYtMaxWatched(finalDuration);

                // Mark video as complete immediately when it ends
                if (finalDuration > 0) {
                  const currentMod = course?.modules[currentModuleIndex];
                  const currentLes = currentMod?.lessons[currentLessonIndex];
                  if (currentLes && currentLes.type === 'Video') {
                    const lesId = currentLes._id && String(currentLes._id).trim() ? String(currentLes._id).trim() : currentLes.title;
                    const progressData = { lessonId: lesId, completionPercentage: 100, isCompleted: true };
                    setLessonProgress(prev => {
                      const updated = { ...prev, [lesId]: progressData };
                      if (currentLes.title && currentLes.title !== lesId) {
                        updated[currentLes.title] = progressData;
                      }
                      return updated;
                    });

                    // Sync to backend
                    api.patch('/player/sync', {
                      courseId,
                      moduleId: currentMod?._id,
                      lessonId: lesId,
                      completionPercentage: 100,
                      status: 'completed'
                    }).catch(() => { });

                    showToast('✅ Video completed!', 'info');
                  }
                }
              }
            },
            onError: (event) => {
              debugError('YOUTUBE', `Player error: ${event.data}`);
              ytInitInProgressRef.current = null; // Clear init flag on error
              const errorMessages: Record<number, string> = {
                2: 'Invalid video ID',
                5: 'HTML5 player error',
                100: 'Video not found',
                101: 'Cannot embed',
                150: 'Cannot embed (copyright)'
              };
              setVideoError(errorMessages[event.data] || `Error: ${event.data}`);
              setYtReady(true); // Show error state
            },
          },
        });

        debugLog('YOUTUBE', 'Player instance created, waiting for onReady...');
      } catch (err) {
        debugError('YOUTUBE', 'Exception creating player:', err);
        setVideoError('Failed to create player');
        setYtReady(true);
      }
    };

    // Start initialization immediately (no delay - initPlayer handles waiting for API/container)
    debugLog('YOUTUBE', 'Starting init immediately...');
    initPlayer();

    // Cleanup function - MUST clear initRef since we're cancelling
    return () => {
      debugLog('YOUTUBE', 'Cleanup: cancelling init');
      cancelled = true;
      if (initTimeout) clearTimeout(initTimeout);
      // CRITICAL: Clear init ref since we cancelled - otherwise next effect run
      // will think init is still happening and skip
      ytInitInProgressRef.current = null;
    };
    // Use stable dependencies - course object changes reference on every render!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, currentModuleIndex, currentLessonIndex, ytApiReady]);

  // YouTube progress tracking
  useEffect(() => {
    if (!ytReady || !ytPlayerRef.current) return;

    ytProgressRef.current = setInterval(() => {
      if (!ytPlayerRef.current) return;

      try {
        const currentTime = ytPlayerRef.current.getCurrentTime();
        const playerState = ytPlayerRef.current.getPlayerState();

        // Update time when playing (state 1 = PLAYING)
        if (playerState === 1) {
          setYtCurrentTime(currentTime);
          setYtMaxWatched(prev => Math.max(prev, currentTime));
        }
      } catch {
        // Player might not be ready yet
      }
    }, 500);

    return () => {
      if (ytProgressRef.current) {
        clearInterval(ytProgressRef.current);
      }
    };
  }, [ytReady]);


  // AUTO-ADVANCE: When YouTube video reaches 95%+ watched, auto-complete and move to next
  const autoAdvanceTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!course || !ytReady || ytDuration <= 0) return;

    const currentLesson = course.modules[currentModuleIndex]?.lessons[currentLessonIndex];
    if (!currentLesson || currentLesson.type !== 'Video') return;

    const lessonId = getLessonKey(currentLesson);
    const watchedPercent = (ytMaxWatched / ytDuration) * 100;
    const isAlreadyCompleted = lessonProgress[lessonId]?.isCompleted;

    // Check if we already triggered auto-advance for this lesson
    if (autoAdvanceTriggeredRef.current === lessonId) return;

    // Auto-complete only at the configured threshold (100% for corporate, 95% otherwise)
    if (watchedPercent >= VIDEO_COMPLETE_PCT && !isAlreadyCompleted) {
      autoAdvanceTriggeredRef.current = lessonId;

      // Update local progress - save under multiple keys for robustness
      const progressData = { lessonId, completionPercentage: 100, isCompleted: true };
      setLessonProgress(prev => {
        const updated = { ...prev, [lessonId]: progressData };
        // Also save under title if different from lessonId
        if (currentLesson.title && currentLesson.title !== lessonId) {
          updated[currentLesson.title] = progressData;
        }
        return updated;
      });

      // Sync to backend
      api.patch('/player/sync', {
        courseId,
        moduleId: course.modules[currentModuleIndex]?._id,
        lessonId,
        completionPercentage: 100,
        status: 'completed'
      }).then(() => {
        loadProgress();
        showToast('✅ Video completed! Moving to next lesson...', 'info');

        // Auto-advance after short delay
        setTimeout(() => {
          const mod = course.modules[currentModuleIndex];
          if (mod && currentLessonIndex < mod.lessons.length - 1) {
            setCurrentLessonIndex(i => i + 1);
          } else if (currentModuleIndex < course.modules.length - 1) {
            setCurrentModuleIndex(i => i + 1);
            setCurrentLessonIndex(0);
            const nextModuleId = course.modules[currentModuleIndex + 1]?._id;
            if (nextModuleId) {
              setExpandedModules(prev => new Set([...prev, nextModuleId]));
            }
          } else {
            showToast('🎉 Course completed! All lessons done.', 'info');
          }
        }, 1500);
      }).catch(err => {
        debugError('AUTO-ADVANCE', 'Failed to sync', err);
      });
    }
  }, [ytMaxWatched, ytDuration, ytReady, course, currentModuleIndex, currentLessonIndex, lessonProgress, courseId]);

  // AUTO-ADVANCE: For native HTML5 videos when 95%+ watched
  const nativeAutoAdvanceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!course || duration <= 0 || maxWatchedTime <= 0) return;

    const currentLesson = course.modules[currentModuleIndex]?.lessons[currentLessonIndex];
    if (!currentLesson || currentLesson.type !== 'Video') return;

    // Skip if this is a YouTube video (handled separately)
    const videoUrl = currentLesson.contentUrl || '';
    if (isYouTubeUrl(videoUrl) || isVimeoUrl(videoUrl)) return;

    const lessonId = getLessonKey(currentLesson);
    const watchedPercent = (maxWatchedTime / duration) * 100;
    const isAlreadyCompleted = lessonProgress[lessonId]?.isCompleted;

    // Check if we already triggered auto-advance for this lesson
    if (nativeAutoAdvanceRef.current === lessonId) return;

    // Auto-complete only at the configured threshold (100% for corporate, 95% otherwise)
    if (watchedPercent >= VIDEO_COMPLETE_PCT && !isAlreadyCompleted) {
      nativeAutoAdvanceRef.current = lessonId;

      // Update local progress - save under multiple keys for robustness
      const progressData = { lessonId, completionPercentage: 100, isCompleted: true };
      setLessonProgress(prev => {
        const updated = { ...prev, [lessonId]: progressData };
        // Also save under title if different from lessonId
        if (currentLesson.title && currentLesson.title !== lessonId) {
          updated[currentLesson.title] = progressData;
        }
        return updated;
      });

      // Sync to backend
      api.patch('/player/sync', {
        courseId,
        moduleId: course.modules[currentModuleIndex]?._id,
        lessonId,
        completionPercentage: 100,
        status: 'completed'
      }).then(() => {
        loadProgress();
        showToast('✅ Video completed! Moving to next lesson...', 'info');

        setTimeout(() => {
          const mod = course.modules[currentModuleIndex];
          if (mod && currentLessonIndex < mod.lessons.length - 1) {
            setCurrentLessonIndex(i => i + 1);
          } else if (currentModuleIndex < course.modules.length - 1) {
            setCurrentModuleIndex(i => i + 1);
            setCurrentLessonIndex(0);
            const nextModuleId = course.modules[currentModuleIndex + 1]?._id;
            if (nextModuleId) {
              setExpandedModules(prev => new Set([...prev, nextModuleId]));
            }
          } else {
            showToast('🎉 Course completed! All lessons done.', 'info');
          }
        }, 1500);
      }).catch(() => {
        // Silently handle sync failure - progress is saved locally
      });
    }
  }, [maxWatchedTime, duration, course, currentModuleIndex, currentLessonIndex, lessonProgress, courseId]);

  // YouTube player controls
  // YouTube Player Controls - Play/Pause
  const ytTogglePlay = useCallback(() => {
    if (!ytPlayerRef.current) {
      debugWarn('YOUTUBE', 'Cannot toggle play - player not ready');
      return;
    }

    try {
      if (ytPlaying) {
        debugLog('YOUTUBE', 'Pausing video');
        ytPlayerRef.current.pauseVideo();
      } else {
        debugLog('YOUTUBE', 'Playing video');
        ytPlayerRef.current.playVideo();
      }
    } catch (error) {
      debugError('YOUTUBE', 'Failed to toggle play', error);
    }
  }, [ytPlaying]);

  // YouTube Player Controls - Speed Change
  const ytChangeSpeed = useCallback((speed: number) => {
    if (!ytPlayerRef.current) {
      debugWarn('YOUTUBE', 'Cannot change speed - player not ready');
      return;
    }

    try {
      debugLog('YOUTUBE', `Setting playback speed to ${speed}x`);
      ytPlayerRef.current.setPlaybackRate(speed);
      setPlaybackSpeed(speed);
    } catch (error) {
      debugError('YOUTUBE', 'Failed to change speed', error);
    }
  }, []);

  // NOTE: Seeking is DISABLED for SCORM compliance
  // Users must watch the video from start to finish
  // The progress bar is display-only and cannot be interacted with


  // Parse ISO 8601 duration (SCORM session_time format: PT1H23M45S)
  const parseISO8601Duration = (duration: string): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseFloat(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  };

  const getVideoErrorCodeMeaning = (code: number): string => {
    const errorCodes: Record<number, string> = {
      1: 'MEDIA_ERR_ABORTED - User aborted',
      2: 'MEDIA_ERR_NETWORK - Network error',
      3: 'MEDIA_ERR_DECODE - Decode error',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Source not supported',
    };
    return errorCodes[code] || `Unknown error code: ${code}`;
  };

  // User info
  const [user, setUser] = useState<any>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const { isOnline } = useOfflineDetection();

  // Refs to always reflect latest state inside closures (e.g. postMessage handlers)
  const courseRef = useRef(course);
  const currentModuleIndexRef = useRef(currentModuleIndex);
  const currentLessonIndexRef = useRef(currentLessonIndex);
  const lessonProgressRef = useRef(lessonProgress);
  const courseIdRef = useRef(courseId);
  const userRef = useRef(user);
  courseRef.current = course;
  currentModuleIndexRef.current = currentModuleIndex;
  currentLessonIndexRef.current = currentLessonIndex;
  lessonProgressRef.current = lessonProgress;
  courseIdRef.current = courseId;
  userRef.current = user;

  // Ref-wrapped functions so postMessage handlers always call latest version
  const loadProgressRef = useRef<() => Promise<void>>(async () => { });

  // SCORM state
  const scormIframeRef = useRef<HTMLIFrameElement>(null);
  const scormVersionRef = useRef<'1.2' | '2004' | null>(null);
  const scormDataRef = useRef<Record<string, string>>({});
  const scormInitializedRef = useRef(false);
  const sessionStartTime = useRef<number>(Date.now());
  const lastError = useRef<string>('0');

  // xAPI statements queue
  const xapiStatementsRef = useRef<XAPIStatement[]>([]);

  // Heartbeat intervals
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const syncInterval = useRef<NodeJS.Timeout | null>(null);
  const sessionTimeInterval = useRef<NodeJS.Timeout | null>(null);

  // The source read the user from `sessionStorage.getItem('user')`. Auth is
  // centralized now (NextAuth + the existing UserCtx), so it comes from
  // useCurrentUser() instead. Mirrored into local state so `userRef` and every
  // downstream `user._id || user.id` read stay exactly as the source wrote them.
  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
    }
  }, [currentUser]);

  // Load course and progress - only when courseId changes
  const courseLoadedRef = useRef(false);
  useEffect(() => {
    if (courseId && !courseLoadedRef.current) {
      courseLoadedRef.current = true;
      loadCourse();
      loadProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Set up keyboard handlers and intervals
  useEffect(() => {
    // COMPLIANCE: Block ALL keyboard shortcuts that could skip video
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentLesson = course?.modules[currentModuleIndex]?.lessons[currentLessonIndex];
      if (currentLesson?.type === 'Video') {
        const videoUrl = currentLesson.contentUrl || '';
        const isYT = isYouTubeUrl(videoUrl);

        // For YouTube videos, block ALL skip-related keys
        if (isYT) {
          const blockedKeys = [
            'ArrowRight', 'ArrowLeft', // Seek forward/back
            'l', 'L', 'j', 'J',         // YouTube seek shortcuts
            'End', 'Home',              // Jump to end/start
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', // Number keys (seek to %)
          ];

          if (blockedKeys.includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            debugLog('KEYBOARD', `Blocked key: ${e.key} (SCORM compliance)`);
            return;
          }

          // Allow space for play/pause
          if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            e.stopPropagation();
            ytTogglePlay();
            return;
          }

          // Allow 'f' for fullscreen
          if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            e.stopPropagation();
            toggleFullscreen();
            return;
          }
        }

        // For native HTML5 videos
        if (playerRef.current) {
          // Block right arrow, 'l' (YouTube forward), and other skip shortcuts
          if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
            const wouldSeekTo = playerRef.current.currentTime + 5;
            if (wouldSeekTo > maxWatchedTime + 0.5) {
              e.preventDefault();
              e.stopPropagation();
              showToast('Skipping forward is disabled for compliance.', 'info');
            }
          }
          // Block End key (skip to end)
          if (e.key === 'End') {
            e.preventDefault();
            e.stopPropagation();
            showToast('Cannot skip to end. Please watch the complete video.', 'info');
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    // Set up heartbeat (every 10 seconds for video)
    heartbeatInterval.current = setInterval(() => {
      if (course && currentModuleIndex >= 0 && currentLessonIndex >= 0) {
        const currentLesson = course.modules[currentModuleIndex]?.lessons[currentLessonIndex];
        if (currentLesson?.type === 'Video' && playing) {
          saveVideoProgress();
        }
      }
    }, 10000);

    // Set up session time tracking (every second while playing)
    sessionTimeInterval.current = setInterval(() => {
      if (playing && sessionStartTimeRef.current !== null) {
        const elapsed = Date.now() - sessionStartTimeRef.current;
        setSessionTime(prev => prev + 1); // Increment by 1 second
      }
    }, 1000); // Update every second

    // COMPLIANCE: Track YouTube/Vimeo watch time (runs when on video page)
    if (youtubeTimerRef.current) {
      clearInterval(youtubeTimerRef.current);
    }
    youtubeTimerRef.current = setInterval(() => {
      const currentLesson = course?.modules[currentModuleIndex]?.lessons[currentLessonIndex];
      if (currentLesson?.type === 'Video' && currentLesson.contentUrl) {
        const videoUrl = currentLesson.contentUrl;
        // For YouTube/Vimeo, track time spent on the page (we can't detect actual playback via iframe)
        if (isYouTubeUrl(videoUrl) || isVimeoUrl(videoUrl)) {
          setYoutubeWatchTime(prev => prev + 1);
        }
      }
    }, 1000);

    // Set up sync interval (every 15 seconds)
    syncInterval.current = setInterval(() => {
      if (isOnline) {
        syncProgress();
      }
    }, 15000);

    // Set up SCORM API in window (fallback for same-origin content)
    setupSCORMAPI();

    // PostMessage handler for cross-origin SCORM bridge (injected at upload time).
    // Uses ONLY refs and the stable setLessonProgress setter so that it is
    // completely immune to stale closures regardless of when the useEffect ran.
    const handleScormBridgeMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.source !== 'scorm-bridge') return;

      const curCourse = courseRef.current;
      const modIdx = currentModuleIndexRef.current;
      const lesIdx = currentLessonIndexRef.current;
      const curModule = curCourse?.modules[modIdx];
      const curLesson = curModule?.lessons[lesIdx];
      if (!curLesson || curLesson.type !== 'SCORM') return;

      const lessonKey = curLesson._id || curLesson.title;

      // Helper: update local state AND sync to backend via ref-based values
      const syncScormLesson = (pct: number, done: boolean, d: Record<string, string>) => {
        setLessonProgress(prev => ({
          ...prev,
          [lessonKey]: {
            ...prev[lessonKey],
            lessonId: lessonKey,
            completionPercentage: pct,
            isCompleted: done,
            suspendData: d['cmi.suspend_data'] || '',
            scormData: { ...d },
          },
        }));

        const cid = courseIdRef.current;
        if (cid) {
          api.patch('/player/sync', {
            courseId: cid,
            moduleId: curModule?._id,
            lessonId: lessonKey,
            completionPercentage: pct,
            status: done ? 'completed' : 'in_progress',
            suspendData: d['cmi.suspend_data'] || '',
            scormData: { ...d },
          }).then(() => {
            if (done) loadProgressRef.current();
          }).catch((err) => {
            console.error('[SCORM Bridge] Failed to sync:', err?.message);
          });
        }
      };

      if (msg.type === 'ready') {
        const savedProg = lessonProgressRef.current[lessonKey];
        const initPayload: Record<string, string> = {};
        if (savedProg?.suspendData) {
          initPayload['cmi.suspend_data'] = typeof savedProg.suspendData === 'string'
            ? savedProg.suspendData : JSON.stringify(savedProg.suspendData);
        }
        if (savedProg?.scormData && typeof savedProg.scormData === 'object') {
          Object.assign(initPayload, savedProg.scormData);
        }
        const curUser = userRef.current;
        if (curUser) {
          initPayload['cmi.core.student_id'] = curUser._id || curUser.id || '';
          initPayload['cmi.core.student_name'] = `${curUser.lastName || ''}, ${curUser.firstName || ''}`;
          initPayload['cmi.learner_id'] = curUser._id || curUser.id || '';
          initPayload['cmi.learner_name'] = `${curUser.firstName || ''} ${curUser.lastName || ''}`;
        }
        try {
          scormIframeRef.current?.contentWindow?.postMessage(
            { source: 'scorm-lms', type: 'init-data', data: initPayload },
            '*',
          );
        } catch (e) { /* bridge handles it */ }
      } else if (msg.type === 'init') {
        scormInitializedRef.current = true;
      } else if (msg.type === 'commit' && msg.data) {
        scormDataRef.current = { ...msg.data };
        const d = msg.data;
        const status12 = d['cmi.core.lesson_status'] || '';
        const status2004 = d['cmi.completion_status'] || '';
        const done = status12 === 'completed' || status12 === 'passed'
          || status2004 === 'completed' || status2004 === 'passed';
        const pct = done ? 100
          : d['cmi.progress_measure'] ? Math.round(parseFloat(d['cmi.progress_measure']) * 100)
            : 50;
        syncScormLesson(pct, done, d);
      } else if (msg.type === 'completed' && msg.data) {
        scormDataRef.current = { ...msg.data };
        syncScormLesson(100, true, msg.data);
        setToast({ message: 'SCORM content completed!', type: 'info' });
        setTimeout(() => setToast(null), 3000);
      } else if (msg.type === 'score' && msg.data) {
        scormDataRef.current = { ...(msg.data.data || msg.data) };
      } else if (msg.type === 'finish' && msg.data) {
        scormDataRef.current = { ...msg.data };
        const d = msg.data;
        const status12 = d['cmi.core.lesson_status'] || '';
        const status2004 = d['cmi.completion_status'] || '';
        const hasExplicitIncomplete = status12 === 'incomplete' || status12 === 'not attempted'
          || status2004 === 'incomplete' || status2004 === 'not attempted';
        const hasExplicitComplete = status12 === 'completed' || status12 === 'passed'
          || status2004 === 'completed' || status2004 === 'passed';
        // If no status was set at all, LMSFinish/Terminate implies completion
        const done = hasExplicitComplete || (!hasExplicitIncomplete && !status12 && !status2004);
        syncScormLesson(done ? 100 : 50, done, d);
        scormInitializedRef.current = false;
      }
    };

    window.addEventListener('message', handleScormBridgeMessage);

    // Cleanup
    return () => {
      window.removeEventListener('message', handleScormBridgeMessage);
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      if (sessionTimeInterval.current) {
        clearInterval(sessionTimeInterval.current);
      }
      if (syncInterval.current) {
        clearInterval(syncInterval.current);
      }
      if (youtubeTimerRef.current) {
        clearInterval(youtubeTimerRef.current);
      }
      document.removeEventListener('keydown', handleKeyDown, true);
      cleanupSCORMAPI();
      if (isOnline) {
        syncProgress(); // Final save
      }
      sessionStartTimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Monitor video element for native HTML5 video
  useEffect(() => {
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (currentLesson?.type === 'Video' && currentLesson.contentUrl && playerRef.current) {
      const video = playerRef.current;

      // Check if video is loaded
      if (video.readyState >= 2 && !isReady) {
        setIsReady(true);
        if (video.duration && duration === 0) {
          setDuration(video.duration);
        }
      }

    }
  }, [course, currentModuleIndex, currentLessonIndex, isReady, duration]);

  // Log video URL when lesson changes and check accessibility
  useEffect(() => {
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (currentLesson?.type === 'Video') {
      // Reset player state when lesson changes
      setPlaying(false);
      setPlayed(0);
      setDuration(0);
      setIsReady(false);
    }
  }, [course, currentModuleIndex, currentLessonIndex]);

  // Setup SCORM Runtime API
  const setupSCORMAPI = useCallback(() => {
    // SCORM 1.2 API
    (window as any).API = {
      LMSInitialize: (_param: string = '') => {
        scormInitializedRef.current = true;
        scormVersionRef.current = '1.2';
        lastError.current = '0';
        return 'true';
      },
      LMSFinish: (_param: string = '') => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return 'false';
        }
        commitSCORMData();
        scormInitializedRef.current = false;
        lastError.current = '0';
        return 'true';
      },
      LMSGetValue: (element: string) => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return '';
        }
        if (!element) {
          lastError.current = '201'; // Invalid argument
          return '';
        }
        lastError.current = '0';
        return scormDataRef.current[element] || '';
      },
      LMSSetValue: (element: string, value: string) => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return 'false';
        }
        if (!element) {
          lastError.current = '201'; // Invalid argument
          return 'false';
        }

        // Check for read-only elements
        const readOnlyElements = ['cmi.core.student_id', 'cmi.core.student_name', 'cmi.core.total_time'];
        if (readOnlyElements.some(ro => element === ro)) {
          lastError.current = '403'; // Read only element
          return 'false';
        }

        if (element.startsWith('cmi.')) {
          scormDataRef.current[element] = value;
          lastError.current = '0';

          // Handle completion
          if (element === 'cmi.core.lesson_status' && (value === 'completed' || value === 'passed')) {
            handleSCORMCompletion();
          }

          // Handle session time - accumulate total time
          if (element.includes('session_time')) {
            const seconds = parseISO8601Duration(value);
            scormDataRef.current['cmi.core.total_time'] =
              (parseFloat(scormDataRef.current['cmi.core.total_time'] || '0') + seconds).toString();
          }

          return 'true';
        }

        lastError.current = '401'; // Not implemented
        return 'false';
      },
      LMSCommit: (_param: string = '') => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return 'false';
        }
        commitSCORMData();
        lastError.current = '0';
        return 'true';
      },
      LMSGetLastError: () => lastError.current,
      LMSGetErrorString: (errorCode: string) => {
        const errorStrings: Record<string, string> = {
          '0': 'No error',
          '101': 'General exception',
          '201': 'Invalid argument error',
          '202': 'Element cannot have children',
          '203': 'Element not an array',
          '301': 'Not initialized',
          '401': 'Not implemented error',
          '402': 'Invalid set value',
          '403': 'Element is read only',
          '404': 'Element is write only',
          '405': 'Incorrect data type',
        };
        return errorStrings[errorCode] || 'Unknown error';
      },
      LMSGetDiagnostic: (errorCode: string) => `Error ${errorCode}: ${(window as any).API.LMSGetErrorString(errorCode)}`,
    };

    // SCORM 2004 API
    (window as any).API_1484_11 = {
      Initialize: (_param: string = '') => {
        scormInitializedRef.current = true;
        scormVersionRef.current = '2004';
        lastError.current = '0';
        return 'true';
      },
      Terminate: (_param: string = '') => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return 'false';
        }
        commitSCORMData();
        scormInitializedRef.current = false;
        lastError.current = '0';
        return 'true';
      },
      GetValue: (element: string) => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return '';
        }
        if (!element) {
          lastError.current = '201'; // Invalid argument
          return '';
        }
        lastError.current = '0';
        return scormDataRef.current[element] || '';
      },
      SetValue: (element: string, value: string) => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return 'false';
        }
        if (!element) {
          lastError.current = '201'; // Invalid argument
          return 'false';
        }

        // Check for read-only elements (SCORM 2004)
        const readOnlyElements = ['cmi.learner_id', 'cmi.learner_name', 'cmi.total_time', 'cmi.entry', 'cmi.mode'];
        if (readOnlyElements.some(ro => element === ro)) {
          lastError.current = '403'; // Read only element
          return 'false';
        }

        if (element.startsWith('cmi.')) {
          scormDataRef.current[element] = value;
          lastError.current = '0';

          // Handle completion
          if (element === 'cmi.completion_status' && (value === 'completed' || value === 'passed')) {
            handleSCORMCompletion();
          }

          // Handle session time - accumulate total time
          if (element.includes('session_time')) {
            const seconds = parseISO8601Duration(value);
            scormDataRef.current['cmi.total_time'] =
              (parseFloat(scormDataRef.current['cmi.total_time'] || '0') + seconds).toString();
          }

          return 'true';
        }

        lastError.current = '401'; // Not implemented
        return 'false';
      },
      Commit: (_param: string = '') => {
        if (!scormInitializedRef.current) {
          lastError.current = '301'; // Not initialized
          return 'false';
        }
        commitSCORMData();
        lastError.current = '0';
        return 'true';
      },
      GetLastError: () => parseInt(lastError.current),
      GetErrorString: (errorCode: number) => {
        const errorStrings: Record<number, string> = {
          0: 'No error',
          101: 'General exception',
          102: 'General initialization failure',
          103: 'Already initialized',
          104: 'Content instance terminated',
          111: 'General termination failure',
          112: 'Termination before initialization',
          113: 'Termination after termination',
          122: 'Retrieve data before initialization',
          123: 'Retrieve data after termination',
          132: 'Store data before initialization',
          133: 'Store data after termination',
          142: 'Commit before initialization',
          143: 'Commit after termination',
          201: 'General argument error',
          301: 'General get failure',
          351: 'General set failure',
          391: 'General commit failure',
          401: 'Undefined data model element',
          402: 'Unimplemented data model element',
          403: 'Data model element value not initialized',
          404: 'Data model element is read only',
          405: 'Data model element is write only',
          406: 'Data model element type mismatch',
          407: 'Data model element value out of range',
          408: 'Data model dependency not established',
        };
        return errorStrings[errorCode] || 'Unknown error';
      },
      GetDiagnostic: (errorCode: number) => `Error ${errorCode}: ${(window as any).API_1484_11.GetErrorString(errorCode)}`,
    };

    // Make API available to iframe
    (window as any).GetSCORM = () => {
      return scormVersionRef.current === '2004'
        ? (window as any).API_1484_11
        : (window as any).API;
    };
  }, []);

  const cleanupSCORMAPI = () => {
    delete (window as any).API;
    delete (window as any).API_1484_11;
    delete (window as any).GetSCORM;
  };

  const loadCourse = async () => {
    debugLog('COURSE', `Loading course: ${courseId}`);
    setLoadError(null);
    try {
      const response = await api.get<{ data: Course | null }>(`/courses/${courseId}`);
      const courseData = response.data;

      debugLog('COURSE', 'Course loaded successfully', {
        title: courseData?.title,
        modulesCount: courseData?.modules?.length,
        modules: courseData?.modules?.map((m: Module) => ({
          title: m.title,
          lessonsCount: m.lessons?.length,
          lessonTypes: m.lessons?.map((l: Lesson) => l.type)
        }))
      });

      if (!courseData) {
        setLoadError('Course data not found');
        return;
      }

      setCourse(courseData);

      if (courseData?.modules?.[0]) {
        setExpandedModules(new Set([courseData.modules[0]._id]));
      }
    } catch (error: any) {
      debugError('COURSE', 'Failed to load course', error);
      // The fetch client throws the parsed error BODY, so `message` is on the
      // error itself — the axios `error.response.data.message` branch is gone.
      setLoadError(error?.message || 'Failed to load course');
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async (): Promise<any | null> => {
    debugLog('PROGRESS', `Loading progress for course: ${courseId}`);
    try {
      const response = await api.get<{ data: any }>(`/progress/${courseId}`);
      let progressData = response.data;

      debugLog('PROGRESS', 'Progress loaded', {
        status: progressData?.status,
        completionPercentage: progressData?.completionPercentage,
        lessonProgressCount: Object.keys(progressData?.lessonProgress || {}).length
      });

      // If no progress record exists, create one immediately to mark course as "started"
      // This ensures it shows in the "In Progress" tab on the dashboard
      if (!progressData) {
        debugLog('PROGRESS', 'No progress record found, creating initial "In Progress" record');
        try {
          const initRes = await api.patch<{ data?: any }>('/player/sync', {
            courseId,
            status: 'in_progress',
          });
          progressData = initRes?.data || null;
          debugLog('PROGRESS', 'Initial progress record created', progressData);
        } catch (initErr) {
          debugLog('PROGRESS', 'Failed to create initial progress record, continuing anyway');
        }
      }

      setProgress(progressData);

      if (progressData?.lessonProgress) {
        // MERGE backend data with local state instead of replacing
        // Keep local progress if it's more advanced (to handle race conditions with sync)
        setLessonProgress(prev => {
          const merged = { ...prev };

          Object.entries(progressData.lessonProgress).forEach(([key, backendProg]: [string, any]) => {
            const localProg = prev[key];

            // Keep local progress if:
            // 1. It's marked as completed, OR
            // 2. It has a higher completion percentage than backend
            const localComplete = localProg?.isCompleted === true;
            const localPercent = localProg?.completionPercentage || 0;
            const backendPercent = backendProg?.completionPercentage || 0;

            if (localComplete || localPercent > backendPercent) {
              // Keep local progress - don't overwrite with older backend data
              debugLog('PROGRESS', `Keeping local progress for ${key} (local: ${localPercent}%, backend: ${backendPercent}%)`);
            } else {
              // Use backend progress
              merged[key] = backendProg;
            }
          });

          return merged;
        });

        // Restore SCORM suspend data
        Object.entries(progressData.lessonProgress).forEach(([_lessonId, prog]: [string, any]) => {
          if (prog.suspendData) {
            debugLog('SCORM', `Restoring suspend data for lesson: ${_lessonId}`);
            scormDataRef.current[`cmi.suspend_data`] = prog.suspendData;
          }
        });
      }

      return progressData;
    } catch (error) {
      console.error('Failed to load progress:', error);
      return null;
    }
  };
  loadProgressRef.current = loadProgress;


  // Restore SCORM data when progress or current lesson changes
  useEffect(() => {
    if (!progress?.lessonProgress) return;

    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];
    const lessonKey = currentLesson?._id || currentLesson?.title;
    if (!lessonKey) return;

    const lessonData = progress.lessonProgress[lessonKey];

    if (lessonData?.scormData) {
      // Restore full SCORM data
      scormDataRef.current = { ...lessonData.scormData };
    }

    if (lessonData?.suspendData) {
      // Ensure suspend_data is available for both versions
      scormDataRef.current['cmi.suspend_data'] = lessonData.suspendData;
      scormDataRef.current['cmi.suspenddata'] = lessonData.suspendData; // SCORM 2004
    }

  }, [progress, course, currentModuleIndex, currentLessonIndex]);

  const saveVideoProgress = useCallback(() => {
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (!currentLesson || currentLesson.type !== 'Video' || !playerRef.current) return;

    // Native HTML5 video element
    const video = playerRef.current;
    const currentTime = video.currentTime || 0;
    const totalDuration = video.duration || duration || 1;
    const percentWatched = (currentTime / totalDuration) * 100;

    // Get existing suspendData or create new
    const existingProg = lessonProgress[currentLesson._id || currentLesson.title];
    let existingSuspendData: any = {};
    if (existingProg?.suspendData) {
      try {
        existingSuspendData = typeof existingProg.suspendData === 'string'
          ? JSON.parse(existingProg.suspendData)
          : existingProg.suspendData;
      } catch (e) {
        existingSuspendData = {};
      }
    }
    const totalSessionTime = (existingSuspendData && typeof existingSuspendData === 'object' && existingSuspendData.totalSessionTime)
      ? (existingSuspendData.totalSessionTime + sessionTime)
      : sessionTime;

    // SCORM-compliant lesson_location format: "time:SECONDS"
    const lessonLocationFormatted = formatTimeLocation(currentTime);

    updateLessonProgress(currentLesson._id || currentLesson.title, {
      completionPercentage: percentWatched,
      isCompleted: percentWatched >= VIDEO_COMPLETE_PCT,
      currentPosition: lessonLocationFormatted, // SCORM format: "time:X"
      suspendData: JSON.stringify({
        // SCORM 1.2: cmi.core.lesson_location
        // SCORM 2004: cmi.location
        lesson_location: lessonLocationFormatted, // SCORM format: "time:X"
        currentTime,
        maxWatched: maxWatchedTime,
        totalSessionTime,
        lastAccessed: new Date().toISOString(),
      }),
    });

    // Send xAPI statement for progress
    sendXAPIStatement('http://adlnet.gov/expapi/verbs/progressed', {
      id: currentLesson.contentUrl || '',
      name: currentLesson.title,
      type: 'http://adlnet.gov/expapi/activities/video',
    }, {
      duration: `PT${Math.floor(currentTime)}S`,
    } as any);
  }, [course, currentModuleIndex, currentLessonIndex, duration, sessionTime, maxWatchedTime, lessonProgress]);

  const commitSCORMData = useCallback(async () => {
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (!currentLesson || currentLesson.type !== 'SCORM') return;

    const isScorm2004 = scormDataRef.current['cmi.completion_status'] !== undefined;

    let isCompleted = false;
    let isPassed = false;

    if (isScorm2004) {
      const completionStatus = scormDataRef.current['cmi.completion_status'] || '';
      const successStatus = scormDataRef.current['cmi.success_status'] || '';
      isCompleted = completionStatus === 'completed';
      isPassed = successStatus === 'passed';
    } else {
      const lessonStatus = scormDataRef.current['cmi.core.lesson_status'] || '';
      isCompleted = lessonStatus === 'completed' || lessonStatus === 'passed';
      isPassed = lessonStatus === 'passed';
    }

    const completionPercentage = isCompleted ? 100 :
      (scormDataRef.current['cmi.progress_measure']
        ? parseFloat(scormDataRef.current['cmi.progress_measure']) * 100
        : 50);

    updateLessonProgress(currentLesson._id || currentLesson.title, {
      completionPercentage,
      isCompleted,
      suspendData: scormDataRef.current['cmi.suspend_data'] || scormDataRef.current['cmi.suspenddata'] || '',
      scormData: { ...scormDataRef.current }, // Save full SCORM data
    });
  }, [course, currentModuleIndex, currentLessonIndex]);

  const handleSCORMCompletion = () => {
    commitSCORMData();
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (currentLesson) {
      // Send xAPI completion statement
      sendXAPIStatement('http://adlnet.gov/expapi/verbs/completed', {
        id: currentLesson.scormPackageId || currentLesson.contentUrl || '',
        name: currentLesson.title,
        type: 'http://adlnet.gov/expapi/activities/module',
      }, {
        completion: true,
        success: true,
      });

      showToast('SCORM content completed!', 'info');
    }
  };

  const sendXAPIStatement = (
    verbId: string,
    object: { id: string; name: string; type: string },
    result?: { duration?: string; completion?: boolean; success?: boolean },
    contentType?: string // 'video' | 'audio' | 'pdf' | 'scorm' | 'ppt' | 'text'
  ) => {
    if (!user) {
      debugWarn('xAPI', 'Cannot send statement - no user logged in');
      return;
    }

    debugLog('xAPI', `Sending statement: ${getVerbDisplay(verbId)}`, {
      object: object.name,
      type: contentType || object.type,
      result
    });

    const statement: XAPIStatement = {
      actor: {
        name: `${user.firstName} ${user.lastName}`,
        mbox: `mailto:${user.email}`,
      },
      verb: {
        id: verbId,
        display: { 'en-US': getVerbDisplay(verbId) },
      },
      object: {
        id: object.id,
        definition: {
          name: { 'en-US': object.name },
          type: object.type,
        },
      },
      timestamp: new Date().toISOString(),
      result,
    };

    xapiStatementsRef.current.push(statement);

    // Send immediately if online
    if (isOnline) {
      syncXAPIStatements();
    }
  };

  const getVerbDisplay = (verbId: string): string => {
    const verbMap: Record<string, string> = {
      'http://adlnet.gov/expapi/verbs/launched': 'launched',
      'http://adlnet.gov/expapi/verbs/completed': 'completed',
      'http://adlnet.gov/expapi/verbs/progressed': 'progressed',
      'http://adlnet.gov/expapi/verbs/passed': 'passed',
      'http://adlnet.gov/expapi/verbs/failed': 'failed',
    };
    return verbMap[verbId] || 'experienced';
  };

  const syncXAPIStatements = async (retryCount = 0) => {
    const maxRetries = 3;
    const statementCount = xapiStatementsRef.current.length;

    if (statementCount === 0) return;

    debugLog('xAPI', `Syncing ${statementCount} statements (attempt ${retryCount + 1}/${maxRetries + 1})`);

    try {
      await api.post('/player/xapi-statements', {
        statements: xapiStatementsRef.current,
      });
      debugLog('xAPI', `Successfully synced ${statementCount} statements`);
      xapiStatementsRef.current = [];

      // Save to localStorage backup (clear on success)
      localStorage.removeItem('xapi_offline_queue');
    } catch (error: any) {
      debugError('xAPI', `Failed to sync statements (attempt ${retryCount + 1})`, error?.message);

      // Save to localStorage for offline retry
      try {
        const existingQueue = JSON.parse(localStorage.getItem('xapi_offline_queue') || '[]');
        const newQueue = [...existingQueue, ...xapiStatementsRef.current];
        localStorage.setItem('xapi_offline_queue', JSON.stringify(newQueue.slice(-100))); // Keep last 100
        debugLog('xAPI', `Saved ${xapiStatementsRef.current.length} statements to offline queue`);
      } catch (e) {
        debugError('xAPI', 'Failed to save to offline queue', e);
      }

      // Retry with exponential backoff
      if (retryCount < maxRetries && isOnline) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        debugLog('xAPI', `Retrying in ${delay}ms...`);
        setTimeout(() => syncXAPIStatements(retryCount + 1), delay);
      }
    }
  };

  // Load offline xAPI queue on mount
  useEffect(() => {
    const loadOfflineQueue = () => {
      try {
        const offlineQueue = JSON.parse(localStorage.getItem('xapi_offline_queue') || '[]');
        if (offlineQueue.length > 0 && isOnline) {
          debugLog('xAPI', `Found ${offlineQueue.length} statements in offline queue, syncing...`);
          xapiStatementsRef.current = [...offlineQueue, ...xapiStatementsRef.current];
          localStorage.removeItem('xapi_offline_queue');
          syncXAPIStatements();
        }
      } catch (e) {
        debugError('xAPI', 'Failed to load offline queue', e);
      }
    };

    if (isOnline) {
      loadOfflineQueue();
    }
  }, [isOnline]);

  const syncProgress = useCallback(async () => {
    if (!courseId || !course) {
      debugWarn('SYNC', 'Cannot sync - no courseId or course data');
      return;
    }

    const currentModule = course.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (!currentLesson) {
      debugWarn('SYNC', 'Cannot sync - no current lesson');
      return;
    }

    // Skip auto-sync for YouTube/Vimeo videos - they use manual "Mark as Completed"
    const videoUrl = currentLesson.contentUrl || '';
    if (currentLesson.type === 'Video' && (isYouTubeUrl(videoUrl) || isVimeoUrl(videoUrl))) {
      debugLog('SYNC', 'Skipping auto-sync for YouTube/Vimeo video');
      return;
    }

    debugLog('SYNC', `Syncing progress for: ${currentLesson.title} (${currentLesson.type})`);

    try {
      const lessonProg = lessonProgress[currentLesson._id || currentLesson.title] || {
        lessonId: currentLesson._id || currentLesson.title,
        completionPercentage: 0,
        isCompleted: false,
      };

      // Get existing suspendData or create new
      const existingSuspendData = lessonProg.suspendData || {};
      const currentSuspendData = typeof existingSuspendData === 'string'
        ? JSON.parse(existingSuspendData)
        : existingSuspendData;
      const totalSessionTime = (currentSuspendData.totalSessionTime || 0) + sessionTime;

      // SCORM-compliant lesson_location format for video: "time:SECONDS"
      const videoCurrentTime = playerRef.current?.currentTime || played * duration;
      const videoLessonLocation = formatTimeLocation(videoCurrentTime);

      const suspendDataToSend = currentLesson.type === 'Video' ? {
        // SCORM 1.2: cmi.core.lesson_location
        // SCORM 2004: cmi.location
        lesson_location: videoLessonLocation, // SCORM format: "time:X"
        currentTime: videoCurrentTime,
        maxWatched: maxWatchedTime,
        totalSessionTime,
        lastAccessed: new Date().toISOString(),
      } : (scormDataRef.current['cmi.suspend_data'] || currentSuspendData);

      const syncData = {
        courseId,
        moduleId: currentModule._id,
        lessonId: currentLesson._id || currentLesson.title,
        completionPercentage: lessonProg.completionPercentage,
        currentPosition: currentLesson.type === 'Video' ? videoLessonLocation : undefined, // SCORM format: "time:X"
        suspendData: typeof suspendDataToSend === 'string' ? suspendDataToSend : JSON.stringify(suspendDataToSend),
        scormData: scormDataRef.current,
        status: lessonProg.isCompleted ? 'completed' : 'in_progress',
        sessionTime: totalSessionTime,
      };

      debugLog('SYNC', 'Sending sync data', {
        lessonType: currentLesson.type,
        completionPercentage: syncData.completionPercentage,
        status: syncData.status,
        sessionTime: totalSessionTime
      });

      await api.patch('/player/sync', syncData);
      debugLog('SYNC', 'Progress synced successfully');

      // Sync xAPI statements
      await syncXAPIStatements();
    } catch (error: any) {
      debugError('SYNC', 'Failed to sync progress', error?.message);
    }
  }, [courseId, course, currentModuleIndex, currentLessonIndex, lessonProgress, played, duration, isOnline, sessionTime, maxWatchedTime, playerRef]);

  const updateLessonProgress = (lessonId: string, progress: Partial<LessonProgress>) => {
    setLessonProgress(prev => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        lessonId,
        ...progress,
      },
    }));

    // Sync to backend immediately when a lesson is completed
    // This is critical for quiz, PDF, audio, PPT completions which don't have
    // their own explicit sync calls (unlike video which syncs separately)
    if (progress.isCompleted && courseId) {
      const currentMod = course?.modules[currentModuleIndex];
      debugLog('SYNC', `Syncing lesson completion to backend: ${lessonId} (type: ${currentMod?.lessons[currentLessonIndex]?.type})`);
      api.patch('/player/sync', {
        courseId,
        moduleId: currentMod?._id,
        lessonId,
        completionPercentage: progress.completionPercentage ?? 100,
        status: 'completed',
      }).then(() => {
        debugLog('SYNC', `Lesson completion synced successfully: ${lessonId}`);
        // Reload progress from backend to detect course completion and trigger celebration
        loadProgress();
      }).catch((err) => {
        debugError('SYNC', `Failed to sync lesson completion: ${lessonId}`, err?.message);
      });
    }
  };

  const handleLessonClick = async (moduleIndex: number, lessonIndex: number) => {
    const targetLesson = course?.modules[moduleIndex]?.lessons[lessonIndex];
    debugLog('LESSON', `Switching to lesson: ${targetLesson?.title || 'Unknown'}`, {
      moduleIndex,
      lessonIndex,
      type: targetLesson?.type,
      contentUrl: targetLesson?.contentUrl
    });

    if (isLessonLocked(moduleIndex, lessonIndex)) {
      debugWarn('LESSON', 'Lesson is locked');
      showToast('Please complete the previous lesson to unlock this content.', 'error');
      return;
    }

    if (course?.modules[moduleIndex].lessons[lessonIndex].type === 'Quiz') {
      if (isQuizLocked(moduleIndex, lessonIndex)) {
        debugWarn('LESSON', 'Quiz is locked');
        showToast(
          isCorporate
            ? 'Please finish the previous lesson (100%) to unlock this quiz.'
            : 'Please complete at least 95% of the previous content to unlock this quiz.',
          'error',
        );
        return;
      }
      debugLog('LESSON', 'Opening quiz');
      // Update indexes FIRST so currentLesson points to the quiz
      setCurrentModuleIndex(moduleIndex);
      setCurrentLessonIndex(lessonIndex);
      setQuizAutoResumeBlockedForLesson(null);
      setShowQuiz(true);
      return;
    }

    // Reset session time when changing lessons
    debugLog('LESSON', 'Resetting session state for new lesson');
    setSessionTime(0);
    sessionStartTimeRef.current = null;
    setVideoError(null); // Clear any previous video errors
    setIsReady(false); // Reset ready state
    setMaxWatchedTime(0); // Reset max watched time
    setCurrentTime(0); // Reset current time
    setDuration(0); // Reset duration
    setPlayed(0); // Reset played
    setPlaying(false); // Reset playing state

    setCurrentModuleIndex(moduleIndex);
    setCurrentLessonIndex(lessonIndex);

    const module = course?.modules[moduleIndex];
    if (module) {
      setExpandedModules(prev => new Set(prev).add(module._id));
    }

    // Load resume data for Audio/PDF/PPT
    const lesson = module?.lessons[lessonIndex];
    if (lesson && (lesson.type === 'Audio' || lesson.type === 'PDF' || lesson.type === 'PPT' || lesson.type === 'Slides')) {
      debugLog('LESSON', `Loading resume data for ${lesson.type}`);
      try {
        const response = await api.get<{ success: boolean; data: any }>(
          `/learner/resume/${lesson._id || lesson.title}?courseId=${courseId}`,
        );
        if (response.success) {
          debugLog('LESSON', 'Resume data loaded', response.data);
          setResumeData(response.data);
        }
      } catch (error) {
        console.error('Failed to load resume data:', error);
        setResumeData(null);
      }
    } else {
      setResumeData(null);
    }

    // Send xAPI launched statement
    if (lesson) {
      sendXAPIStatement('http://adlnet.gov/expapi/verbs/launched', {
        id: lesson.contentUrl || lesson.scormPackageId || lesson._id || '',
        name: lesson.title,
        type: lesson.type === 'Video'
          ? 'http://adlnet.gov/expapi/activities/video'
          : lesson.type === 'Audio'
            ? 'http://adlnet.gov/expapi/activities/audio'
            : 'http://adlnet.gov/expapi/activities/module',
      });
    }

    // Load SCORM suspend data if available
    if (lesson?.type === 'SCORM') {
      const lessonProg = lessonProgress[lesson._id || lesson.title];
      if (lessonProg?.suspendData) {
        scormDataRef.current['cmi.suspend_data'] = lessonProg.suspendData;
      }
    }
  };

  // Helper to find progress for a lesson by checking all possible key formats
  const findLessonProgress = (lesson: Lesson, moduleIdx: number, lessonIdx: number): LessonProgress | null => {
    // Build list of possible keys for this lesson
    const possibleKeys: string[] = [];

    if (lesson._id && String(lesson._id).trim()) {
      possibleKeys.push(String(lesson._id).trim());
    }
    if (lesson.assessmentId && String(lesson.assessmentId).trim()) {
      possibleKeys.push(String(lesson.assessmentId).trim());
    }
    const quizDataId = (lesson as any)?.quizData?.id;
    if (quizDataId && String(quizDataId).trim()) {
      possibleKeys.push(String(quizDataId).trim());
    }
    if (lesson.title && lesson.title.trim()) {
      possibleKeys.push(lesson.title.trim());
    }
    possibleKeys.push(`lesson_${moduleIdx}_${lessonIdx}`);

    // Also search all progress keys for partial matches (handles ObjectId vs string mismatches)
    const allProgressKeys = Object.keys(lessonProgress);

    // First try exact matches
    for (const key of possibleKeys) {
      if (lessonProgress[key]) {
        return lessonProgress[key];
      }
    }

    // Then try finding by title match in lessonProgress values
    for (const key of allProgressKeys) {
      const prog = lessonProgress[key];
      // Check if the progress lessonId matches any of our possible keys
      if (prog && possibleKeys.includes(prog.lessonId)) {
        return prog;
      }
    }

    return null;
  };

  const isQuizLocked = (moduleIndex: number, lessonIndex: number): boolean => {
    const module = course?.modules[moduleIndex];
    if (!module) return true;

    const lesson = module.lessons[lessonIndex];
    if (lesson.type !== 'Quiz') return false;

    if (lessonIndex === 0) {
      if (moduleIndex === 0) {
        return false;
      }
      const prevModule = course?.modules[moduleIndex - 1];
      if (!prevModule || prevModule.lessons.length === 0) return true;

      const lastLessonIdx = prevModule.lessons.length - 1;
      const lastLessonOfPrevModule = prevModule.lessons[lastLessonIdx];
      const lastProg = findLessonProgress(lastLessonOfPrevModule, moduleIndex - 1, lastLessonIdx);

      return !lastProg?.isCompleted;
    }

    const previousLesson = module.lessons[lessonIndex - 1];
    const prevProg = findLessonProgress(previousLesson, moduleIndex, lessonIndex - 1);

    return !prevProg?.isCompleted;
  };

  const isLessonLocked = (moduleIndex: number, lessonIndex: number): boolean => {
    if (moduleIndex === 0 && lessonIndex === 0) return false;

    const module = course?.modules[moduleIndex];
    if (!module) return true;

    if (lessonIndex > 0) {
      const previousLesson = module.lessons[lessonIndex - 1];
      const prevProg = findLessonProgress(previousLesson, moduleIndex, lessonIndex - 1);
      if (!prevProg?.isCompleted) return true;
    }

    if (lessonIndex === 0 && moduleIndex > 0) {
      const previousModule = course.modules[moduleIndex - 1];
      const lastLessonIdx = previousModule.lessons.length - 1;
      const lastLesson = previousModule.lessons[lastLessonIdx];
      const lastProg = findLessonProgress(lastLesson, moduleIndex - 1, lastLessonIdx);
      if (!lastProg?.isCompleted) return true;
    }

    return false;
  };

  // AUTO-SHOW QUIZ: When navigating to a Quiz lesson (via auto-advance or any other means),
  // automatically set showQuiz to true so the quiz renders properly
  // Also re-check when lessonProgress changes (e.g., after video completion)
  useEffect(() => {
    if (!course) return;

    const currentLesson = course.modules[currentModuleIndex]?.lessons[currentLessonIndex];
    const currentLessonKey = currentLesson ? getLessonKey(currentLesson) : null;
    if (currentLesson?.type === 'Quiz' && !showQuiz) {
      // Check if the quiz is unlocked before showing
      const quizLocked = isQuizLocked(currentModuleIndex, currentLessonIndex);
      const autoResumeBlocked = currentLessonKey !== null && quizAutoResumeBlockedForLesson === currentLessonKey;
      const quizDone = !!findLessonProgress(currentLesson, currentModuleIndex, currentLessonIndex)?.isCompleted;
      debugLog('AUTO-SHOW-QUIZ', `Quiz lock check: locked=${quizLocked}, blocked=${autoResumeBlocked}`, { lessonProgress });
      if (!quizLocked && !autoResumeBlocked && !quizDone) {
        // For corporate learners, never auto-launch the quiz — let the
        // "Are you ready to start the quiz?" panel surface so the learner
        // explicitly confirms with a click.
        if (isCorporate) {
          debugLog('AUTO-SHOW-QUIZ', 'Corporate learner — leaving showQuiz=false to show Start-Quiz prompt');
        } else {
          debugLog('AUTO-SHOW-QUIZ', `Current lesson is Quiz and unlocked, auto-setting showQuiz=true`);
          setShowQuiz(true);
        }
      }
    } else if (currentLesson?.type !== 'Quiz' && showQuiz) {
      // Reset showQuiz when navigating away from a Quiz
      setShowQuiz(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, currentModuleIndex, currentLessonIndex, lessonProgress, showQuiz, quizAutoResumeBlockedForLesson]);

  const showToast = (message: string, type: 'error' | 'info' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleVideoProgress = (state: { played: number; playedSeconds: number }) => {
    if (!seeking) {
      setPlayed(state.played);

      const currentModule = course?.modules[currentModuleIndex];
      const currentLesson = currentModule?.lessons[currentLessonIndex];
      if (currentLesson && currentLesson.type === 'Video') {
        const completionPercentage = state.played * 100;
        updateLessonProgress(currentLesson._id || currentLesson.title, {
          completionPercentage,
          isCompleted: completionPercentage >= VIDEO_COMPLETE_PCT,
          currentPosition: state.playedSeconds,
        });
      }
    }
  };

  const handleVideoEnd = () => {
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (currentLesson && currentLesson.type === 'Video') {
      updateLessonProgress(currentLesson._id || currentLesson.title, {
        completionPercentage: 100,
        isCompleted: true,
      });

      // Send xAPI completion statement
      sendXAPIStatement('http://adlnet.gov/expapi/verbs/completed', {
        id: currentLesson.contentUrl || '',
        name: currentLesson.title,
        type: 'http://adlnet.gov/expapi/activities/video',
      }, {
        completion: true,
        success: true,
      });

      showToast('Video completed! You can now proceed to the next lesson.', 'info');
    }
  };


  const handleSaveAndExit = async () => {
    // Call LMSFinish for SCORM
    if (scormInitializedRef.current) {
      if (scormVersionRef.current === '2004') {
        (window as any).API_1484_11?.Terminate('');
      } else {
        (window as any).API?.LMSFinish('');
      }
    }

    // Final sync
    await syncProgress();
    router.push('/learner/dashboard');
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

  // Video player event handlers - MUST be before any early returns
  const handleReady = useCallback((_player: any) => {
    setIsReady(true);
    // Get duration from the player instance
    try {
      if (playerRef.current) {
        const internalPlayer = (playerRef.current as any).getInternalPlayer?.();
        if (internalPlayer) {
          if (internalPlayer.duration) {
            setDuration(internalPlayer.duration);
          }
          // Auto-play if online
          if (isOnline && internalPlayer.paused !== undefined) {
            setPlaying(true);
            internalPlayer.play().catch((_err: any) => {
              // Auto-play blocked by browser - user must click play manually
            });
          }
        }
      }
    } catch (_err) {
      // Could not get video duration
    }
  }, [isOnline]);

  const handleStart = useCallback(() => {
    // Video started
  }, []);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    if (!isOnline) {
      showToast('Please check your internet connection.', 'error');
    }
  }, [isOnline]);

  const handlePause = useCallback(() => {
    setPlaying(false);
  }, []);

  const handleBuffer = useCallback(() => {
    // Buffering
  }, []);

  const handleBufferEnd = useCallback(() => {
    // Buffer ended
  }, []);

  const handleProgress = useCallback((state: any) => {
    if (state && typeof state === 'object' && 'played' in state) {
      const progressState = state as { played: number; playedSeconds: number };
      setPlayed(progressState.played);
      handleVideoProgress(progressState);

      // Get duration from player if not set yet
      if (duration === 0 && playerRef.current) {
        try {
          const internalPlayer = (playerRef.current as any).getInternalPlayer?.();
          if (internalPlayer && internalPlayer.duration && internalPlayer.duration > 0) {
            setDuration(internalPlayer.duration);
          }
        } catch (_err) {
          // Ignore errors
        }
      }
    }
  }, [duration, handleVideoProgress]);

  const handleDuration = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  const handleError = useCallback((error: any) => {
    debugError('VIDEO', 'Video playback error occurred', error);

    let errorMessage = 'Failed to load video.';
    if (error?.message) {
      errorMessage += ` Error: ${error.message}`;
    } else if (typeof error === 'string') {
      errorMessage += ` Error: ${error}`;
    } else if (error?.target?.error) {
      const videoError = error.target.error;
      errorMessage = getVideoErrorCodeMeaning(videoError.code);
      debugError('VIDEO', `Video element error: ${errorMessage} (code: ${videoError.code})`);
      setVideoError(errorMessage);
    }

    showToast(errorMessage, 'error');
  }, []);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    handleVideoEnd();
  }, [handleVideoEnd]);

  const togglePlayPause = useCallback(() => {
    const newPlayingState = !playing;
    setPlaying(newPlayingState);

    if (isOnline && playerRef.current) {
      const internalPlayer = (playerRef.current as any).getInternalPlayer?.();
      if (internalPlayer && internalPlayer.play && newPlayingState) {
        internalPlayer.play().catch((_err: any) => {
          showToast('Failed to play video. Please try again.', 'error');
        });
      }
    } else if (!isOnline) {
      showToast('Please check your internet connection.', 'error');
    }
  }, [playing, isOnline]);

  // Check if ReactPlayer ref is attached and monitor for ready state
  useEffect(() => {
    const currentModule = course?.modules[currentModuleIndex];
    const currentLesson = currentModule?.lessons[currentLessonIndex];

    if (currentLesson?.type === 'Video' && currentLesson.contentUrl) {
      // Reset max watched time when lesson changes
      setMaxWatchedTime(0);
      // Reset YouTube watch time for compliance tracking
      setYoutubeWatchTime(0);

      // Load saved progress for this lesson
      const lessonProg = lessonProgress[currentLesson._id || currentLesson.title];
      if (lessonProg?.currentPosition) {
        // Parse SCORM location format (e.g., "time:305") to numeric value
        setMaxWatchedTime(parseSCORMLocation(lessonProg.currentPosition));
      }
    }
  }, [course, currentModuleIndex, currentLessonIndex, lessonProgress]);

  // Debug: Log render state
  useEffect(() => {
    const currentModuleDebug = course?.modules[currentModuleIndex];
    const currentLessonDebug = currentModuleDebug?.lessons[currentLessonIndex];

    if (currentLessonDebug && !loading) {
      debugLog('RENDER', `Rendering lesson: ${currentLessonDebug.title}`, {
        type: currentLessonDebug.type,
        contentUrl: currentLessonDebug.contentUrl,
        hasSlideUrls: !!(currentLessonDebug as any).slideUrls,
        moduleIndex: currentModuleIndex,
        lessonIndex: currentLessonIndex
      });
    }
  }, [course, currentModuleIndex, currentLessonIndex, loading]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)'
      }}>
        {/* Animated Background Orbs */}
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            top: '10%',
            left: '20%',
            width: '300px',
            height: '300px',
            background: 'rgba(99, 102, 241, 0.3)',
            borderRadius: '50%',
            filter: 'blur(60px)',
            animation: 'pulse 2s infinite'
          }}></div>
          <div style={{
            position: 'absolute',
            bottom: '20%',
            right: '20%',
            width: '250px',
            height: '250px',
            background: 'rgba(139, 92, 246, 0.3)',
            borderRadius: '50%',
            filter: 'blur(60px)',
            animation: 'pulse 2s infinite',
            animationDelay: '1s'
          }}></div>
        </div>
        <div style={{
          background: 'rgba(30, 27, 75, 0.9)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          zIndex: 10,
          position: 'relative'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid transparent',
            borderTopColor: '#818cf8',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: '#e0e7ff', fontSize: '18px', marginBottom: '8px' }}>Loading course...</p>
          <p style={{ color: '#a5b4fc', fontSize: '14px' }}>Preparing your learning experience</p>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        `}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a]">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Error Loading Course</h2>
          <p className="text-gray-400 mb-4">{loadError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                loadCourse();
                loadProgress();
              }}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-3 rounded-xl font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push('/learner/dashboard')}
              className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-3 rounded-xl font-medium"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)'
      }}>
        {/* Animated Background Orbs */}
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            top: '10%',
            left: '20%',
            width: '300px',
            height: '300px',
            background: 'rgba(99, 102, 241, 0.3)',
            borderRadius: '50%',
            filter: 'blur(60px)'
          }}></div>
        </div>
        <div style={{
          background: 'rgba(30, 27, 75, 0.9)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          zIndex: 10,
          position: 'relative',
          maxWidth: '400px'
        }}>
          <AlertCircle style={{ width: '64px', height: '64px', color: '#f87171', margin: '0 auto 16px' }} />
          <p style={{ color: '#e0e7ff', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Course not found</p>
          <p style={{ color: '#a5b4fc', fontSize: '14px', marginBottom: '24px' }}>The course may have been removed or you don't have access.</p>
          <button
            onClick={() => router.push('/learner/dashboard')}
            style={{
              background: 'linear-gradient(to right, #4f46e5, #7c3aed)',
              color: 'white',
              fontWeight: 500,
              padding: '12px 24px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Handle case where course has no modules or lessons - CHECK FIRST before accessing
  if (!course.modules || course.modules.length === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)'
      }}>
        <div style={{
          background: 'rgba(30, 27, 75, 0.9)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <AlertCircle style={{ width: '64px', height: '64px', color: '#fbbf24', margin: '0 auto 16px' }} />
          <p style={{ color: '#e0e7ff', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>No Content Available</p>
          <p style={{ color: '#a5b4fc', fontSize: '14px', marginBottom: '24px' }}>This course doesn't have any modules or lessons yet.</p>
          <button
            onClick={() => router.push('/learner/dashboard')}
            style={{
              background: 'linear-gradient(to right, #4f46e5, #7c3aed)',
              color: 'white',
              fontWeight: 500,
              padding: '12px 24px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Now safe to access modules
  const currentModule = course.modules[currentModuleIndex];
  const currentLesson = currentModule?.lessons?.[currentLessonIndex];

  // Handle case where module has no lessons
  if (currentModule && (!currentModule.lessons || currentModule.lessons.length === 0)) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a]">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No Lessons Available</h2>
          <p className="text-gray-400 mb-6">This module doesn't have any lessons yet.</p>
          <button
            onClick={() => router.push('/learner/dashboard')}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-3 rounded-xl font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex ${isCorporate ? 'bg-gray-50 text-gray-900' : 'bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] text-white'} overflow-hidden relative`}>
      {/* Animated Background Orbs */}
      {!isCorporate && (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-2xl backdrop-blur-xl border ${toast.type === 'error'
          ? 'bg-red-600/90 border-red-500/50'
          : 'bg-indigo-600/90 border-indigo-500/50'
          } text-white animate-slide-in`}>
          {toast.message}
        </div>
      )}

      {/* Course-completed celebratory toast — replaces the prior centered modal.
          Fires on the same condition (course at 100% AND quiz passed) but
          stays out of the learner's way and auto-dismisses. */}
      {showCourseCompleteModal && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-2xl"
        >
          <div className="relative overflow-hidden rounded-2xl shadow-2xl border border-emerald-300/50 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white animate-slide-in">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex items-center gap-4 p-5 sm:p-6">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center backdrop-blur-sm">
                <CheckCircle className="w-9 h-9 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg sm:text-xl font-bold leading-tight">🎉 Your course has been completed!</p>
                <p className="text-sm text-white/90 mt-0.5">Great work — your certificate is on its way.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCourseCompleteModal(false);
                  router.push('/learner/dashboard');
                }}
                className="hidden sm:inline-flex flex-shrink-0 items-center gap-2 bg-white/95 hover:bg-white text-emerald-700 font-bold px-4 py-2 rounded-xl shadow-md transition-all"
              >
                Dashboard
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setShowCourseCompleteModal(false)}
                className="flex-shrink-0 text-white/80 hover:text-white text-2xl leading-none px-1"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Course Map */}
      <div className={`w-80 ${isCorporate ? 'bg-white border-r border-gray-200' : 'bg-gray-900/80 backdrop-blur-2xl border-r border-white/10'} flex flex-col shadow-2xl transition-colors`}>
        {/* Header */}
        <div className={`p-4 ${isCorporate ? 'border-b border-gray-100 bg-gray-50/50' : 'border-b border-white/10 bg-white/5'}`}>
          <button
            onClick={() => router.push('/learner/dashboard')}
            className={`flex items-center gap-2 ${isCorporate ? 'text-gray-500 hover:text-gray-900' : 'text-gray-400 hover:text-white'} mb-3 transition-colors`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>
          <h1 className={`text-lg font-bold ${isCorporate ? 'text-gray-900' : 'text-white'} line-clamp-2`} title={course.title}>{course.title}</h1>
          {course.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-3 leading-relaxed">{course.description}</p>
          )}
          {progress && (
            <div className="mt-3">
              <div className={`flex items-center justify-between text-xs mb-2 ${isCorporate ? 'text-gray-500' : 'text-gray-400'}`}>
                <span>Overall Progress</span>
                <span className={`${isCorporate ? 'text-indigo-600' : 'text-indigo-400'} font-bold`}>{(progress.completionPercentage || 0).toFixed(1)}%</span>
              </div>
              <div className={`w-full ${isCorporate ? 'bg-gray-200' : 'bg-white/10'} rounded-full h-2 overflow-hidden`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isCorporate ? 'bg-indigo-600' : 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/50'}`}
                  style={{ width: `${progress.completionPercentage || 0}%` }}
                ></div>
              </div>

              {/* Certificate Button — shown once all lessons are accessed (completionPercentage=100).
                  Quiz scores only affect the certificate's score display, not course completion eligibility. */}
              {(() => {
                const certificateEnabled = course.settings?.certificateEnabled === true;
                const currentProgress = progress.completionPercentage || 0;
                const isCourseComplete = currentProgress >= 100;

                // Show certificate button when ALL lessons are accessed
                if (certificateEnabled && isCourseComplete) {
                  return (
                    <button
                      onClick={() => router.push('/learner/certificates')}
                      className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-medium py-3 px-4 rounded-xl shadow-lg hover:shadow-amber-500/30 transition-all duration-300 animate-pulse"
                    >
                      <Award className="w-5 h-5" />
                      <span>🎉 View Your Certificate!</span>
                    </button>
                  );
                }

                // Certificate enabled but not all lessons accessed yet
                if (certificateEnabled && !isCourseComplete) {
                  const remaining = 100 - currentProgress;
                  return (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                      <div className="flex items-center gap-2 text-amber-400 text-sm">
                        <Award className="w-4 h-4" />
                        <span>Complete {remaining.toFixed(0)}% more to earn certificate</span>
                      </div>
                    </div>
                  );
                }

                // Show course completion celebration even without certificate
                if (!certificateEnabled && isCourseComplete) {
                  return (
                    <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                      <span className="text-emerald-400 text-sm font-medium">
                        🎉 Course Completed!
                      </span>
                    </div>
                  );
                }

                return null;
              })()}
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
                <div key={module._id} className={`border ${isCorporate ? 'border-gray-100 bg-white' : 'border-white/10 bg-white/5 backdrop-blur-sm'} rounded-xl overflow-hidden mb-2`}>
                  <button
                    onClick={() => toggleModule(module._id)}
                    className={`w-full p-3 ${isCorporate ? 'bg-gray-50/50 hover:bg-gray-100' : 'bg-white/5 hover:bg-white/10'} flex items-center justify-between transition-all duration-300`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className={`w-4 h-4 ${isCorporate ? 'text-indigo-600' : 'text-indigo-400'} flex-shrink-0`} />
                      ) : (
                        <ChevronRight className={`w-4 h-4 ${isCorporate ? 'text-gray-400' : 'text-gray-400'} flex-shrink-0`} />
                      )}
                      <div className="flex-1 min-w-0 text-left">
                        <span className={`text-sm font-bold ${isCorporate ? 'text-gray-900' : 'text-white'} truncate block`} title={module.title}>{module.title}</span>
                        {module.description && (
                          <span className={`text-xs ${isCorporate ? 'text-gray-500' : 'text-indigo-300/70'} line-clamp-2 block mt-0.5 leading-snug`}>{module.description}</span>
                        )}
                      </div>
                    </div>
                    <div className={`text-xs font-bold ${isCorporate ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'} px-2 py-0.5 rounded-full flex-shrink-0 ml-2`}>{Math.round(moduleProgress)}%</div>
                  </button>

                  {isExpanded && (
                    <div className={isCorporate ? 'bg-white' : 'bg-black/20'}>
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
                            className={`w-full p-3 text-left border-t ${isCorporate ? 'border-gray-50' : 'border-white/5'} flex items-center gap-3 transition-all duration-300 ${isActive
                              ? (isCorporate ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'bg-gradient-to-r from-indigo-600/30 to-violet-600/30 border-l-4 border-l-indigo-500')
                              : isLocked || isQuizLockedState
                                ? (isCorporate ? 'bg-gray-50/50 opacity-50 cursor-not-allowed' : 'bg-black/20 opacity-50 cursor-not-allowed')
                                : (isCorporate ? 'hover:bg-gray-50' : 'hover:bg-white/10')
                              }`}
                          >
                            <div className={`flex-shrink-0 p-1.5 rounded-lg ${isActive
                              ? (isCorporate ? 'bg-indigo-600/10' : 'bg-indigo-500/30')
                              : (isCorporate ? 'bg-gray-100' : 'bg-white/5')
                              }`}>
                              {isLocked || isQuizLockedState ? (
                                <Lock className="w-4 h-4 text-gray-500" />
                              ) : lessonProg?.isCompleted ? (
                                <CheckCircle className={`w-4 h-4 ${isCorporate ? 'text-emerald-600' : 'text-emerald-400'}`} />
                              ) : lesson.type === 'Video' ? (
                                <Video className={`w-4 h-4 ${isCorporate ? 'text-indigo-500' : 'text-cyan-400'}`} />
                              ) : lesson.type === 'Quiz' ? (
                                <Award className={`w-4 h-4 ${isCorporate ? 'text-amber-600' : 'text-amber-400'}`} />
                              ) : (
                                <FileText className={`w-4 h-4 ${isCorporate ? 'text-gray-500' : 'text-gray-400'}`} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${isLocked || isQuizLockedState
                                ? 'text-gray-400'
                                : isActive
                                  ? (isCorporate ? 'text-indigo-700 font-bold' : 'text-white font-medium')
                                  : (isCorporate ? 'text-gray-600' : 'text-gray-300')
                                }`} title={lesson.title}>
                                {lesson.title}
                              </p>
                              {lessonProg && !isLocked && !isQuiz && (
                                <div className={`mt-1.5 w-full ${isCorporate ? 'bg-gray-100' : 'bg-white/10'} rounded-full h-1 overflow-hidden`}>
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${isCorporate ? 'bg-indigo-600' : 'bg-gradient-to-r from-indigo-500 to-violet-500'}`}
                                    style={{ width: `${lessonProg.completionPercentage}%` }}
                                  ></div>
                                </div>
                              )}
                            </div>
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

        {/* Save & Exit Button */}
        <div className={`p-4 border-t ${isCorporate ? 'border-gray-100 bg-gray-50/50' : 'border-white/10 bg-white/5'}`}>
          <button
            onClick={handleSaveAndExit}
            className={`w-full ${isCorporate ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700'} text-white font-bold px-4 py-3.5 rounded-xl shadow-lg transition-all duration-300 flex items-center justify-center gap-2 transform hover:scale-[1.02]`}
          >
            <Save className="w-4 h-4" />
            Save & Exit
          </button>
        </div>
      </div>

      {/* Main Content Area - Cinema Mode */}
      <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-900/50 to-black/50 backdrop-blur-sm">
        {currentLesson ? (
          <>
            {/* Lesson Header — always shows learning objectives from both module and sub-module */}
            {(() => {
              const lessonObjective = currentLesson.learningObjective?.trim() || '';
              const moduleObjective = currentModule?.learningObjective?.trim() || '';
              const displayDescription = currentLesson.description?.trim() || '';
              return (
                <div className={`p-6 border-b ${isCorporate ? 'border-gray-100 bg-white shadow-sm' : 'border-white/10 bg-white/5 backdrop-blur-sm'}`}>
                  <h2 className={`text-2xl font-black ${isCorporate ? 'text-gray-900' : 'text-white'} mb-2`}>{currentLesson.title}</h2>
                  {displayDescription && (
                    <p className={`${isCorporate ? 'text-gray-500' : 'text-gray-400'} text-sm leading-relaxed mt-1 font-medium`}>{displayDescription}</p>
                  )}
                  {moduleObjective && (
                    <div className={`flex items-start gap-2 mt-4 ${isCorporate ? 'bg-indigo-50/50 border-indigo-100' : 'bg-indigo-500/10 border-indigo-500/20'} border rounded-xl px-4 py-3`}>
                      <span className={`${isCorporate ? 'text-indigo-600' : 'text-indigo-400'} text-sm flex-shrink-0`}>📚</span>
                      <p className={`${isCorporate ? 'text-indigo-900' : 'text-indigo-200'} text-sm leading-relaxed`}>
                        <span className={`font-bold ${isCorporate ? 'text-indigo-700' : 'text-indigo-400'}`}>Module Objective: </span>
                        {moduleObjective}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Player Area */}
            <div className={`flex-1 ${isCorporate ? 'bg-gray-100' : 'bg-gradient-to-br from-gray-900/80 to-black/80'} relative min-h-0 ${showQuiz && currentLesson.type === 'Quiz' ? 'overflow-hidden flex flex-col' : 'flex items-center justify-center p-6'}`}>
              <>
                {currentLesson.type === 'Video' ? (() => {
                  const videoUrlToUse = currentLesson.contentUrl;

                  return (
                    <>
                      {/* Video Player Content */}
                      {(() => {
                        // Check if URL is missing
                        if (!videoUrlToUse) {
                          return (
                            <div className="w-full max-w-6xl text-center text-white p-8">
                              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                              <h3 className="text-xl font-bold mb-2">Video URL Missing</h3>
                              <p className="text-gray-400 mb-4">
                                The video URL for this lesson is not available.
                              </p>
                              <p className="text-sm text-gray-500">
                                Please check that the lesson has a valid contentUrl set.
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="w-full max-w-6xl">
                            {/* Offline Indicator */}
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

                            {/* Video Error Display */}
                            {videoError && (
                              <div className="w-full bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
                                <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                                <h3 className="text-xl font-bold text-white mb-2">Video Failed to Load</h3>
                                <p className="text-gray-300 mb-2">{videoError}</p>
                                <p className="text-sm text-gray-400 mb-4">
                                  URL attempted: <code className="text-xs break-all">{videoUrlToUse?.substring(0, 80)}...</code>
                                </p>
                                <p className="text-sm text-gray-500">
                                  Please check if the video URL is valid and accessible. If using S3, ensure CORS is configured correctly.
                                </p>
                              </div>
                            )}

                            {/* YouTube/Vimeo Custom Player - No Skip, Custom Controls */}
                            {!videoError && (isYouTubeUrl(videoUrlToUse) || isVimeoUrl(videoUrlToUse)) && (
                              <div
                                ref={videoContainerRef}
                                className={`w-full bg-black rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
                                style={{ aspectRatio: isFullscreen ? 'auto' : '16/9', height: isFullscreen ? '100vh' : 'auto' }}
                              >
                                <div className="w-full h-full flex flex-col">
                                  {/* Video Container - YouTube API Player */}
                                  <div className="relative flex-1" style={{ minHeight: isFullscreen ? 'calc(100vh - 120px)' : '400px' }}>
                                    {/* YouTube Player Container for API */}
                                    <div
                                      id="yt-player-container"
                                      className="absolute inset-0 w-full h-full bg-black"
                                    />


                                    {/* Loading State */}
                                    {!ytReady && (
                                      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center z-30 pointer-events-auto">
                                        <div className="text-center">
                                          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                          <p className="text-white font-medium text-lg">Loading Video...</p>
                                          <p className="text-gray-400 text-sm mt-2">Please wait while we prepare your content</p>
                                        </div>
                                      </div>
                                    )}

                                    {/* Transparent overlay to intercept clicks and control via API */}
                                    {ytReady && (
                                      <div
                                        className="absolute inset-0 z-20 cursor-pointer"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          debugLog('VIDEO', `Overlay clicked - ${ytPlaying ? 'pausing' : 'playing'}`);
                                          ytTogglePlay();
                                        }}
                                      >
                                        {/* Play button overlay (when paused) */}
                                        {!ytPlaying && (
                                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-all">
                                            <div className="w-24 h-24 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-500 hover:scale-110 transition-all shadow-2xl">
                                              <Play className="w-12 h-12 text-white ml-1" />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Custom Control Bar - Modern LMS Style */}
                                  <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 border-t border-indigo-500/30">
                                    {/* Progress Bar (Display Only - No Seeking) */}
                                    <div className="mb-4">
                                      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                                        <span className="font-mono">{formatTime(ytCurrentTime)}</span>
                                        <span className="text-amber-400 font-medium flex items-center gap-1">
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                          </svg>
                                          No Skipping - Must Watch Full Video
                                        </span>
                                        <span className="font-mono">{formatTime(ytDuration)}</span>
                                      </div>
                                      {/* Progress Bar - Display Only */}
                                      <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                                        {/* Watched Progress (Green) */}
                                        <div
                                          className="absolute h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                                          style={{ width: `${ytDuration > 0 ? (ytMaxWatched / ytDuration) * 100 : 0}%` }}
                                        />
                                        {/* Current Position Indicator */}
                                        <div
                                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg transition-all duration-300"
                                          style={{ left: `calc(${ytDuration > 0 ? (ytCurrentTime / ytDuration) * 100 : 0}% - 6px)` }}
                                        />
                                      </div>
                                      <div className="flex items-center justify-between text-xs mt-1">
                                        <span className="text-indigo-400">Watched: {ytDuration > 0 ? Math.round((ytMaxWatched / ytDuration) * 100) : 0}%</span>
                                        <span className="text-gray-500">Progress auto-saves every 10 seconds</span>
                                      </div>
                                    </div>

                                    {/* Control Buttons Row */}
                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                      {/* Left: Play/Pause */}
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() => {
                                            debugLog('VIDEO', 'Play/Pause button clicked');
                                            ytTogglePlay();
                                          }}
                                          disabled={!ytReady}
                                          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg ${ytPlaying
                                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
                                            : 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600'
                                            } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                          {ytPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                          {ytPlaying ? 'Pause' : 'Play'}
                                        </button>

                                        {/* Speed Control */}
                                        <div className="relative">
                                          <button
                                            onClick={() => setShowSpeedDropdown(!showSpeedDropdown)}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
                                          >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                            <span className="font-medium">{playbackSpeed}x</span>
                                            <ChevronDown className={`w-4 h-4 transition-transform ${showSpeedDropdown ? 'rotate-180' : ''}`} />
                                          </button>
                                          {showSpeedDropdown && (
                                            <div className="absolute bottom-full left-0 mb-2 w-28 bg-slate-800 rounded-xl shadow-2xl overflow-hidden z-30 border border-white/10">
                                              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                                                <button
                                                  key={speed}
                                                  onClick={() => {
                                                    debugLog('VIDEO', `Speed changed to ${speed}x`);
                                                    ytChangeSpeed(speed);
                                                    setShowSpeedDropdown(false);
                                                  }}
                                                  className={`block w-full text-left px-4 py-2 text-sm transition-colors ${playbackSpeed === speed
                                                    ? 'bg-indigo-600 text-white font-bold'
                                                    : 'text-gray-300 hover:bg-slate-700'
                                                    }`}
                                                >
                                                  {speed}x {speed === 1 && '(Normal)'}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Center: Progress Info */}
                                      <div className="flex items-center gap-4">
                                        <div className="bg-indigo-500/20 text-indigo-300 px-4 py-2 rounded-xl font-bold text-sm border border-indigo-500/30">
                                          {ytDuration > 0 ? Math.round((ytCurrentTime / ytDuration) * 100) : 0}% Watched
                                        </div>
                                      </div>

                                      {/* Right: CC, Fullscreen & Complete */}
                                      <div className="flex items-center gap-3">
                                        {/* CC Toggle for YouTube */}
                                        <button
                                          onClick={() => {
                                            const newState = !captionsEnabled;
                                            setCaptionsEnabled(newState);
                                            if (ytPlayerRef.current) {
                                              try {
                                                if (newState) {
                                                  ytPlayerRef.current.loadModule('captions');
                                                  ytPlayerRef.current.setOption('captions', 'track', { languageCode: 'en' });
                                                } else {
                                                  ytPlayerRef.current.unloadModule('captions');
                                                }
                                              } catch (e) {
                                                debugLog('CAPTIONS', 'Failed to toggle YouTube captions', e);
                                              }
                                            }
                                          }}
                                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${captionsEnabled
                                            ? 'bg-indigo-500/40 text-indigo-200 border border-indigo-400/50'
                                            : 'bg-white/10 hover:bg-white/20 text-white'
                                            }`}
                                          title={captionsEnabled ? 'Disable Captions' : 'Enable Captions'}
                                        >
                                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM7.5 13.5c0 .28-.22.5-.5.5H5.5c-.28 0-.5-.22-.5-.5v-3c0-.28.22-.5.5-.5H7c.28 0 .5.22.5.5v.5h-1v-.25H5.75v2.5H6.5V13h1v.5zm4.5 0c0 .28-.22.5-.5.5h-1.5c-.28 0-.5-.22-.5-.5v-3c0-.28.22-.5.5-.5H11.5c.28 0 .5.22.5.5v.5h-1v-.25H10.25v2.5H11V13h1v.5z" />
                                          </svg>
                                          <span className="hidden sm:inline">CC</span>
                                        </button>

                                        <button
                                          onClick={toggleFullscreen}
                                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
                                        >
                                          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                                          <span className="hidden sm:inline text-sm font-medium">
                                            {isFullscreen ? 'Exit' : 'Fullscreen'}
                                          </span>
                                        </button>

                                        {/* Mark Complete Button - Only shows when 95%+ watched */}
                                        {(() => {
                                          const watchedPercent = ytDuration > 0 ? (ytMaxWatched / ytDuration) * 100 : 0;
                                          const lessonId = getLessonKey(currentLesson);
                                          const isCompleted = lessonProgress[lessonId]?.isCompleted || lessonProgress[currentLesson.title]?.isCompleted;

                                          if (isCompleted) {
                                            return (
                                              <div className="bg-emerald-600/30 text-emerald-400 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 border border-emerald-500/30">
                                                <CheckCircle className="w-5 h-5" /> Completed ✓
                                              </div>
                                            );
                                          }

                                          if (watchedPercent >= VIDEO_COMPLETE_PCT) {
                                            return (
                                              <button
                                                onClick={async () => {
                                                  const progressData = { lessonId, completionPercentage: 100, isCompleted: true };
                                                  setLessonProgress(prev => {
                                                    const updated = { ...prev, [lessonId]: progressData };
                                                    if (currentLesson.title && currentLesson.title !== lessonId) {
                                                      updated[currentLesson.title] = progressData;
                                                    }
                                                    return updated;
                                                  });

                                                  try {
                                                    await api.patch('/player/sync', {
                                                      courseId,
                                                      moduleId: course?.modules[currentModuleIndex]?._id,
                                                      lessonId,
                                                      completionPercentage: 100,
                                                      status: 'completed'
                                                    });
                                                    loadProgress();
                                                    showToast('✅ Video completed! Next lesson unlocked.', 'info');

                                                    setTimeout(() => {
                                                      const mod = course?.modules[currentModuleIndex];
                                                      if (mod && currentLessonIndex < mod.lessons.length - 1) {
                                                        setCurrentLessonIndex(i => i + 1);
                                                      } else if (currentModuleIndex < (course?.modules.length || 0) - 1) {
                                                        setCurrentModuleIndex(i => i + 1);
                                                        setCurrentLessonIndex(0);
                                                      }
                                                    }, 500);
                                                  } catch (error) {
                                                    debugError('VIDEO', 'Failed to sync completion', error);
                                                    showToast('Marked complete locally. Will sync when online.', 'info');
                                                  }
                                                }}
                                                className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:shadow-emerald-500/30 transition-all hover:scale-105"
                                              >
                                                <CheckCircle className="w-5 h-5" />
                                                Mark Complete & Next →
                                              </button>
                                            );
                                          }

                                          // Not yet at 95%
                                          return (
                                            <div className="bg-gray-700/50 text-gray-400 px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 cursor-not-allowed border border-gray-600/50">
                                              <Lock className="w-4 h-4" />
                                              Watch {Math.round(95 - watchedPercent)}% more to complete
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Native HTML5 Video Player */}
                            {!videoError && !isYouTubeUrl(videoUrlToUse) && !isVimeoUrl(videoUrlToUse) && (
                              <div
                                ref={videoContainerRef}
                                className={`w-full bg-black rounded-lg overflow-hidden relative ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
                                style={{ aspectRatio: isFullscreen ? 'auto' : '16/9', height: isFullscreen ? '100vh' : 'auto' }}
                              >
                                {/* Native HTML5 Video Player with SCORM Compliance */}
                                {/* SCORM Compliance: Prevent forward seeking - only allow seeking to watched portions */}
                                <div className="w-full">
                                  {/* Compliance Badge */}
                                  <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg px-3 py-2 mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span className="text-amber-200 text-xs font-medium">
                                      Compliance Required: Video cannot be skipped. Watch progress: {Math.round((maxWatchedTime / (duration || 1)) * 100)}%
                                    </span>
                                  </div>

                                  {/* Video Element - Using native controls for reliable playback */}
                                  <div className="relative" style={{ aspectRatio: '16/9', backgroundColor: '#000' }}>
                                    <video
                                      ref={playerRef}
                                      src={videoUrlToUse}
                                      preload="auto"
                                      onTimeUpdate={() => {
                                        if (playerRef.current) {
                                          const current = playerRef.current.currentTime;
                                          const total = playerRef.current.duration || duration;

                                          setCurrentTime(current);

                                          // Update max watched time (SCORM compliance)
                                          if (current > maxWatchedTime) {
                                            setMaxWatchedTime(current);
                                          }

                                          const progressPercent = total > 0 ? (current / total) * 100 : 0;
                                          setPlayed(progressPercent / 100);

                                          // Update lesson progress
                                          const currentModule = course?.modules[currentModuleIndex];
                                          const currentLesson = currentModule?.lessons[currentLessonIndex];
                                          if (currentLesson && currentLesson.type === 'Video') {
                                            updateLessonProgress(currentLesson._id || currentLesson.title, {
                                              completionPercentage: progressPercent,
                                              isCompleted: progressPercent >= VIDEO_COMPLETE_PCT,
                                              currentPosition: current,
                                            });

                                            // Mark as completed only at the configured threshold
                                            if (progressPercent >= VIDEO_COMPLETE_PCT && !isReady) {
                                              handleVideoEnd();
                                            }
                                          }
                                        }
                                      }}
                                      onLoadedMetadata={() => {
                                        if (playerRef.current) {
                                          const totalDuration = playerRef.current.duration;
                                          setDuration(totalDuration);
                                          setVideoError(null); // Clear any previous errors
                                        }
                                      }}
                                      onCanPlay={() => {
                                        if (playerRef.current) {
                                          setIsReady(true);
                                          setVideoError(null);

                                          // Restore max watched time and total session time from progress if available
                                          const currentModule = course?.modules[currentModuleIndex];
                                          const currentLesson = currentModule?.lessons[currentLessonIndex];
                                          if (currentLesson) {
                                            const lessonProg = lessonProgress[currentLesson._id || currentLesson.title];
                                            if (lessonProg) {
                                              // Restore max watched time (bookmark position)
                                              // Parse SCORM location format (e.g., "time:305") to numeric value
                                              const resumePosition = parseSCORMLocation(lessonProg.currentPosition);
                                              if (resumePosition > 0) {
                                                setMaxWatchedTime(resumePosition);
                                                if (playerRef.current && playerRef.current.currentTime === 0) {
                                                  playerRef.current.currentTime = resumePosition;
                                                  showToast(`Resuming from ${formatTime(resumePosition)}`, 'info');
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }}
                                      onWaiting={() => {
                                        // Video is buffering
                                        setIsReady(false);
                                      }}
                                      onPlaying={() => {
                                        // Video started playing, definitely ready
                                        setIsReady(true);
                                        setPlaying(true);
                                      }}
                                      onEnded={() => {
                                        setPlaying(false);
                                        handleVideoEnd();
                                      }}
                                      onSeeking={() => {
                                        // COMPLIANCE: Prevent skipping ahead past watched content
                                        if (playerRef.current) {
                                          const attemptedTime = playerRef.current.currentTime;
                                          const allowedMax = maxWatchedTime + 0.5; // Small buffer for loading

                                          if (attemptedTime > allowedMax) {
                                            // Reset to max watched position
                                            playerRef.current.currentTime = maxWatchedTime;
                                            showToast('You cannot skip ahead. Please watch the video completely for compliance.', 'info');
                                          }
                                        }
                                      }}
                                      onSeeked={() => {
                                        // Double-check after seek completes (backup for compliance)
                                        if (playerRef.current && playerRef.current.currentTime > maxWatchedTime + 0.5) {
                                          playerRef.current.currentTime = maxWatchedTime;
                                        }
                                      }}
                                      onPlay={() => {
                                        setPlaying(true);
                                        setVideoError(null); // Clear errors when playing
                                        // Start session time tracking
                                        if (sessionStartTimeRef.current === null) {
                                          sessionStartTimeRef.current = Date.now();
                                        }
                                        handlePlay();
                                      }}
                                      onPause={() => {
                                        setPlaying(false);
                                        // Stop session time tracking
                                        if (sessionStartTimeRef.current !== null) {
                                          const elapsed = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
                                          setSessionTime(prev => prev + elapsed);
                                          sessionStartTimeRef.current = null;
                                        }
                                        handlePause();
                                      }}
                                      onError={(e) => {
                                        const video = e.currentTarget;
                                        // If crossOrigin is set and caused a CORS block, retry without it
                                        if (video.crossOrigin) {
                                          console.warn('[Video] Retrying without crossOrigin (possible CORS issue)');
                                          video.crossOrigin = '';
                                          video.removeAttribute('crossorigin');
                                          video.load();
                                          return;
                                        }
                                        if (video.error) {
                                          const errorMessage = getVideoErrorCodeMeaning(video.error.code);
                                          setVideoError(errorMessage);
                                          handleError({
                                            target: { error: video.error }
                                          });
                                        } else {
                                          setVideoError('Unknown video error occurred');
                                        }
                                      }}
                                      className="w-full h-full object-contain"
                                      controls={true}
                                      controlsList="nodownload"
                                      playsInline
                                      {...(currentLesson?.captions?.length ? { crossOrigin: 'anonymous' as const } : {})}
                                    >
                                      {currentLesson?.captions?.map((cap, idx) => (
                                        <track
                                          key={`${cap.language}-${idx}`}
                                          kind="subtitles"
                                          src={cap.url}
                                          srcLang={cap.language}
                                          label={cap.label}
                                          default={idx === 0}
                                        />
                                      ))}
                                    </video>

                                    {/* Completion Badge */}
                                    {duration > 0 && (currentTime / duration) * 100 >= VIDEO_COMPLETE_PCT && (
                                      <div className="absolute top-4 right-4 bg-gradient-to-r from-emerald-500 to-green-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg shadow-emerald-500/50 z-10 backdrop-blur-sm">
                                        ✓ Completed
                                      </div>
                                    )}
                                  </div>

                                  {/* Custom Controls - Glassmorphism */}
                                  <div className="bg-gradient-to-t from-black/80 to-gray-900/60 backdrop-blur-md p-4 space-y-3 border-t border-white/10">
                                    {/* Progress Bar with Watched/Unwatched Indication */}
                                    <div className="relative">
                                      <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={duration > 0 ? (currentTime / duration) * 100 : 0}
                                        onChange={(e) => {
                                          if (playerRef.current && duration > 0) {
                                            const seekTime = (parseFloat(e.target.value) / 100) * duration;

                                            // Only allow seeking backwards or to already watched portions
                                            if (seekTime <= maxWatchedTime) {
                                              playerRef.current.currentTime = seekTime;
                                            } else {
                                              // Snap back to max watched - cannot seek forward beyond watched content
                                              if (playerRef.current) {
                                                playerRef.current.currentTime = maxWatchedTime;
                                              }
                                            }
                                          }
                                        }}
                                        className="w-full h-3 rounded-full appearance-none cursor-pointer"
                                        style={{
                                          background: `linear-gradient(to right, 
                                #6366f1 0%, 
                                #8b5cf6 ${duration > 0 ? (maxWatchedTime / duration) * 100 : 0}%, 
                                rgba(255,255,255,0.1) ${duration > 0 ? (maxWatchedTime / duration) * 100 : 0}%, 
                                rgba(255,255,255,0.1) 100%)`,
                                        }}
                                      />
                                      {/* Current position indicator */}
                                      <div
                                        className="absolute top-0 w-1 h-3 bg-white rounded-sm pointer-events-none shadow-lg"
                                        style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                      />
                                    </div>

                                    <div className="text-xs text-gray-400 flex items-center gap-4">
                                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-r from-indigo-500 to-violet-500"></span> Watched</span>
                                      <span className="flex items-center gap-1">
                                        <span className="w-3 h-3 rounded bg-white/10 flex items-center justify-center">
                                          <svg className="w-2 h-2 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                          </svg>
                                        </span> Locked
                                      </span>
                                      <span className="ml-auto text-amber-400 font-medium flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                        </svg>
                                        Compliance Mode: No Skipping
                                      </span>
                                    </div>

                                    {/* Controls Row */}
                                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                      {/* Play/Pause Button */}
                                      <button
                                        onClick={() => {
                                          if (playerRef.current) {
                                            if (playing) {
                                              playerRef.current.pause();
                                              setPlaying(false);
                                            } else {
                                              playerRef.current.play();
                                              setPlaying(true);
                                            }
                                          }
                                        }}
                                        className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 shadow-lg ${playing
                                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-500/50'
                                          : 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 hover:shadow-emerald-500/50'
                                          } text-white hover:scale-105`}
                                      >
                                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        {playing ? 'Pause' : 'Play'}
                                      </button>

                                      {/* Time Display */}
                                      <div className="bg-white/10 backdrop-blur-sm text-white px-3 py-2 rounded-xl font-mono text-sm border border-white/10">
                                        {formatTime(currentTime)} / {formatTime(duration)}
                                      </div>

                                      {/* Speed Control Dropdown */}
                                      <div className="relative">
                                        <select
                                          value={playbackSpeed}
                                          onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                          className="bg-violet-500/20 text-violet-300 px-3 py-2 rounded-xl font-bold text-sm border border-violet-500/30 cursor-pointer appearance-none pr-8 hover:bg-violet-500/30 transition-colors"
                                          style={{ backgroundImage: 'none' }}
                                        >
                                          <option value={0.5} className="bg-gray-900">0.5x</option>
                                          <option value={0.75} className="bg-gray-900">0.75x</option>
                                          <option value={1} className="bg-gray-900">1x</option>
                                          <option value={1.25} className="bg-gray-900">1.25x</option>
                                          <option value={1.5} className="bg-gray-900">1.5x</option>
                                          <option value={1.75} className="bg-gray-900">1.75x</option>
                                          <option value={2} className="bg-gray-900">2x</option>
                                        </select>
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-violet-300 pointer-events-none text-xs">⚡</span>
                                      </div>

                                      {/* Progress Percentage */}
                                      <div className="hidden sm:block bg-indigo-500/20 text-indigo-300 px-3 py-2 rounded-xl font-bold text-sm border border-indigo-500/30">
                                        {duration > 0 ? ((currentTime / duration) * 100).toFixed(0) : '0'}%
                                      </div>

                                      {/* CC Toggle for S3 Videos */}
                                      <button
                                        onClick={() => {
                                          const newState = !captionsEnabled;
                                          setCaptionsEnabled(newState);
                                          if (playerRef.current) {
                                            const tracks = playerRef.current.textTracks;
                                            for (let i = 0; i < tracks.length; i++) {
                                              tracks[i].mode = newState ? 'showing' : 'hidden';
                                            }
                                          }
                                        }}
                                        className={`px-3 py-2 rounded-xl font-bold text-sm transition-all duration-300 border flex items-center gap-2 ${captionsEnabled
                                          ? 'bg-indigo-500/40 text-indigo-200 border-indigo-400/50'
                                          : 'bg-white/10 hover:bg-white/20 text-white border-white/10 hover:border-white/30'
                                          }`}
                                        title={captionsEnabled ? 'Disable Captions' : 'Enable Captions'}
                                      >
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM7.5 13.5c0 .28-.22.5-.5.5H5.5c-.28 0-.5-.22-.5-.5v-3c0-.28.22-.5.5-.5H7c.28 0 .5.22.5.5v.5h-1v-.25H5.75v2.5H6.5V13h1v.5zm4.5 0c0 .28-.22.5-.5.5h-1.5c-.28 0-.5-.22-.5-.5v-3c0-.28.22-.5.5-.5H11.5c.28 0 .5.22.5.5v.5h-1v-.25H10.25v2.5H11V13h1v.5z" />
                                        </svg>
                                        <span className="hidden sm:inline">CC</span>
                                      </button>

                                      {/* Fullscreen Button */}
                                      <button
                                        onClick={toggleFullscreen}
                                        className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl transition-all duration-300 border border-white/10 hover:border-white/30 flex items-center gap-2"
                                        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                                      >
                                        {isFullscreen ? (
                                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                                          </svg>
                                        ) : (
                                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                          </svg>
                                        )}
                                        <span className="hidden sm:inline text-sm">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
                                      </button>

                                      {/* Completion Status */}
                                      {duration > 0 && (currentTime / duration) * 100 >= VIDEO_COMPLETE_PCT && (
                                        <div className="bg-emerald-500/20 text-emerald-300 px-3 py-2 rounded-xl font-bold text-sm ml-auto border border-emerald-500/30 shadow-lg shadow-emerald-500/20">
                                          ✓ Complete
                                        </div>
                                      )}
                                    </div>

                                    {/* SCORM Compliance Info */}
                                    <div className="bg-white/5 backdrop-blur-sm text-emerald-300 p-3 rounded-xl text-xs font-mono border border-white/10">
                                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                        <div className="flex items-center gap-1.5"><span className="text-emerald-400">✅</span> SCORM Compliant</div>
                                        <div className="flex items-center gap-1.5"><span className="text-amber-400">🔒</span> Seek Protection</div>
                                        <div className="flex items-center gap-1.5"><span className="text-cyan-400">📊</span> Max: {formatTime(maxWatchedTime)}</div>
                                        <div className="flex items-center gap-1.5"><span className="text-indigo-400">🕐</span> Session: {formatTime(sessionTime)}</div>
                                        <div className={`flex items-center gap-1.5 ${duration > 0 && (currentTime / duration) * 100 >= VIDEO_COMPLETE_PCT ? 'text-emerald-400' : 'text-gray-400'}`}>
                                          {duration > 0 && (currentTime / duration) * 100 >= VIDEO_COMPLETE_PCT ? '✓ Complete' : `${(VIDEO_COMPLETE_PCT - (duration > 0 ? (currentTime / duration) * 100 : 0)).toFixed(0)}% to complete`}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })() : (currentLesson.type === 'SCORM' && (currentLesson.scormLaunchUrl || currentLesson.contentUrl)) ?
                      <div className="w-full h-full flex flex-col">
                        <iframe
                          ref={scormIframeRef}
                          className="flex-1 w-full border-0"
                          title="SCORM Content"
                          allow="fullscreen"
                          src={currentLesson.scormLaunchUrl || currentLesson.contentUrl}
                          onLoad={() => {
                            scormVersionRef.current = currentLesson.scormVersion || '1.2';
                            const lessonKey = currentLesson._id || currentLesson.title;
                            const savedProg = lessonProgress[lessonKey];
                            const initPayload: Record<string, string> = {};
                            if (savedProg?.suspendData) {
                              initPayload['cmi.suspend_data'] = savedProg.suspendData;
                            }
                            if (savedProg?.scormData && typeof savedProg.scormData === 'object') {
                              Object.assign(initPayload, savedProg.scormData as Record<string, string>);
                            }
                            if (user) {
                              initPayload['cmi.core.student_id'] = user._id || user.id || '';
                              initPayload['cmi.core.student_name'] = `${user.lastName || ''}, ${user.firstName || ''}`;
                              initPayload['cmi.learner_id'] = user._id || user.id || '';
                              initPayload['cmi.learner_name'] = `${user.firstName || ''} ${user.lastName || ''}`;
                            }
                            try {
                              scormIframeRef.current?.contentWindow?.postMessage(
                                { source: 'scorm-lms', type: 'init-data', data: initPayload },
                                '*',
                              );
                            } catch (e) { /* bridge handles it */ }
                          }}
                        />
                        {/* Fallback manual completion for SCORM when bridge doesn't fire */}
                        {(() => {
                          const scormLessonKey = currentLesson._id || currentLesson.title;
                          const scormProg = lessonProgress[scormLessonKey];
                          if (scormProg?.isCompleted) return null;
                          return (
                            <div className="px-4 py-2 bg-white/5 border-t border-white/10 flex items-center justify-between">
                              <span className="text-xs text-gray-400">
                                Finished the SCORM content? If progress didn't update automatically:
                              </span>
                              <button
                                onClick={() => {
                                  updateLessonProgress(scormLessonKey, {
                                    completionPercentage: 100,
                                    isCompleted: true,
                                  });
                                  showToast('SCORM lesson marked complete!', 'info');
                                }}
                                className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-all"
                              >
                                Mark as Complete
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                      : (currentLesson.type === 'PDF' && currentLesson.contentUrl) ?
                      <div className="w-full self-stretch min-h-0 overflow-hidden rounded-lg">
                        <PdfProgressViewer
                          key={currentLesson._id || currentLesson.title}
                          fileUrl={currentLesson.contentUrl}
                          courseId={courseId!}
                          lessonId={currentLesson._id || currentLesson.title}
                          title={currentLesson.title}
                          initialPage={resumeData?.lastPage || 1}
                          initialProgress={resumeData?.progress || 0}
                          initialScrollPosition={resumeData?.scrollPosition || 0}
                          onProgress={(pct) => {
                            updateLessonProgress(currentLesson._id || currentLesson.title, {
                              completionPercentage: pct,
                            });
                          }}
                          onComplete={() => {
                            debugLog('PDF', 'PDF lesson completed');
                            updateLessonProgress(currentLesson._id || currentLesson.title, {
                              completionPercentage: 100,
                              isCompleted: true,
                            });
                            loadProgress();
                          }}
                          onXAPIStatement={(verb, result) => {
                            sendXAPIStatement(
                              `http://adlnet.gov/expapi/verbs/${verb}`,
                              {
                                id: currentLesson.contentUrl || currentLesson._id || '',
                                name: currentLesson.title,
                                type: 'http://adlnet.gov/expapi/activities/file',
                              },
                              result,
                              'pdf'
                            );
                          }}
                        />
                      </div>
                      : (currentLesson.type === 'Audio' && currentLesson.contentUrl) ?
                      <AudioPlayerResource
                        audioUrl={currentLesson.contentUrl}
                        courseId={courseId!}
                        lessonId={currentLesson._id || currentLesson.title}
                        title={currentLesson.title}
                        initialTime={resumeData?.lastTime || 0}
                        onComplete={() => {
                          debugLog('AUDIO', 'Audio lesson completed');
                          updateLessonProgress(currentLesson._id || currentLesson.title, {
                            completionPercentage: 100,
                            isCompleted: true,
                          });
                          loadProgress();
                        }}
                        onXAPIStatement={(verb, result) => {
                          sendXAPIStatement(
                            `http://adlnet.gov/expapi/verbs/${verb}`,
                            {
                              id: currentLesson.contentUrl || currentLesson._id || '',
                              name: currentLesson.title,
                              type: 'http://adlnet.gov/expapi/activities/audio',
                            },
                            result,
                            'audio'
                          );
                        }}
                      />
                      : (currentLesson.type === 'Document' && currentLesson.contentUrl) ?
                      // ========================================
                      // SCORM DOCUMENT VIEWER (DOC/DOCX)
                      // Behavior: Scroll-based, free navigation
                      // Completion: Reading time + manual acknowledgment
                      // ========================================
                      <SCORMDocumentViewer
                        fileUrl={currentLesson.contentUrl}
                        courseId={courseId!}
                        lessonId={currentLesson._id || currentLesson.title}
                        title={currentLesson.title}
                        onComplete={() => {
                          debugLog('DOCUMENT', 'Document lesson completed (SCORM)');
                          updateLessonProgress(currentLesson._id || currentLesson.title, {
                            completionPercentage: 100,
                            isCompleted: true,
                          });
                          loadProgress();
                        }}
                        onXAPIStatement={(verb, result) => {
                          sendXAPIStatement(
                            `http://adlnet.gov/expapi/verbs/${verb}`,
                            {
                              id: currentLesson.contentUrl || currentLesson._id || '',
                              name: currentLesson.title,
                              type: 'http://adlnet.gov/expapi/activities/media',
                            },
                            result,
                            'document'
                          );
                        }}
                      />
              : (currentLesson.type === 'PPT' || currentLesson.type === 'Slides') && currentLesson.slideUrls && currentLesson.slideUrls.length > 0 ?
                      // ========================================
                      // SCORM PRESENTATION VIEWER (PPT with converted slides)
                      // Behavior: Slide-based, NO scroll, Next/Prev ONLY
                      // Completion: Only when last slide is viewed
                      // Jumping to arbitrary slides: DISABLED
                      // ========================================
                      <SCORMPresentationViewer
                        slideUrls={currentLesson.slideUrls}
                        courseId={courseId!}
                        lessonId={currentLesson._id || currentLesson.title}
                        title={currentLesson.title}
                        initialSlide={0}
                        onComplete={() => {
                          debugLog('PPT', 'Presentation completed (SCORM-compliant)');
                          updateLessonProgress(currentLesson._id || currentLesson.title, {
                            completionPercentage: 100,
                            isCompleted: true,
                          });
                          loadProgress();
                        }}
                        onXAPIStatement={(verb, result) => {
                          sendXAPIStatement(
                            `http://adlnet.gov/expapi/verbs/${verb}`,
                            {
                              id: currentLesson.contentUrl || currentLesson._id || '',
                              name: currentLesson.title,
                              type: 'http://adlnet.gov/expapi/activities/media',
                            },
                            result,
                            'ppt'
                          );
                        }}
                      />
                      : (currentLesson.type === 'PPT' || currentLesson.type === 'Slides') && currentLesson.contentUrl ?
                      // ========================================
                      // FALLBACK: PPT without converted slides
                      // Uses Document viewer (Google Docs) as fallback
                      // Note: For full SCORM compliance, slides should be converted
                      // ========================================
                      <SCORMDocumentViewer
                        fileUrl={currentLesson.contentUrl}
                        courseId={courseId!}
                        lessonId={currentLesson._id || currentLesson.title}
                        title={`${currentLesson.title} (Presentation)`}
                        onComplete={() => {
                          debugLog('PPT', 'Presentation completed (fallback viewer)');
                          updateLessonProgress(currentLesson._id || currentLesson.title, {
                            completionPercentage: 100,
                            isCompleted: true,
                          });
                          loadProgress();
                        }}
                        onXAPIStatement={(verb, result) => {
                          sendXAPIStatement(
                            `http://adlnet.gov/expapi/verbs/${verb}`,
                            {
                              id: currentLesson.contentUrl || currentLesson._id || '',
                              name: currentLesson.title,
                              type: 'http://adlnet.gov/expapi/activities/media',
                            },
                            result,
                            'ppt'
                          );
                        }}
                      />
                      : (currentLesson.type === 'Text') ?
                      <div className="w-full max-w-4xl mx-auto p-6 h-full overflow-y-auto" ref={(el) => {
                        if (!el) return;
                        const handleScroll = () => {
                          const scrollPercent = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100) || 0;
                          const clampedPercent = Math.min(100, Math.max(0, scrollPercent));
                          if (clampedPercent > (lessonProgress[currentLesson._id || currentLesson.title]?.completionPercentage || 0)) {
                            updateLessonProgress(currentLesson._id || currentLesson.title, {
                              completionPercentage: clampedPercent,
                              isCompleted: clampedPercent >= 95,
                            });
                          }
                        };
                        el.addEventListener('scroll', handleScroll);
                        return () => el.removeEventListener('scroll', handleScroll);
                      }}>
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                          <h2 className="text-2xl font-bold text-white mb-4">{currentLesson.title}</h2>
                          {currentLesson.description && !currentLesson.content && (
                            <div className="prose prose-invert max-w-none">
                              <p className="text-gray-300 whitespace-pre-wrap">{currentLesson.description}</p>
                            </div>
                          )}
                          {currentLesson.content ? (
                            <div
                              className="prose prose-invert prose-lg max-w-none mt-4
                          prose-headings:text-white prose-p:text-gray-300 prose-strong:text-white
                          prose-a:text-indigo-400 prose-a:hover:text-indigo-300
                          prose-ul:text-gray-300 prose-ol:text-gray-300
                          prose-li:text-gray-300 prose-blockquote:text-gray-400
                          prose-code:text-indigo-300 prose-code:bg-white/10 prose-code:px-1 prose-code:rounded
                          prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10
                          prose-img:rounded-xl prose-img:shadow-lg prose-img:max-w-full
                          prose-table:text-gray-300 prose-th:text-white prose-td:border-white/10 prose-th:border-white/10"
                              dangerouslySetInnerHTML={{ __html: currentLesson.content }}
                            />
                          ) : currentLesson.description ? (
                            <div className="prose prose-invert max-w-none mt-4">
                              <p className="text-gray-300 whitespace-pre-wrap leading-relaxed text-lg">{currentLesson.description}</p>
                            </div>
                          ) : null}
                          <button
                            onClick={async () => {
                              updateLessonProgress(currentLesson._id || currentLesson.title, {
                                completionPercentage: 100,
                                isCompleted: true,
                              });
                              showToast('Lesson completed!', 'info');
                              await new Promise(resolve => setTimeout(resolve, 1500));
                              loadProgress();
                            }}
                            className="mt-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium px-6 py-3 rounded-xl shadow-lg transition-all duration-300"
                          >
                            Mark as Complete
                          </button>
                        </div>
                      </div>
                      : (currentLesson.type === 'Quiz') ?
                      showQuiz ? (
                      <div className="w-full h-full overflow-y-auto">
                        <ProctoredQuizWrapper
                          assessmentId={
                            currentLesson.assessmentId ||
                            (currentLesson as any)?.quizData?.id ||
                            currentLesson._id ||
                            `quiz-${currentModuleIndex}-${currentLessonIndex}`
                          }
                          courseId={courseId!}
                          lessonId={currentLesson?._id || currentLesson?.title}
                          quizTitle={currentLesson.title}
                          timeLimitMinutes={
                            (currentLesson as any)?.quizData?.settings?.timeLimit || undefined
                          }
                          retakeMode={retakeMode}
                          onComplete={async (result) => {
                            const quizLessonKey = getLessonKey(currentLesson);
                            setShowQuiz(false);
                            setRetakeMode(false);
                            setQuizAutoResumeBlockedForLesson(quizLessonKey);
                            // Remember the per-quiz passing score (creator-defined or default 75)
                            // for the post-attempt pass/fail display.
                            if (typeof result?.passingScore === 'number') {
                              setPassingScoreByLesson(prev => ({
                                ...prev,
                                [quizLessonKey]: result.passingScore,
                              }));
                            }
                            // Capture correct/wrong/total counts so the post-quiz card
                            // can show them ("12 correct / 3 wrong / 80%").
                            if (
                              typeof result?.correctCount === 'number' &&
                              typeof result?.totalQuestions === 'number'
                            ) {
                              setQuizResultByLesson(prev => ({
                                ...prev,
                                [quizLessonKey]: {
                                  correct: result.correctCount,
                                  wrong: typeof result.wrongCount === 'number' ? result.wrongCount : (result.totalQuestions - result.correctCount),
                                  total: result.totalQuestions,
                                },
                              }));
                            }
                            // `isCompleted` mirrors the pass result so the course's
                            // aggregate completion stays below 100% until the
                            // learner passes. `attempted` lets the post-quiz
                            // card detect "show score + retake" even on fail.
                            updateLessonProgress(quizLessonKey, {
                              completionPercentage: result.passed ? 100 : (result.percentage ?? 0),
                              isCompleted: !!result.passed,
                              attempted: true,
                            } as any);
                            const aid =
                              currentLesson.assessmentId ||
                              (currentLesson as any)?.quizData?.id;
                            if (aid) {
                              updateLessonProgress(String(aid), {
                                completionPercentage: result.percentage ?? 0,
                                isCompleted: !!result.passed,
                                attempted: true,
                              } as any);
                            }
                            await loadProgress();
                            setTimeout(async () => {
                              const latest = await loadProgress();
                              const pct = latest?.completionPercentage ?? 0;
                              // Only celebrate when the learner has actually passed
                              // the gating quiz — never show the "Course completed"
                              // popup on a failed attempt, even if every lesson is
                              // marked done.
                              if (pct >= 100 && result?.passed === true) {
                                setShowCourseCompleteModal(true);
                              }
                            }, 1200);
                          }}
                          onCancel={() => {
                            const quizLessonKey = getLessonKey(currentLesson);
                            setShowQuiz(false);
                            setQuizAutoResumeBlockedForLesson(quizLessonKey);
                          }}
                        />
                      </div>
                      ) : (
                      // Quiz ready / locked / completed states — light theme card.
                      <div className="w-full h-full flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
                        <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-xl max-w-md w-full text-center overflow-hidden">
                          <div className="absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-br from-indigo-200/60 to-violet-200/60 rounded-full blur-3xl pointer-events-none" />
                          <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-gradient-to-br from-emerald-200/40 to-cyan-200/40 rounded-full blur-3xl pointer-events-none" />
                          <div className="relative">
                          <div className="p-4 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl inline-block mb-4 shadow-sm">
                            <Award className="w-12 h-12 text-amber-500" />
                          </div>
                          {(() => {
                            const qp = findLessonProgress(currentLesson, currentModuleIndex, currentLessonIndex);
                            if (isQuizLocked(currentModuleIndex, currentLessonIndex)) {
                              return (
                                <>
                                  <div className="flex items-center justify-center gap-2 mb-3">
                                    <Lock className="w-5 h-5 text-amber-500" />
                                    <p className="text-amber-700 text-lg font-semibold">Quiz Locked</p>
                                  </div>
                                  <p className="text-gray-600 text-sm mb-5">
                                    Finish the previous lesson (100%) to unlock this quiz.
                                  </p>
                                  <div className="flex flex-col gap-3">
                                    {currentLessonIndex > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCurrentLessonIndex(currentLessonIndex - 1);
                                        }}
                                        className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-300"
                                      >
                                        Go to Previous Lesson
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        debugLog('QUIZ-REFRESH', 'Refreshing progress from server');
                                        await loadProgress();
                                        showToast('Progress refreshed. If lesson is complete, quiz will unlock.', 'info');
                                      }}
                                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-2 rounded-xl transition-all duration-300 text-sm"
                                    >
                                      Refresh Progress
                                    </button>
                                  </div>
                                </>
                              );
                            }
                            // Show the post-quiz score / retake card after any
                            // attempt — passed (`isCompleted=true`) OR failed
                            // (`attempted=true`, `isCompleted=false`).
                            if (qp?.isCompleted || (qp as any)?.attempted) {
                              // Use the assessment's creator-defined passing score when known,
                              // otherwise fall back to the default (75%).
                              const lessonKey = getLessonKey(currentLesson);
                              const passingScore = passingScoreByLesson[lessonKey] ?? DEFAULT_PASSING_SCORE;
                              const isPassed = (qp?.completionPercentage || 0) >= passingScore;
                              const counts = quizResultByLesson[lessonKey];
                              return (
                                <>
                                  <div className="flex items-center justify-center gap-2 mb-3">
                                    {isPassed ? (
                                      <CheckCircle className="w-10 h-10 text-emerald-500" />
                                    ) : (
                                      <AlertCircle className="w-10 h-10 text-amber-500" />
                                    )}
                                    <p className={`${isPassed ? 'text-emerald-700' : 'text-amber-700'} text-xl font-bold`}>
                                      {isPassed ? 'Quiz Passed' : 'Quiz Not Passed'}
                                    </p>
                                  </div>
                                  <p className="text-gray-600 text-sm mb-2">
                                    {isPassed
                                      ? 'You have successfully passed this assessment.'
                                      : `You did not meet the passing score (${passingScore}%) for this assessment.`}
                                  </p>
                                  {typeof qp?.completionPercentage === 'number' && (
                                    <div className={`mx-auto mb-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${isPassed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                      Your score: {Math.round(qp.completionPercentage)}%
                                    </div>
                                  )}
                                  {counts && (
                                    <div className="grid grid-cols-3 gap-2 mb-5 max-w-sm mx-auto">
                                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
                                        <div className="text-xl font-bold text-emerald-700 leading-tight">{counts.correct}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-semibold">Correct</div>
                                      </div>
                                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center">
                                        <div className="text-xl font-bold text-rose-700 leading-tight">{counts.wrong}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-rose-700/80 font-semibold">Wrong</div>
                                      </div>
                                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                                        <div className="text-xl font-bold text-gray-700 leading-tight">{counts.total}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total</div>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-3">
                                    {/* Retake is available for every quiz so the learner can improve their score. */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuizAutoResumeBlockedForLesson(null);
                                        setRetakeMode(true);
                                        setShowQuiz(true);
                                      }}
                                      className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02]"
                                    >
                                      Retake Quiz
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => router.push('/learner/dashboard')}
                                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-3 rounded-xl transition-all border border-gray-200"
                                    >
                                      Back to Dashboard
                                    </button>
                                  </div>
                                </>
                              );
                            }
                            return (
                              <>
                                <p className="text-gray-900 text-xl font-bold mb-3">
                                  Are you ready to start the quiz?
                                </p>
                                <p className="text-gray-600 text-sm mb-5">
                                  When you click Start Quiz, the assessment will begin. Make sure you're ready before continuing.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuizAutoResumeBlockedForLesson(null);
                                    setShowQuiz(true);
                                  }}
                                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02]"
                                >
                                  Start Quiz
                                </button>
                              </>
                            );
                          })()}
                          </div>
                        </div>
                      </div>
                      )
                      : currentLesson.content ? (
                      // Fallback for any lesson type that has HTML/text content
                      <div className="w-full max-w-4xl mx-auto p-6 h-full overflow-y-auto">
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                          <h2 className="text-2xl font-bold text-white mb-4">{currentLesson.title}</h2>
                          <div
                            className="prose prose-invert prose-lg max-w-none
                        prose-headings:text-white prose-p:text-gray-300 prose-strong:text-white
                        prose-a:text-indigo-400 prose-ul:text-gray-300 prose-ol:text-gray-300
                        prose-li:text-gray-300 prose-img:rounded-xl prose-img:max-w-full"
                            dangerouslySetInnerHTML={{ __html: currentLesson.content }}
                          />
                          <button
                            onClick={async () => {
                              updateLessonProgress(currentLesson._id || currentLesson.title, {
                                completionPercentage: 100,
                                isCompleted: true,
                              });
                              showToast('Lesson completed!', 'info');
                              await new Promise(resolve => setTimeout(resolve, 1500));
                              loadProgress();
                            }}
                            className="mt-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium px-6 py-3 rounded-xl shadow-lg transition-all duration-300"
                          >
                            Mark as Complete
                          </button>
                        </div>
                      </div>
                      ) : currentLesson.contentUrl ? (
                      // Generic content that has a URL but no specific renderer — use iframe
                      <div className="w-full h-full flex flex-col">
                        <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between">
                          <h3 className="text-sm font-medium text-gray-300">{currentLesson.title}</h3>
                          <a
                            href={currentLesson.contentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                          >
                            Open in new tab
                          </a>
                        </div>
                        <iframe
                          className="flex-1 w-full border-0"
                          src={currentLesson.contentUrl}
                          title={currentLesson.title}
                          allow="fullscreen"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                        <div className="px-4 py-2 bg-white/5 border-t border-white/10">
                          <button
                            onClick={async () => {
                              updateLessonProgress(currentLesson._id || currentLesson.title, {
                                completionPercentage: 100,
                                isCompleted: true,
                              });
                              showToast('Lesson completed!', 'info');
                              await new Promise(resolve => setTimeout(resolve, 1500));
                              loadProgress();
                            }}
                            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium px-4 py-2 rounded-xl shadow-lg transition-all duration-300 text-sm"
                          >
                            Mark as Complete
                          </button>
                        </div>
                      </div>
                      ) : (

                      <div className="text-center">
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                          <div className="p-4 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-xl inline-block mb-4">
                            <FileText className="w-12 h-12 text-indigo-400" />
                          </div>
                          <p className="text-gray-300 text-lg font-medium mb-2">Content not available</p>
                          <p className="text-gray-500 text-sm">This lesson&apos;s content couldn&apos;t be loaded.</p>
                          <p className="text-gray-600 text-xs mt-2">Lesson type: {currentLesson.type || 'unknown'}</p>
                        </div>
                      </div>
              )}
                    </>
            </div>
            </>
            ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                  <div className="p-4 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-xl inline-block mb-4">
                    <Play className="w-12 h-12 text-indigo-400" />
                  </div>
                  <p className="text-gray-300 text-lg font-medium mb-2">Select a lesson to begin</p>
                  <p className="text-gray-500 text-sm">Choose a lesson from the sidebar to start learning.</p>
                </div>
              </div>
            </div>
        )}
          </div>
      </div>
      );
};

      export default UniversalLMSPlayer;

