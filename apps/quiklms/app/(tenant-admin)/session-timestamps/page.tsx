'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Filter, Loader2, User, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

type SessionRow = {
  scheduledClassId: string;
  meetingId: string | null;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  batch: { _id: string; name: string; subject?: string; grade?: string } | null;
  teacher: { _id: string; firstName?: string; lastName?: string; email?: string } | null;
  teacherFirstJoinAt: string | null;
  students: Array<{
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    firstJoinAt: string | null;
  }>;
};

const toISODateInput = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export default function SessionTimestampsPage() {
  const { branding } = useBranding();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toISODateInput(d);
  });
  const [endDate, setEndDate] = useState(() => toISODateInput(new Date()));
  const [query, setQuery] = useState('');

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const from = new Date(`${startDate}T00:00:00.000Z`).toISOString();
      const to = new Date(`${endDate}T23:59:59.999Z`).toISOString();
      const res = await api.get<any>('/scheduling/admin/session-join-timestamps', {
        params: { startDate: from, endDate: to, limit: 300 },
      });
      setRows(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load session timestamps');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const teacherName = `${r.teacher?.firstName || ''} ${r.teacher?.lastName || ''}`.trim();
      const batchName = r.batch?.name || '';
      const subject = r.batch?.subject || '';
      return (
        r.title?.toLowerCase().includes(q) ||
        teacherName.toLowerCase().includes(q) ||
        batchName.toLowerCase().includes(q) ||
        subject.toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
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
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Session Timestamps</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">
              Teacher and student join times per class session
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Class, batch, subject, teacher..."
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{filtered.length} sessions</p>
          <button
            onClick={fetchRows}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50"
            disabled={loading}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Refreshing
              </span>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading sessions...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-6 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-750">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Teacher</th>
                  <th className="px-4 py-3">Scheduled start</th>
                  <th className="px-4 py-3">Teacher join</th>
                  <th className="px-4 py-3">Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((r) => {
                  const teacherName =
                    `${r.teacher?.firstName || ''} ${r.teacher?.lastName || ''}`.trim() || '—';
                  const batchLabel = r.batch
                    ? `${r.batch.subject || 'Class'} · ${r.batch.name}`
                    : '';
                  const isOpen = !!expanded[r.scheduledClassId];
                  const teacherLate =
                    r.teacherFirstJoinAt &&
                    new Date(r.teacherFirstJoinAt).getTime() > new Date(r.startTime).getTime();
                  const teacherJoined = !!r.teacherFirstJoinAt;
                  const teacherLateByMins =
                    teacherLate && r.teacherFirstJoinAt
                      ? Math.max(
                          0,
                          Math.round(
                            (new Date(r.teacherFirstJoinAt).getTime() -
                              new Date(r.startTime).getTime()) /
                              60000,
                          ),
                        )
                      : null;

                  return (
                    <tr
                      key={r.scheduledClassId}
                      className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            setExpanded((p) => ({
                              ...p,
                              [r.scheduledClassId]: !p[r.scheduledClassId],
                            }))
                          }
                          className="text-left w-full"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {r.title}
                              </p>
                              {batchLabel && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {batchLabel}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 mt-0.5 text-gray-500">
                              {isOpen ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="mt-3 bg-gray-50 dark:bg-gray-750 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-2">
                              <User className="w-4 h-4 text-violet-500" />
                              <span className="font-semibold">Teacher</span>
                            </div>

                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="text-xs text-gray-700 dark:text-gray-200 truncate">
                                {teacherName}
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold shrink-0 ${
                                  !teacherJoined
                                    ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                    : teacherLate
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                                }`}
                              >
                                {fmt(r.teacherFirstJoinAt)}
                              </span>
                            </div>

                            <div className="my-2 border-t border-gray-200 dark:border-gray-700" />

                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-2">
                              <Users className="w-4 h-4" />
                              <span className="font-semibold">Students</span>
                            </div>
                            {r.students?.length ? (
                              <div className="space-y-1">
                                {r.students.map((s) => {
                                  const name =
                                    `${s.firstName || ''} ${s.lastName || ''}`.trim() ||
                                    s.email ||
                                    s._id;
                                  const studentLate =
                                    s.firstJoinAt &&
                                    new Date(s.firstJoinAt).getTime() >
                                      new Date(r.startTime).getTime();
                                  const studentJoined = !!s.firstJoinAt;

                                  return (
                                    <div
                                      key={s._id}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <span className="text-xs text-gray-700 dark:text-gray-200 truncate">
                                        {name}
                                      </span>
                                      <span
                                        className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold shrink-0 ${
                                          !studentJoined
                                            ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                            : studentLate
                                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                                        }`}
                                      >
                                        {fmt(s.firstJoinAt)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                No students found.
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{teacherName}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                        {fmt(r.startTime)}
                      </td>
                      <td className="px-4 py-3">
                        {r.teacherFirstJoinAt ? (
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold ${
                                teacherLate
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                              }`}
                            >
                              {fmt(r.teacherFirstJoinAt)}
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              {teacherLate ? `Late by ${teacherLateByMins}m` : 'On time'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                        {r.students?.length || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
