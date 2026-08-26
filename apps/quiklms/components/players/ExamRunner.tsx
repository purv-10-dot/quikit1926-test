'use client';
/**
 * Exam taking surface — ported from the old QuikLMSs frontend
 * (`src/pages/ExamTakingPage.tsx`), which served the `/exam/:examId/take` route.
 *
 * This component previously had proctoring and a timer but **no question UI** —
 * it rendered the literal placeholder "Exam question surface —" beside a debug
 * `tick` button, so a learner could not answer an exam at all. The whole exams
 * module was unusable from the client (GAP_REPORT §4b).
 *
 * Three phases, as in the original:
 *   disclosure → the proctoring rules; the session is NOT started until the
 *                learner accepts. Starting on mount (as this file used to) would
 *                begin the server-authoritative timer before consent.
 *   exam       → question navigator + per-type answer surface + autosave.
 *   submitted  → confirmation.
 *
 * Browser-only (ssr:false) — it touches fullscreen and document events. Mounted
 * by `app/(fullscreen)/exam/[examId]/take/page.tsx`, which passes `examId` as a
 * prop; the original read it from the router.
 *
 * The /exams Socket.IO namespace is still not wired (the worker has no runtime —
 * §2.2), so the countdown is client-side, exactly as the original's was. The
 * server remains authoritative: `remainingSeconds` comes from `serverDeadline`
 * at start, and `/submit` re-checks it.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertTriangle,
  Shield,
  Maximize,
  CheckCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useProctoringEngine } from '@/hooks/useProctoringEngine';

interface ExamQuestion {
  _id: string;
  text: string;
  type: string;
  options?: { text: string; isCorrect?: boolean }[];
  points: number;
  order: number;
  imageUrl?: string;
}

interface SessionData {
  sessionId: string;
  examTitle: string;
  duration: number;
  totalMarks: number;
  proctoringLevel: string;
  instructions: string;
  questions: ExamQuestion[];
  answers: Record<string, AnswerValue>;
  remainingSeconds: number;
  status: string;
}

interface AnswerValue {
  selectedOptionIndices?: number[];
  textAnswer?: string;
  submittedAt?: Date;
}

type Phase = 'disclosure' | 'exam' | 'submitted';

export default function ExamRunner({ examId }: { examId: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('disclosure');
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The countdown effect fires handleSubmit, which is declared below it; a ref
  // keeps that call pointing at the latest closure without reordering the file.
  const submitRef = useRef<(forced?: boolean) => Promise<void>>(async () => {});

  const { save: manualSave } = useAutoSave({
    sessionId: session?.sessionId || null,
    answers,
    enabled: phase === 'exam',
  });

  // `=== 'soft'` is the original's exact gate (`ExamTakingPage.tsx:59`). The
  // LmsProctoringLevel enum is only `none | soft`, so this and a
  // not-in-['off','none'] blocklist are equivalent over the real value space.
  useProctoringEngine({
    sessionId: session?.sessionId || null,
    enabled: phase === 'exam' && session?.proctoringLevel === 'soft',
    onWarning: (msg) => {
      setWarningMsg(msg);
      setTimeout(() => setWarningMsg(null), 4000);
    },
  });

  const enterFullscreen = useCallback(() => {
    try {
      void document.documentElement.requestFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  // Track fullscreen for the "return to fullscreen" affordance (kept from the
  // previous shell — the original had no such prompt).
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    onChange();
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    setError('');
    try {
      enterFullscreen();
      const res = await api.post<{ data: SessionData }>(`/exam-sessions/${examId}/start`);
      const data = res.data;
      setSession(data);
      setAnswers(data.answers || {});
      setRemainingSeconds(data.remainingSeconds);
      setPhase('exam');
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || 'Failed to start exam');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = useCallback(
    async (forced = false) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await manualSave();
        await api.post(`/exam-sessions/${session!.sessionId}/submit`);
        setPhase('submitted');
        if (timerRef.current) clearInterval(timerRef.current);
        try {
          void document.exitFullscreen?.();
        } catch {
          /* ignore */
        }
      } catch (e: unknown) {
        // Legacy swallowed the error on a forced (timer-expiry) submit.
        if (!forced) alert((e as { message?: string })?.message || 'Submit failed');
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, manualSave, session],
  );

  submitRef.current = handleSubmit;

  // Countdown — auto-submits at zero.
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          void submitRef.current(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const currentQuestion = session?.questions[currentIndex];

  const updateAnswer = (questionId: string, value: Partial<AnswerValue>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...value, submittedAt: new Date() },
    }));
  };

  const answeredCount = useMemo(() => {
    if (!session) return 0;
    return session.questions.filter((q) => {
      const a = answers[q._id];
      if (!a) return false;
      if (a.selectedOptionIndices && a.selectedOptionIndices.length > 0) return true;
      if (a.textAnswer?.trim()) return true;
      return false;
    }).length;
  }, [answers, session]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // ─── Disclosure Screen ───
  if (phase === 'disclosure') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 sm:p-3 bg-amber-100 rounded-xl">
              <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Proctored Exam</h1>
              <p className="text-sm text-gray-500">Please read the following rules carefully</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 space-y-3">
            <h3 className="font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Exam Rules &amp; Proctoring Disclosure
            </h3>
            <ul className="text-sm text-amber-900 space-y-2">
              <li>1. This exam uses <strong>soft proctoring</strong>. Your browser activity will be monitored and logged.</li>
              <li>2. The exam will run in <strong>fullscreen mode</strong>. Exiting fullscreen will be logged as a violation.</li>
              <li>3. <strong>Tab switching</strong>, window switching, and navigating away will be detected and logged.</li>
              <li>4. <strong>Copy-paste</strong>, right-click, and keyboard shortcuts (Ctrl+C, Ctrl+V, PrintScreen) are disabled.</li>
              <li>5. Your answers are <strong>auto-saved every 30 seconds</strong>. If you disconnect, you can reconnect within the grace window.</li>
              <li>6. The timer is <strong>server-authoritative</strong>. The exam will be auto-submitted when time expires.</li>
              <li>7. All violations are logged for <strong>teacher review</strong>. No auto-disqualification — a human will review flagged behavior.</li>
            </ul>
          </div>

          {error && <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">{error}</p>}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={() => router.replace('/learner/exams')}
              className="px-5 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Go Back
            </button>
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <Maximize className="w-4 h-4" /> {loading ? 'Starting...' : 'Accept & Start Exam'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Submitted Screen ───
  if (phase === 'submitted') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-4 sm:p-6 lg:p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Exam Submitted!</h1>
          <p className="text-gray-500 mb-2">Your answers have been recorded successfully.</p>
          <p className="text-sm text-gray-400 mb-6">Results will be available once the teacher publishes them.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/learner/exams')}
              className="px-6 py-2.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50"
            >
              My Exams
            </button>
            <button
              onClick={() => router.push('/learner/dashboard')}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Exam Screen ───
  if (!session || !currentQuestion) return null;

  const isTimeLow = remainingSeconds < 300;

  return (
    <div
      className="min-h-screen bg-gray-100 flex flex-col select-none"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: 'none' }}
    >
      {/* Top Bar */}
      <div className="bg-white border-b px-3 sm:px-6 py-3 flex items-center justify-between flex-wrap gap-2 sticky top-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h1 className="font-semibold text-gray-900 text-sm sm:text-lg">{session.examTitle}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-sm text-gray-500">
            {answeredCount}/{session.questions.length} answered
          </span>
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${
              isTimeLow ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            {formatTime(remainingSeconds)}
          </div>
          <button
            onClick={() => setShowConfirmSubmit(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <Send className="w-4 h-4" /> Submit
          </button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Question Navigator */}
        <div className="w-20 bg-white border-r p-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1.5">
            {session.questions.map((q, i) => {
              const isAnswered =
                !!answers[q._id]?.selectedOptionIndices?.length || !!answers[q._id]?.textAnswer?.trim();
              return (
                <button
                  key={q._id}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-8 h-8 rounded text-xs font-medium flex items-center justify-center transition-colors ${
                    i === currentIndex
                      ? 'bg-indigo-600 text-white'
                      : isAnswered
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Content */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">
                Question {currentIndex + 1} of {session.questions.length}
              </span>
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                {currentQuestion.points} {currentQuestion.points === 1 ? 'point' : 'points'}
              </span>
            </div>

            {/* Question text is authored HTML (rich-text editor) — rendered as
                markup by the original. Preserved. */}
            <div
              className="text-lg text-gray-900 mb-6 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: currentQuestion.text }}
            />

            {currentQuestion.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentQuestion.imageUrl} alt="Question" className="max-w-md mb-6 rounded-lg border" />
            )}

            {/* MCQ / Multi-select */}
            {(currentQuestion.type === 'mcq' || currentQuestion.type === 'multi_select') && currentQuestion.options && (
              <div className="space-y-3">
                {currentQuestion.options.map((opt, oi) => {
                  const selected = answers[currentQuestion._id]?.selectedOptionIndices || [];
                  const isSelected = selected.includes(oi);
                  return (
                    <button
                      key={oi}
                      onClick={() => {
                        let newSelected: number[];
                        if (currentQuestion.type === 'mcq') {
                          newSelected = [oi];
                        } else {
                          newSelected = isSelected ? selected.filter((x: number) => x !== oi) : [...selected, oi];
                        }
                        updateAnswer(currentQuestion._id, { selectedOptionIndices: newSelected });
                      }}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                        <span className="text-gray-800">{opt.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* True/False */}
            {currentQuestion.type === 'true_false' && (
              <div className="flex gap-4">
                {['true', 'false'].map((val) => {
                  const isSelected = answers[currentQuestion._id]?.textAnswer === val;
                  return (
                    <button
                      key={val}
                      onClick={() => updateAnswer(currentQuestion._id, { textAnswer: val })}
                      className={`flex-1 p-4 rounded-xl border-2 text-center font-medium transition-all ${
                        isSelected ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Short Answer / Fill Blank / One Word */}
            {(currentQuestion.type === 'short_answer' ||
              currentQuestion.type === 'fill_blank' ||
              currentQuestion.type === 'one_word') && (
              <input
                value={answers[currentQuestion._id]?.textAnswer || ''}
                onChange={(e) => updateAnswer(currentQuestion._id, { textAnswer: e.target.value })}
                className="w-full border-2 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none"
                placeholder="Type your answer..."
              />
            )}

            {/* Match Column */}
            {currentQuestion.type === 'match_column' && (
              <textarea
                value={answers[currentQuestion._id]?.textAnswer || ''}
                onChange={(e) => updateAnswer(currentQuestion._id, { textAnswer: e.target.value })}
                rows={5}
                className="w-full border-2 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Enter matches (example: A-1, B-2, C-3)"
              />
            )}

            {/* Long Answer */}
            {currentQuestion.type === 'long_answer' && (
              <textarea
                value={answers[currentQuestion._id]?.textAnswer || ''}
                onChange={(e) => updateAnswer(currentQuestion._id, { textAnswer: e.target.value })}
                rows={8}
                className="w-full border-2 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Write your detailed answer..."
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            {currentIndex < session.questions.length - 1 ? (
              <button
                onClick={() => setCurrentIndex((i) => i + 1)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Send className="w-4 h-4" /> Review & Submit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Return-to-fullscreen affordance (kept from the previous shell). */}
      {session.proctoringLevel === 'soft' && !isFullscreen && (
        <button
          onClick={enterFullscreen}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg"
        >
          <Maximize className="w-4 h-4" /> Return to Fullscreen
        </button>
      )}

      {/* Proctoring Warning Toast */}
      {warningMsg && (
        <div className="fixed top-4 right-4 z-50 animate-pulse">
          <div className="bg-amber-500 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            {warningMsg}
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Submit Exam?</h2>
            <p className="text-gray-600 mb-4">
              You have answered <strong>{answeredCount}</strong> out of <strong>{session.questions.length}</strong>{' '}
              questions.
              {answeredCount < session.questions.length && (
                <span className="text-amber-600"> Some questions are unanswered.</span>
              )}
            </p>
            <p className="text-sm text-gray-400 mb-6">You cannot change your answers after submitting.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 px-4 py-2.5 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Continue Exam
              </button>
              <button
                onClick={() => {
                  setShowConfirmSubmit(false);
                  void handleSubmit();
                }}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
