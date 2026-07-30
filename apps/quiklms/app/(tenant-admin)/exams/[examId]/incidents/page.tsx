'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { ArrowLeft, Shield, AlertTriangle, Eye, CheckCircle, XCircle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

interface Incident {
  _id: string;
  sessionId: string;
  student?: { _id: string; firstName: string; lastName: string; email: string };
  sessionStatus: string;
  flagSummary: Record<string, number>;
  disposition: string;
  action: string;
  remarks?: string;
  reviewedAt?: string;
  proctoringFlags?: { totalFlags: number; severityLevel: string; tabSwitches: number; fullscreenExits: number; copyAttempts: number; rightClicks: number; shortcutAttempts: number };
}

interface LogEntry {
  _id: string;
  eventType: string;
  timestamp: string;
  severity: string;
  metadata?: any;
}

const EVENT_LABELS: Record<string, string> = {
  tab_switch: 'Tab Switch',
  fullscreen_exit: 'Fullscreen Exit',
  copy_attempt: 'Copy Attempt',
  paste_attempt: 'Paste Attempt',
  right_click: 'Right Click',
  shortcut_key: 'Shortcut Key',
  print_attempt: 'Print Attempt',
  blur: 'Window Blur',
  beforeunload: 'Page Leave Attempt',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-yellow-100 text-yellow-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

const DISPOSITION_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  dismissed: 'bg-green-100 text-green-700',
  confirmed_violation: 'bg-red-100 text-red-700',
};

export default function IncidentReviewPage() {
  const params = useParams();
  const examId = params.examId as string;
  const router = useRouter();
  const { branding } = useBranding();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [reviewForm, setReviewForm] = useState({ disposition: 'pending', action: 'none', remarks: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchIncidents();
  }, [examId]);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await api.get<any>(`/proctoring/exam/${examId}/incidents`);
      setIncidents(res.data || []);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const viewDetails = async (incident: Incident) => {
    setSelectedIncident(incident);
    setReviewForm({
      disposition: incident.disposition || 'pending',
      action: incident.action || 'none',
      remarks: incident.remarks || '',
    });
    setLogsLoading(true);
    try {
      const res = await api.get<any>(`/proctoring/${incident.sessionId}/log`);
      setLogs(res.data || []);
    } catch {}
    finally { setLogsLoading(false); }
  };

  const handleReview = async () => {
    if (!selectedIncident) return;
    setSaving(true);
    try {
      await api.patch<any>(`/proctoring/${selectedIncident.sessionId}/incident`, reviewForm);
      await fetchIncidents();
      setSelectedIncident(null);
      toast.success('Review saved successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const totalPending = incidents.filter(i => i.disposition === 'pending').length;

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster />
      <button onClick={() => router.push('/exams')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 pt-4">
        <ArrowLeft className="w-4 h-4" /> Back to Exams
      </button>

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
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Incident Review</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">{incidents.length} flagged sessions | {totalPending} pending review</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-gray-500">No proctoring incidents found. All sessions are clean.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map(inc => (
            <div key={inc._id} className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    inc.proctoringFlags?.severityLevel === 'high' ? 'bg-red-100' :
                    inc.proctoringFlags?.severityLevel === 'medium' ? 'bg-amber-100' : 'bg-yellow-100'
                  }`}>
                    <AlertTriangle className={`w-5 h-5 ${
                      inc.proctoringFlags?.severityLevel === 'high' ? 'text-red-600' :
                      inc.proctoringFlags?.severityLevel === 'medium' ? 'text-amber-600' : 'text-yellow-600'
                    }`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{inc.student?.firstName} {inc.student?.lastName}</p>
                    <p className="text-xs text-gray-400">{inc.student?.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right mr-4">
                    <p className="text-sm font-medium text-gray-700">{inc.proctoringFlags?.totalFlags || 0} total flags</p>
                    <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                      {(inc.proctoringFlags?.tabSwitches || 0) > 0 && <span>Tabs: {inc.proctoringFlags?.tabSwitches}</span>}
                      {(inc.proctoringFlags?.fullscreenExits || 0) > 0 && <span>FS: {inc.proctoringFlags?.fullscreenExits}</span>}
                      {(inc.proctoringFlags?.copyAttempts || 0) > 0 && <span>Copy: {inc.proctoringFlags?.copyAttempts}</span>}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${DISPOSITION_COLORS[inc.disposition] || 'bg-gray-100'}`}>
                    {inc.disposition.replace('_', ' ')}
                  </span>
                  <button onClick={() => viewDetails(inc)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200">
                    <Eye className="w-3.5 h-3.5" /> Review
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 p-4 sm:p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedIncident.student?.firstName} {selectedIncident.student?.lastName} — Incident Detail
                  </h2>
                  <p className="text-sm text-gray-500">{selectedIncident.proctoringFlags?.totalFlags || 0} total flags</p>
                </div>
                <button onClick={() => setSelectedIncident(null)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {/* Timeline */}
              <h3 className="font-semibold text-gray-800 mb-3">Event Timeline</h3>
              {logsLoading ? (
                <div className="text-center py-6 text-gray-500">Loading events...</div>
              ) : logs.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">No events logged</p>
              ) : (
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {logs.map(log => (
                    <div key={log._id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[log.severity] || 'bg-gray-100'}`}>
                        {log.severity}
                      </span>
                      <span className="text-sm font-medium text-gray-700">{EVENT_LABELS[log.eventType] || log.eventType}</span>
                      <span className="text-xs text-gray-400 ml-auto">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      {log.metadata && <span className="text-xs text-gray-400">{typeof log.metadata === 'object' ? JSON.stringify(log.metadata) : log.metadata}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Review Form */}
              <h3 className="font-semibold text-gray-800 mb-3">Review Decision</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Disposition</label>
                    <select value={reviewForm.disposition} onChange={e => setReviewForm({ ...reviewForm, disposition: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="pending">Pending</option>
                      <option value="dismissed">Dismissed (No Violation)</option>
                      <option value="confirmed_violation">Confirmed Violation</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Action</label>
                    <select value={reviewForm.action} onChange={e => setReviewForm({ ...reviewForm, action: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="none">No Action</option>
                      <option value="warning">Warning</option>
                      <option value="penalty_applied">Apply Penalty</option>
                      <option value="session_voided">Void Session</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Remarks</label>
                  <textarea value={reviewForm.remarks} onChange={e => setReviewForm({ ...reviewForm, remarks: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Add review notes..." />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t p-4 sm:p-6 flex justify-end gap-3">
              <button onClick={() => setSelectedIncident(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleReview} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
