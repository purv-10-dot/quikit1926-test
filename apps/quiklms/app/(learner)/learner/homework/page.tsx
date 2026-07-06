'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle,
  Star,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  BarChart3,
  BookOpen,
  ClipboardList,
  FlaskConical,
  BookMarked,
  AlertTriangle,
  Send,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { uploadViaPresign } from '@/lib/upload-client';
import { useBranding } from '@/app/providers';

// ── Types ──────────────────────────────────────────────────────────────────────

interface HomeworkItem {
  _id: string;
  title: string;
  description?: string;
  instructions?: string;
  type?: string;
  dueDate?: string;
  maxScore?: number;
  status?: string;
  batchId?: { _id: string; name: string; subject?: string; grade?: string } | string;
  teacherId?: { firstName?: string; lastName?: string } | string;
  allowLateSubmission?: boolean;
  attachmentUrls?: string[];
  resourceLinks?: { url: string; label: string }[];
}

interface Submission {
  _id: string;
  homeworkId: HomeworkItem | string;
  status: 'submitted' | 'graded' | 'returned';
  score?: number;
  feedback?: string;
  textResponse?: string;
  attachmentUrls?: string[];
  submittedAt?: string;
  isLate?: boolean;
  gradedBy?: { firstName?: string; lastName?: string } | string;
}

type ActiveTab = 'pending' | 'submissions';

const TYPE_ICONS: Record<string, React.ElementType> = {
  assignment: ClipboardList,
  quiz: FlaskConical,
  project: BookOpen,
  reading: BookMarked,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const getFileName = (url: string, fallback = 'Attachment') => {
  try {
    const path = new URL(url).pathname;
    const raw = decodeURIComponent(path.split('/').pop() || fallback);
    return raw.replace(/^\d+-/, '');
  } catch {
    return fallback;
  }
};

const formatDate = (d?: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getBatchName = (batch: HomeworkItem['batchId']) => {
  if (typeof batch === 'object' && batch !== null) return batch.name || 'Unknown';
  return '';
};

const getTeacherName = (teacher: HomeworkItem['teacherId']) => {
  if (typeof teacher === 'object' && teacher !== null) {
    return [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || 'Teacher';
  }
  return '';
};

const getHomeworkFromSubmission = (sub: Submission): HomeworkItem | null => {
  if (typeof sub.homeworkId === 'object' && sub.homeworkId !== null) return sub.homeworkId;
  return null;
};

// ── Component ──────────────────────────────────────────────────────────────────

const LearnerHomeworkPage = () => {
  const { branding } = useBranding();
  const [pending, setPending] = useState<HomeworkItem[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Submission modal state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<HomeworkItem | null>(null);
  const [textResponse, setTextResponse] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<any>('/homework/student/submissions');
      const data = res;

      const subs: Submission[] = Array.isArray(data.submissions) ? data.submissions : [];
      const pend: HomeworkItem[] = Array.isArray(data.pending) ? data.pending : [];

      setSubmissions(subs);
      setPending(pend);
    } catch (err: any) {
      setError(err?.message || 'Failed to load homework');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── Submit homework ────────────────────────────────────────────────────────

  const openSubmitModal = (hw: HomeworkItem) => {
    setSubmitTarget(hw);
    setTextResponse('');
    setAttachmentUrl('');
    setUploadedFiles([]);
    setSubmitError('');
    setSubmitModalOpen(true);
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    setSubmitError('');
    try {
      const fileUrl = await uploadViaPresign(file, '/upload/homework-resource');
      if (!fileUrl) throw new Error('No URL returned');
      setUploadedFiles((prev) => [...prev, fileUrl]);
    } catch {
      setSubmitError('File upload failed. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async () => {
    if (!submitTarget) return;
    const allAttachments = [...uploadedFiles, ...(attachmentUrl.trim() ? [attachmentUrl.trim()] : [])];
    if (!textResponse.trim() && allAttachments.length === 0) {
      setSubmitError('Please provide a text response or upload/attach a file.');
      return;
    }
    try {
      setSubmitting(true);
      setSubmitError('');
      const payload: any = {};
      if (textResponse.trim()) payload.textResponse = textResponse.trim();
      if (allAttachments.length > 0) payload.attachmentUrls = allAttachments;
      await api.post<any>(`/homework/${submitTarget._id}/submit`, payload);
      setSubmitModalOpen(false);
      fetchData();
    } catch (err: any) {
      setSubmitError(err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalAssigned = pending.length + submissions.length;
  const pendingCount = pending.length;
  const submittedCount = submissions.length;
  const gradedSubs = submissions.filter((s) => s.status === 'graded' && s.score !== undefined);
  const averageScore =
    gradedSubs.length > 0 ? gradedSubs.reduce((sum, s) => sum + (s.score || 0), 0) / gradedSubs.length : 0;

  return (
    <>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
        {/* Premium Branded Header */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
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
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
                  Homework
                </h1>
                <p className="opacity-90 text-sm sm:text-base lg:text-lg font-light">
                  View assignments and submit work
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div
            className="bg-opacity-10 backdrop-blur-xl border border-opacity-30 rounded-2xl p-5 text-center"
            style={{ backgroundColor: `${branding.primaryColor}1a`, borderColor: `${branding.primaryColor}4d` }}
          >
            <BarChart3 className="w-6 h-6 mx-auto mb-2" style={{ color: branding.primaryColor }} />
            <p className="text-2xl sm:text-3xl font-bold text-black">{totalAssigned}</p>
            <p className="text-sm text-black/80 font-medium">Total Assigned</p>
          </div>
          <div className="bg-gradient-to-br from-amber-600/20 to-orange-600/20 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-5 text-center">
            <Clock className="w-6 h-6 text-amber-300 mx-auto mb-2" />
            <p className="text-2xl sm:text-3xl font-bold text-black">{pendingCount}</p>
            <p className="text-sm text-black/80 font-medium">Pending</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-600/20 to-green-600/20 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-5 text-center">
            <CheckCircle className="w-6 h-6 text-emerald-300 mx-auto mb-2" />
            <p className="text-2xl sm:text-3xl font-bold text-black">{submittedCount}</p>
            <p className="text-sm text-black/80 font-medium">Submitted</p>
          </div>
          <div
            className="bg-opacity-10 backdrop-blur-xl border border-opacity-30 rounded-2xl p-5 text-center"
            style={{ backgroundColor: `${branding.primaryColor}1a`, borderColor: `${branding.primaryColor}4d` }}
          >
            <Star className="w-6 h-6 mx-auto mb-2" style={{ color: branding.primaryColor }} />
            <p className="text-2xl sm:text-3xl font-bold text-black">{averageScore > 0 ? averageScore.toFixed(1) : '—'}</p>
            <p className="text-sm text-black/80 font-medium">Avg Score</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 bg-white border border-black/10 rounded-xl p-1 mb-8 w-fit shadow-sm">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'pending' ? 'text-white shadow-lg' : 'text-black/80 hover:bg-black/5'
            }`}
            style={
              activeTab === 'pending'
                ? { background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }
                : {}
            }
          >
            <Clock className="w-4 h-4" />
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'submissions' ? 'text-white shadow-lg' : 'text-black/80 hover:bg-black/5'
            }`}
            style={
              activeTab === 'submissions'
                ? { background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }
                : {}
            }
          >
            <CheckCircle className="w-4 h-4" />
            Submissions ({submittedCount})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: branding.primaryColor }} />
            <span className="ml-3 text-black/70">Loading...</span>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/30 rounded-2xl p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-medium">{error}</p>
          </div>
        ) : activeTab === 'pending' ? (
          /* ── Pending Tab ── */
          pending.length === 0 ? (
            <div className="bg-white border border-black/10 rounded-2xl p-12 text-center shadow-sm">
              <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-black mb-2">All caught up!</h3>
              <p className="text-black/70">You have no pending homework assignments.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map((hw) => {
                const isOverdue = hw.dueDate && new Date(hw.dueDate) < new Date();
                const TypeIcon = TYPE_ICONS[hw.type || ''] || FileText;
                const isExpanded = expandedId === hw._id;

                return (
                  <div
                    key={hw._id}
                    className="bg-white backdrop-blur-xl border rounded-2xl overflow-hidden transition-all shadow-sm"
                    style={{
                      borderColor: isOverdue ? '#fca5a5' : isExpanded ? branding.primaryColor : '#0000001a',
                      boxShadow: isExpanded ? `0 4px 6px -1px ${branding.primaryColor}1a` : undefined,
                    }}
                  >
                    <div
                      className="p-3 sm:p-5 cursor-pointer flex items-center justify-between flex-wrap gap-3"
                      onClick={() => setExpandedId(isExpanded ? null : hw._id)}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div
                          className={`p-2.5 rounded-xl ${isOverdue ? 'bg-red-500/20' : ''}`}
                          style={!isOverdue ? { backgroundColor: `${branding.primaryColor}20` } : {}}
                        >
                          <TypeIcon
                            className="w-5 h-5"
                            style={{ color: isOverdue ? '#fca5a5' : branding.primaryColor }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-base font-semibold text-black truncate">{hw.title}</h3>
                            {isOverdue && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" />
                                Overdue
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-black/65 mt-1">
                            {getBatchName(hw.batchId) && <span>{getBatchName(hw.batchId)}</span>}
                            {hw.type && <span className="capitalize">{hw.type}</span>}
                            <span>Due: {formatDate(hw.dueDate)}</span>
                            {hw.maxScore && <span>Max: {hw.maxScore} pts</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openSubmitModal(hw);
                          }}
                          className="text-white font-medium px-4 py-2 rounded-xl shadow-lg transition-all text-sm flex items-center gap-2 hover:scale-105"
                          style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
                        >
                          <Send className="w-4 h-4" />
                          Submit
                        </button>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-black/60" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-black/60" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-white/10 pt-4 space-y-3">
                        {hw.description && (
                          <div>
                            <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Description</h4>
                            <p className="text-sm text-black/85 whitespace-pre-wrap">{hw.description}</p>
                          </div>
                        )}
                        {hw.instructions && (
                          <div>
                            <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Instructions</h4>
                            <p className="text-sm text-black/85 whitespace-pre-wrap">{hw.instructions}</p>
                          </div>
                        )}
                        {hw.attachmentUrls && hw.attachmentUrls.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Attached Files</h4>
                            <div className="space-y-1.5">
                              {hw.attachmentUrls.map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                                >
                                  <FileText className="w-3.5 h-3.5 shrink-0" />
                                  {getFileName(url, `Attachment ${i + 1}`)}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {hw.resourceLinks && hw.resourceLinks.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Resource Links</h4>
                            <div className="space-y-1.5">
                              {hw.resourceLinks.map((link, i) => (
                                <a
                                  key={i}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                                >
                                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                  {link.label || link.url}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {getTeacherName(hw.teacherId) && (
                          <p className="text-xs text-black/60">Assigned by: {getTeacherName(hw.teacherId)}</p>
                        )}
                        {isOverdue && hw.allowLateSubmission && (
                          <p className="text-xs text-amber-400">Late submissions are accepted for this homework.</p>
                        )}
                        {isOverdue && !hw.allowLateSubmission && (
                          <p className="text-xs text-red-400">Late submissions are not accepted. Contact your teacher.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ── Submissions Tab ── */
          submissions.length === 0 ? (
            <div className="bg-white border border-black/10 rounded-2xl p-12 text-center shadow-sm">
              <FileText className="w-16 h-16 text-indigo-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-black mb-2">No submissions yet</h3>
              <p className="text-black/70">Submit your first homework from the Pending tab.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {submissions.map((sub) => {
                const hw = getHomeworkFromSubmission(sub);
                const title = hw?.title || 'Homework';
                const type = hw?.type || '';
                const dueDate = hw?.dueDate || '';
                const maxScore = hw?.maxScore || 0;
                const TypeIcon = TYPE_ICONS[type] || FileText;
                const isExpanded = expandedId === sub._id;

                const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
                  submitted: { bg: 'bg-blue-500/20 border-blue-500/30', text: 'text-blue-300', label: 'Submitted' },
                  graded: { bg: 'bg-emerald-500/20 border-emerald-500/30', text: 'text-emerald-300', label: 'Graded' },
                  returned: { bg: 'bg-amber-500/20 border-amber-500/30', text: 'text-amber-300', label: 'Returned' },
                };
                const sc = statusConfig[sub.status] || statusConfig.submitted;

                return (
                  <div
                    key={sub._id}
                    className="bg-white backdrop-blur-xl border border-black/10 hover:border-indigo-300 rounded-2xl overflow-hidden transition-all shadow-sm"
                  >
                    <div
                      className="p-5 cursor-pointer flex items-center justify-between"
                      onClick={() => setExpandedId(isExpanded ? null : sub._id)}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="p-2.5 rounded-xl bg-indigo-500/20">
                          <TypeIcon className="w-5 h-5 text-indigo-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold text-black truncate">{title}</h3>
                          <div className="flex items-center gap-3 text-xs text-black/65 mt-1">
                            {type && <span className="capitalize">{type}</span>}
                            <span>Due: {formatDate(dueDate)}</span>
                            <span>Submitted: {formatDate(sub.submittedAt)}</span>
                            {sub.isLate && <span className="text-amber-400 font-semibold">Late</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span
                          className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${sc.bg} ${sc.text}`}
                        >
                          {sc.label}
                        </span>
                        {sub.status === 'graded' && sub.score !== undefined && (
                          <span className="text-sm font-bold text-black bg-black/5 px-3 py-1 rounded-full">
                            {sub.score}
                            {maxScore ? `/${maxScore}` : ''}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-black/60" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-black/60" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-3">
                        {hw?.description && (
                          <div>
                            <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Description</h4>
                            <p className="text-sm text-black/85 whitespace-pre-wrap">{hw.description}</p>
                          </div>
                        )}
                        {sub.textResponse && (
                          <div className="bg-black/5 rounded-xl p-3 border border-black/10">
                            <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Your Response</h4>
                            <p className="text-sm text-black/85 whitespace-pre-wrap">{sub.textResponse}</p>
                          </div>
                        )}
                        {sub.attachmentUrls && sub.attachmentUrls.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Attachments</h4>
                            {sub.attachmentUrls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-indigo-400 hover:underline py-0.5"
                              >
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                {getFileName(url, `Attachment ${i + 1}`)}
                              </a>
                            ))}
                          </div>
                        )}
                        {sub.status === 'graded' && sub.feedback && (
                          <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
                            <div className="flex items-start gap-2">
                              <MessageSquare className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                              <div>
                                <h4 className="text-xs font-semibold text-black/70 uppercase tracking-wider mb-1">Teacher Feedback</h4>
                                <p className="text-sm text-black/85">{sub.feedback}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── Submit Modal ── */}
        {submitModalOpen && submitTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white border border-black/10 rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-black">Submit Homework</h2>
                  <p className="text-sm text-black/70 mt-0.5">{submitTarget.title}</p>
                </div>
                <button
                  onClick={() => setSubmitModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 transition"
                >
                  <X className="w-5 h-5 text-black/60" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {submitTarget.instructions && (
                  <div className="bg-black/5 rounded-xl p-3 border border-black/10">
                    <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1">Instructions</h4>
                    <p className="text-sm text-black/85 whitespace-pre-wrap">{submitTarget.instructions}</p>
                  </div>
                )}

                {submitTarget.attachmentUrls && submitTarget.attachmentUrls.length > 0 && (
                  <div className="bg-black/5 rounded-xl p-3 border border-black/10">
                    <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1.5">Attached Files</h4>
                    <div className="space-y-1.5">
                      {submitTarget.attachmentUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          {getFileName(url, `Attachment ${i + 1}`)}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {submitTarget.resourceLinks && submitTarget.resourceLinks.length > 0 && (
                  <div className="bg-black/5 rounded-xl p-3 border border-black/10">
                    <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider mb-1.5">Resource Links</h4>
                    <div className="space-y-1.5">
                      {submitTarget.resourceLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          {link.label || link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-black/70">
                  <span>Due: {formatDate(submitTarget.dueDate)}</span>
                  {submitTarget.maxScore && <span>Max Score: {submitTarget.maxScore}</span>}
                  {submitTarget.dueDate && new Date(submitTarget.dueDate) < new Date() && (
                    <span className="text-amber-400 font-semibold">Overdue</span>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1.5">Your Response</label>
                  <textarea
                    value={textResponse}
                    onChange={(e) => setTextResponse(e.target.value)}
                    rows={5}
                    placeholder="Type your answer here..."
                    className="w-full px-4 py-3 rounded-xl bg-white border border-black/15 text-black placeholder-black/40 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 transition resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1.5">Upload File (optional)</label>
                  <label
                    className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-white/20 text-sm cursor-pointer hover:border-indigo-500/50 hover:bg-white/5 transition ${
                      uploadingFile ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {uploadingFile ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-300" />
                    )}
                    <span className="text-black/70">{uploadingFile ? 'Uploading...' : 'Click to upload a file'}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                      }}
                      disabled={uploadingFile}
                    />
                  </label>
                  {uploadedFiles.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {uploadedFiles.map((url, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-sm text-indigo-400 bg-white/5 rounded-lg px-3 py-2"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate flex-1">{getFileName(url, `File ${i + 1}`)}</span>
                          <button
                            onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-black/50 hover:text-red-400 transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1.5">Or paste a link (optional)</label>
                  <input
                    type="text"
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-4 py-3 rounded-xl bg-white border border-black/15 text-black placeholder-black/40 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 transition"
                  />
                </div>

                {submitError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
                    {submitError}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10">
                <button
                  onClick={() => setSubmitModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-black/70 hover:bg-black/5 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg transition-all text-sm flex items-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default LearnerHomeworkPage;
