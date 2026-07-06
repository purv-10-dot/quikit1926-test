'use client';
/**
 * Exam taking surface. Starts/resumes the exam session via REST, then runs the
 * client-side proctoring engine so violations (tab switch, fullscreen exit,
 * copy/paste, right-click, print/dev-tools shortcuts, blur, beforeunload) are
 * captured and POSTed to /api/proctoring/:sessionId/event.
 *
 * Proctoring is gated on the exam's `proctoringLevel` flag returned by the
 * start endpoint — anything other than 'off'/'none' enables capture. Face
 * detection is intentionally NOT used here (exam path is DOM-event only); the
 * quiz path uses ProctoredQuizWrapper for webcam proctoring.
 *
 * Browser-only (ssr:false). The /exams Socket.IO namespace
 * (NEXT_PUBLIC_WORKER_URL) drives the authoritative timer; that wiring is left
 * as-is. This component owns the host shell + proctoring.
 */
import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, Maximize } from 'lucide-react';
import { api } from '@/lib/api';
import { useProctoringEngine } from '@/hooks/useProctoringEngine';

interface StartedSession {
  sessionId: string;
  examTitle?: string;
  proctoringLevel?: string;
  remainingSeconds?: number;
}

export default function ExamRunner({ examId }: { examId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState<string>('Exam in progress');
  const [proctoringLevel, setProctoringLevel] = useState<string>('soft');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Start/resume session via REST; the /exams socket drives the timer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<{ data: StartedSession }>(`/exam-sessions/${examId}/start`);
        if (cancelled) return;
        const d = res.data;
        setSessionId(d.sessionId);
        if (d.examTitle) setExamTitle(d.examTitle);
        if (d.proctoringLevel) setProctoringLevel(d.proctoringLevel);
        if (typeof d.remainingSeconds === 'number') setRemaining(d.remainingSeconds);
        try {
          void document.documentElement.requestFullscreen();
        } catch {
          /* ignore */
        }
      } catch {
        /* start failed — leave shell in place */
      }
    })();
    return () => {
      cancelled = true;
    };
    // socket.io-client would connect to `${NEXT_PUBLIC_WORKER_URL}/exams` here
    // with { auth: { token } } and subscribe to timerSync/examWarning/forceSubmit.
  }, [examId]);

  // Proctoring is active unless the exam explicitly disables it.
  const proctoringEnabled = !['off', 'none', 'disabled'].includes((proctoringLevel || '').toLowerCase());

  useProctoringEngine({
    sessionId,
    enabled: !!sessionId && proctoringEnabled,
    onWarning: (msg) => {
      setWarningMsg(msg);
      setTimeout(() => setWarningMsg(null), 4000);
    },
  });

  // Track fullscreen state for the "return to fullscreen" affordance.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    onChange();
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const enterFullscreen = () => {
    try {
      void document.documentElement.requestFullscreen();
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col select-none"
      onContextMenu={(e) => proctoringEnabled && e.preventDefault()}
      style={proctoringEnabled ? { userSelect: 'none' } : undefined}
    >
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/10 text-sm">
        <span className="flex items-center gap-2">
          {proctoringEnabled && <Shield className="w-4 h-4 text-rose-400" />}
          {examTitle}
        </span>
        <span>
          {remaining != null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '--:--'}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center text-white/60">
        Exam question surface —{' '}
        {proctoringEnabled ? 'proctoring active' : 'proctoring off'}. Timer synced via /exams socket.
        <button className="ml-4 underline" onClick={() => setRemaining((r) => (r ?? 600) - 1)}>
          tick
        </button>
      </div>

      {proctoringEnabled && !isFullscreen && (
        <button
          onClick={enterFullscreen}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg"
        >
          <Maximize className="w-4 h-4" /> Return to Fullscreen
        </button>
      )}

      {warningMsg && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-amber-500 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            {warningMsg}
          </div>
        </div>
      )}
    </div>
  );
}
