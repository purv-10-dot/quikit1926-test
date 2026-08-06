'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Star,
  Filter,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  BarChart3,
  BookOpen,
  ClipboardList,
  FlaskConical,
  BookMarked,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Submission {
  _id: string;
  homeworkId:
    | string
    | {
        _id: string;
        title: string;
        description?: string;
        type?: string;
        dueDate?: string;
        totalPoints?: number;
        instructions?: string;
      };
  status: 'pending' | 'submitted' | 'graded' | 'late';
  score?: number;
  feedback?: string;
  submittedAt?: string;
  createdAt?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-300' },
  submitted: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  graded: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  late: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  assignment: ClipboardList,
  quiz: FlaskConical,
  project: BookOpen,
  reading: BookMarked,
};

const TYPE_COLORS: Record<string, string> = {
  assignment: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  quiz: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  project: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  reading: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getHomeworkTitle = (hw: Submission['homeworkId']) => {
  if (typeof hw === 'object' && hw?.title) return hw.title;
  return 'Homework';
};

const getHomeworkField = <T,>(hw: Submission['homeworkId'], field: string, fallback: T): T => {
  if (typeof hw === 'object' && hw !== null && field in hw) return (hw as any)[field] ?? fallback;
  return fallback;
};

// ── Component ──────────────────────────────────────────────────────────────────

const HomeworkStatusPage = () => {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState('');

  // ── Load Children ─────────────────────────────────────────────────────────

  useEffect(() => {
    const loadChildren = async () => {
      try {
        const res = await api.get<any>('/credits/my-balance');
        const data = res.data;
        if (Array.isArray(data) && data.length > 0) {
          setChildren(data);
          setSelectedChild(data[0].studentId?.toString() || data[0].studentId);
        } else {
          // Learner role - fetch own submissions
          setSelectedChild('self');
        }
      } catch {
        setSelectedChild('self');
      }
    };
    loadChildren();
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedChild) return;
    const fetchSubmissions = async () => {
      try {
        setLoading(true);
        setError('');
        const params: any = {};
        if (selectedChild !== 'self') params.studentId = selectedChild;
        const res = await api.get<any>('/homework/student/submissions', { params });
        const resData = res;

        // Extract submitted homework
        const subs: Submission[] = Array.isArray(resData)
          ? resData
          : Array.isArray(resData.submissions)
          ? resData.submissions
          : resData.data ?? [];

        // Extract pending homework and convert to Submission-like objects
        const pendingHw: any[] = Array.isArray(resData.pending) ? resData.pending : [];
        const pendingItems: Submission[] = pendingHw.map((hw: any) => ({
          _id: `pending-${hw._id}`,
          homeworkId: {
            _id: hw._id,
            title: hw.title,
            description: hw.description,
            type: hw.type,
            dueDate: hw.dueDate,
            totalPoints: hw.maxScore ?? hw.totalPoints,
            instructions: hw.instructions,
          },
          status: 'pending' as const,
          score: undefined,
          feedback: undefined,
          submittedAt: undefined,
          createdAt: hw.createdAt,
        }));

        setSubmissions([...pendingItems, ...subs]);
      } catch (err: any) {
        setError(err?.message || 'Failed to load homework status');
      } finally {
        setLoading(false);
      }
    };
    fetchSubmissions();
  }, [selectedChild]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = submissions.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    return true;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalHomework = submissions.length;
  const completedCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'graded').length;
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const gradedSubs = submissions.filter((s) => s.status === 'graded' && s.score !== undefined);
  const averageScore =
    gradedSubs.length > 0
      ? gradedSubs.reduce((sum, s) => sum + (s.score || 0), 0) / gradedSubs.length
      : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Homework Status</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">{"Track your child's homework assignments and grades"}</p>
          </div>
        </div>
      </div>

      {/* Child Selector */}
      {children.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Select Child</label>
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {children.map((child: any) => (
              <option key={child.studentId} value={child.studentId}>
                {child.studentName} {child.grade ? `(Grade ${child.grade})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5 text-center">
          <BarChart3 className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{totalHomework}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Homework</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{completedCount}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Completed</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5 text-center">
          <Clock className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{pendingCount}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Pending</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5 text-center">
          <Star className="w-6 h-6 text-purple-500 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{averageScore > 0 ? averageScore.toFixed(1) : '—'}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Avg Score</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="graded">Graded</option>
            <option value="late">Late</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Homework Found</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {submissions.length === 0
              ? 'No homework has been assigned yet.'
              : 'Try adjusting your filter to see more results.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Homework</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">Type</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Due Date</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Submitted</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Score</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub, idx) => {
                  const hw = sub.homeworkId;
                  const title = getHomeworkTitle(hw);
                  const type = getHomeworkField(hw, 'type', '');
                  const dueDate = getHomeworkField(hw, 'dueDate', '');
                  const totalPoints = getHomeworkField(hw, 'totalPoints', 0) || getHomeworkField(hw, 'maxScore', 0);
                  const description = getHomeworkField(hw, 'description', '');
                  const statusStyle = STATUS_STYLES[sub.status] || STATUS_STYLES.pending;
                  const TypeIcon = TYPE_ICONS[type] || FileText;
                  const typeColor = TYPE_COLORS[type] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
                  const isExpanded = expandedId === sub._id;
                  const isOverdue = dueDate && sub.status === 'pending' && new Date(dueDate) < new Date();

                  return (
                    <>
                      <tr
                        key={sub._id}
                        onClick={() => setExpandedId(isExpanded ? null : sub._id)}
                        className={`border-b border-gray-50 dark:border-gray-700/50 transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                          idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-750/50'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isOverdue && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden sm:table-cell">
                          {type && (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${typeColor}`}>
                              <TypeIcon className="w-3.5 h-3.5" />
                              {type}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">
                          {formatDate(dueDate)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">
                          {sub.submittedAt ? formatDate(sub.submittedAt) : '—'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusStyle.bg} ${statusStyle.text}`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {sub.status === 'graded' && sub.score !== undefined ? (
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {sub.score}{totalPoints ? `/${totalPoints}` : ''}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400 mx-auto" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400 mx-auto" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr key={`${sub._id}-detail`} className="bg-indigo-50/50 dark:bg-indigo-900/10">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="space-y-3">
                              {description && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                                    Description
                                  </h4>
                                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{description}</p>
                                </div>
                              )}
                              {sub.status === 'graded' && sub.feedback && (
                                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-600">
                                  <div className="flex items-start gap-2">
                                    <MessageSquare className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                                    <div>
                                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                                        Teacher Feedback
                                      </h4>
                                      <p className="text-sm text-gray-700 dark:text-gray-300">{sub.feedback}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {!description && !(sub.status === 'graded' && sub.feedback) && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No additional details available.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeworkStatusPage;
