'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  Calendar,
  FileText,
  CheckCircle,
  LayoutDashboard,
  ChevronDown,
  User,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  XCircle,
  X,
  BarChart2,
} from 'lucide-react';
import { api } from '@/lib/api';

interface ChildBalance {
  studentId: string;
  studentName: string;
  grade?: string;
  available: number;
  totalPurchased: number;
  totalUsed: number;
}

interface ExamResult {
  sessionId: string;
  examId: string;
  examTitle: string;
  subject: string;
  totalMarks: number;
  score?: number;
  totalPoints?: number;
  percentage?: number;
  passed?: boolean;
  status: string;
  examStatus: string;
  teacherRemarks?: string;
  startedAt?: string;
  endedAt?: string;
  passingScore: number;
  resultsPublished: boolean;
}

const ParentDashboardPage = () => {
  const pathname = usePathname();
  const [children, setChildren] = useState<ChildBalance[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [showChildSelector, setShowChildSelector] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const [weekClasses, setWeekClasses] = useState(0);
  const [pendingHomework, setPendingHomework] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [resultModal, setResultModal] = useState<ExamResult | null>(null);

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (selectedChild) {
      loadChildData(selectedChild);
    }
  }, [selectedChild]);

  const loadInitialData = async () => {
    setError(null);
    try {
      const balanceRes = await api.get<any>('/credits/my-balance');
      const balanceData = balanceRes;

      if (Array.isArray(balanceData) && balanceData.length > 0) {
        setChildren(balanceData);
        setSelectedChild(balanceData[0].studentId);
      }
    } catch (err: any) {
      console.error('Failed to load parent data:', err);
      setError(err?.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadChildData = async (studentId: string) => {
    try {
      const child = children.find((c) => c.studentId === studentId);
      if (child) {
        setCreditsRemaining(child.available);
      }

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const [classesRes, homeworkRes, attendanceRes, examResultsRes] = await Promise.allSettled([
        api.get<any>('/scheduling/student/classes', {
          params: { studentId, startDate: startOfWeek.toISOString(), endDate: endOfWeek.toISOString() },
        }),
        api.get<any>('/homework/student/submissions', { params: { studentId } }),
        api.get<any>(`/attendance/student/${studentId}`, {
          params: {
            startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
            endDate: now.toISOString(),
          },
        }),
        api.get<any>(`/exam-sessions/student/${studentId}/results`),
      ]);

      if (classesRes.status === 'fulfilled') {
        const classes = (classesRes.value as any);
        setWeekClasses(Array.isArray(classes) ? classes.length : 0);
      }

      if (homeworkRes.status === 'fulfilled') {
        const data = (homeworkRes.value as any);
        setPendingHomework(data?.pending?.length || 0);
      }

      if (attendanceRes.status === 'fulfilled') {
        const records = (attendanceRes.value as any);
        if (Array.isArray(records) && records.length > 0) {
          setAttendanceRecords(records);
          const presentCount = records.filter(
            (r: any) => r.status === 'present' || r.status === 'late'
          ).length;
          setAttendanceRate(Math.round((presentCount / records.length) * 100));
        } else {
          setAttendanceRecords([]);
          setAttendanceRate(0);
        }
      }

      if (examResultsRes.status === 'fulfilled') {
        const results = (examResultsRes.value as any).data || [];
        setExamResults(Array.isArray(results) ? results.slice(0, 5) : []);
      } else {
        setExamResults([]);
      }
    } catch (error) {
      console.error('Failed to load child data:', error);
    }
  };

  const selectedChildInfo = children.find((c) => c.studentId === selectedChild);

  if (error && !children.length) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-3">{error}</p>
        <button
          onClick={loadInitialData}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white">
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Dashboard</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">
              Track your organization's performance
            </p>
          </div>
        </div>
      </div>

      {/* Child Selector */}
      {children.length > 0 && (
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowChildSelector(!showChildSelector)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {selectedChildInfo?.studentName || 'Select Child'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedChildInfo?.grade
                    ? `Grade ${selectedChildInfo.grade}`
                    : 'Choose a child to view their dashboard'}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-gray-400 transition-transform ${showChildSelector ? 'rotate-180' : ''}`}
            />
          </div>

          {showChildSelector && children.length > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
              {children.map((child) => (
                <button
                  key={child.studentId}
                  onClick={() => {
                    setSelectedChild(child.studentId);
                    setShowChildSelector(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    selectedChild === child.studentId
                      ? 'bg-indigo-50 dark:bg-indigo-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <span className="text-indigo-600 dark:text-indigo-400 text-sm font-bold">
                      {child.studentName.charAt(0)}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{child.studentName}</p>
                    <p className="text-xs text-gray-500">
                      {child.grade ? `Grade ${child.grade}` : ''} - {child.available} credits
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? '...' : creditsRemaining}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Available Credits</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? '...' : weekClasses}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Class Schedule</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-pink-50 dark:bg-pink-900/30 flex items-center justify-center">
              <FileText className="w-6 h-6 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? '...' : pendingHomework}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Homework</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? '...' : `${attendanceRate}%`}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Attendance Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Low Credit Warning */}
      {!loading && creditsRemaining <= 3 && (
        <div className="flex items-start gap-4 p-5 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-lg">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">Low Credit Balance</h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {selectedChildInfo?.studentName || 'Your child'} has only{' '}
              <strong>{creditsRemaining}</strong> credit{creditsRemaining !== 1 ? 's' : ''} remaining.
              Each class attended deducts 1 credit. Please contact the school administration to purchase
              more credits.
            </p>
            <Link
              href="/parent-dashboard/credits"
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition"
            >
              <CreditCard className="w-4 h-4" />
              View Credit Details
            </Link>
          </div>
        </div>
      )}

      {/* Exam Results Section */}
      {selectedChild && examResults.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Exam Results</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedChildInfo?.studentName}'s recent exam results
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {examResults.map((result) => (
              <div
                key={result.sessionId}
                className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{result.examTitle}</p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {result.subject && (
                      <span className="text-indigo-600 dark:text-indigo-400 text-xs">{result.subject}</span>
                    )}
                    {result.endedAt && (
                      <span>Attempted: {new Date(result.endedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                  {result.resultsPublished && result.score != null && (
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {result.score}/{result.totalPoints || result.totalMarks} marks (
                        {result.percentage ?? 0}%)
                      </span>
                      {result.passed != null &&
                        (result.passed ? (
                          <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Passed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </span>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {result.resultsPublished ? (
                    <button
                      onClick={() => setResultModal(result)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
                    >
                      <BarChart2 className="w-3.5 h-3.5" /> View
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded-lg text-xs">
                      Awaiting Results
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attendance Calendar Heatmap */}
      {selectedChild && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-500" />
            Attendance Heatmap —{' '}
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1"
              >
                {d}
              </div>
            ))}
            {(() => {
              const now = new Date();
              const year = now.getFullYear();
              const month = now.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const cells: React.ReactNode[] = [];

              for (let i = 0; i < firstDay; i++) {
                cells.push(<div key={`empty-${i}`} className="h-10" />);
              }

              for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = attendanceRecords.find((r: any) => {
                  const d = new Date(r.date || r.classDate || r.createdAt);
                  return (
                    d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
                  );
                });

                let bgColor = 'bg-gray-50 dark:bg-gray-700';
                let textColor = 'text-gray-400 dark:text-gray-500';
                let tooltip = 'No class';

                if (record) {
                  if (record.status === 'present') {
                    bgColor = 'bg-emerald-400 dark:bg-emerald-600';
                    textColor = 'text-white';
                    tooltip = 'Present';
                  } else if (record.status === 'late') {
                    bgColor = 'bg-amber-400 dark:bg-amber-600';
                    textColor = 'text-white';
                    tooltip = 'Late';
                  } else if (record.status === 'absent') {
                    bgColor = 'bg-red-400 dark:bg-red-600';
                    textColor = 'text-white';
                    tooltip = 'Absent';
                  } else if (record.status === 'excused') {
                    bgColor = 'bg-blue-300 dark:bg-blue-600';
                    textColor = 'text-white';
                    tooltip = 'Excused';
                  }
                }

                const isToday = day === now.getDate();

                cells.push(
                  <div
                    key={day}
                    title={`${dateStr}: ${tooltip}`}
                    className={`h-10 rounded-lg flex items-center justify-center text-xs font-medium ${bgColor} ${textColor} ${
                      isToday ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
                    } transition-all hover:scale-105 cursor-default`}
                  >
                    {day}
                  </div>
                );
              }

              return cells;
            })()}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-400" /> Present
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-400" /> Late
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-400" /> Absent
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-300" /> Excused
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-700" /> No Class
            </div>
          </div>
        </div>
      )}

      {/* Exam Result Detail Modal */}
      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Exam Result</h2>
              <button
                onClick={() => setResultModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Exam</p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {resultModal.examTitle}
                </p>
                {resultModal.subject && (
                  <p className="text-sm text-indigo-600 dark:text-indigo-400">{resultModal.subject}</p>
                )}
              </div>
              <div
                className={`rounded-xl p-5 text-center border ${
                  resultModal.passed
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : resultModal.passed === false
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                }`}
              >
                <p className="text-4xl font-bold mb-1 text-gray-900 dark:text-gray-100">
                  {resultModal.score ?? '—'} / {resultModal.totalPoints || resultModal.totalMarks}
                </p>
                <p className="text-xl font-semibold text-gray-600 dark:text-gray-300">
                  {resultModal.percentage ?? 0}%
                </p>
                {resultModal.passed != null && (
                  <div
                    className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-sm font-semibold ${
                      resultModal.passed
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {resultModal.passed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {resultModal.passed ? 'Passed' : 'Failed'}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Marks Obtained</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">
                    {resultModal.score ?? '—'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Total Marks</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">
                    {resultModal.totalPoints || resultModal.totalMarks}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Passing Score</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">
                    {resultModal.passingScore}%
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Percentage</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">
                    {resultModal.percentage ?? 0}%
                  </p>
                </div>
              </div>
              {resultModal.teacherRemarks && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-xs text-blue-500 mb-0.5">Teacher Remarks</p>
                  <p className="text-sm text-blue-800 dark:text-blue-300">{resultModal.teacherRemarks}</p>
                </div>
              )}
              {resultModal.endedAt && (
                <p className="text-xs text-gray-400 text-center">
                  Submitted: {new Date(resultModal.endedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setResultModal(null)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboardPage;
