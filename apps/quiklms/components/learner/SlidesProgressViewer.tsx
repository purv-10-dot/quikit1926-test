'use client';
/**
 * SlidesProgressViewer — ported from the old QuikSkills frontend
 * (src/components/learner/SlidesProgressViewer.tsx).
 *
 * Slide-based presentation viewer: no scrolling — Next/Prev (and thumbnail /
 * keyboard) navigation only. Progress is the fraction of distinct slides viewed;
 * the lesson completes once that reaches 95%, which for any deck is only
 * possible after reaching the last slide.
 *
 * SCORM lesson_location for slides uses the format "slide:INDEX" (e.g. "slide:5"),
 * sent both as currentPosition and inside suspendData on PATCH /api/player/sync.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Play, Pause, CheckCircle,
  AlertCircle, Clock, Maximize, Minimize, Presentation
} from 'lucide-react';
import { api } from '@/lib/api';

// Debug logging
const DEBUG_ENABLED = true;
const debugLog = (msg: string, data?: any) => {
  if (!DEBUG_ENABLED) return;
  console.log(`[SlidesViewer] ${msg}`, data || '');
};

interface SlidesProgressViewerProps {
  slideUrls: string[]; // Array of slide image URLs
  courseId: string;
  lessonId: string;
  title?: string;
  initialSlide?: number;
  onComplete?: () => void;
  onXAPIStatement?: (verb: string, result?: any) => void;
}

const SlidesProgressViewer: React.FC<SlidesProgressViewerProps> = ({
  slideUrls,
  courseId,
  lessonId,
  title = 'Presentation',
  initialSlide = 0,
  onComplete,
  onXAPIStatement,
}) => {
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  const [viewedSlides, setViewedSlides] = useState<Set<number>>(new Set([initialSlide]));
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState(5); // seconds per slide
  const [sessionTime, setSessionTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasLaunched = useRef(false);

  const totalSlides = slideUrls.length;

  // Send xAPI statement helper
  const sendXAPI = useCallback((verb: string, result?: any) => {
    debugLog(`xAPI: ${verb}`, result);
    if (onXAPIStatement) {
      onXAPIStatement(verb, result);
    }
  }, [onXAPIStatement]);

  // Track session time
  useEffect(() => {
    sessionStartRef.current = Date.now();

    const interval = setInterval(() => {
      setSessionTime(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Send launched xAPI on mount
  useEffect(() => {
    if (!hasLaunched.current && totalSlides > 0) {
      hasLaunched.current = true;
      debugLog('Slides launched', { totalSlides, title });
      sendXAPI('launched');
      setLoading(false);
    }
  }, [totalSlides, title, sendXAPI]);

  // Update progress when viewed slides change
  useEffect(() => {
    if (totalSlides > 0) {
      const newProgress = Math.round((viewedSlides.size / totalSlides) * 100);
      setProgress(newProgress);

      debugLog('Progress updated', {
        viewedSlides: viewedSlides.size,
        totalSlides,
        progress: newProgress
      });

      // Check completion at 95%
      if (newProgress >= 95 && !isCompleted) {
        setIsCompleted(true);
        handleComplete();
      }
    }
  }, [viewedSlides, totalSlides, isCompleted]);

  // Auto-play functionality
  useEffect(() => {
    if (isAutoPlaying) {
      autoPlayRef.current = setInterval(() => {
        goToNextSlide();
      }, autoPlayInterval * 1000);
    } else {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    }

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [isAutoPlaying, autoPlayInterval]);

  // Sync progress periodically
  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      syncSlidesProgress();
    }, 15000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      syncSlidesProgress();
    };
  }, [progress, currentSlide, sessionTime, viewedSlides]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToNextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevSlide();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, isFullscreen]);

  const syncSlidesProgress = async () => {
    // SCORM-compliant lesson_location format: "slide:INDEX"
    const lessonLocationFormatted = `slide:${currentSlide}`;

    debugLog('Syncing slides progress', { progress, currentSlide, sessionTime, lessonLocation: lessonLocationFormatted });

    try {
      await api.patch('/player/sync', {
        courseId,
        lessonId,
        completionPercentage: progress,
        currentPosition: lessonLocationFormatted, // SCORM format: "slide:X"
        suspendData: JSON.stringify({
          // SCORM 1.2: cmi.core.lesson_location
          // SCORM 2004: cmi.location
          lesson_location: lessonLocationFormatted, // SCORM format: "slide:X"
          currentSlide,
          viewedSlides: Array.from(viewedSlides),
          sessionTime,
          lastAccessed: new Date().toISOString()
        }),
        status: isCompleted ? 'completed' : 'in_progress'
      });

      sendXAPI('progressed', {
        duration: `PT${sessionTime}S`
      });
    } catch (err) {
      console.error('Failed to sync slides progress:', err);
    }
  };

  const handleComplete = async () => {
    debugLog('Slides completed!', { progress, sessionTime });

    try {
      await api.post('/learner/complete-resource', {
        courseId,
        subModuleId: lessonId,
        type: 'ppt',
        percentViewed: progress,
        lastSlide: currentSlide,
        sessionTime,
      });

      sendXAPI('completed', {
        completion: true,
        success: true,
        duration: `PT${sessionTime}S`
      });

      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error('Failed to complete slides:', err);
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < totalSlides) {
      setCurrentSlide(index);
      setViewedSlides(prev => new Set(prev).add(index));
      debugLog('Navigated to slide', { index, title: `Slide ${index + 1}` });
    }
  };

  const goToNextSlide = () => {
    if (currentSlide < totalSlides - 1) {
      goToSlide(currentSlide + 1);
    } else {
      setIsAutoPlaying(false);
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  };

  const toggleAutoPlay = () => {
    setIsAutoPlaying(!isAutoPlaying);
    debugLog(isAutoPlaying ? 'Auto-play stopped' : 'Auto-play started');
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading presentation...</p>
        </div>
      </div>
    );
  }

  if (error || totalSlides === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-center p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-400 font-semibold mb-2">{error || 'No slides available'}</p>
          <p className="text-gray-500 text-sm">Please check the presentation file.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-slate-900 text-white ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Presentation className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold">{title}</h2>
          {isCompleted && (
            <span className="flex items-center gap-1 text-sm text-green-400 font-medium">
              <CheckCircle className="w-4 h-4" />
              Completed
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Clock className="w-4 h-4" />
            <span>{formatTime(sessionTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-32 bg-slate-700 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-300 min-w-[3rem]">
              {progress}%
            </span>
          </div>
        </div>
      </div>

      {/* Slide Display */}
      <div className="flex-1 flex items-center justify-center p-4 bg-black relative">
        {/* Previous Button */}
        <button
          onClick={goToPrevSlide}
          disabled={currentSlide === 0}
          className={`absolute left-4 z-10 p-3 rounded-full transition-all ${
            currentSlide === 0
              ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              : 'bg-slate-700/80 hover:bg-slate-600 text-white'
          }`}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Slide Image */}
        <div className="max-w-full max-h-full flex items-center justify-center">
          <img
            src={slideUrls[currentSlide]}
            alt={`Slide ${currentSlide + 1}`}
            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
            onLoad={() => setLoading(false)}
            onError={() => setError('Failed to load slide image')}
          />
        </div>

        {/* Next Button */}
        <button
          onClick={goToNextSlide}
          disabled={currentSlide === totalSlides - 1}
          className={`absolute right-4 z-10 p-3 rounded-full transition-all ${
            currentSlide === totalSlides - 1
              ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              : 'bg-slate-700/80 hover:bg-slate-600 text-white'
          }`}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Controls */}
      <div className="p-4 bg-slate-800 border-t border-slate-700">
        {/* Slide Thumbnails */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
          {slideUrls.map((url, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`flex-shrink-0 w-20 h-14 rounded overflow-hidden border-2 transition-all ${
                currentSlide === index
                  ? 'border-indigo-500 ring-2 ring-indigo-500/50'
                  : viewedSlides.has(index)
                  ? 'border-green-500/50 opacity-80'
                  : 'border-slate-600 opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={url}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {viewedSlides.has(index) && (
                <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Auto-play toggle */}
            <button
              onClick={toggleAutoPlay}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isAutoPlaying
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
              }`}
            >
              {isAutoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span className="text-sm font-medium">
                {isAutoPlaying ? 'Stop' : 'Auto-play'}
              </span>
            </button>

            {/* Auto-play speed */}
            <select
              value={autoPlayInterval}
              onChange={(e) => setAutoPlayInterval(Number(e.target.value))}
              className="bg-slate-700 text-gray-300 text-sm px-3 py-2 rounded-lg"
            >
              <option value={3}>3s per slide</option>
              <option value={5}>5s per slide</option>
              <option value={10}>10s per slide</option>
              <option value={15}>15s per slide</option>
            </select>
          </div>

          <div className="flex items-center gap-4">
            {/* Slide Counter */}
            <span className="text-gray-400 text-sm">
              Slide {currentSlide + 1} of {totalSlides}
            </span>

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Completion Warning */}
        {progress < 95 && !isCompleted && (
          <div className="mt-3 text-center text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-2">
            Please view at least 95% of the slides to proceed to the next lesson.
          </div>
        )}
      </div>
    </div>
  );
};

export default SlidesProgressViewer;
