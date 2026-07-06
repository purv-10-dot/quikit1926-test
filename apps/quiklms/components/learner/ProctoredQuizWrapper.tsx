'use client';
/**
 * ProctoredQuizWrapper — ported from the old QuikSkills frontend.
 *
 * Wraps a quiz in a proctored session:
 *   1. disclosure  — rules screen; "Accept & Start" opens a quiz-proctoring
 *                    session (POST /api/quiz-proctoring/start) and enters
 *                    fullscreen.
 *   2. quiz        — runs useQuizProctoringEngine (DOM-event capture) plus the
 *                    optional useFaceProctoring (MediaPipe webcam — degrades to
 *                    a no-op when @mediapipe/tasks-vision is not installed).
 *   3. submitted   — completes the session (POST /api/quiz-proctoring/:id/complete).
 *
 * The actual quiz UI is delegated to QuikSkill's QuizTakingComponent.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  Maximize,
  Eye,
  Lock,
  Monitor,
  Keyboard,
  MousePointer2,
  CheckCircle,
  Camera,
  Video,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useQuizProctoringEngine } from '@/hooks/useQuizProctoringEngine';
import { useFaceProctoring, type FaceStatus } from '@/hooks/useFaceProctoring';
import QuizTakingComponent from '@/components/learner/QuizTakingComponent';

interface ProctoredQuizWrapperProps {
  assessmentId: string;
  courseId: string;
  lessonId?: string;
  quizTitle?: string;
  timeLimitMinutes?: number;
  retakeMode?: boolean;
  onComplete: (result: unknown) => void;
  onCancel: () => void;
}

type Phase = 'disclosure' | 'quiz' | 'submitted';

const FACE_STATUS_LABEL: Record<FaceStatus, string> = {
  initializing: 'Loading...',
  unavailable: 'Camera off',
  ok: 'Face OK',
  no_face: 'No face',
  multiple: 'Multiple faces',
  looking_away: 'Look at camera',
  looking_down: 'Look at screen',
  eyes_closed: 'Eyes closed',
  too_far: 'Move closer',
  camera_error: 'Camera error',
};

const ProctoredQuizWrapper: React.FC<ProctoredQuizWrapperProps> = ({
  assessmentId,
  courseId,
  lessonId,
  quizTitle,
  timeLimitMinutes,
  retakeMode,
  onComplete,
  onCancel,
}) => {
  const [phase, setPhase] = useState<Phase>('disclosure');
  const [proctoringSessionId, setProctoringSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleWarning = useCallback((msg: string) => {
    setWarningMsg(msg);
    setViolationCount((c) => c + 1);
    setTimeout(() => setWarningMsg(null), 5000);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // DOM-event proctoring (tab/fullscreen/keyboard/clipboard).
  useQuizProctoringEngine({
    sessionId: proctoringSessionId,
    enabled: phase === 'quiz',
    onWarning: handleWarning,
  });

  // Optional face proctoring (no-op if MediaPipe is unavailable).
  const { videoRef, unavailable: faceUnavailable, cameraError, faceStatus } = useFaceProctoring({
    sessionId: proctoringSessionId,
    enabled: phase === 'quiz',
    onWarning: handleWarning,
  });

  const enterFullscreen = useCallback(() => {
    try {
      void document.documentElement.requestFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  const handleAcceptAndStart = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ data: { sessionId: string } }>('/quiz-proctoring/start', {
        assessmentId,
        courseId,
        timeLimitMinutes: timeLimitMinutes || undefined,
      });
      setProctoringSessionId(res.data.sessionId);
      enterFullscreen();
      setPhase('quiz');
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || 'Failed to start proctored quiz session');
    } finally {
      setLoading(false);
    }
  };

  const handleQuizComplete = async (result: unknown) => {
    if (proctoringSessionId) {
      try {
        await api.post(`/quiz-proctoring/${proctoringSessionId}/complete`);
      } catch (err) {
        console.error('Failed to complete proctoring session:', err);
      }
    }
    try {
      void document.exitFullscreen?.();
    } catch {
      /* ignore */
    }
    setPhase('submitted');
    onComplete(result);
  };

  const handleQuizCancel = () => {
    if (proctoringSessionId) {
      try {
        void api.post(`/quiz-proctoring/${proctoringSessionId}/complete`);
      } catch {
        /* ignore */
      }
    }
    try {
      void document.exitFullscreen?.();
    } catch {
      /* ignore */
    }
    onCancel();
  };

  const faceStatusColor =
    faceStatus === 'ok'
      ? 'border-green-500'
      : faceStatus === 'initializing' || faceStatus === 'unavailable'
        ? 'border-gray-500'
        : faceStatus === 'camera_error'
          ? 'border-gray-600'
          : 'border-red-500';

  // ─── Disclosure ──────────────────────────────────────────────────────────
  if (phase === 'disclosure') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        <div className="relative bg-white border border-gray-200 rounded-2xl shadow-xl max-w-2xl w-full p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Shield className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Proctored Quiz</h1>
              <p className="text-gray-500 text-sm">{quizTitle || 'Please read the following rules carefully'}</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 space-y-3">
            <h3 className="font-semibold text-amber-700 flex items-center gap-2 text-sm uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4" /> Quiz Rules & Proctoring Disclosure
            </h3>
            <div className="space-y-3">
              {[
                { icon: Monitor, text: <>This quiz uses <strong>proctoring</strong>. Your browser activity will be monitored and logged throughout.</> },
                { icon: Maximize, text: <>The quiz runs in <strong>fullscreen mode</strong>. Exiting fullscreen is recorded as a violation.</> },
                { icon: Eye, text: <><strong>Tab switching</strong>, window switching, and navigating away will be detected and flagged.</> },
                { icon: Lock, text: <><strong>Copy-paste</strong>, right-click, and keyboard shortcuts (Ctrl+C/V, PrintScreen) are disabled.</> },
                { icon: Camera, text: <>Your <strong>webcam</strong> may be active. Face detection monitors for absence, multiple people, and looking away from the screen.</>, highlight: true },
                { icon: Keyboard, text: <>All violations are logged for <strong>admin review</strong>. Repeated violations may result in quiz invalidation.</> },
                { icon: MousePointer2, text: <>Right-click and text selection are disabled throughout the quiz.</> },
              ].map(({ icon: Icon, text, highlight }: { icon: React.ComponentType<{ className?: string }>; text: React.ReactNode; highlight?: boolean }, i) => (
                <div key={i} className={`flex items-start gap-3 ${highlight ? 'bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 -mx-1' : ''}`}>
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${highlight ? 'text-indigo-500' : 'text-amber-500'}`} />
                  <p className={`text-sm ${highlight ? 'text-indigo-900' : 'text-amber-900'}`}>{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 flex items-start gap-2.5">
            <Video className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-blue-700 text-xs">
              If webcam proctoring is enabled, your browser will ask for camera permission when you click{' '}
              <strong>Accept & Start</strong>.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <button onClick={onCancel} className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-all text-sm font-medium">
              Go Back
            </button>
            <button
              onClick={handleAcceptAndStart}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl disabled:opacity-50 transition-all text-sm font-semibold shadow-md hover:shadow-lg"
            >
              <Shield className="w-4 h-4" />
              {loading ? 'Starting...' : 'Accept & Start Quiz'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Quiz ────────────────────────────────────────────────────────────────
  if (phase === 'quiz') {
    return (
      <div className="min-h-screen bg-gray-50 relative select-none" onContextMenu={(e) => e.preventDefault()} style={{ userSelect: 'none' }}>
        <div className="sticky top-0 z-40 px-4 sm:px-6 pt-4 pb-3 bg-gradient-to-b from-gray-50 via-gray-50 to-gray-50/0">
          <div className="mx-auto max-w-6xl flex items-center justify-between gap-3 flex-wrap rounded-xl bg-white border border-rose-200 shadow-sm px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <Shield className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span className="font-semibold text-gray-900 tracking-wide truncate">Proctored Quiz</span>
              <span className="hidden sm:inline text-gray-400">·</span>
              <span className="hidden sm:inline text-gray-500">Activity monitored</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!isFullscreen && (
                <button onClick={enterFullscreen} className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1 rounded-lg text-xs font-semibold transition-all">
                  <Maximize className="w-3.5 h-3.5" />
                  Return to Fullscreen
                </button>
              )}
              {violationCount > 0 && (
                <span className="bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md text-xs font-semibold">
                  {violationCount} violation{violationCount !== 1 ? 's' : ''}
                </span>
              )}
              <span className="text-gray-400 font-mono text-[11px] tracking-tight">#{proctoringSessionId?.slice(-6)}</span>
            </div>
          </div>
        </div>

        {!isFullscreen && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-rose-200 shadow-2xl px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 animate-bounce" />
              <div>
                <p className="font-bold text-sm text-gray-900">You have exited fullscreen mode</p>
                <p className="text-xs text-gray-500">This has been logged as a violation. Please return to fullscreen to continue.</p>
              </div>
            </div>
            <button onClick={enterFullscreen} className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg">
              <Maximize className="w-4 h-4" /> Return to Fullscreen
            </button>
          </div>
        )}

        <div>
          <QuizTakingComponent
            assessmentId={assessmentId}
            courseId={courseId}
            lessonId={lessonId}
            retakeMode={retakeMode}
            sessionId={proctoringSessionId || undefined}
            onComplete={handleQuizComplete}
            onCancel={handleQuizCancel}
          />
        </div>

        {/* Webcam preview — only shown when face proctoring is actually running */}
        {!faceUnavailable && (
          <div className="fixed bottom-6 left-6 z-[60]">
            <div className={`relative rounded-xl overflow-hidden border-2 shadow-2xl transition-colors ${faceStatusColor}`} style={{ width: 160, height: 120 }}>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                {cameraError ? 'Camera error' : FACE_STATUS_LABEL[faceStatus]}
              </div>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1 select-none">Camera monitoring active</p>
          </div>
        )}

        {warningMsg && (
          <div className="fixed bottom-6 right-6 z-[60] animate-bounce">
            <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 max-w-sm border border-white/20">
              <AlertTriangle className="w-6 h-6 relative flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Proctoring Alert</p>
                <p className="text-xs text-white/90">{warningMsg}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Submitted ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 sm:p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Quiz Submitted Successfully</h1>
        <p className="text-gray-500 mb-2">Your answers and proctoring data have been recorded.</p>
        {violationCount > 0 && (
          <p className="text-amber-600 text-sm mb-4">
            {violationCount} proctoring violation{violationCount !== 1 ? 's were' : ' was'} detected and will be reviewed by your administrator.
          </p>
        )}
        <button onClick={onCancel} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-medium">
          Return to Course
        </button>
      </div>
    </div>
  );
};

export default ProctoredQuizWrapper;
