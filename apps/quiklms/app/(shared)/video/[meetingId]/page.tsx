'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Video, Loader2, AlertCircle, Play, Square, XCircle, ExternalLink,
  Eye, EyeOff, Users, Clock, User, LogIn, LogOut, RefreshCw, Copy, Check,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/app/providers';

interface MeetingHost {
  _id: string;
  name: string;
  email?: string;
}

interface Meeting {
  _id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  host: MeetingHost | string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  joinUrl?: string;
  password?: string;
  provider?: string;
  batchId?: string;
  scheduledClassId?: string;
}

interface AttendanceRecord {
  _id: string;
  userId: string | { _id: string; name: string; email?: string };
  joinedAt: string;
  leftAt?: string;
  name?: string;
}

const getHostId = (host: MeetingHost | string): string => {
  if (typeof host === 'object' && host?._id) return host._id;
  return typeof host === 'string' ? host : '';
};

const getHostName = (host: MeetingHost | string): string => {
  if (typeof host === 'object' && host?.name) return host.name;
  return 'Unknown';
};

const getAttendeeName = (record: AttendanceRecord): string => {
  if (record.name) return record.name;
  if (typeof record.userId === 'object' && record.userId?.name) return record.userId.name;
  return 'Unknown';
};

const formatDateTime = (iso: string): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  scheduled:   { bg: 'bg-blue-50 dark:bg-blue-900/20',       text: 'text-blue-700 dark:text-blue-300',     border: 'border-blue-200 dark:border-blue-800',    dot: 'bg-blue-500',                label: 'Scheduled'   },
  in_progress: { bg: 'bg-amber-50 dark:bg-amber-900/20',     text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800',  dot: 'bg-amber-500 animate-pulse', label: 'In Progress' },
  completed:   { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500',         label: 'Completed'   },
  cancelled:   { bg: 'bg-red-50 dark:bg-red-900/20',         text: 'text-red-700 dark:text-red-300',       border: 'border-red-200 dark:border-red-800',      dot: 'bg-red-500',                 label: 'Cancelled'   },
};

const VideoClassPage = () => {
  const params = useParams();
  const meetingId = params.meetingId as string;
  const { user: currentUser } = useCurrentUser();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const attendanceInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const isHost = meeting && currentUser ? getHostId(meeting.host) === currentUser._id : false;
  const isTeacher = currentUser?.role === 'TEACHER';

  const fetchMeeting = useCallback(async () => {
    if (!meetingId) return;
    try {
      setLoading(true);
      setError('');
      const res = await api.get<any>(`/meetings/${meetingId}`);
      setMeeting(res?.meeting ?? res);
    } catch (err: any) {
      setError(err?.statusCode === 404 ? 'Meeting not found' : (err?.message || 'Failed to load meeting details'));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { fetchMeeting(); }, [fetchMeeting]);

  const fetchAttendance = useCallback(async () => {
    if (!meetingId) return;
    try {
      setAttendanceLoading(true);
      const res = await api.get<any>(`/meetings/${meetingId}/attendance`);
      setAttendance(Array.isArray(res) ? res : res?.attendance ?? res?.data ?? []);
    } catch { /* silent */ } finally { setAttendanceLoading(false); }
  }, [meetingId]);

  useEffect(() => {
    if ((isHost || isTeacher) && meeting) {
      fetchAttendance();
      if (meeting.status === 'in_progress') attendanceInterval.current = setInterval(fetchAttendance, 30000);
    }
    return () => { if (attendanceInterval.current) { clearInterval(attendanceInterval.current); attendanceInterval.current = null; } };
  }, [isHost, isTeacher, meeting?.status, fetchAttendance, meeting]);

  const startMeeting = async () => {
    if (!meetingId) return;
    try {
      setActionLoading('start');
      await api.patch<any>(`/meetings/${meetingId}/start`);
      await fetchMeeting();
    } catch (err: any) { alert(err?.message || 'Failed to start meeting'); }
    finally { setActionLoading(null); }
    try { await api.post<any>(`/meetings/${meetingId}/join`); } catch { /* silent */ }
  };

  const endMeeting = async () => {
    if (!meetingId) return;
    try { setActionLoading('end'); await api.patch<any>(`/meetings/${meetingId}/end`); await fetchMeeting(); }
    catch (err: any) { alert(err?.message || 'Failed to end meeting'); }
    finally { setActionLoading(null); }
  };

  const cancelMeeting = async () => {
    if (!meetingId || !confirm('Are you sure you want to cancel this meeting?')) return;
    try { setActionLoading('cancel'); await api.patch<any>(`/meetings/${meetingId}/cancel`); await fetchMeeting(); }
    catch (err: any) { alert(err?.message || 'Failed to cancel meeting'); }
    finally { setActionLoading(null); }
  };

  const joinMeeting = async () => {
    if (!meetingId || !meeting?.joinUrl) return;
    try { setActionLoading('join'); await api.post<any>(`/meetings/${meetingId}/join`); window.open(meeting.joinUrl, '_blank', 'noopener,noreferrer'); }
    catch (err: any) { alert(err?.message || 'Failed to join meeting'); }
    finally { setActionLoading(null); }
  };

  const leaveMeeting = async () => {
    if (!meetingId) return;
    try { setActionLoading('leave'); await api.post<any>(`/meetings/${meetingId}/leave`); await fetchMeeting(); }
    catch (err: any) { alert(err?.message || 'Failed to leave meeting'); }
    finally { setActionLoading(null); }
  };

  const copyJoinLink = async () => {
    if (!meeting?.joinUrl) return;
    try { await navigator.clipboard.writeText(meeting.joinUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); } catch { /* fallback */ }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 rounded-2xl shadow-2xl p-6 lg:p-10 text-white flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center"><Video className="w-8 h-8" /></div>
          <div><h1 className="text-2xl lg:text-4xl font-extrabold">Video Class</h1><p className="text-violet-100 mt-1">Loading meeting details...</p></div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          <span className="ml-3 text-gray-500">Loading meeting...</span>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 rounded-2xl shadow-2xl p-6 lg:p-10 text-white flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center"><Video className="w-8 h-8" /></div>
          <div><h1 className="text-2xl lg:text-4xl font-extrabold">Video Class</h1></div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-1">{error === 'Meeting not found' ? 'Meeting Not Found' : 'Error Loading Meeting'}</h3>
          <p className="text-red-600 dark:text-red-400 text-sm">{error || 'The meeting could not be loaded.'}</p>
          <button onClick={fetchMeeting} className="mt-4 px-5 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-200 transition font-medium">Retry</button>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[meeting.status] || STATUS_CONFIG.scheduled;

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white">
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Video className="w-5 h-5 sm:w-8 sm:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">{meeting.title}</h1>
              <p className="text-violet-100 text-sm sm:text-lg font-light mt-1">{meeting.description || 'Video class session'}</p>
            </div>
          </div>
          <div className={`${statusCfg.bg} ${statusCfg.border} border rounded-full px-4 py-2 flex items-center gap-2`}>
            <div className={`w-2.5 h-2.5 rounded-full ${statusCfg.dot}`} />
            <span className={`text-sm font-semibold ${statusCfg.text}`}>{statusCfg.label}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Details */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4 sm:p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Meeting Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: Clock, label: 'Start Time', value: formatDateTime(meeting.startTime) },
                { icon: Clock, label: 'End Time',   value: formatDateTime(meeting.endTime) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-750 rounded-xl">
                  <Icon className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-750 rounded-xl">
                <User className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Host</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                    {getHostName(meeting.host)}
                    {isHost && <span className="ml-2 text-xs text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">You</span>}
                  </p>
                </div>
              </div>
              {meeting.provider && (
                <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-750 rounded-xl">
                  <Video className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Provider</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 capitalize">{meeting.provider}</p>
                  </div>
                </div>
              )}
            </div>

            {meeting.joinUrl && (
              <div className="p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl space-y-2">
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">Join Link</p>
                <div className="flex items-center gap-2">
                  <a href={meeting.joinUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-sm text-violet-700 dark:text-violet-300 hover:text-violet-900 underline underline-offset-2 truncate transition">
                    {meeting.joinUrl}
                  </a>
                  <button onClick={copyJoinLink} className="p-2 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40 transition shrink-0">
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
                  </button>
                  <a href={meeting.joinUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40 transition shrink-0">
                    <ExternalLink className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </a>
                </div>
              </div>
            )}

            {meeting.password && (
              <div className="p-4 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-xl">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600">
                    {showPassword ? meeting.password : '••••••••'}
                  </code>
                  <button onClick={() => setShowPassword(!showPassword)} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                    {showPassword ? <EyeOff className="w-4 h-4 text-gray-500" /> : <Eye className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Actions</h2>
            {(isHost || isTeacher) ? (
              <div className="flex flex-wrap gap-3">
                {meeting.status === 'scheduled' && (
                  <button onClick={startMeeting} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold transition shadow-lg shadow-emerald-600/25">
                    {actionLoading === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start Class
                  </button>
                )}
                {meeting.status === 'in_progress' && (
                  <button onClick={endMeeting} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-semibold transition shadow-lg shadow-red-600/25">
                    {actionLoading === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />} End Class
                  </button>
                )}
                {meeting.status !== 'completed' && meeting.status !== 'cancelled' && (
                  <button onClick={cancelMeeting} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-5 py-3 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 rounded-xl font-semibold transition">
                    {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Cancel Meeting
                  </button>
                )}
                {meeting.joinUrl && meeting.status === 'in_progress' && (
                  <button onClick={joinMeeting} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-semibold transition shadow-lg shadow-violet-600/25">
                    {actionLoading === 'join' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Open Meeting
                  </button>
                )}
                {meeting.status === 'completed' && <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> This meeting has been completed.</p>}
                {meeting.status === 'cancelled' && <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" /> This meeting has been cancelled.</p>}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {(meeting.status === 'scheduled' || meeting.status === 'in_progress') && meeting.joinUrl && (
                  <button onClick={joinMeeting} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-semibold transition shadow-lg shadow-violet-600/25">
                    {actionLoading === 'join' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Join Class
                  </button>
                )}
                {meeting.status === 'in_progress' && (
                  <button onClick={leaveMeeting} disabled={!!actionLoading}
                    className="flex items-center gap-2 px-5 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 rounded-xl font-semibold transition">
                    {actionLoading === 'leave' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Leave
                  </button>
                )}
                {meeting.status === 'completed' && <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> This class has ended.</p>}
                {meeting.status === 'cancelled' && <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" /> This class has been cancelled.</p>}
                {meeting.status === 'scheduled' && !meeting.joinUrl && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Waiting for the host to start the class...</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Attendance */}
        {(isHost || isTeacher) && (
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4 sm:p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-violet-500" />
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Attendance</h2>
                </div>
                <button onClick={fetchAttendance} disabled={attendanceLoading} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                  <RefreshCw className={`w-4 h-4 text-gray-500 ${attendanceLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {meeting.status === 'in_progress' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block" /> Auto-refreshes every 30 seconds
                </p>
              )}
              {attendance.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">{meeting.status === 'scheduled' ? 'Meeting has not started yet' : 'No attendance records'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {attendance.map((record) => {
                      const name = getAttendeeName(record);
                      const isActive = !record.leftAt;
                      return (
                        <div key={record._id} className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isActive ? 'bg-emerald-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                            {name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Joined {new Date(record.joinedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              {record.leftAt && <> · Left {new Date(record.leftAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</>}
                            </p>
                          </div>
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Total joined</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100">{attendance.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-500 dark:text-gray-400">Currently active</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{attendance.filter((r) => !r.leftAt).length}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoClassPage;
