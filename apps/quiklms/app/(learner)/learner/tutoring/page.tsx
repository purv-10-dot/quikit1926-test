'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Clock, CheckCircle, CheckCircle2, XCircle, Calendar, BookOpen, Loader2, AlertCircle, User, ChevronDown, History, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

interface ProposedSlot {
  date: string;
  startTime: string;
  endTime: string;
}

interface Teacher {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  subjects?: string[];
}

interface TutoringRequest {
  _id: string;
  subject: string;
  notes?: string;
  proposedSlots: ProposedSlot[];
  confirmedSlot?: ProposedSlot;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  teacherId?: { _id: string; firstName: string; lastName: string; email: string } | null;
  rejectionReason?: string;
  teacherNotes?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle; border: string; accent: string; shadow: string }> = {
  pending: {
    label: 'Pending',
    bg: 'bg-amber-50/50 dark:bg-amber-900/10',
    text: 'text-amber-700 dark:text-amber-400',
    icon: Clock,
    border: 'border-amber-100 dark:border-amber-800/50',
    accent: 'bg-amber-400',
    shadow: 'shadow-amber-100/50 dark:shadow-none'
  },
  accepted: {
    label: 'Accepted',
    bg: 'bg-emerald-50/50 dark:bg-emerald-900/10',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: CheckCircle,
    border: 'border-emerald-100 dark:border-emerald-800/50',
    accent: 'bg-emerald-400',
    shadow: 'shadow-emerald-100/50 dark:shadow-none'
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-rose-50/50 dark:bg-rose-900/10',
    text: 'text-rose-700 dark:text-rose-400',
    icon: XCircle,
    border: 'border-rose-100 dark:border-rose-800/50',
    accent: 'bg-rose-400',
    shadow: 'shadow-rose-100/50 dark:shadow-none'
  },
  completed: {
    label: 'Completed',
    bg: 'bg-slate-50/50 dark:bg-slate-800/20',
    text: 'text-slate-600 dark:text-slate-400',
    icon: CheckCircle2,
    border: 'border-slate-200 dark:border-slate-700/50',
    accent: 'bg-slate-400',
    shadow: 'shadow-slate-100/50 dark:shadow-none'
  },
};

const formatSlot = (slot: ProposedSlot) =>
  `${new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${slot.startTime} – ${slot.endTime}`;

const RequestCard = ({ req }: { req: TutoringRequest }) => {
  const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const teacher = req.teacherId && typeof req.teacherId === 'object' && req.teacherId.firstName
    ? req.teacherId : null;

  return (
    <div className={`group relative bg-white dark:bg-gray-800/40 backdrop-blur-sm rounded-2xl border ${cfg.border} ${cfg.shadow} hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden`}>
      {/* Status Accent Line */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cfg.accent} opacity-80 group-hover:opacity-100 transition-opacity`} />

      <div className="p-6 space-y-4">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${cfg.bg} ${cfg.text}`}>
                <StatusIcon className="w-3 h-3" /> {cfg.label}
              </span>
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-tight">
                ID: {req._id.slice(-6)}
              </span>
            </div>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-gray-100 truncate leading-tight tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {req.subject}
            </h3>
          </div>
          <div className="p-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 text-gray-400 group-hover:text-indigo-500 transition-colors">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Teacher Info */}
        {teacher && (
          <div className="flex items-center gap-3 p-3 bg-gray-50/50 dark:bg-gray-700/30 rounded-2xl border border-gray-100/50 dark:border-gray-600/30 transition-all group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-900/10 group-hover:border-indigo-100 dark:group-hover:border-indigo-800/30">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800 shadow-sm">
                <span className="text-sm font-black text-indigo-600 dark:text-indigo-300">{teacher.firstName.charAt(0)}</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate leading-none">
                {teacher.firstName} {teacher.lastName}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">
                Teacher • {teacher.email}
              </p>
            </div>
          </div>
        )}

        {/* Notes Section */}
        {req.notes && (
          <div className="flex items-start gap-2.5 p-3 bg-slate-50/50 dark:bg-slate-700/20 rounded-xl border border-slate-100/50 dark:border-slate-700/50">
            <Sparkles className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic line-clamp-2">
              "{req.notes}"
            </p>
          </div>
        )}

        {/* Special Status Blocks */}
        {req.status === 'accepted' && req.confirmedSlot && (
          <div className="relative overflow-hidden p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/50 shadow-sm shadow-emerald-100/50 dark:shadow-none">
            <div className="absolute top-0 right-0 p-1 opacity-10">
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>
            <div className="relative flex items-center gap-3">
              <div className="p-2 bg-white dark:bg-emerald-800/50 rounded-lg shadow-sm">
                <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-700/70 dark:text-emerald-400/70 uppercase tracking-widest mb-0.5">Confirmed Session</p>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-100">{formatSlot(req.confirmedSlot)}</p>
                {req.teacherNotes && (
                  <div className="mt-1.5 flex items-start gap-1.5 pt-1.5 border-t border-emerald-100 dark:border-emerald-800/50">
                    <AlertCircle className="w-3 h-3 text-emerald-500 mt-0.5" />
                    <p className="text-[11px] font-medium text-emerald-700/80 dark:text-emerald-300/80 leading-tight">
                      Teacher Note: {req.teacherNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {req.status === 'rejected' && req.rejectionReason && (
          <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-800/50">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <p className="text-[10px] font-black text-rose-700/70 dark:text-rose-400/70 uppercase tracking-widest mb-1">Rejection Reason</p>
                <p className="text-sm font-medium text-rose-800 dark:text-rose-200">{req.rejectionReason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Proposed Slots Footer */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proposed Slots</p>
            <span className="text-[10px] font-medium text-gray-400">{req.proposedSlots.length} options</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {req.proposedSlots.map((slot, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  req.status === 'accepted' && req.confirmedSlot && JSON.stringify(slot) === JSON.stringify(req.confirmedSlot)
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                    : 'bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100/50 dark:border-indigo-800/30'
                }`}
              >
                <Clock className="w-3 h-3" />
                {formatSlot(slot)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100/50 dark:border-gray-700 flex justify-between items-center">
        <span className="text-[10px] font-medium text-gray-400">
          Requested {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
          View Details
        </button>
      </div>
    </div>
  );
};

const TutoringRequestPage = () => {
  const { branding } = useBranding();
  const [requests, setRequests] = useState<TutoringRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [successMsg, setSuccessMsg] = useState('');

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<ProposedSlot[]>([{ date: '', startTime: '', endTime: '' }]);

  const activeRequests = requests.filter(r => r.status === 'pending' || r.status === 'accepted');
  const historyRequests = requests.filter(r => r.status === 'completed' || r.status === 'rejected');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get<any>('/tutoring-requests/student');
      setRequests(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tutoring requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    setTeachersLoading(true);
    try {
      const res = await api.get<any>('/tutoring-requests/available-teachers');
      setTeachers(Array.isArray(res) ? res : []);
    } catch {
      setTeachers([]);
    } finally {
      setTeachersLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  useEffect(() => {
    if (showForm && teachers.length === 0) fetchTeachers();
  }, [showForm]);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const addSlot = () => setSlots([...slots, { date: '', startTime: '', endTime: '' }]);
  const removeSlot = (i: number) => setSlots(slots.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, field: keyof ProposedSlot, value: string) => {
    const updated = [...slots];
    updated[i] = { ...updated[i], [field]: value };
    setSlots(updated);
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!selectedTeacherId) { setFormError('Please select a teacher.'); return; }
    if (!subject.trim()) { setFormError('Subject is required.'); return; }
    const validSlots = slots.filter(s => s.date && s.startTime && s.endTime);
    if (validSlots.length === 0) { setFormError('Please add at least one available slot.'); return; }
    for (const s of validSlots) {
      if (s.endTime <= s.startTime) { setFormError('End time must be after start time.'); return; }
    }
    setSubmitting(true);
    try {
      const res = await api.post<any>('/tutoring-requests', { subject, notes, proposedSlots: validSlots, teacherId: selectedTeacherId });
      setShowForm(false);
      setSubject(''); setNotes(''); setSlots([{ date: '', startTime: '', endTime: '' }]); setSelectedTeacherId('');
      setActiveTab('active');
      if (res && res._id) {
        setRequests(prev => [res, ...prev]);
      }
      setSuccessMsg('Tutoring session request submitted successfully!');
      fetchRequests();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedRequests = activeTab === 'active' ? activeRequests : historyRequests;

  return (
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
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
                One-on-One Tutoring
              </h1>
              <p className="opacity-90 text-sm sm:text-base lg:text-lg font-light">
                Request personalized sessions with your teachers
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl font-bold transition-all border border-white/30 shadow-xl self-start lg:self-center"
          >
            <Plus className="w-5 h-5 font-bold" /> Request Session
          </button>
        </div>

        {/* Quick Stats */}
        {!loading && requests.length > 0 && (
          <div className="relative flex gap-3 mt-8 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <Clock className="w-4 h-4 text-white" />
              <span className="text-sm font-medium">{requests.filter(r => r.status === 'pending').length} Pending</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <CheckCircle className="w-4 h-4 text-white" />
              <span className="text-sm font-medium">{requests.filter(r => r.status === 'accepted').length} Accepted</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <Sparkles className="w-4 h-4 text-white" />
              <span className="text-sm font-medium">{requests.filter(r => r.status === 'completed').length} Completed</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'active'
            ? 'text-white shadow-lg'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-black/20'
            }`}
          style={activeTab === 'active' ? { backgroundColor: branding.primaryColor } : {}}
        >
          <Clock className="w-4 h-4" />
          Active Sessions
          {activeRequests.length > 0 && (
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'active' ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'
              }`}>{activeRequests.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'history'
            ? 'text-white shadow-lg'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-black/20'
            }`}
          style={activeTab === 'history' ? { backgroundColor: branding.primaryColor } : {}}
        >
          <History className="w-4 h-4" />
          Previous Sessions
          {historyRequests.length > 0 && (
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'history' ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'
              }`}>{historyRequests.length}</span>
          )}
        </button>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin" style={{ color: branding.primaryColor }} /></div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-500">{error}</p>
        </div>
      ) : displayedRequests.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg p-12 text-center">
          {activeTab === 'active' ? (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-opacity-10 flex items-center justify-center" style={{ backgroundColor: branding.primaryColor }}>
                <BookOpen className="w-8 h-8" style={{ color: branding.primaryColor }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Active Sessions</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
                You don't have any pending or upcoming tutoring sessions. Request one now!
              </p>
              <button onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-xl font-semibold transition shadow-lg hover:scale-105"
                style={{ backgroundColor: branding.primaryColor }}>
                <Plus className="w-5 h-5" /> Request a Session
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <History className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Previous Sessions</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                Your completed and past tutoring sessions will appear here.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedRequests.map((req) => (
            <RequestCard key={req._id} req={req} />
          ))}
        </div>
      )}

      {/* Create Request Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-700 rounded-t-3xl">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Request Tutoring Session</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />{formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Select Teacher <span className="text-red-500">*</span></label>
                {teachersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading teachers...</div>
                ) : teachers.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No teachers available. Please contact your admin.</p>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none pr-10"
                    >
                      <option value="">Choose a teacher...</option>
                      {teachers.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.firstName} {t.lastName}{t.subjects?.length ? ` — ${t.subjects.join(', ')}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Subject <span className="text-red-500">*</span></label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Mathematics - Algebra"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="Specific topics, doubts, or questions you'd like to cover..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Available Time Slots <span className="text-red-500">*</span></label>
                  <button type="button" onClick={addSlot}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-medium">
                    <Plus className="w-3.5 h-3.5" /> Add Slot
                  </button>
                </div>
                <div className="space-y-3">
                  {slots.map((slot, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600">
                      <div className="flex-1 space-y-2">
                        <input type="date" value={slot.date} onChange={(e) => updateSlot(i, 'date', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="time" value={slot.startTime} onChange={(e) => updateSlot(i, 'startTime', e.target.value)}
                            placeholder="Start"
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
                          <input type="time" value={slot.endTime} onChange={(e) => updateSlot(i, 'endTime', e.target.value)}
                            placeholder="End"
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-600 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                      </div>
                      {slots.length > 1 && (
                        <button type="button" onClick={() => removeSlot(i)} className="mt-1 text-red-400 hover:text-red-600 transition">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Add multiple slots to give your teacher more flexibility</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-semibold transition shadow-md hover:scale-[1.02]"
                  style={{ backgroundColor: branding.primaryColor }}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutoringRequestPage;
