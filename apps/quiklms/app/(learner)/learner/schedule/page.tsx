'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  BookOpen,
  User,
  ChevronLeft,
  ChevronRight,
  Video,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

interface ScheduledClass {
  _id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  status: string;
  meetingId?: string | { _id: string; joinUrl?: string };
  batchId?: {
    name: string;
    grade?: string;
    subject: string;
  };
  teacherId?: {
    firstName: string;
    lastName: string;
  };
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const StudentSchedulePage = () => {
  const { branding } = useBranding();
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekRange = useCallback(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + weekOffset * 7);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return { startOfWeek, endOfWeek };
  }, [weekOffset]);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startOfWeek, endOfWeek } = getWeekRange();
      const res = await api.get<any>('/scheduling/student/classes', {
        params: {
          startDate: startOfWeek.toISOString(),
          endDate: endOfWeek.toISOString(),
        },
      });
      const raw = res?.data ?? res;
      setClasses(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      console.error('Failed to load schedule:', err);
      setError(err?.message || 'Failed to load schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getWeekRange]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const weekDates = useMemo(() => {
    const { startOfWeek } = getWeekRange();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, [getWeekRange]);

  const weekLabel = useMemo(() => {
    const a = weekDates[0];
    const b = weekDates[6];
    if (!a || !b) return '';
    const sameMonth = a.getMonth() === b.getMonth();
    if (sameMonth) {
      return `${a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · ${a.getDate()}–${b.getDate()}`;
    }
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [weekDates]);

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const joinAndOpenMeeting = async (meetingId: string, joinUrl?: string) => {
    if (!meetingId) return;
    try {
      await api.post<any>(`/meetings/${meetingId}/join`, {});
    } catch {
      // still attempt to open the meeting link even if tracking fails
    }
    if (joinUrl) window.open(joinUrl, '_blank', 'noopener,noreferrer');
  };

  const getClassesForDay = (date: Date) =>
    classes.filter((c) => {
      const classDate = new Date(c.startTime);
      return classDate.toDateString() === date.toDateString();
    });

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'scheduled':
        return { bar: 'bg-sky-500', badge: 'bg-sky-50 text-sky-800 border-sky-200' };
      case 'in_progress':
        return { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case 'completed':
        return { bar: 'bg-slate-300', badge: 'bg-slate-100 text-slate-700 border-slate-200' };
      case 'cancelled':
        return { bar: 'bg-red-400', badge: 'bg-red-50 text-red-800 border-red-200' };
      default:
        return { bar: 'bg-indigo-400', badge: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();

  const fetchMeetingLink = async (meetingId?: string) => {
    if (!meetingId) return;
    try {
      const res = await api.get<any>(`/meetings/${meetingId}`);
      const meeting = res.data;
      if (meeting?.joinUrl) {
        window.open(meeting.joinUrl, '_blank');
      } else {
        alert('Meeting link is not available yet. Check your email for the join link.');
      }
    } catch {
      alert('Could not fetch meeting link. Check your email for the join link.');
    }
  };

  /**
   * Open a class's room, whichever shape `meetingId` arrived in.
   *
   * `/scheduling/student/classes` returns the class's own scalar columns, so
   * `meetingId` is a plain id here; the populated `{_id, joinUrl}` form comes from
   * other endpoints. Both were already handled inline — pulled out so the
   * `scheduled` and `in_progress` buttons cannot drift apart.
   */
  const openClassMeeting = async (cls: ScheduledClass) => {
    if (typeof cls.meetingId === 'object' && cls.meetingId?.joinUrl) {
      await joinAndOpenMeeting(cls.meetingId._id, cls.meetingId.joinUrl);
      return;
    }
    const id = typeof cls.meetingId === 'string' ? cls.meetingId : cls.meetingId?._id;
    if (!id) return;
    // Log the join first, then resolve the URL — `fetchMeetingLink` is what opens
    // the window, so doing it the other way round loses the popup to the browser's
    // user-gesture rule on slow networks.
    await joinAndOpenMeeting(id, undefined);
    await fetchMeetingLink(id);
  };

  const daysWithClasses = useMemo(() => {
    return weekDates.filter((d) =>
      classes.some((c) => new Date(c.startTime).toDateString() === d.toDateString()),
    );
  }, [weekDates, classes]);

  const totalThisWeek = classes.length;

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
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              My Classes
            </h1>
            <p className="opacity-90 text-sm sm:text-base lg:text-lg font-light max-w-2xl">
              Upcoming live sessions for this week. Join when your class is in progress.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadSchedule()}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 rounded-xl transition-all duration-300 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Week controls + range */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center justify-center sm:justify-start gap-1">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${weekOffset === 0
                  ? 'text-white shadow-lg'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              style={weekOffset === 0 ? { backgroundColor: branding.primaryColor } : {}}
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition"
              aria-label="Next week"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Week of
            </p>
            <p className="text-sm font-semibold text-gray-900">{weekLabel}</p>
            {!loading && (
              <p className="text-xs text-gray-500 mt-0.5">
                {totalThisWeek}{' '}
                {totalThisWeek === 1 ? 'session' : 'sessions'}
              </p>
            )}
          </div>
        </div>

        {/* 7-day strip */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {weekDates.map((date, idx) => {
              const count = getClassesForDay(date).length;
              const today = isToday(date);
              return (
                <div
                  key={idx}
                  className={`flex-shrink-0 flex flex-col items-center min-w-[4.5rem] rounded-xl px-2 py-2.5 border transition ${today
                      ? 'border-opacity-40 bg-opacity-10 ring-1'
                      : 'border-gray-100 bg-gray-50/80'
                    }`}
                  style={today ? { borderColor: branding.primaryColor, backgroundColor: `${branding.primaryColor}10`, boxShadow: `0 0 0 1px ${branding.primaryColor}20` } : {}}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${today ? '' : 'text-gray-500'}`}
                    style={today ? { color: branding.primaryColor } : {}}
                  >
                    {SHORT_DAYS[date.getDay()]}
                  </span>
                  <span
                    className={`text-lg font-bold tabular-nums ${today ? '' : 'text-gray-900'}`}
                    style={today ? { color: branding.primaryColor } : {}}
                  >
                    {date.getDate()}
                  </span>
                  {today && (
                    <span
                      className="mt-0.5 text-[10px] font-bold uppercase"
                      style={{ color: branding.primaryColor }}
                    >
                      Today
                    </span>
                  )}
                  <span
                    className={`mt-1 text-[10px] font-medium ${count > 0 ? '' : 'text-gray-400'}`}
                    style={count > 0 ? { color: branding.primaryColor } : {}}
                  >
                    {count > 0 ? `${count}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50">
          <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: branding.primaryColor }} />
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center">
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={loadSchedule}
            className="px-4 py-2 text-white rounded-xl text-sm font-medium transition"
            style={{ backgroundColor: branding.primaryColor }}
          >
            Try again
          </button>
        </div>
      ) : totalThisWeek === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 sm:p-14 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
            <Calendar className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            No classes this week
          </h2>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            When your school schedules live sessions, they will show up here. You can switch weeks to plan ahead.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {daysWithClasses.map((date) => {
            const dayClasses = getClassesForDay(date).sort(
              (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
            );
            return (
              <section key={date.toISOString()} aria-labelledby={`day-${date.getTime()}`}>
                <div className="flex items-center gap-3 mb-3">
                  <h2
                    id={`day-${date.getTime()}`}
                    className="text-sm font-bold text-gray-900 uppercase tracking-wide"
                  >
                    {date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </h2>
                  {isToday(date) && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold bg-opacity-10"
                      style={{ backgroundColor: branding.primaryColor, color: branding.primaryColor }}
                    >
                      Today
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {dayClasses.length}{' '}
                    {dayClasses.length === 1 ? 'class' : 'classes'}
                  </span>
                </div>
                <ul className="space-y-3">
                  {dayClasses.map((cls) => {
                    const st = getStatusStyles(cls.status);
                    return (
                      <li
                        key={cls._id}
                        className="group relative flex gap-0 rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300 transition overflow-hidden"
                      >
                        <div className={`w-1 flex-shrink-0 ${st.bar}`} aria-hidden />
                        <div className="flex-1 min-w-0 p-4 sm:p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span
                                  className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border ${st.badge}`}
                                >
                                  {cls.status === 'in_progress'
                                    ? 'Live'
                                    : cls.status === 'scheduled'
                                      ? 'Scheduled'
                                      : cls.status === 'completed'
                                        ? 'Done'
                                        : cls.status === 'cancelled'
                                          ? 'Cancelled'
                                          : cls.status}
                                </span>
                              </div>
                              <p className="font-semibold text-gray-900 text-base leading-snug">{cls.title}</p>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
                                <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                                  <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: branding.primaryColor }} />
                                  {formatTime(cls.startTime)} – {formatTime(cls.endTime)}
                                </span>
                                {cls.location && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                    {cls.location}
                                  </span>
                                )}
                                {cls.batchId && (
                                  <span className="inline-flex items-center gap-1">
                                    <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                                    {cls.batchId.subject}
                                    {cls.batchId.name ? ` · ${cls.batchId.name}` : ''}
                                  </span>
                                )}
                                {cls.teacherId && (
                                  <span className="inline-flex items-center gap-1">
                                    <User className="w-3.5 h-3.5 text-gray-400" />
                                    {cls.teacherId.firstName} {cls.teacherId.lastName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex sm:flex-col gap-2 sm:items-end flex-shrink-0">
                              {/*
                                A `scheduled` class with a room is JOINABLE, not just
                                "ready". It used to render a dead badge, so a student who
                                arrived on time — before the teacher pressed Start — had
                                the link sitting in front of them and no way to open it,
                                while the invitation email for the same session did work.
                              */}
                              {(cls.status === 'in_progress' || cls.status === 'scheduled') && cls.meetingId && (
                                <button
                                  type="button"
                                  onClick={() => openClassMeeting(cls)}
                                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm transition w-full sm:w-auto ${
                                    cls.status === 'in_progress'
                                      ? 'bg-emerald-600 hover:bg-emerald-700'
                                      : 'bg-sky-600 hover:bg-sky-700'
                                  }`}
                                >
                                  <Video className="w-4 h-4" />
                                  {cls.status === 'in_progress' ? 'Join class' : 'Join when ready'}
                                  <ExternalLink className="w-3.5 h-3.5 opacity-90" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentSchedulePage;
