'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { Phone, AlertTriangle, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface CallAttempt {
  attemptNumber: number;
  attemptTime: string;
  phoneNumber: string;
  callStatus: string;
  callDuration?: number;
  callSid?: string;
}

interface Escalation {
  _id: string;
  teacherId: { _id: string; firstName: string; lastName: string; email: string } | null;
  scheduledClassId: { _id: string; title: string; startTime: string; endTime: string; status: string } | null;
  callAttempts: CallAttempt[];
  status: string;
  adminNotified: boolean;
  resolutionTime?: string;
  teacherJoinedAt?: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  escalating: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />,
  escalating: <Phone className="w-4 h-4 animate-pulse" />,
  resolved: <CheckCircle className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
};

export default function EscalationLogPage() {
  const { branding } = useBranding();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchEscalations();
  }, [filter]);

  const fetchEscalations = async () => {
    try {
      const queryString = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await api.get<any>(`/escalations/admin${queryString}`);
      const data = res.data;
      setEscalations(Array.isArray(data) ? data : data?.data || []);
    } catch (err: any) {
      console.error('Failed to fetch escalations:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTeacherName = (e: Escalation) =>
    e.teacherId ? `${e.teacherId.firstName} ${e.teacherId.lastName}` : 'Unknown';

  const getClassName = (e: Escalation) =>
    e.scheduledClassId?.title || 'Unknown class';

  const stats = {
    total: escalations.length,
    resolved: escalations.filter(e => e.status === 'resolved').length,
    failed: escalations.filter(e => e.status === 'failed').length,
    active: escalations.filter(e => ['pending', 'escalating'].includes(e.status)).length,
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
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
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Call Escalation Log</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Auto-call escalation history for missed classes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'bg-blue-50 text-blue-700' },
          { label: 'Active', value: stats.active, color: 'bg-orange-50 text-orange-700' },
          { label: 'Resolved', value: stats.resolved, color: 'bg-green-50 text-green-700' },
          { label: 'Failed', value: stats.failed, color: 'bg-red-50 text-red-700' },
        ].map(s => (
          <div key={s.label} className={`p-4 rounded-xl ${s.color}`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="escalating">Escalating</option>
          <option value="resolved">Resolved</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : escalations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No escalations found</p>
          <p className="text-sm text-gray-400">All teachers have been attending their classes on time</p>
        </div>
      ) : (
        <div className="space-y-3">
          {escalations.map(e => (
            <div key={e._id} className="bg-white border rounded-xl overflow-hidden">
              <div
                className="p-4 flex items-center justify-between flex-wrap gap-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === e._id ? null : e._id)}
              >
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[e.status] || 'bg-gray-100'}`}>
                    {statusIcons[e.status]} {e.status}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{getTeacherName(e)}</p>
                    <p className="text-sm text-gray-500">{getClassName(e)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm text-gray-500">
                    <p>{new Date(e.createdAt).toLocaleDateString()}</p>
                    <p>{new Date(e.createdAt).toLocaleTimeString()}</p>
                  </div>
                  {expandedId === e._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {expandedId === e._id && (
                <div className="border-t px-4 py-3 bg-gray-50">
                  <h4 className="font-medium text-sm mb-2">Call Attempts ({e.callAttempts.length})</h4>
                  <div className="space-y-2">
                    {e.callAttempts.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
                          {a.attemptNumber}
                        </span>
                        <span className="text-gray-600">{a.phoneNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          a.callStatus === 'answered' ? 'bg-green-100 text-green-700' :
                          a.callStatus === 'initiated' ? 'bg-blue-100 text-blue-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {a.callStatus}
                        </span>
                        <span className="text-gray-400">{new Date(a.attemptTime).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {e.callAttempts.length === 0 && (
                      <p className="text-sm text-gray-400">No call attempts yet</p>
                    )}
                  </div>
                  {e.adminNotified && (
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Admin notified about missed class
                    </p>
                  )}
                  {e.teacherJoinedAt && (
                    <p className="text-xs text-green-600 mt-2">
                      Teacher joined at {new Date(e.teacherJoinedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
