'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, BookOpen, User, ChevronLeft, ChevronRight, Video, ExternalLink } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';

interface ScheduledClass {
  _id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  status: string;
  meetingId?: string | { _id: string; joinUrl?: string; hostUrl?: string; status?: string };
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ChildSchedulePage = () => {
  const pathname = usePathname();
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [children, setChildren] = useState<any[]>([]);

  useEffect(() => {
    loadChildren();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (selectedChild) {
      loadSchedule();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChild, weekOffset]);

  const loadChildren = async () => {
    try {
      const res = await api.get<any>('/credits/my-balance');
      const data = res.data;
      if (Array.isArray(data) && data.length > 0) {
        setChildren(data);
        setSelectedChild(data[0].studentId);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Failed to load children:', err);
      setLoading(false);
    }
  };

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + weekOffset * 7);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const res = await api.get<any>('/scheduling/student/classes', {
        params: {
          studentId: selectedChild,
          startDate: startOfWeek.toISOString(),
          endDate: endOfWeek.toISOString(),
        },
      });
      setClasses(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to load schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const getWeekDates = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getClassesForDay = (date: Date) => {
    return classes.filter((c) => {
      const classDate = new Date(c.startTime);
      return classDate.toDateString() === date.toDateString();
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'in_progress': return 'border-l-green-500 bg-green-50 dark:bg-green-900/20';
      case 'completed': return 'border-l-gray-400 bg-gray-50 dark:bg-gray-700/30';
      case 'cancelled': return 'border-l-red-500 bg-red-50 dark:bg-red-900/20';
      default: return 'border-l-gray-300 bg-gray-50';
    }
  };

  const fetchMeetingLink = async (classId: string, meetingId?: string) => {
    if (!meetingId) return;
    try {
      const res = await api.get<any>(`/meetings/${meetingId}`);
      const meeting = res.data;
      if (meeting?.joinUrl) {
        window.open(meeting.joinUrl, '_blank');
      } else {
        toast.error('Meeting link is not available yet. Please check your email for the join link.');
      }
    } catch (err: any) {
      toast.error('Could not fetch meeting link. Check your email for the join link.');
    }
  };

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster />
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white">
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Class Schedule</h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">{"View your child's upcoming classes and schedule"}</p>
          </div>
        </div>
      </div>

      {/* Child Selector + Week Navigation */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {children.length > 1 && (
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            {children.map((child: any) => (
              <option key={child.studentId} value={child.studentId}>
                {child.studentName} {child.grade ? `(Grade ${child.grade})` : ''}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50"
          >
            This Week
          </button>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
          >
            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Weekly Calendar */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-4">
          {weekDates.map((date, idx) => {
            const dayClasses = getClassesForDay(date);
            return (
              <div key={idx} className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg border ${
                isToday(date) ? 'border-indigo-300 dark:border-indigo-600' : 'border-gray-100 dark:border-gray-700'
              } overflow-hidden`}>
                <div className={`px-6 py-3 ${isToday(date) ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{DAYS[date.getDay()]}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      {isToday(date) && (
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">Today</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{dayClasses.length} class{dayClasses.length !== 1 ? 'es' : ''}</span>
                  </div>
                </div>

                <div className="p-4">
                  {dayClasses.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">No classes</p>
                  ) : (
                    <div className="space-y-2">
                      {dayClasses.map((cls) => (
                        <div key={cls._id} className={`border-l-4 ${getStatusColor(cls.status)} rounded-lg p-3`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900 dark:text-gray-100">{cls.title}</p>
                              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(cls.startTime)} - {formatTime(cls.endTime)}
                                </span>
                                {cls.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {cls.location}
                                  </span>
                                )}
                                {cls.batchId && (
                                  <span className="flex items-center gap-1">
                                    <BookOpen className="w-3 h-3" /> {cls.batchId.subject}
                                  </span>
                                )}
                                {cls.teacherId && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" /> {cls.teacherId.firstName} {cls.teacherId.lastName}
                                  </span>
                                )}
                              </div>
                            </div>
                            {cls.status === 'in_progress' && cls.meetingId && (
                              <a
                                href={typeof cls.meetingId === 'object' ? cls.meetingId.joinUrl : undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  if (typeof cls.meetingId !== 'object' || !(cls.meetingId as any)?.joinUrl) {
                                    e.preventDefault();
                                    fetchMeetingLink(cls._id, typeof cls.meetingId === 'string' ? cls.meetingId : (cls.meetingId as any)?._id);
                                  }
                                }}
                                className="shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition"
                              >
                                <Video className="w-3.5 h-3.5" />
                                Join Class
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {cls.status === 'scheduled' && cls.meetingId && (
                              <span className="shrink-0 ml-3 flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-lg">
                                <Video className="w-3.5 h-3.5" />
                                Video Ready
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChildSchedulePage;
