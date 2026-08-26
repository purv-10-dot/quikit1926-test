'use client';
/**
 * SCORM-Compliant Presentation Viewer for PPT Files
 *
 * Ported from the old QuikLMSs frontend `src/components/learner/SCORMPresentationViewer.tsx`.
 *
 * MANDATORY BEHAVIORAL RULES:
 * - PPT files behave as SLIDE-BASED content (NOT scrollable)
 * - Navigation ONLY via Next/Previous buttons
 * - Jumping to arbitrary slides is DISABLED
 * - Completion ONLY when the last slide is viewed
 * - Progress = (current_slide_index / total_slides) * 100
 *
 * SCORM Data Model:
 * - SCORM 1.2: cmi.core.lesson_location stores last viewed slide
 * - SCORM 2004: cmi.location stores last viewed slide
 * - cmi.completion_status: 'incomplete' until last slide viewed
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, CheckCircle,
  AlertCircle, Clock, Maximize, Minimize, Presentation,
  Lock
} from 'lucide-react';
import { api } from '@/lib/api';

// Debug logging
const DEBUG_ENABLED = true;
const debugLog = (msg: string, data?: any) => {
  if (!DEBUG_ENABLED) return;
  console.log(`[SCORM-PPT] ${msg}`, data || '');
};

interface SCORMPresentationViewerProps {
  slideUrls: string[];
  courseId: string;
  lessonId: string;
  title?: string;
  initialSlide?: number;
  onComplete?: () => void;
  onXAPIStatement?: (verb: string, result?: any) => void;
}

interface SCORMState {
  lessonLocation: string;      // cmi.core.lesson_location / cmi.location - format: "slide:INDEX"
  completionStatus: 'incomplete' | 'completed';
  sessionTime: number;         // Session duration in seconds
  maxSlideReached: number;     // Highest slide index the learner has reached
}

// SCORM location format parser - extracts numeric value from "slide:X" format
const parseSlideLocation = (location: string | number | undefined): number => {
  if (typeof location === 'number') return location;
  if (!location) return 0;
  const match = String(location).match(/^slide:(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

const SCORMPresentationViewer: React.FC<SCORMPresentationViewerProps> = ({
  slideUrls,
  courseId,
  lessonId,
  title = 'Presentation',
  initialSlide = 0,
  onComplete,
  onXAPIStatement,
}) => {
  // Core state
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  const [maxSlideReached, setMaxSlideReached] = useState(initialSlide);
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasLaunched = useRef(false);

  const totalSlides = slideUrls.length;

  // ========================================
  // SCORM COMPLIANCE: Progress Calculation
  // Progress = (current_slide_index + 1) / total_slides * 100
  // Completion ONLY when last slide (index = totalSlides - 1) is viewed
  // ========================================

  const calculateProgress = useCallback((slideIndex: number, maxReached: number): number => {
    if (totalSlides === 0) return 0;
    // Progress is based on the maximum slide reached, not current position
    return Math.round(((maxReached + 1) / totalSlides) * 100);
  }, [totalSlides]);

  const isLastSlide = currentSlide === totalSlides - 1;
  const canGoNext = currentSlide < totalSlides - 1;
  const canGoPrev = currentSlide > 0;

  // ========================================
  // xAPI Statement Helper
  // ========================================
  const sendXAPI = useCallback((verb: string, result?: any) => {
    debugLog(`xAPI: ${verb}`, result);
    if (onXAPIStatement) {
      onXAPIStatement(verb, result);
    }
  }, [onXAPIStatement]);

  // ========================================
  // Session Time Tracking
  // ========================================
  useEffect(() => {
    sessionStartRef.current = Date.now();

    const interval = setInterval(() => {
      setSessionTime(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ========================================
  // SCORM: Launched Event on Mount
  // ========================================
  useEffect(() => {
    if (!hasLaunched.current && totalSlides > 0) {
      hasLaunched.current = true;
      debugLog('Presentation launched (SCORM)', { totalSlides, title });
      sendXAPI('launched');
      setLoading(false);

      // Initialize progress
      const initialProgress = calculateProgress(initialSlide, initialSlide);
      setProgress(initialProgress);
    }
  }, [totalSlides, title, sendXAPI, initialSlide, calculateProgress]);

  // ========================================
  // SCROLL PREVENTION - Critical for SCORM PPT compliance
  // PPT content MUST NOT be scrollable
  // ========================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Block ALL scroll events on the presentation container
    const preventScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Prevent wheel scrolling
    container.addEventListener('wheel', preventScroll, { passive: false });
    // Prevent touch scrolling
    container.addEventListener('touchmove', preventScroll, { passive: false });
    // Prevent keyboard scrolling (Page Up/Down, Home, End)
    const preventKeyScroll = (e: KeyboardEvent) => {
      const blockedKeys = ['PageUp', 'PageDown', 'Home', 'End'];
      if (blockedKeys.includes(e.key)) {
        e.preventDefault();
        return false;
      }
    };
    container.addEventListener('keydown', preventKeyScroll);

    return () => {
      container.removeEventListener('wheel', preventScroll);
      container.removeEventListener('touchmove', preventScroll);
      container.removeEventListener('keydown', preventKeyScroll);
    };
  }, []);

  // ========================================
  // KEYBOARD NAVIGATION - Only Arrow Keys for Next/Prev
  // ========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          if (canGoNext) goToNextSlide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (canGoPrev) goToPrevSlide();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) exitFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, isFullscreen, canGoNext, canGoPrev]);

  // ========================================
  // SCORM: Periodic Progress Sync
  // ========================================
  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      syncSCORMProgress();
    }, 15000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      // Final sync on unmount
      syncSCORMProgress();
    };
  }, []);

  // ========================================
  // SCORM: Sync Progress to Backend
  // ========================================
  const syncSCORMProgress = async () => {
    // SCORM-compliant lesson_location format: "slide:INDEX"
    const lessonLocationFormatted = `slide:${currentSlide}`;

    const scormState: SCORMState = {
      lessonLocation: lessonLocationFormatted,
      completionStatus: isCompleted ? 'completed' : 'incomplete',
      sessionTime,
      maxSlideReached,
    };

    debugLog('Syncing SCORM progress', scormState);

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
          max_slide_reached: maxSlideReached,
          total_slides: totalSlides,
          session_time: sessionTime,
          completion_status: isCompleted ? 'completed' : 'incomplete',
          last_accessed: new Date().toISOString(),
        }),
        status: isCompleted ? 'completed' : 'in_progress',
      });

      sendXAPI('progressed', {
        duration: `PT${sessionTime}S`,
        extensions: {
          'https://lms.example.com/xapi/extensions/slide': currentSlide + 1,
          'https://lms.example.com/xapi/extensions/totalSlides': totalSlides,
        },
      });
    } catch (err) {
      console.error('Failed to sync SCORM progress:', err);
    }
  };

  // ========================================
  // SCORM: Handle Completion
  // Completion is ONLY triggered when the LAST slide is viewed
  // ========================================
  const handleComplete = async () => {
    if (isCompleted) return; // Prevent duplicate completion

    debugLog('Presentation COMPLETED!', {
      finalSlide: currentSlide + 1,
      totalSlides,
      sessionTime
    });

    setIsCompleted(true);

    try {
      await api.post('/learner/complete-resource', {
        courseId,
        subModuleId: lessonId,
        type: 'ppt',
        percentViewed: 100,
        lastSlide: currentSlide,
        totalSlides,
        sessionTime,
      });

      sendXAPI('completed', {
        completion: true,
        success: true,
        duration: `PT${sessionTime}S`,
        extensions: {
          'https://lms.example.com/xapi/extensions/slide': currentSlide + 1,
          'https://lms.example.com/xapi/extensions/totalSlides': totalSlides,
        },
      });

      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error('Failed to mark presentation complete:', err);
    }
  };

  // ========================================
  // NAVIGATION: Next Slide (Controlled Progression)
  // ========================================
  const goToNextSlide = () => {
    if (!canGoNext) return;

    const nextSlide = currentSlide + 1;
    setCurrentSlide(nextSlide);
    setImageLoaded(false);

    // Update max slide reached
    if (nextSlide > maxSlideReached) {
      setMaxSlideReached(nextSlide);
    }

    // Update progress
    const newMaxReached = Math.max(nextSlide, maxSlideReached);
    const newProgress = calculateProgress(nextSlide, newMaxReached);
    setProgress(newProgress);

    debugLog('Navigated to NEXT slide', {
      slide: nextSlide + 1,
      progress: newProgress,
      isLast: nextSlide === totalSlides - 1
    });

    // SCORM COMPLIANCE: Check for completion when reaching last slide
    if (nextSlide === totalSlides - 1 && !isCompleted) {
      handleComplete();
    }
  };

  // ========================================
  // NAVIGATION: Previous Slide
  // ========================================
  const goToPrevSlide = () => {
    if (!canGoPrev) return;

    const prevSlide = currentSlide - 1;
    setCurrentSlide(prevSlide);
    setImageLoaded(false);

    debugLog('Navigated to PREVIOUS slide', { slide: prevSlide + 1 });
    // Note: Progress does NOT decrease when going back
  };

  // ========================================
  // Fullscreen Controls
  // ========================================
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

  // ========================================
  // Utility Functions
  // ========================================
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ========================================
  // RENDER: Loading State
  // ========================================
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

  // ========================================
  // RENDER: Error State
  // ========================================
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

  // ========================================
  // RENDER: Main Presentation Viewer
  // ========================================
  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-slate-900 text-white select-none ${
        isFullscreen ? 'fixed inset-0 z-50' : ''
      }`}
      style={{ overflow: 'hidden' }} // Prevent scrolling at container level
      tabIndex={0} // Enable keyboard focus
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Presentation className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold">{title}</h2>
          {isCompleted && (
            <span className="flex items-center gap-1 text-sm text-green-400 font-medium bg-green-400/10 px-2 py-1 rounded">
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

      {/* SCORM Compliance Notice */}
      <div className="bg-indigo-900/30 border-b border-indigo-700/50 px-4 py-2 text-center">
        <p className="text-xs text-indigo-300">
          <Lock className="w-3 h-3 inline mr-1" />
          SCORM-compliant presentation mode. Use Next/Previous buttons to navigate.
        </p>
      </div>

      {/* Slide Display - NO SCROLLING */}
      <div
        className="flex-1 flex items-center justify-center p-4 bg-black relative"
        style={{ overflow: 'hidden' }} // Critical: Prevent any scrolling
      >
        {/* Previous Button */}
        <button
          onClick={goToPrevSlide}
          disabled={!canGoPrev}
          className={`absolute left-4 z-10 p-4 rounded-full transition-all ${
            !canGoPrev
              ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              : 'bg-indigo-600/80 hover:bg-indigo-500 text-white shadow-lg'
          }`}
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        {/* Slide Image Container */}
        <div className="max-w-full max-h-full flex items-center justify-center relative">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          )}
          <img
            src={slideUrls[currentSlide]}
            alt={`Slide ${currentSlide + 1} of ${totalSlides}`}
            className={`max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setError(`Failed to load slide ${currentSlide + 1}`)}
            draggable={false} // Prevent drag
          />
        </div>

        {/* Next Button */}
        <button
          onClick={goToNextSlide}
          disabled={!canGoNext}
          className={`absolute right-4 z-10 p-4 rounded-full transition-all ${
            !canGoNext
              ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              : 'bg-indigo-600/80 hover:bg-indigo-500 text-white shadow-lg'
          }`}
          aria-label="Next slide"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      </div>

      {/* Controls Footer */}
      <div className="p-4 bg-slate-800 border-t border-slate-700">
        {/* Progress Indicator - Visual only, NO clicking */}
        <div className="flex gap-1 overflow-x-auto pb-3 mb-3 justify-center">
          {slideUrls.map((_, index) => (
            <div
              key={index}
              className={`flex-shrink-0 w-8 h-1.5 rounded-full transition-all ${
                index === currentSlide
                  ? 'bg-indigo-500 w-12'
                  : index <= maxSlideReached
                  ? 'bg-green-500/60'
                  : 'bg-slate-600'
              }`}
              title={`Slide ${index + 1}${index <= maxSlideReached ? ' (viewed)' : ' (not viewed)'}`}
            />
          ))}
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Previous Button */}
            <button
              onClick={goToPrevSlide}
              disabled={!canGoPrev}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                !canGoPrev
                  ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            {/* Next Button */}
            <button
              onClick={goToNextSlide}
              disabled={!canGoNext}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                !canGoNext
                  ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Slide Counter */}
            <span className="text-gray-400 text-sm font-mono">
              Slide {currentSlide + 1} / {totalSlides}
            </span>

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Completion Status */}
        {!isCompleted && (
          <div className="mt-3 text-center text-sm bg-amber-400/10 border border-amber-400/20 rounded-lg p-2">
            {isLastSlide ? (
              <span className="text-green-400">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                You&apos;ve reached the final slide. This lesson is now complete!
              </span>
            ) : (
              <span className="text-amber-400">
                <Lock className="w-4 h-4 inline mr-1" />
                Navigate through all slides to complete this lesson. ({totalSlides - currentSlide - 1} slides remaining)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SCORMPresentationViewer;
