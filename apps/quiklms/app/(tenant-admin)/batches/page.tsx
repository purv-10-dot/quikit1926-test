'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useBranding } from '@/app/providers';
import {
  BookOpen,
  Plus,
  Search,
  Edit3,
  Archive,
  ArchiveRestore,
  Trash2,
  X,
  Users,
  Clock,
  Calendar,
  GraduationCap,
  Loader2,
  AlertCircle,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location?: string;
}

interface Batch {
  _id: string;
  name: string;
  grade: string;
  section?: string;
  subject: string;
  teacherId: string | { _id: string; firstName?: string; lastName?: string; name?: string; email?: string };
  studentIds?: string[];
  startDate: string;
  endDate: string;
  maxCapacity?: number;
  academicYear: string;
  status: 'draft' | 'active' | 'archived';
  schedule?: ScheduleSlot[];
  defaultMeetingProvider?: string;
  classType?: string;
  trialClassCount?: number;
}

interface BatchFormData {
  name: string;
  grade: string;
  section: string;
  subject: string;
  teacherId: string;
  startDate: string;
  endDate: string;
  maxCapacity: number;
  academicYear: string;
  schedule: ScheduleSlot[];
  studentIds: string[];
  defaultMeetingProvider: string;
  classType: string;
  trialClassCount: number;
}

interface Teacher {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Student {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  grade?: string;
  section?: string;
  studentId?: string;
  isActive: boolean;
  role?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GRADES = ['LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const DAYS: { label: string; value: number }[] = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
  { label: 'Sunday', value: 0 },
];

const DAY_LABELS: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-blue-100 text-blue-700',
  archived: 'bg-amber-100 text-amber-700',
};

const MEETING_PROVIDERS = [
  { value: 'jitsi', label: 'Jitsi Meet (Free)' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'manual', label: 'Manual URL' },
];

const getCurrentAcademicYear = (): string => {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
};

const emptyForm: BatchFormData = {
  name: '', grade: '', section: '', subject: '', teacherId: '',
  startDate: '', endDate: '', maxCapacity: 30,
  academicYear: getCurrentAcademicYear(), schedule: [], studentIds: [],
  defaultMeetingProvider: 'jitsi', classType: 'regular', trialClassCount: 0,
};

// ── Confirm Dialog ─────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmDialog = ({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading }: ConfirmDialogProps) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-auto p-6">
      <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50 ${confirmClass || 'bg-red-600 hover:bg-red-700'}`}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const BatchesPage = () => {
  const { branding } = useBranding();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  /**
   * Why the roster is empty, when it is empty because the FETCH failed rather
   * than because the tenant has no teachers. The two look identical in the form
   * and have completely different remedies.
   */
  const [rosterError, setRosterError] = useState('');
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [formData, setFormData] = useState<BatchFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Confirmation dialogs
  const [archiveConfirm, setArchiveConfirm] = useState<Batch | null>(null);
  const [unarchiveConfirm, setUnarchiveConfirm] = useState<Batch | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Batch | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Schedule builder
  const [newSlotDay, setNewSlotDay] = useState(1);
  const [newSlotStart, setNewSlotStart] = useState('09:00');
  const [newSlotEnd, setNewSlotEnd] = useState('10:00');

  // Student selector
  const [studentSearch, setStudentSearch] = useState('');

  // Academic config
  const [subjectsList, setSubjectsList] = useState<string[]>([]);
  const [sectionsList, setSectionsList] = useState<string[]>([]);

  // ── Data Fetching ────────────────────────────────────────────────────────────

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [batchRes, teacherRes, studentRes, subjectRes, sectionRes] = await Promise.allSettled([
        api.get<any>('/batches'),
        api.get<any>('/users', { params: { role: 'TEACHER' } }),
        api.get<any>('/users'),
        api.get<any>('/academic-config/subjects'),
        api.get<any>('/academic-config/sections'),
      ]);

      if (batchRes.status === 'fulfilled') {
        const d = (batchRes.value as any);
        setBatches(Array.isArray(d) ? d : d.batches ?? d.data ?? []);
      } else if (!silent) {
        setError((batchRes.reason as any)?.message || 'Failed to load batches');
      }

      // A REJECTED roster fetch used to be dropped on the floor: `teachers`
      // stayed empty and the form rendered "No teachers found. Add teachers
      // first." — which sends the admin off to create a teacher they already
      // have, while the real fault (a 401/403/500 on /api/users) was invisible
      // in the UI and absent from the logs. Roster failures are now recorded so
      // the empty dropdown can say WHY it is empty.
      if (teacherRes.status === 'fulfilled') {
        const d = (teacherRes.value as any).data;
        setTeachers(Array.isArray(d) ? d : d.data ?? []);
        setRosterError('');
      } else {
        const reason = (teacherRes.reason as any)?.message || 'Could not load the teacher list';
        console.error('[batches] teacher fetch failed:', teacherRes.reason);
        setRosterError(reason);
      }

      if (studentRes.status === 'fulfilled') {
        const d = (studentRes.value as any).data;
        const all = Array.isArray(d) ? d : d.data ?? [];
        setAllStudents(all.filter((u: any) => u.role === 'LEARNER' && u.isActive));
      } else {
        console.error('[batches] student fetch failed:', studentRes.reason);
      }

      if (subjectRes.status === 'fulfilled' && Array.isArray((subjectRes.value as any))) {
        setSubjectsList((subjectRes.value as any));
      }
      if (sectionRes.status === 'fulfilled' && Array.isArray((sectionRes.value as any))) {
        setSectionsList((sectionRes.value as any));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getTeacherName = (teacherId: Batch['teacherId']) => {
    if (typeof teacherId === 'object' && teacherId) {
      if (teacherId.firstName || teacherId.lastName)
        return `${teacherId.firstName || ''} ${teacherId.lastName || ''}`.trim();
      if (teacherId.name) return teacherId.name;
      return teacherId.email || 'Unknown';
    }
    return typeof teacherId === 'string' ? teacherId : 'Unknown';
  };

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ── Filtering ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() =>
    batches.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (gradeFilter !== 'all' && b.grade !== gradeFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const teacher = getTeacherName(b.teacherId).toLowerCase();
        if (!b.name.toLowerCase().includes(q) && !b.subject.toLowerCase().includes(q) && !teacher.includes(q))
          return false;
      }
      return true;
    }),
    [batches, statusFilter, gradeFilter, searchTerm]
  );

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingBatch(null);
    setFormData(emptyForm);
    setFormError('');
    setStudentSearch('');
    setShowModal(true);
    // The roster is fetched once on mount, so a teacher added since this page
    // loaded — the usual order of work: add the teacher, then build their batch
    // — was missing from the dropdown until a manual refresh. Silent, so an
    // open form is never disturbed by it.
    fetchAll(true);
  };

  const openEdit = (batch: Batch) => {
    setEditingBatch(batch);
    setFormData({
      name: batch.name,
      grade: batch.grade,
      section: batch.section || '',
      subject: batch.subject,
      teacherId: typeof batch.teacherId === 'object' ? batch.teacherId._id : batch.teacherId,
      startDate: batch.startDate ? batch.startDate.slice(0, 10) : '',
      endDate: batch.endDate ? batch.endDate.slice(0, 10) : '',
      maxCapacity: batch.maxCapacity || 30,
      academicYear: batch.academicYear || getCurrentAcademicYear(),
      schedule: batch.schedule || [],
      studentIds: batch.studentIds || [],
      defaultMeetingProvider: batch.defaultMeetingProvider || 'jitsi',
      classType: batch.classType || 'regular',
      trialClassCount: batch.trialClassCount || 0,
    });
    setFormError('');
    setStudentSearch('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { setFormError('Batch name is required'); return; }
    if (!formData.subject.trim()) { setFormError('Subject is required'); return; }
    if (!formData.teacherId.trim()) { setFormError('Teacher is required'); return; }
    if (!formData.academicYear || !/^\d{4}-\d{4}$/.test(formData.academicYear)) {
      setFormError(`Academic year must be in format YYYY-YYYY (e.g., ${getCurrentAcademicYear()})`); return;
    }
    if (formData.schedule.length === 0) { setFormError('At least one schedule slot is required'); return; }
    if (!formData.startDate || !formData.endDate) { setFormError('Start and end dates are required'); return; }

    setSubmitting(true);
    setFormError('');
    try {
      const payload = {
        ...formData,
        schedule: formData.schedule.map(({ dayOfWeek, startTime, endTime, location }) => ({
          dayOfWeek, startTime, endTime, ...(location ? { location } : {}),
        })),
      };
      if (editingBatch) {
        const res = await api.patch<any>(`/batches/${editingBatch._id}`, payload);
        const updated = (res as any)?.data?._id ? (res as any).data : (res as any);
        if (updated?._id) setBatches(prev => prev.map(b => b._id === updated._id ? updated : b));
      } else {
        const res = await api.post<any>('/batches', payload);
        const created = (res as any)?.data?._id ? (res as any).data : (res as any);
        if (created?._id) setBatches(prev => [created, ...prev]);
      }
      setShowModal(false);
      fetchAll(true);
    } catch (err: any) {
      setFormError(Array.isArray(err?.message) ? err.message.join('\n') : err?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleArchive = async () => {
    if (!archiveConfirm) return;
    setActionLoading(true);
    try {
      await api.delete<any>(`/batches/${archiveConfirm._id}`);
      setBatches(prev => prev.map(b => b._id === archiveConfirm._id ? { ...b, status: 'archived' } : b));
      setArchiveConfirm(null);
      fetchAll(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive batch');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnarchive = async () => {
    if (!unarchiveConfirm) return;
    setActionLoading(true);
    try {
      const res = await api.patch<any>(`/batches/${unarchiveConfirm._id}/unarchive`);
      const updated = (res as any)?.data?._id ? (res as any).data : (res as any);
      setBatches(prev => prev.map(b => b._id === unarchiveConfirm._id ? (updated?._id ? updated : { ...b, status: 'active' }) : b));
      setUnarchiveConfirm(null);
      fetchAll(true);
    } catch (err: any) {
      // Fallback: try PATCH with status
      try {
        await api.patch<any>(`/batches/${unarchiveConfirm._id}`, { status: 'active' });
        setBatches(prev => prev.map(b => b._id === unarchiveConfirm!._id ? { ...b, status: 'active' } : b));
        setUnarchiveConfirm(null);
      } catch {
        toast.error(err?.message || 'Failed to unarchive batch');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    try {
      await api.delete<any>(`/batches/${deleteConfirm._id}/permanent`);
      setBatches(prev => prev.filter(b => b._id !== deleteConfirm._id));
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete batch');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Schedule ─────────────────────────────────────────────────────────────────

  const addScheduleSlot = () => {
    setFormData(prev => ({
      ...prev,
      schedule: [...prev.schedule, { dayOfWeek: newSlotDay, startTime: newSlotStart, endTime: newSlotEnd }],
    }));
  };

  const removeScheduleSlot = (idx: number) => {
    setFormData(prev => ({ ...prev, schedule: prev.schedule.filter((_, i) => i !== idx) }));
  };

  // ── Students ─────────────────────────────────────────────────────────────────

  const filteredStudents = useMemo(() =>
    allStudents.filter((s) => {
      if (formData.grade && s.grade && s.grade !== formData.grade) return false;
      if (formData.section && s.section && s.section !== formData.section) return false;
      if (studentSearch) {
        const q = studentSearch.toLowerCase();
        const name = `${s.firstName} ${s.lastName}`.toLowerCase();
        if (!name.includes(q) && !(s.email || '').toLowerCase().includes(q) && !(s.studentId || '').toLowerCase().includes(q))
          return false;
      }
      return true;
    }),
    [allStudents, formData.grade, formData.section, studentSearch]
  );

  const toggleStudent = (id: string) => {
    setFormData(prev => ({
      ...prev,
      studentIds: prev.studentIds.includes(id) ? prev.studentIds.filter(s => s !== id) : [...prev.studentIds, id],
    }));
  };

  const selectAllFilteredStudents = () => {
    setFormData(prev => ({ ...prev, studentIds: [...new Set([...prev.studentIds, ...filteredStudents.map(s => s._id)])] }));
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const inputCls = 'w-full px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition';

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight leading-tight">
                Batch Management
              </h1>
              <p className="text-indigo-100 text-xs sm:text-base lg:text-lg mt-0.5 truncate font-light">
                Manage your class batches and student groups
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="self-start sm:self-auto flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-sm font-semibold px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl transition-all border border-white/30 whitespace-nowrap shadow-lg"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            Create Batch
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-100 dark:border-gray-700 p-4">
        {/* Search always visible */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search batches..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition"
            />
          </div>
          {/* Toggle filters on small screens */}
          <button
            onClick={() => setFiltersOpen(p => !p)}
            className="sm:hidden flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 transition hover:bg-gray-100 dark:hover:bg-gray-600"
          >
            <Filter className="w-4 h-4" />
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
          {/* Desktop filters inline */}
          <div className="hidden sm:flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Grades</option>
              {GRADES.map(g => <option key={g} value={g}>{g} Grade</option>)}
            </select>
          </div>
        </div>
        {/* Mobile collapsible filters */}
        {filtersOpen && (
          <div className="sm:hidden flex flex-col gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Grades</option>
              {GRADES.map(g => <option key={g} value={g}>{g} Grade</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400 text-sm">Loading...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium text-sm">{error}</p>
          <button onClick={() => fetchAll()} className="mt-4 px-4 py-2 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-200 transition">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-100 dark:border-gray-700 p-8 sm:p-12 text-center">
          <BookOpen className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-base sm:text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {batches.length === 0 ? 'No Batches Yet' : 'No Matching Batches'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {batches.length === 0
              ? 'Get started by creating your first batch.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {batches.length === 0 && (
            <button onClick={openCreate} className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-xl font-semibold transition">
              <Plus className="w-4 h-4" /> Create First Batch
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {filtered.map((batch) => (
            <div
              key={batch._id}
              className="group bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
            >
              {/* Accent bar */}
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 flex-shrink-0" />

              <div className="p-4 sm:p-5 flex flex-col flex-1 space-y-3">
                {/* Title & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">{batch.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{batch.subject}</p>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[batch.status] || STATUS_STYLES.active}`}>
                    {batch.status}
                  </span>
                </div>

                {/* Info rows */}
                <div className="space-y-1.5 text-xs sm:text-sm flex-1">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 min-w-0">
                    <GraduationCap className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <span className="truncate">Grade {batch.grade}{batch.section ? ` – ${batch.section}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 min-w-0">
                    <Users className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <span className="truncate">
                      {getTeacherName(batch.teacherId)} · {batch.studentIds?.length ?? 0}/{batch.maxCapacity || '∞'} students
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 min-w-0">
                    <Calendar className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                    <span className="truncate">{formatDate(batch.startDate)} – {formatDate(batch.endDate)}</span>
                  </div>
                  {batch.schedule && batch.schedule.length > 0 && (
                    <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                      <Clock className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="leading-relaxed line-clamp-2">
                        {batch.schedule.map(s => `${DAY_LABELS[s.dayOfWeek] || '?'} ${s.startTime}–${s.endTime}`).join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                  {/* Row 1: Edit always visible */}
                  <div className="flex items-center flex-wrap gap-1.5">
                    <button
                      onClick={() => openEdit(batch)}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    {batch.status !== 'archived' && (
                      <button
                        onClick={() => setArchiveConfirm(batch)}
                        className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    )}

                    {batch.status === 'archived' && (
                      <>
                        <button
                          onClick={() => setUnarchiveConfirm(batch)}
                          className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                          Unarchive
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(batch)}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl my-2 sm:my-0">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700 rounded-t-2xl sm:rounded-t-3xl">
              <h2 className="text-base sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingBatch ? 'Edit Batch' : 'Create Batch'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition flex-shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{formError}</span>
                </div>
              )}

              {/* Batch Name */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Batch Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Math Advanced – Grade 10"
                  className={inputCls}
                />
              </div>

              {/* Grade / Section / Subject — responsive grid */}
              <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Grade
                  </label>
                  <select
                    value={formData.grade}
                    onChange={e => setFormData({ ...formData, grade: e.target.value, section: '' })}
                    className={inputCls}
                  >
                    <option value="">Select grade</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Section</label>
                  <select
                    value={formData.section}
                    onChange={e => setFormData({ ...formData, section: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Select section</option>
                    {sectionsList.map(s => <option key={s} value={s}>Section {s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Select subject</option>
                    {subjectsList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Teacher */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Teacher <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.teacherId}
                  onChange={e => setFormData({ ...formData, teacherId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select a teacher</option>
                  {teachers.map(tc => (
                    <option key={tc._id} value={tc._id}>{tc.firstName} {tc.lastName} ({tc.email})</option>
                  ))}
                </select>
                {teachers.length === 0 && (
                  rosterError ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Could not load teachers: {rosterError}{' '}
                      <button type="button" onClick={() => fetchAll(true)} className="underline">
                        Retry
                      </button>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">No teachers found. Add teachers first.</p>
                  )
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Start Date</label>
                  <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">End Date</label>
                  <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className={inputCls} />
                </div>
              </div>

              {/* Academic Year & Max Capacity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Academic Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.academicYear}
                    onChange={e => setFormData({ ...formData, academicYear: e.target.value })}
                    placeholder={`e.g. ${getCurrentAcademicYear()}`}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Max Students</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.maxCapacity}
                    onChange={e => setFormData({ ...formData, maxCapacity: parseInt(e.target.value) || 1 })}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Meeting Provider */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Video Class Provider</label>
                <select
                  value={formData.defaultMeetingProvider}
                  onChange={e => setFormData({ ...formData, defaultMeetingProvider: e.target.value })}
                  className={inputCls}
                >
                  {MEETING_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {/* Class Type */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Class Type</label>
                <select
                  value={formData.classType}
                  onChange={e => setFormData({ ...formData, classType: e.target.value })}
                  className={inputCls}
                >
                  <option value="regular">Regular</option>
                  <option value="demo">Demo</option>
                  <option value="trial">Trial</option>
                </select>
                {(formData.classType === 'demo' || formData.classType === 'trial') && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Number of Trial Classes</label>
                    <input
                      type="number"
                      min={1}
                      value={formData.trialClassCount}
                      onChange={e => setFormData({ ...formData, trialClassCount: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Schedule</label>

                {formData.schedule.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formData.schedule.map((slot, i) => (
                      <div key={i} className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm gap-2">
                        <span className="text-gray-800 dark:text-gray-200 min-w-0 truncate">
                          {DAY_LABELS[slot.dayOfWeek] || '?'} · {slot.startTime} – {slot.endTime}
                        </span>
                        <button onClick={() => removeScheduleSlot(i)} className="text-red-500 hover:text-red-700 transition flex-shrink-0 p-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 items-end">
                  <select
                    value={newSlotDay}
                    onChange={e => setNewSlotDay(parseInt(e.target.value))}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none flex-1 min-w-[100px]"
                  >
                    {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input
                    type="time"
                    value={newSlotStart}
                    onChange={e => setNewSlotStart(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="time"
                    value={newSlotEnd}
                    onChange={e => setNewSlotEnd(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addScheduleSlot}
                    className="px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium rounded-xl hover:bg-indigo-200 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Students */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Add Students{' '}
                  <span className="text-gray-400 font-normal text-xs">
                    ({formData.studentIds.length} selected{formData.maxCapacity ? ` / ${formData.maxCapacity} max` : ''})
                  </span>
                </label>

                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="relative flex-1 min-w-[140px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search students..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={selectAllFilteredStudents}
                    className="text-xs px-2.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 font-medium hover:bg-indigo-100 transition whitespace-nowrap"
                  >
                    Select All
                  </button>
                  {formData.studentIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, studentIds: [] }))}
                      className="text-xs px-2.5 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 font-medium hover:bg-red-100 transition whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {formData.grade && (
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-2">
                    Showing students in grade {formData.grade}.
                  </p>
                )}

                <div className="max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl">
                  {filteredStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-5 text-gray-400 dark:text-gray-500 text-xs sm:text-sm">
                      <Users className="w-7 h-7 mb-1.5 opacity-40" />
                      {allStudents.length === 0 ? 'No students found.' : 'No students match the filter.'}
                    </div>
                  ) : (
                    filteredStudents.map(s => {
                      const selected = formData.studentIds.includes(s._id);
                      return (
                        <label
                          key={s._id}
                          className={`flex items-center gap-3 px-3 sm:px-4 py-2 cursor-pointer border-b last:border-b-0 border-gray-100 dark:border-gray-700 transition-colors ${
                            selected ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleStudent(s._id)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
                              {s.firstName} {s.lastName}
                            </span>
                            <span className="ml-1.5 text-xs text-gray-400">
                              {s.grade ? `Grade ${s.grade}` : ''}{s.section ? ` – ${s.section}` : ''}{s.studentId ? ` (${s.studentId})` : ''}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>

                {formData.studentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formData.studentIds.slice(0, 8).map(sid => {
                      const student = allStudents.find(s => s._id === sid);
                      return (
                        <span key={sid} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-medium">
                          {student ? `${student.firstName} ${student.lastName}` : sid.slice(-6)}
                          <button type="button" onClick={() => toggleStudent(sid)} className="hover:text-red-500 transition">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                    {formData.studentIds.length > 8 && (
                      <span className="text-xs text-gray-400 py-1">+{formData.studentIds.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-xl font-semibold transition"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingBatch ? 'Save' : 'Create Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialogs ────────────────────────────────────────────────── */}
      {archiveConfirm && (
        <ConfirmDialog
          title="Archive Batch"
          message={`Archive "${archiveConfirm.name}"? It will be hidden from active views but not deleted. You can unarchive it later.`}
          confirmLabel="Archive"
          confirmClass="bg-amber-500 hover:bg-amber-600"
          loading={actionLoading}
          onConfirm={handleArchive}
          onCancel={() => setArchiveConfirm(null)}
        />
      )}

      {unarchiveConfirm && (
        <ConfirmDialog
          title="Unarchive Batch"
          message={`Restore "${unarchiveConfirm.name}" to active status?`}
          confirmLabel="Unarchive"
          confirmClass="bg-emerald-600 hover:bg-emerald-700"
          loading={actionLoading}
          onConfirm={handleUnarchive}
          onCancel={() => setUnarchiveConfirm(null)}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="Permanently Delete Batch"
          message={`This will permanently delete "${deleteConfirm.name}" and cannot be undone. This action is irreversible.`}
          confirmLabel="Delete Permanently"
          confirmClass="bg-red-600 hover:bg-red-700"
          loading={actionLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};

export default BatchesPage;
