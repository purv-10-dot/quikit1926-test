'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { ClipboardList, Clock, Play, Trophy, AlertTriangle, Calendar, ArrowLeft, X, CheckCircle2, XCircle, BarChart2, RotateCcw } from 'lucide-react';

interface MySession {
  _id: string;
  examId: string;
  status: string;
  score?: number;
  percentage?: number;
  passed?: boolean;
  startedAt?: string;
  endedAt?: string;
}

interface StudentExam {
  _id: string;
  title: string;
  subject?: string;
  duration: number;
  totalMarks: number;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  status: string;
  proctoringLevel: string;
  batchId?: { name: string; grade?: string };
  settings?: { passingScore: number };
  mySession?: MySession | null;
}

export default function StudentExamDashboard() {
  const { branding } = useBranding();
  const [exams, setExams] = useState<StudentExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [resultModal, setResultModal] = useState<StudentExam | null>(null);
  const router = useRouter();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const examsRes = await api.get<any>('/exams/student');
      const examsData = examsRes.data || [];
      setExams(examsData);
    } catch (err: any) {
      console.error('[StudentExamDashboard] Failed to fetch exams:', err);
      setError(err?.message || 'Failed to load exams. Please try again.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const now = new Date();
  const sessionStatus = (exam: StudentExam) => exam.mySession?.status || null;
  const hasSubmitted = (exam: StudentExam) => {
    const s = sessionStatus(exam);
    return s === 'submitted' || s === 'auto_submitted' || s === 'timed_out';
  };
  const timeEnded = (exam: StudentExam) =>
    exam.scheduledEndTime ? new Date(exam.scheduledEndTime) < now : false;
  const timeStarted = (exam: StudentExam) =>
    exam.scheduledStartTime ? new Date(exam.scheduledStartTime) <= now : true;

  const upcomingExams = exams.filter(e => {
    if (hasSubmitted(e)) return false;
    if (e.status === 'results_published') return false;
    if (e.status === 'draft') return false;
    if (timeEnded(e) && !sessionStatus(e)) return false;
    return true;
  });

  const pastExams = exams.filter(e => {
    if (e.status === 'draft') return false;
    if (hasSubmitted(e)) return true;
    if (e.status === 'results_published') return true;
    if (timeEnded(e) && !sessionStatus(e)) return true;
    return false;
  });

  const canTakeExam = (exam: StudentExam) => {
    if (hasSubmitted(exam)) return false;
    if (exam.status === 'draft') return false;
    if (!timeStarted(exam)) return false;
    if (timeEnded(exam)) return false;
    return true;
  };

  const getExamLabel = (exam: StudentExam): string => {
    const s = sessionStatus(exam);
    if (s === 'in_progress') return 'Resume Exam';
    if (!timeStarted(exam)) return 'Not Yet Started';
    if (timeEnded(exam)) return 'Exam Ended';
    return 'Unavailable';
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => router.push('/learner/dashboard')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 pt-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Premium Branded Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl border border-white/30">
              <ClipboardList className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
                My Exams
              </h1>
              <p className="opacity-90 text-sm sm:text-base lg:text-lg font-light">
                View upcoming exams and past results
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('upcoming')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'upcoming' ? 'text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          style={tab === 'upcoming' ? { backgroundColor: branding.primaryColor } : {}}
        >
          Upcoming ({upcomingExams.length})
        </button>
        <button
          onClick={() => setTab('past')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'past' ? 'text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          style={tab === 'past' ? { backgroundColor: branding.primaryColor } : {}}
        >
          Past Results ({pastExams.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-3">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 text-white rounded-lg text-sm transition shadow-md"
            style={{ backgroundColor: branding.primaryColor }}
          >
            Retry
          </button>
        </div>
      ) : tab === 'upcoming' ? (
        upcomingExams.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No upcoming exams</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {upcomingExams.map(exam => (
              <div key={exam._id} className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{exam.title}</h3>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      {exam.subject && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{exam.subject}</span>}
                      {exam.batchId && <span>{exam.batchId.name}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{exam.duration} min</span>
                      <span>Total: {exam.totalMarks} marks</span>
                      {exam.proctoringLevel === 'soft' && (
                        <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" />Proctored</span>
                      )}
                    </div>
                    {exam.scheduledStartTime && (
                      <p className="text-sm text-gray-400 mt-2">
                        Scheduled: {new Date(exam.scheduledStartTime).toLocaleString()}
                        {exam.scheduledEndTime && ` — ${new Date(exam.scheduledEndTime).toLocaleString()}`}
                      </p>
                    )}
                  </div>
                  <div>
                    {canTakeExam(exam) ? (
                      <button
                        onClick={() => router.push(`/exam/${exam._id}/take`)}
                        className="flex items-center gap-2 px-4 py-2 text-white rounded-lg transition shadow-md hover:scale-105"
                        style={{ backgroundColor: branding.primaryColor }}
                      >
                        {sessionStatus(exam) === 'in_progress' ? <><RotateCcw className="w-4 h-4" /> Resume Exam</> : <><Play className="w-4 h-4" /> Start Exam</>}
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-sm">
                        {getExamLabel(exam)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        pastExams.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No past exam results</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pastExams.map(exam => {
              const session = exam.mySession;
              const resultsPublished = exam.status === 'results_published';
              return (
                <div key={exam._id} className="bg-white border rounded-xl p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{exam.title}</h3>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1">
                        {exam.subject && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-xs">{exam.subject}</span>}
                        <span>Duration: {exam.duration} min</span>
                        <span>Total: {exam.totalMarks} marks</span>
                        {session?.endedAt && (
                          <span className="text-gray-400">Attempted: {new Date(session.endedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                      {resultsPublished && session && session.score != null && (
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-sm font-medium text-gray-700">
                            Score: <span className="font-bold" style={{ color: branding.primaryColor }}>{session.score}/{exam.totalMarks}</span>
                          </span>
                          <span className="text-sm text-gray-500">({session.percentage ?? 0}%)</span>
                          {session.passed != null && (
                            session.passed
                              ? <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />Passed</span>
                              : <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Failed</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {resultsPublished && session ? (
                        <button
                          onClick={() => setResultModal(exam)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5"
                        >
                          <BarChart2 className="w-4 h-4" /> View Result
                        </button>
                      ) : !session ? (
                        <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-sm">
                          {timeEnded(exam) ? 'Missed' : 'Not Attempted'}
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-sm">Awaiting Results</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Result Detail Modal */}
      {resultModal && resultModal.mySession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Exam Result</h2>
              <button onClick={() => setResultModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Exam</p>
                <p className="text-base font-semibold text-gray-900">{resultModal.title}</p>
                {resultModal.subject && <p className="text-sm text-indigo-600">{resultModal.subject}</p>}
              </div>

              <div className={`rounded-xl p-5 text-center ${resultModal.mySession.passed ? 'bg-green-50 border border-green-200' : resultModal.mySession.passed === false ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
                <p className="text-4xl font-bold mb-1" style={{ color: resultModal.mySession.passed ? '#16a34a' : resultModal.mySession.passed === false ? '#dc2626' : '#374151' }}>
                  {resultModal.mySession.score ?? '—'} / {resultModal.totalMarks}
                </p>
                <p className="text-xl font-semibold text-gray-700">{resultModal.mySession.percentage ?? 0}%</p>
                {resultModal.mySession.passed != null && (
                  <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-sm font-semibold ${resultModal.mySession.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {resultModal.mySession.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {resultModal.mySession.passed ? 'Passed' : 'Failed'}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Marks Obtained</p>
                  <p className="font-semibold text-gray-800">{resultModal.mySession.score ?? '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Total Marks</p>
                  <p className="font-semibold text-gray-800">{resultModal.totalMarks}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Passing Score</p>
                  <p className="font-semibold text-gray-800">{resultModal.settings?.passingScore ?? 40}%</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Percentage</p>
                  <p className="font-semibold text-gray-800">{resultModal.mySession.percentage ?? 0}%</p>
                </div>
              </div>

              {resultModal.mySession.endedAt && (
                <p className="text-xs text-gray-400 text-center">
                  Submitted: {new Date(resultModal.mySession.endedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setResultModal(null)}
                className="w-full py-2.5 text-white rounded-lg font-medium shadow-md transition-all hover:scale-[1.02]"
                style={{ backgroundColor: branding.primaryColor }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
