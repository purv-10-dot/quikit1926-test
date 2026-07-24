'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Play,
  CheckCircle2,
  Clock,
  MapPin,
  Loader2,
  AlertCircle,
  CalendarCheck,
  Video,
  X,
  CalendarDays,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClassSession {
  _id: string;
  title: string;
  batchId: string | { _id: string; name: string };
  date?: string;
  startTime: string; // Full ISO date string from backend
  endTime: string;   // Full ISO date string from backend
  location?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  scheduled: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
    label: 'Scheduled',
  },
  in_progress: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
    label: 'In Progress',
  },
  completed: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    label: 'Completed',
  },
  cancelled: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
    label: 'Cancelled',
  },
  rescheduled: {
    bg: 'bg-gray-50 dark:bg-gray-700/30',
    text: 'text-gray-500 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-600',
    dot: 'bg-gray-400',
    label: 'Rescheduled',
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const getMonday = (d: Date): Date => {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const addDays = (d: Date, n: number): Date => {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
};

const formatDateISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Component ──────────────────────────────────────────────────────────────────

const MyClassesPage = () => {
  const router = useRouter();
  const { branding } = useBranding();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [meetingMap, setMeetingMap] = useState<Record<string, { meetingId: string; url: string }>>({});
  const [videoLoading, setVideoLoading] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);

  // ── Fetch classes ──────────────────────────────────────────────────────────

  const fetchClasses = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<any>('/scheduling/teacher/classes', {
        params: {
          startDate: formatDateISO(weekStart),
          endDate: formatDateISO(addDays(weekStart, 6)),
        },
      });
      const data = Array.isArray(res) ? res : res?.classes ?? res?.data ?? [];
      setClasses(data);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const startClass = async (id: string) => {
    try {
      setActionLoading(id);
      await api.patch<any>(`/scheduling/classes/${id}/start`);
      fetchClasses();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'Failed to start class');
    } finally {
      setActionLoading(null);
    }
  };

  const completeClass = async (id: string) => {
    try {
      setActionLoading(id);
      await api.patch<any>(`/scheduling/classes/${id}/complete`);
      fetchClasses();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'Failed to complete class');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Reschedule State ───────────────────────────────────────────────────────
  const [rescheduleClass, setRescheduleClass] = useState<ClassSession | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ newDate: '', newStartTime: '', newEndTime: '', reason: '' });
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  const openReschedule = (cls: ClassSession) => {
    const startDate = new Date(cls.startTime);
    const endDate = new Date(cls.endTime);
    setRescheduleClass(cls);
    setRescheduleForm({
      newDate: startDate.toISOString().slice(0, 10),
      newStartTime: startDate.toTimeString().slice(0, 5),
      newEndTime: endDate.toTimeString().slice(0, 5),
      reason: '',
    });
    setRescheduleError('');
  };

  const handleReschedule = async () => {
    if (!rescheduleClass) return;
    if (!rescheduleForm.newDate || !rescheduleForm.newStartTime || !rescheduleForm.newEndTime) {
      setRescheduleError('Please fill in the new date and times.');
      return;
    }
    if (!rescheduleForm.reason.trim()) {
      setRescheduleError('Please provide a reason for rescheduling.');
      return;
    }
    const newStart = new Date(`${rescheduleForm.newDate}T${rescheduleForm.newStartTime}`);
    const newEnd = new Date(`${rescheduleForm.newDate}T${rescheduleForm.newEndTime}`);
    if (newEnd <= newStart) { setRescheduleError('End time must be after start time.'); return; }
    setRescheduling(true);
    try {
      await api.patch<any>(`/scheduling/classes/${rescheduleClass._id}/reschedule`, {
        newStartTime: newStart.toISOString(),
        newEndTime: newEnd.toISOString(),
        reason: rescheduleForm.reason,
      });
      setRescheduleClass(null);
      fetchClasses();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setRescheduleError(e?.message || 'Failed to reschedule class');
    } finally {
      setRescheduling(false);
    }
  };

  // ── Provider Picker State ──────────────────────────────────────────────────
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [pickerClass, setPickerClass] = useState<ClassSession | null>(null);

  const PROVIDERS = [
    { value: 'google_meet', label: 'Google Meet', icon: '🟢', desc: 'Google Meet video call' },
    { value: 'zoom', label: 'Zoom', icon: '🔵', desc: 'Zoom video meeting' },
    { value: 'jitsi', label: 'Jitsi Meet', icon: '🟣', desc: 'Free, no account needed' },
  ];

  // ── Video Class ────────────────────────────────────────────────────────────

  const openVideoClass = (cls: ClassSession) => {
    if (meetingMap[cls._id]?.meetingId) {
      router.push(`/teacher-dashboard/video/${meetingMap[cls._id].meetingId}`);
      return;
    }
    setPickerClass(cls);
    setShowProviderPicker(true);
  };

  const createMeetingWithProvider = async (cls: ClassSession, provider: string) => {
    setShowProviderPicker(false);
    try {
      setVideoLoading(cls._id);
      let hostUrl: string | null = null;
      let meetingId: string | null = null;

      // Check for existing meeting first
      try {
        const res = await api.get<any>('/meetings', {
          params: { scheduledClassId: cls._id },
        });
        const meetings = Array.isArray(res) ? res : res?.meetings ?? res?.data ?? [];
        if (meetings.length > 0) {
          meetingId = meetings[0]._id;
          hostUrl = meetings[0].hostUrl || meetings[0].joinUrl;
        }
      } catch {
        // No existing meeting
      }

      // If no existing meeting, create one with the selected provider
      if (!hostUrl) {
        const res = await api.post<any>('/meetings', {
          title: cls.title,
          scheduledStartTime: cls.startTime,
          scheduledEndTime: cls.endTime,
          scheduledClassId: cls._id,
          provider,
        });
        const meeting = res?.meeting ?? res;
        meetingId = meeting._id;
        hostUrl = meeting.hostUrl || meeting.joinUrl;
      }

      // Auto-start the class if it's still in "scheduled" status
      // This triggers the email notification to students with the join link
      if (cls.status === 'scheduled') {
        try {
          await api.patch<any>(`/scheduling/classes/${cls._id}/start`);
        } catch {
          // Class may already be started, ignore
        }
      }

      if (hostUrl && meetingId) {
        const capturedMeetingId = meetingId;
        setMeetingMap((prev) => ({ ...prev, [cls._id]: { meetingId: capturedMeetingId, url: hostUrl! } }));
        router.push(`/teacher-dashboard/video/${capturedMeetingId}`);
      }

      // Refresh classes to reflect updated status
      fetchClasses();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'Failed to create video class');
    } finally {
      setVideoLoading(null);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goToPrevWeek = () => setWeekStart(addDays(weekStart, -7));
  const goToNextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToToday = () => setWeekStart(getMonday(new Date()));

  // ── Group classes by day ───────────────────────────────────────────────────

  const classesByDay: Record<string, ClassSession[]> = {};
  weekDays.forEach((d) => {
    classesByDay[formatDateISO(d)] = [];
  });
  classes.forEach((c) => {
    const key = c.date?.slice(0, 10) || (c.startTime ? formatDateISO(new Date(c.startTime)) : '');
    if (key && classesByDay[key]) {
      classesByDay[key].push(c);
    }
  });

  const getBatchName = (batchId: string | { _id: string; name: string }) => {
    if (typeof batchId === 'object' && batchId?.name) return batchId.name;
    return '';
  };

  // ── Week label ─────────────────────────────────────────────────────────────

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

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
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">My Classes</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Your weekly class schedule</p>
          </div>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevWeek}
              className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={goToNextWeek}
              className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{weekLabel}</h2>

          <button
            onClick={goToToday}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition text-sm"
          >
            <CalendarCheck className="w-4 h-4" />
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading schedule...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button onClick={fetchClasses} className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-200 transition">
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
          {weekDays.map((day, idx) => {
            const key = formatDateISO(day);
            const dayClasses = classesByDay[key] || [];
            const isToday = isSameDay(day, today);

            return (
              <div
                key={key}
                className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg border overflow-hidden transition-all duration-200 ${
                  isToday
                    ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800'
                    : 'border-gray-100 dark:border-gray-700'
                }`}
              >
                {/* Day Header */}
                <div
                  className={`px-4 py-3 text-center border-b ${
                    isToday
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800'
                      : 'bg-gray-50 dark:bg-gray-750 border-gray-100 dark:border-gray-700'
                  }`}
                >
                  <p className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    <span className="hidden lg:inline">{DAY_NAMES[idx]}</span>
                    <span className="lg:hidden">{DAY_SHORT[idx]}</span>
                  </p>
                  <p className={`text-lg font-bold mt-0.5 ${isToday ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>
                    {day.getDate()}
                  </p>
                </div>

                {/* Classes */}
                <div className="p-2 space-y-2 min-h-[120px]">
                  {dayClasses.length === 0 ? (
                    <div className="flex items-center justify-center h-[100px] text-sm text-gray-400 dark:text-gray-500">
                      No classes
                    </div>
                  ) : (
                    dayClasses.map((cls) => {
                      const cfg = STATUS_CONFIG[cls.status] || STATUS_CONFIG.scheduled;
                      const batchName = getBatchName(cls.batchId);
                      const isActionTarget = actionLoading === cls._id;

                      return (
                        <div
                          key={cls._id}
                          className={`${cfg.bg} ${cfg.border} border rounded-xl p-3 space-y-2 transition-all duration-200 hover:shadow-md`}
                        >
                          {/* Status dot + title */}
                          <div className="flex items-start gap-2">
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold truncate ${cfg.text}`}>{cls.title}</p>
                              {batchName && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{batchName}</p>
                              )}
                            </div>
                          </div>

                          {/* Time & location */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>
                                {new Date(cls.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {' – '}
                                {new Date(cls.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {cls.location && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{cls.location}</span>
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          {cls.status === 'scheduled' && (
                            <div className="space-y-1.5">
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => startClass(cls._id)}
                                  disabled={isActionTarget}
                                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition"
                                >
                                  {isActionTarget ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                  Start
                                </button>
                                <button
                                  onClick={() => openVideoClass(cls)}
                                  disabled={videoLoading === cls._id}
                                  className="flex items-center justify-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition"
                                  title="Video Class"
                                >
                                  {videoLoading === cls._id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Video className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                          {/* Reschedule button — visible for scheduled, in_progress, and completed classes */}
                          {(cls.status === 'scheduled' || cls.status === 'in_progress' || cls.status === 'completed') && (
                            <button
                              onClick={() => openReschedule(cls)}
                              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition mt-1.5"
                            >
                              <CalendarDays className="w-3 h-3" />
                              Reschedule
                            </button>
                          )}
                          {cls.status === 'in_progress' && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => completeClass(cls._id)}
                                disabled={isActionTarget}
                                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition"
                              >
                                {isActionTarget ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                Complete
                              </button>
                              <button
                                onClick={() => openVideoClass(cls)}
                                disabled={videoLoading === cls._id}
                                className="flex items-center justify-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition"
                                title="Video Class"
                              >
                                {videoLoading === cls._id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Video className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Reschedule Modal ───────────────────────────────────────────────── */}
      {rescheduleClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRescheduleClass(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Reschedule Class</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{rescheduleClass.title}</p>
              </div>
              <button onClick={() => setRescheduleClass(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New Date</label>
              <input type="date" value={rescheduleForm.newDate}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, newDate: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New Start Time</label>
                <input type="time" value={rescheduleForm.newStartTime}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, newStartTime: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New End Time</label>
                <input type="time" value={rescheduleForm.newEndTime}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, newEndTime: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reason <span className="text-red-500">*</span></label>
              <textarea value={rescheduleForm.reason} rows={3}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, reason: e.target.value })}
                placeholder="e.g. Teacher unavailable due to urgent appointment..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none" />
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-xl p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Students will be automatically notified about the reschedule via email.
              </p>
            </div>

            {rescheduleError && (
              <p className="text-sm text-red-500 dark:text-red-400">{rescheduleError}</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setRescheduleClass(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                Cancel
              </button>
              <button onClick={handleReschedule} disabled={rescheduling}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-semibold transition">
                {rescheduling && <Loader2 className="w-4 h-4 animate-spin" />}
                <CalendarDays className="w-4 h-4" />
                Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Provider Picker Modal ──────────────────────────────────────────── */}
      {showProviderPicker && pickerClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowProviderPicker(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Choose Platform</h3>
              <button onClick={() => setShowProviderPicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a video platform for &quot;<span className="font-medium text-gray-700 dark:text-gray-300">{pickerClass.title}</span>&quot;</p>
            <div className="space-y-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => createMeetingWithProvider(pickerClass, p.value)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all duration-200 text-left"
                >
                  <span className="text-2xl">{p.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{p.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{p.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyClassesPage;
