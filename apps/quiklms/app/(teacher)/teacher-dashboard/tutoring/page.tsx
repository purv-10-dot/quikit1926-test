'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Clock, CheckCircle, XCircle, Calendar, Loader2, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, History } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

interface ProposedSlot {
  date: string;
  startTime: string;
  endTime: string;
}

interface TutoringRequest {
  _id: string;
  subject: string;
  notes?: string;
  proposedSlots: ProposedSlot[];
  confirmedSlot?: ProposedSlot;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  studentId: { _id: string; firstName: string; lastName: string; email: string; grade?: string; section?: string } | null;
  teacherId?: { _id: string; firstName: string; lastName: string; email: string } | null;
  rejectionReason?: string;
  teacherNotes?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  accepted:  { label: 'Accepted',  bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  rejected:  { label: 'Rejected',  bg: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  completed: { label: 'Completed', bg: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-600' },
};

const formatSlot = (slot: ProposedSlot) =>
  `${new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${slot.startTime} – ${slot.endTime}`;

const slotsEqual = (a: ProposedSlot, b: ProposedSlot) =>
  a.date === b.date && a.startTime === b.startTime && a.endTime === b.endTime;

const TutoringRequestsPage = () => {
  const { branding } = useBranding();
  const [requests, setRequests] = useState<TutoringRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(-1);
  const [teacherNotes, setTeacherNotes] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<any>('/tutoring-requests/teacher');
      setRequests(Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const filtered = statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter);

  const handleAccept = async (reqObj: TutoringRequest) => {
    if (selectedSlotIndex < 0 || !reqObj.proposedSlots[selectedSlotIndex]) {
      setActionError('Please select a time slot to confirm.');
      return;
    }
    const slot = reqObj.proposedSlots[selectedSlotIndex];
    setActionLoading(reqObj._id);
    setActionError('');
    try {
      await api.patch<any>(`/tutoring-requests/${reqObj._id}/accept`, {
        confirmedSlot: { date: slot.date, startTime: slot.startTime, endTime: slot.endTime },
        teacherNotes: teacherNotes || undefined,
      });
      setAcceptingId(null);
      setSelectedSlotIndex(-1);
      setTeacherNotes('');
      setSuccessMsg(`Session with ${reqObj.studentId?.firstName || 'student'} accepted!`);
      await fetchRequests();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setActionError(e?.message || 'Failed to accept request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reqObj: TutoringRequest) => {
    setActionLoading(reqObj._id);
    setActionError('');
    try {
      await api.patch<any>(`/tutoring-requests/${reqObj._id}/reject`, {
        rejectionReason: rejectionReason || undefined,
      });
      setRejectingId(null);
      setRejectionReason('');
      setSuccessMsg(`Request from ${reqObj.studentId?.firstName || 'student'} rejected.`);
      await fetchRequests();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setActionError(e?.message || 'Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkCompleted = async (reqObj: TutoringRequest) => {
    setActionLoading(reqObj._id);
    setActionError('');
    try {
      await api.patch<any>(`/tutoring-requests/${reqObj._id}/complete`);
      setSuccessMsg(`Session with ${reqObj.studentId?.firstName || 'student'} marked as completed!`);
      await fetchRequests();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setActionError(e?.message || 'Failed to mark as completed');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
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
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Tutoring Requests</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Review and manage student session proposals</p>
          </div>
        </div>
        {!loading && requests.length > 0 && (
          <div className="relative flex gap-4 mt-6 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <Clock className="w-4 h-4 text-amber-300" />
              <span className="text-sm font-medium">{requests.filter(r => r.status === 'pending').length} Pending</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <CheckCircle className="w-4 h-4 text-emerald-300" />
              <span className="text-sm font-medium">{requests.filter(r => r.status === 'accepted').length} Accepted</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <History className="w-4 h-4 text-purple-200" />
              <span className="text-sm font-medium">{requests.filter(r => r.status === 'completed').length + requests.filter(r => r.status === 'rejected').length} Past</span>
            </div>
          </div>
        )}
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'accepted', 'rejected', 'completed'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition capitalize ${
              statusFilter === s ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-indigo-300'
            }`}>
            {s === 'all' ? 'All' : s}
            {s !== 'all' && ` (${requests.filter(r => r.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : error ? (
        <div className="text-center py-12"><AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" /><p className="text-red-500">{error}</p></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg p-12 text-center">
          <BookOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No {statusFilter !== 'all' ? statusFilter : ''} tutoring requests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
          {filtered.map((req) => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const isExpanded = expandedId === req._id;
            const student = req.studentId;
            const studentName = student?.firstName
              ? `${student.firstName} ${student.lastName || ''}`
              : 'Unknown Student';
            const studentInitial = student?.firstName
              ? student.firstName.charAt(0).toUpperCase()
              : '?';
            const isActioning = actionLoading === req._id;

            return (
              <div key={req._id} className={`bg-white dark:bg-gray-800 rounded-2xl border ${cfg.border} shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
                {/* Header Row */}
                <div className="p-5 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : req._id)}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{studentInitial}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{studentName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {student?.email || ''}
                          {student?.grade ? ` · Grade ${student.grade}` : ''}
                          {student?.section ? ` ${student.section}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${cfg.bg}`}>{cfg.label}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 flex-wrap text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-indigo-500" />{req.subject}</span>
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-gray-400" />{new Date(req.createdAt).toLocaleDateString()}</span>
                    <span className="text-gray-400">{req.proposedSlots.length} slot{req.proposedSlots.length !== 1 ? 's' : ''} proposed</span>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-5 space-y-4">
                    {req.notes && (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                        <p className="text-xs font-medium text-gray-500 mb-1">Student's Notes</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{req.notes}</p>
                      </div>
                    )}

                    {/* Proposed Slots */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {req.status === 'pending' ? 'Select a slot to confirm:' : 'Proposed Slots'}
                      </p>
                      <div className="space-y-2">
                        {req.proposedSlots.map((slot, i) => {
                          const isSelected = acceptingId === req._id && selectedSlotIndex === i;
                          const isConfirmed = req.confirmedSlot && slotsEqual(slot, req.confirmedSlot);
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                                isConfirmed
                                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                                  : isSelected
                                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                                    : req.status === 'pending'
                                      ? 'border-gray-200 dark:border-gray-600 hover:border-indigo-300 cursor-pointer'
                                      : 'border-gray-200 dark:border-gray-600'
                              }`}
                              onClick={() => {
                                if (req.status === 'pending') {
                                  setAcceptingId(req._id);
                                  setSelectedSlotIndex(i);
                                  setActionError('');
                                }
                              }}
                            >
                              <Calendar className={`w-4 h-4 shrink-0 ${isConfirmed ? 'text-emerald-500' : 'text-indigo-500'}`} />
                              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{formatSlot(slot)}</span>
                              {isConfirmed && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                              {isSelected && !isConfirmed && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Confirmed Slot (for accepted/completed) */}
                    {(req.status === 'accepted' || req.status === 'completed') && req.confirmedSlot && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Confirmed Slot</p>
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">{formatSlot(req.confirmedSlot)}</p>
                        {req.teacherNotes && <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">Your notes: {req.teacherNotes}</p>}
                      </div>
                    )}

                    {/* Rejection reason (for rejected) */}
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Rejection Reason</p>
                        <p className="text-sm text-red-600 dark:text-red-400">{req.rejectionReason}</p>
                      </div>
                    )}

                    {/* Pending Actions */}
                    {req.status === 'pending' && (
                      <div className="space-y-3">
                        {acceptingId === req._id && selectedSlotIndex >= 0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes for student (optional)</label>
                            <textarea value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} rows={2}
                              placeholder="Any preparation tips or instructions..."
                              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                          </div>
                        )}
                        {rejectingId === req._id && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason for rejection (optional)</label>
                            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2}
                              placeholder="e.g. None of the proposed slots are available..."
                              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                          </div>
                        )}
                        {actionError && acceptingId === req._id && (
                          <p className="text-sm text-red-500 dark:text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{actionError}</p>
                        )}
                        <div className="flex gap-3">
                          {rejectingId === req._id ? (
                            <>
                              <button
                                onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                                disabled={isActioning}
                                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                              >Cancel</button>
                              <button
                                onClick={() => handleReject(req)}
                                disabled={isActioning}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl font-semibold transition"
                              >
                                {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                Confirm Rejection
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setRejectingId(req._id);
                                  setAcceptingId(null);
                                  setSelectedSlotIndex(-1);
                                  setActionError('');
                                }}
                                disabled={isActioning}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                              >
                                <XCircle className="w-4 h-4" /> Reject
                              </button>
                              <button
                                onClick={() => {
                                  if (acceptingId !== req._id || selectedSlotIndex < 0) {
                                    setAcceptingId(req._id);
                                    setActionError('Please click on a time slot above to select it, then click Accept.');
                                    return;
                                  }
                                  handleAccept(req);
                                }}
                                disabled={isActioning}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
                              >
                                {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Accept
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Mark Completed button for accepted sessions */}
                    {req.status === 'accepted' && (
                      <div className="pt-2">
                        <button
                          onClick={() => handleMarkCompleted(req)}
                          disabled={isActioning}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
                        >
                          {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Mark Session as Completed
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TutoringRequestsPage;
