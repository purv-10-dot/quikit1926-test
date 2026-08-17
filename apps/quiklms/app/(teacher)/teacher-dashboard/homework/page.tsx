'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Filter,
  Edit3,
  Send,
  X,
  Loader2,
  AlertCircle,
  Eye,
  BookOpen,
  ClipboardList,
  FlaskConical,
  BookMarked,
  Clock,
  CheckCircle2,
  BarChart3,
  MessageSquare,
  Star,
  Lock,
  ToggleLeft,
  ToggleRight,
  Paperclip,
  Link,
  Download,
  ExternalLink,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '@/lib/api';
import { uploadFile } from '@/lib/upload-client';
import { MAX_HOMEWORK_BYTES, formatMaxSize } from '@/lib/constants/uploads';
import FilePreviewModal from '@/components/FilePreviewModal';
import { useBranding } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';

/** The real message off a thrown API error / upload failure, never a stand-in. */
const errorText = (err: unknown, fallback: string) =>
  (err as { message?: string })?.message || fallback;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Batch {
  _id: string;
  name: string;
}

interface ResourceLink {
  url: string;
  label?: string;
}

interface Homework {
  _id: string;
  title: string;
  description?: string;
  type: 'assignment' | 'quiz' | 'project' | 'reading';
  status: 'draft' | 'published' | 'closed';
  dueDate: string;
  totalPoints: number;
  instructions?: string;
  allowLateSubmission?: boolean;
  lateSubmissionPenalty?: number;
  batchId: string | { _id: string; name: string };
  submissionCount?: number;
  createdAt?: string;
  attachmentUrls?: string[];
  resourceLinks?: ResourceLink[];
}

interface Submission {
  _id: string;
  studentId: string | { _id: string; name: string; email?: string; firstName?: string; lastName?: string };
  status: 'pending' | 'submitted' | 'graded' | 'late';
  score?: number;
  feedback?: string;
  submittedAt?: string;
  content?: string;
  textResponse?: string;
  attachmentUrls?: string[];
  isLate?: boolean;
  correctedFileUrl?: string;
  richFeedback?: string;
}

interface HomeworkStats {
  total?: number;
  totalStudents?: number;
  submitted?: number;
  graded?: number;
  averageScore?: number;
  pending?: number;
}

interface HomeworkFormData {
  title: string;
  description: string;
  type: 'assignment' | 'quiz' | 'project' | 'reading';
  dueDate: string;
  totalPoints: number;
  instructions: string;
  allowLateSubmission: boolean;
  lateSubmissionPenalty: number;
  batchId: string;
  attachmentUrls: string[];
  resourceLinks: ResourceLink[];
}

const TYPE_STYLES: Record<string, { bg: string; icon: React.ElementType }> = {
  assignment: { bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: ClipboardList },
  quiz: { bg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: FlaskConical },
  project: { bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: BookOpen },
  reading: { bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: BookMarked },
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  closed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const SUBMISSION_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  graded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  late: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const emptyForm: HomeworkFormData = {
  title: '',
  description: '',
  type: 'assignment',
  dueDate: '',
  totalPoints: 100,
  instructions: '',
  allowLateSubmission: false,
  lateSubmissionPenalty: 10,
  batchId: '',
  attachmentUrls: [],
  resourceLinks: [],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getBatchName = (batchId: string | { _id: string; name: string }) => {
  if (typeof batchId === 'object' && batchId?.name) return batchId.name;
  return '';
};

const getBatchId = (batchId: string | { _id: string; name: string }) => {
  if (typeof batchId === 'object') return batchId._id;
  return batchId;
};

const getStudentName = (studentId: string | { _id: string; firstName?: string; lastName?: string; name?: string }) => {
  if (typeof studentId === 'object') {
    const full = `${studentId.firstName || ''} ${studentId.lastName || ''}`.trim();
    if (full) return full;
    if (studentId.name) return studentId.name;
    return 'Unknown Student';
  }
  return (typeof studentId === 'string' && studentId) ? studentId : 'Unknown Student';
};

// ── Component ──────────────────────────────────────────────────────────────────

const HomeworkPage = () => {
  const { branding } = useBranding();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');

  // Create/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [formData, setFormData] = useState<HomeworkFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Detail Modal
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<HomeworkStats>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Grading
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(0);
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [gradingSubmitting, setGradingSubmitting] = useState(false);
  const [correctedFileUrl, setCorrectedFileUrl] = useState('');
  const [richFeedback, setRichFeedback] = useState('');

  // File Upload
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');

  // Corrected-file upload, on the grading form
  const [uploadingCorrected, setUploadingCorrected] = useState(false);
  const [gradeError, setGradeError] = useState('');

  // In-app file preview — the file the teacher is currently looking at
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchHomework = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<any>('/homework/teacher');
      const raw = Array.isArray(res) ? res : res?.homework ?? res?.data ?? [];
      const data = raw.map((hw: any) => ({
        ...hw,
        totalPoints: hw.totalPoints ?? hw.maxScore ?? 100,
        lateSubmissionPenalty: hw.lateSubmissionPenalty ?? hw.latePenaltyPercent ?? 0,
      }));
      setHomework(data);
    } catch (err: unknown) {
      const e = err as any;
      setError(e?.message || 'Failed to load homework');
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await api.get<any>('/batches');
      const data = Array.isArray(res) ? res : res?.batches ?? res?.data ?? [];
      setBatches(data);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchHomework();
    fetchBatches();
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = homework.filter((h) => {
    if (statusFilter !== 'all' && h.status !== statusFilter) return false;
    if (batchFilter !== 'all' && getBatchId(h.batchId) !== batchFilter) return false;
    return true;
  });

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingHomework(null);
    setFormData(emptyForm);
    setFormError('');
    setUploadError('');
    setNewLinkUrl('');
    setNewLinkLabel('');
    setShowModal(true);
  };

  const openEdit = (hw: Homework) => {
    setEditingHomework(hw);
    setFormData({
      title: hw.title,
      description: hw.description || '',
      type: hw.type,
      dueDate: hw.dueDate ? hw.dueDate.slice(0, 10) : '',
      totalPoints: (hw as any).maxScore || hw.totalPoints || 100,
      instructions: hw.instructions || '',
      allowLateSubmission: hw.allowLateSubmission || false,
      lateSubmissionPenalty: (hw as any).latePenaltyPercent || hw.lateSubmissionPenalty || 10,
      batchId: getBatchId(hw.batchId),
      attachmentUrls: hw.attachmentUrls || [],
      resourceLinks: hw.resourceLinks || [],
    });
    setFormError('');
    setUploadError('');
    setNewLinkUrl('');
    setNewLinkLabel('');
    setShowModal(true);
  };

  /**
   * Attach a file to the homework being composed.
   *
   * Two things this deliberately does that it did not before:
   *
   *  1. CHECKS THE SIZE FIRST, against the same constant the route enforces
   *     (`MAX_HOMEWORK_BYTES`). Without it an over-limit file was uploaded in
   *     full and then refused with a 413 — the pattern `ResourceUploader` already
   *     avoids for course resources.
   *  2. SHOWS THE REAL ERROR. `catch { setUploadError('File upload failed.') }`
   *     threw the diagnosis away, so a 413, a 403, an unsupported type and a
   *     blocked cross-origin PUT were one indistinguishable message — which is
   *     why "the upload is broken" had no lead to follow. `uploadFileWithPreview`
   *     already classifies the bucket-CORS case into a sentence naming the cause;
   *     that sentence has to reach the screen.
   */
  const handleFileUpload = async (file: File) => {
    setUploadError('');
    if (file.size > MAX_HOMEWORK_BYTES) {
      setUploadError(
        `"${file.name}" is ${formatMaxSize(file.size)} — the limit is ${formatMaxSize(MAX_HOMEWORK_BYTES)}.`,
      );
      return;
    }
    setUploadingFile(true);
    try {
      const fileUrl = await uploadFile(file, '/upload/homework-resource');
      if (!fileUrl) throw new Error('Upload completed but no file URL came back.');
      setFormData((prev) => ({ ...prev, attachmentUrls: [...prev.attachmentUrls, fileUrl] }));
    } catch (err: unknown) {
      setUploadError(errorText(err, 'File upload failed. Please try again.'));
    } finally {
      setUploadingFile(false);
    }
  };

  const addResourceLink = () => {
    if (!newLinkUrl.trim()) return;
    try { new URL(newLinkUrl.trim()); } catch { setUploadError('Please enter a valid URL (including https://)'); return; }
    setFormData((prev) => ({
      ...prev,
      resourceLinks: [...prev.resourceLinks, { url: newLinkUrl.trim(), label: newLinkLabel.trim() || newLinkUrl.trim() }],
    }));
    setNewLinkUrl('');
    setNewLinkLabel('');
    setUploadError('');
  };

  const removeAttachment = (index: number) => {
    setFormData((prev) => ({ ...prev, attachmentUrls: prev.attachmentUrls.filter((_, i) => i !== index) }));
  };

  const removeResourceLink = (index: number) => {
    setFormData((prev) => ({ ...prev, resourceLinks: prev.resourceLinks.filter((_, i) => i !== index) }));
  };

  const getFileNameFromUrl = (url: string) => {
    try {
      const path = new URL(url).pathname;
      const raw = decodeURIComponent(path.split('/').pop() || url);
      return raw.replace(/^\d+-/, '');
    } catch { return url; }
  };

  const handleSubmitForm = async () => {
    if (!formData.title.trim()) {
      setFormError('Title is required');
      return;
    }
    if (!formData.batchId) {
      setFormError('Please select a batch');
      return;
    }
    /**
     * Due date is REQUIRED and was not checked here.
     *
     * `<input type="date">` submits `''` when untouched, the create schema's
     * `z.string()` accepted it, and the handler reached Prisma with
     * `new Date('')` — an Invalid Date. The teacher got "Invalid or incomplete
     * request body" with nothing pointing at the date, which is what made
     * homework creation look completely broken. `dateField` now refuses it
     * server-side too; this is the half that says which field.
     */
    if (!formData.dueDate) {
      setFormError('Please pick a due date');
      return;
    }
    try {
      setSubmitting(true);
      setFormError('');
      const payload = {
        title: formData.title,
        description: formData.description,
        type: formData.type,
        dueDate: formData.dueDate,
        maxScore: formData.totalPoints,
        instructions: formData.instructions,
        allowLateSubmission: formData.allowLateSubmission,
        latePenaltyPercent: formData.lateSubmissionPenalty,
        batchId: formData.batchId,
        attachmentUrls: formData.attachmentUrls,
        resourceLinks: formData.resourceLinks,
      };
      if (editingHomework) {
        await api.patch<any>(`/homework/${editingHomework._id}`, payload);
      } else {
        await api.post<any>('/homework', payload);
      }
      setShowModal(false);
      fetchHomework();
    } catch (err: unknown) {
      const e = err as any;
      setFormError(e?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await api.patch<any>(`/homework/${id}/publish`);
      fetchHomework();
    } catch (err: unknown) {
      const e = err as any;
      toast.error(e?.message || 'Failed to publish');
    }
  };

  const handleClose = async (id: string) => {
    if (!confirm('Are you sure you want to close this homework?')) return;
    try {
      await api.patch<any>(`/homework/${id}/close`);
      fetchHomework();
    } catch (err: unknown) {
      const e = err as any;
      toast.error(e?.message || 'Failed to close');
    }
  };

  // ── Detail View ────────────────────────────────────────────────────────────

  const openDetail = async (hw: Homework) => {
    setSelectedHomework(hw);
    setLoadingDetail(true);
    setDetailError(null);
    setSubmissions([]);
    setStats({});
    setGradingSubmissionId(null);
    try {
      const [subsRes, statsRes] = await Promise.allSettled([
        api.get<any>(`/homework/${hw._id}/submissions`),
        api.get<any>(`/homework/${hw._id}/stats`),
      ]);
      if (subsRes.status === 'fulfilled') {
        const v = subsRes.value as any;
        const subs = Array.isArray(v) ? v : v?.submissions ?? v?.data ?? [];
        setSubmissions(subs);
      }
      if (statsRes.status === 'fulfilled') {
        const v = statsRes.value as any;
        setStats(v?.stats ?? v ?? {});
      }
      if (subsRes.status === 'rejected' && statsRes.status === 'rejected') {
        setDetailError('Failed to load homework details. Please try again.');
      }
    } catch {
      setDetailError('Failed to load homework details. Please try again.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // ── Grading ────────────────────────────────────────────────────────────────

  const startGrading = (sub: Submission) => {
    setGradingSubmissionId(sub._id);
    setGradeScore(sub.score || 0);
    setGradeFeedback(sub.feedback || '');
    setCorrectedFileUrl((sub as any).correctedFileUrl || '');
    setRichFeedback((sub as any).richFeedback || '');
    setGradeError('');
  };

  /**
   * Upload the teacher's marked-up copy of the student's work.
   *
   * `correctedFileUrl` was a bare text input asking the teacher to paste a URL
   * from somewhere else — there was no way to attach an actual file, even though
   * `POST /api/upload/homework-resource` already admits TEACHER precisely for
   * this. Pasting an external link still works; it is no longer the only option.
   */
  const handleCorrectedFileUpload = async (file: File) => {
    setGradeError('');
    if (file.size > MAX_HOMEWORK_BYTES) {
      setGradeError(
        `"${file.name}" is ${formatMaxSize(file.size)} — the limit is ${formatMaxSize(MAX_HOMEWORK_BYTES)}.`,
      );
      return;
    }
    setUploadingCorrected(true);
    try {
      const url = await uploadFile(file, '/upload/homework-resource');
      if (!url) throw new Error('Upload completed but no file URL came back.');
      setCorrectedFileUrl(url);
    } catch (err: unknown) {
      setGradeError(errorText(err, 'Upload failed. Please try again.'));
    } finally {
      setUploadingCorrected(false);
    }
  };

  const submitGrade = async () => {
    if (!gradingSubmissionId) return;
    const max = selectedHomework?.totalPoints;
    // Caught here as well as server-side so the teacher sees which number is
    // wrong instead of a generic validation failure.
    if (max != null && gradeScore > max) {
      setGradeError(`Score cannot exceed ${max}.`);
      return;
    }
    if (gradeScore < 0) {
      setGradeError('Score cannot be negative.');
      return;
    }
    try {
      setGradingSubmitting(true);
      setGradeError('');
      await api.patch<any>(`/homework/submissions/${gradingSubmissionId}/grade`, {
        score: gradeScore,
        feedback: gradeFeedback,
        correctedFileUrl: correctedFileUrl || undefined,
        richFeedback: richFeedback || undefined,
      });
      toast.success('Grade saved');
      if (selectedHomework) {
        openDetail(selectedHomework);
      }
      setGradingSubmissionId(null);
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to grade');
      setGradeError(message);
      toast.error(message);
    } finally {
      setGradingSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Homework</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Create and manage homework assignments</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 border border-white/30"
          >
            <Plus className="w-5 h-5" />
            Create Homework
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading homework...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button onClick={fetchHomework} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-200 transition">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {homework.length === 0 ? 'No Homework Yet' : 'No Matching Homework'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {homework.length === 0
              ? 'Get started by creating your first homework assignment.'
              : 'Try adjusting your filter criteria.'}
          </p>
          {homework.length === 0 && (
            <button
              onClick={openCreate}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition"
            >
              <Plus className="w-5 h-5" />
              Create First Homework
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {filtered.map((hw) => {
            const typeStyle = TYPE_STYLES[hw.type] || TYPE_STYLES.assignment;
            const TypeIcon = typeStyle.icon;
            return (
              <div
                key={hw._id}
                className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                <div className="p-6 space-y-4">
                  {/* Title & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{hw.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{getBatchName(hw.batchId) || 'No batch'}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full capitalize ${STATUS_STYLES[hw.status] || STATUS_STYLES.draft}`}>
                      {hw.status}
                    </span>
                  </div>

                  {/* Type & Due Date */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${typeStyle.bg}`}>
                        <TypeIcon className="w-3.5 h-3.5" />
                        {hw.type}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500">·</span>
                      <span className="text-gray-600 dark:text-gray-400">{hw.totalPoints} pts</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                      <Clock className="w-4 h-4 text-pink-500" />
                      <span>Due Date: {formatDate(hw.dueDate)}</span>
                    </div>
                    {hw.submissionCount !== undefined && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>{hw.submissionCount} submissions</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex-wrap">
                    <button
                      onClick={() => openDetail(hw)}
                      className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                    {/*
                      Edit is offered for draft AND published homework.
                      `create()` publishes immediately (that is what makes it
                      visible to the batch), so gating Edit on `status === 'draft'`
                      meant nothing a teacher created could ever be edited — the
                      button existed but was unreachable, even though
                      `PATCH /api/homework/:id` accepts the edit. Closed homework
                      stays read-only: its submissions are already graded.
                    */}
                    {hw.status !== 'closed' && (
                      <button
                        onClick={() => openEdit(hw)}
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    {hw.status === 'draft' && (
                      <button
                        onClick={() => handlePublish(hw._id)}
                        className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition px-3 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 ml-auto"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Publish
                      </button>
                    )}
                    {hw.status === 'published' && (
                      <button
                        onClick={() => handleClose(hw._id)}
                        className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-700 rounded-t-3xl">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingHomework ? 'Edit Homework' : 'Create Homework'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Chapter 5 Exercises"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the homework..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-none"
                />
              </div>

              {/* Type & Batch */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as HomeworkFormData['type'] })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  >
                    <option value="assignment">Assignment</option>
                    <option value="quiz">Quiz</option>
                    <option value="project">Project</option>
                    <option value="reading">Reading</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Batch <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.batchId}
                    onChange={(e) => setFormData({ ...formData, batchId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  >
                    <option value="">Select batch</option>
                    {batches.map((b) => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due Date & Total Points */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Total Points</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.totalPoints}
                    onChange={(e) => setFormData({ ...formData, totalPoints: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Instructions</label>
                <textarea
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  placeholder="Detailed instructions for students..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-none"
                />
              </div>

              {/* Attachments */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Paperclip className="w-4 h-4 inline mr-1.5 text-gray-400" />
                  Attachments <span className="text-gray-400 font-normal">(optional)</span>
                </label>

                {/* File Upload */}
                <div>
                  <label className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition bg-gray-50 dark:bg-gray-700">
                    {uploadingFile ? (
                      <><Loader2 className="w-4 h-4 animate-spin text-indigo-500" /><span className="text-sm text-gray-500">Uploading...</span></>
                    ) : (
                      <><Upload className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500 dark:text-gray-400">Click to upload PDF, DOC, Image... (max {formatMaxSize(MAX_HOMEWORK_BYTES)})</span></>
                    )}
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4,.zip"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
                      disabled={uploadingFile} />
                  </label>
                </div>

                {/* Uploaded Files List */}
                {formData.attachmentUrls.length > 0 && (
                  <div className="space-y-2">
                    {formData.attachmentUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600">
                        <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{getFileNameFromUrl(url)}</span>
                        <button type="button" onClick={() => removeAttachment(i)} className="text-red-400 hover:text-red-600 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* External Links */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Add external link / learning resource</p>
                  <div className="flex gap-2">
                    <input type="url" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <input type="text" value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)}
                      placeholder="Label (optional)"
                      className="w-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button type="button" onClick={addResourceLink}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {formData.resourceLinks.length > 0 && (
                    <div className="space-y-2">
                      {formData.resourceLinks.map((link, i) => (
                        <div key={i} className="flex items-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                          <Link className="w-4 h-4 text-blue-500 shrink-0" />
                          <span className="text-sm text-blue-700 dark:text-blue-300 truncate flex-1">{link.label || link.url}</span>
                          <button type="button" onClick={() => removeResourceLink(i)} className="text-red-400 hover:text-red-600 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {uploadError && (
                  <p className="text-xs text-red-500 dark:text-red-400">{uploadError}</p>
                )}
              </div>

              {/* Late Submission */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Late Submission</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, allowLateSubmission: !formData.allowLateSubmission })}
                    className="text-indigo-600 dark:text-indigo-400"
                  >
                    {formData.allowLateSubmission ? (
                      <ToggleRight className="w-8 h-8" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-400" />
                    )}
                  </button>
                </div>
                {formData.allowLateSubmission && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Late Penalty (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.lateSubmissionPenalty}
                      onChange={(e) => setFormData({ ...formData, lateSubmissionPenalty: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitForm}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingHomework ? 'Save Changes' : 'Create Homework'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────────────────────────── */}
      {selectedHomework && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedHomework(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-700 rounded-t-3xl">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{selectedHomework.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${STATUS_STYLES[selectedHomework.status]}`}>
                    {selectedHomework.status}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${TYPE_STYLES[selectedHomework.type]?.bg}`}>
                    {selectedHomework.type}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Due: {formatDate(selectedHomework.dueDate)} · {selectedHomework.totalPoints} pts
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedHomework(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Description & Instructions */}
              {(selectedHomework.description || selectedHomework.instructions) && (
                <div className="space-y-3">
                  {selectedHomework.description && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{selectedHomework.description}</p>
                    </div>
                  )}
                  {selectedHomework.instructions && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Instructions</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{selectedHomework.instructions}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments & Links */}
              {((selectedHomework.attachmentUrls && selectedHomework.attachmentUrls.length > 0) ||
                (selectedHomework.resourceLinks && selectedHomework.resourceLinks.length > 0)) && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4" /> Attachments &amp; Resources
                  </h4>
                  {selectedHomework.attachmentUrls && selectedHomework.attachmentUrls.length > 0 && (
                    <div className="space-y-2">
                      {selectedHomework.attachmentUrls.map((url, i) => (
                        <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600">
                          <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                          <button type="button" onClick={() => setPreviewUrl(url)}
                            className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 text-left hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition">
                            {getFileNameFromUrl(url)}
                          </button>
                          <button type="button" onClick={() => setPreviewUrl(url)} title="Preview in app"
                            className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition shrink-0">
                            <Eye className="w-4 h-4" />
                          </button>
                          <a href={url} download={getFileNameFromUrl(url)} title="Download"
                            className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition shrink-0">
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedHomework.resourceLinks && selectedHomework.resourceLinks.length > 0 && (
                    <div className="space-y-2">
                      {selectedHomework.resourceLinks.map((link, i) => (
                        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition">
                          <Link className="w-4 h-4 text-blue-500 shrink-0" />
                          <span className="text-sm text-blue-700 dark:text-blue-300 truncate flex-1">{link.label || link.url}</span>
                          <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              {loadingDetail ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="ml-2 text-gray-500 dark:text-gray-400">Loading details...</span>
                </div>
              ) : detailError ? (
                <div className="text-center py-8">
                  <p className="text-red-500 dark:text-red-400 mb-3">{detailError}</p>
                  <button onClick={() => selectedHomework && openDetail(selectedHomework)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition">
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 text-center">
                      <BarChart3 className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{stats.totalStudents ?? stats.total ?? submissions.length}</p>
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Total</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                      <Send className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.submitted ?? submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Submitted</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 text-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{stats.graded ?? submissions.filter(s => s.status === 'graded').length}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Graded</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
                      <Star className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {stats.averageScore != null ? Number(stats.averageScore).toFixed(1) : '—'}
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Avg Score</p>
                    </div>
                  </div>

                  {/* Submissions List */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Submissions</h3>
                    {submissions.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        <p className="text-gray-500 dark:text-gray-400 text-sm">No submissions yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {submissions.map((sub) => (
                          <div
                            key={sub._id}
                            className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-100 dark:border-gray-600"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                    {getStudentName(sub.studentId).charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getStudentName(sub.studentId)}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {sub.submittedAt ? `Submitted: ${formatDate(sub.submittedAt)}` : 'Not submitted'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${SUBMISSION_STATUS_STYLES[sub.status] || SUBMISSION_STATUS_STYLES.pending}`}>
                                  {sub.status}
                                </span>
                                {sub.score !== undefined && sub.score !== null && (
                                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                    {sub.score}/{selectedHomework.totalPoints}
                                  </span>
                                )}
                                {(sub.status === 'submitted' || sub.status === 'late') && gradingSubmissionId !== sub._id && (
                                  <button
                                    onClick={() => startGrading(sub)}
                                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-2.5 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    Grade
                                  </button>
                                )}
                                {sub.status === 'graded' && gradingSubmissionId !== sub._id && (
                                  <button
                                    onClick={() => startGrading(sub)}
                                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    Re-grade
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Student's Submitted Content */}
                            {(sub.textResponse || (sub.attachmentUrls && sub.attachmentUrls.length > 0)) && (
                              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-2">
                                {sub.textResponse && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Student&apos;s Response</p>
                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                      {sub.textResponse}
                                    </div>
                                  </div>
                                )}
                                {sub.attachmentUrls && sub.attachmentUrls.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Attachments</p>
                                    {/*
                                      Opens IN the app. These were `target="_blank"`
                                      links, so reviewing a class meant leaving the
                                      grading screen once per submission.
                                    */}
                                    <div className="flex flex-wrap gap-2">
                                      {sub.attachmentUrls.map((url, idx) => (
                                        <button
                                          key={idx}
                                          type="button"
                                          onClick={() => setPreviewUrl(url)}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition border border-indigo-200 dark:border-indigo-700"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          {getFileNameFromUrl(url)}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Inline Grading */}
                            {gradingSubmissionId === sub._id && (
                              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                      Score (out of {selectedHomework.totalPoints})
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={selectedHomework.totalPoints}
                                      value={gradeScore}
                                      onChange={(e) => setGradeScore(parseInt(e.target.value) || 0)}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Feedback</label>
                                    <textarea
                                      value={gradeFeedback}
                                      onChange={(e) => setGradeFeedback(e.target.value)}
                                      placeholder="Write feedback for the student..."
                                      rows={2}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none"
                                    />
                                  </div>
                                </div>
                                {/* Enhanced Grading Fields */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Corrected File (optional)</label>
                                    {correctedFileUrl ? (
                                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                                        <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                        <button type="button" onClick={() => setPreviewUrl(correctedFileUrl)}
                                          className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 text-left hover:underline">
                                          {getFileNameFromUrl(correctedFileUrl)}
                                        </button>
                                        <button type="button" onClick={() => setCorrectedFileUrl('')} title="Remove"
                                          className="text-red-400 hover:text-red-600 transition shrink-0">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:border-indigo-400 transition">
                                        {uploadingCorrected ? (
                                          <><Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /><span className="text-xs text-gray-500">Uploading...</span></>
                                        ) : (
                                          <><Upload className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-500 dark:text-gray-400">Upload marked-up file</span></>
                                        )}
                                        <input type="file" className="hidden" disabled={uploadingCorrected}
                                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCorrectedFileUpload(f); e.target.value = ''; }} />
                                      </label>
                                    )}
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rich Feedback (optional)</label>
                                    <textarea
                                      value={richFeedback}
                                      onChange={(e) => setRichFeedback(e.target.value)}
                                      placeholder="Detailed feedback with formatting..."
                                      rows={2}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none"
                                    />
                                  </div>
                                </div>
                                {gradeError && (
                                  <p className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    {gradeError}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => setGradingSubmissionId(null)}
                                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={submitGrade}
                                    disabled={gradingSubmitting}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
                                  >
                                    {gradingSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    Submit Grade
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Show feedback if graded */}
                            {sub.status === 'graded' && (sub.feedback || sub.correctedFileUrl) && gradingSubmissionId !== sub._id && (
                              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 space-y-1.5">
                                {sub.feedback && (
                                  <div className="flex items-start gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{sub.feedback}</p>
                                  </div>
                                )}
                                {sub.correctedFileUrl && (
                                  <button type="button" onClick={() => setPreviewUrl(sub.correctedFileUrl!)}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                                    <Eye className="w-3.5 h-3.5" />
                                    Corrected file: {getFileNameFromUrl(sub.correctedFileUrl)}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        Rendered last and above both modals (z-[110]) so a submitted file opens on
        top of the detail modal the teacher is grading in, rather than replacing it.
      */}
      {previewUrl && <FilePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  );
};

export default HomeworkPage;
