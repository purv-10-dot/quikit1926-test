'use client';

import { useEffect, useState } from 'react';
import { Calendar, CheckCircle, FileText, DollarSign, LayoutDashboard, MapPin, Users, BookOpen, ChevronDown, ChevronUp, GraduationCap, Clock, Award, AlertCircle, Star, BarChart2, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

interface ScheduledClass {
  _id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  status: string;
  batchId?: {
    _id: string;
    name: string;
    studentIds?: string[];
  };
}

interface PayoutSummary {
  netAmount: number;
  totalClassesCompleted: number;
}

interface BatchStudent {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  grade?: string;
  section?: string;
  studentId?: string;
  phone?: string;
  role?: string;
}

interface ScheduleItem {
  dayOfWeek: number | string;
  startTime: string;
  endTime: string;
  location?: string;
}

interface MyBatch {
  _id: string;
  name: string;
  grade?: string;
  section?: string;
  subject: string;
  description?: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  schedule: ScheduleItem[];
  studentIds: BatchStudent[];
  status: string;
  teacherId?: string;
}

// dayOfWeek is stored as 0=Sunday, 1=Monday … 6=Saturday in the backend
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun sort order

const getDayName = (day: number | string): string => {
  if (typeof day === 'number') return DAY_NAMES[day] ?? `Day ${day}`;
  return String(day);
};

const TeacherDashboardPage = () => {
  const pathname = usePathname();
  const { branding } = useBranding();
  const [todaysClasses, setTodaysClasses] = useState<ScheduledClass[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState(0);
  const [homeworkToGrade, setHomeworkToGrade] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myBatches, setMyBatches] = useState<MyBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  // Performance dashboard
  const [dashboardMetrics, setDashboardMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    loadMyBatches();
    loadMetrics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const loadDashboardData = async () => {
    setError(null);
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

      const [classesRes, homeworkRes, payoutsRes] = await Promise.allSettled([
        api.get<any>('/scheduling/teacher/classes', { params: { startDate: startOfDay, endDate: endOfDay } }),
        api.get<any>('/homework/teacher', { params: { status: 'published' } }),
        api.get<any>('/payouts/teacher', { params: { year: today.getFullYear() } }),
      ]);

      if (classesRes.status === 'fulfilled') {
        const classes = (classesRes.value as any);
        setTodaysClasses(Array.isArray(classes) ? classes : []);
        const pending = (Array.isArray(classes) ? classes : []).filter(
          (c: ScheduledClass) => c.status === 'scheduled' || c.status === 'completed'
        );
        setPendingAttendance(pending.filter((c: ScheduledClass) => c.status === 'scheduled').length);
      }

      if (homeworkRes.status === 'fulfilled') {
        const homework = (homeworkRes.value as any);
        setHomeworkToGrade(Array.isArray(homework) ? homework.length : 0);
      }

      if (payoutsRes.status === 'fulfilled') {
        const payouts = (payoutsRes.value as any);
        if (Array.isArray(payouts)) {
          const currentMonth = today.getMonth();
          const currentMonthPayout = payouts.find((p: PayoutSummary & { periodStart: string }) => {
            const pMonth = new Date(p.periodStart).getMonth();
            return pMonth === currentMonth;
          });
          setMonthEarnings(currentMonthPayout?.netAmount || 0);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to load dashboard data:', err);
      const e = err as any;
      setError(e?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const loadMyBatches = async () => {
    setBatchesLoading(true);
    try {
      const res = await api.get<any>('/batches/teacher/my-batches');
      const list = Array.isArray(res) ? res : res?.data || [];
      setMyBatches(list);
    } catch (err: unknown) {
      console.error('Failed to load batches:', err);
    } finally {
      setBatchesLoading(false);
    }
  };

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await api.get<any>('/analytics/teacher-dashboard');
      setDashboardMetrics(res);
    } catch (err: unknown) {
      console.error('Failed to load performance metrics:', err);
    } finally {
      setMetricsLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatScheduleTime = (t?: string) => {
    if (!t) return '';
    const parts = String(t).split(':');
    if (parts.length < 2) return t;
    const hour = parseInt(parts[0], 10);
    const min = parts[1];
    if (isNaN(hour)) return t;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${min} ${ampm}`;
  };

  const totalStudents = myBatches.reduce((sum, b) => sum + ((b.studentIds || []).filter(Boolean).length), 0);

  if (error && !todaysClasses.length) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-3">{error}</p>
        <button onClick={loadDashboardData} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition">Retry</button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
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
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Dashboard</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Your weekly class schedule</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 bg-white/20 rounded-xl border border-white/20 backdrop-blur-md">
            <div className="text-right">
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest leading-none mb-1">Status</p>
              <p className="text-emerald-300 text-xs font-bold uppercase tracking-wide">Teaching Active</p>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {[
          { color: '#6366f1', icon: Calendar, label: "Today's Classes", value: todaysClasses.length, text: 'Scheduled', link: null },
          { color: '#8b5cf6', icon: CheckCircle, label: 'Attendance', value: pendingAttendance, text: 'Pending', link: '/teacher-dashboard/attendance' },
          { color: '#ec4899', icon: FileText, label: 'Homework', value: homeworkToGrade, text: 'To Grade', link: '/teacher-dashboard/homework' },
          { color: '#f59e0b', icon: DollarSign, label: 'My Payouts', value: `₹${monthEarnings.toLocaleString()}`, text: 'Net This Month', link: '/teacher-dashboard/payouts' },
          { color: '#10b981', icon: BookOpen, label: 'MY BATCHES', value: myBatches.length, text: 'Active', link: null },
          { color: '#06b6d4', icon: GraduationCap, label: 'TOTAL STUDENTS', value: totalStudents, text: 'Enrolled', link: null },
        ].map((kpi, i) => {
          const content = (
            <div
              className={`group bg-white border border-[#f2f2f7] rounded-xl p-5 shadow-sm transition-all duration-300 ${kpi.link ? 'hover:shadow-md cursor-pointer' : ''}`}
              style={{ borderTop: `3px solid ${kpi.color}` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[#8e8e93] text-[10px] font-bold uppercase tracking-wider mb-2">{kpi.label}</p>
                  <p className="text-2xl font-bold text-[#1c1c1e] leading-none">{loading && i < 4 ? '...' : kpi.value}</p>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: kpi.color }}></span>
                    <span className="text-[11px] font-medium text-[#48484a]">{kpi.text}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${kpi.color}10` }}>
                  <kpi.icon className="w-6 h-6" style={{ color: kpi.color }} />
                </div>
              </div>
            </div>
          );
          return kpi.link ? <Link key={i} href={kpi.link}>{content}</Link> : <div key={i}>{content}</div>;
        })}
      </div>

      {/* Performance Metrics & Level */}
      {!metricsLoading && dashboardMetrics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Level Badge */}
          <div className="bg-white border border-[#f2f2f7] rounded-xl p-6 shadow-sm flex flex-col justify-between" style={{ borderTop: '3px solid var(--brand-primary)' }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary-light)]/20 flex items-center justify-center">
                  <Award className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <p className="text-[#8e8e93] text-[10px] font-bold uppercase tracking-wider">TEACHING LEVEL</p>
                  <p className="text-xl font-bold text-[#1c1c1e] capitalize">
                    {dashboardMetrics.level?.currentLevel || 'Beginner'}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#8e8e93] font-medium">Overall Score</span>
                <span className="font-bold text-[var(--brand-primary)]">{dashboardMetrics.level?.overallScore ?? 0}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-[var(--brand-primary)] h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (dashboardMetrics.level?.overallScore ?? 0) / 2)}%` }} />
              </div>
              <p className="text-[10px] text-[#8e8e93] italic font-medium">
                Score 0–80: Beginner · 80–200: Intermediate · 200+: Lead
              </p>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="lg:col-span-2 bg-white border border-[#f2f2f7] rounded-xl p-6 shadow-sm" style={{ borderTop: '3px solid #8b5cf6' }}>
            <h2 className="text-[#1c1c1e] font-bold text-[15px] flex items-center gap-2 mb-6">
              <BarChart2 className="w-5 h-5 text-purple-600" /> Performance Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Attendance', value: `${dashboardMetrics.metrics.attendanceRate}%`, color: '#10b981', icon: CheckCircle },
                { label: 'Punctuality', value: dashboardMetrics.metrics.punctualityScore, color: '#3b82f6', icon: Clock },
                { label: 'Classes Done', value: dashboardMetrics.metrics.completedClasses, color: '#6366f1', icon: Calendar },
                { label: 'HW Graded', value: `${dashboardMetrics.metrics.homeworkCompletionRate}%`, color: '#f59e0b', icon: FileText },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="bg-[#f8f9fb] rounded-xl p-4 text-center border border-[#f2f2f7]">
                  <Icon className="w-5 h-5 mx-auto mb-2 opacity-50" style={{ color }} />
                  <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                  <p className="text-[10px] text-[#8e8e93] font-bold uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>
            {dashboardMetrics.metrics.classesMissed > 0 && (
              <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-[11px] font-bold uppercase tracking-wide">
                  {dashboardMetrics.metrics.classesMissed} class{dashboardMetrics.metrics.classesMissed !== 1 ? 'es' : ''} missed this period
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {!metricsLoading && dashboardMetrics?.suggestions?.length > 0 && (
        <div className="bg-white border border-[#f2f2f7] rounded-xl p-6 shadow-sm" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h2 className="text-[#1c1c1e] font-bold text-[15px] flex items-center gap-2 mb-5">
            <Lightbulb className="w-5 h-5 text-amber-500" /> Performance Insights &amp; Suggestions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dashboardMetrics.suggestions.map((s: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <Star className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-900 font-medium leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Batches */}
      <div className="bg-white border border-[#f2f2f7] rounded-xl p-6 shadow-sm" style={{ borderTop: '3px solid #10b981' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[#1c1c1e] font-bold text-[17px] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-teal-600" />
              </div>
              My Batches
            </h2>
            {!batchesLoading && myBatches.length > 0 && (
              <p className="text-[11px] text-[#8e8e93] font-bold uppercase tracking-wider mt-1.5 ml-13">
                {myBatches.length} TOTAL BATCHES · {totalStudents} STUDENTS
              </p>
            )}
          </div>
        </div>

        {batchesLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-10 h-10 border-4 border-teal-100 border-t-teal-500 rounded-full animate-spin" />
            <p className="text-sm text-[#8e8e93] font-medium tracking-wide">Loading batch data...</p>
          </div>
        ) : myBatches.length === 0 ? (
          <div className="text-center py-16 bg-[#f8f9fb] rounded-2xl border border-dashed border-gray-200">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-[#d1d1d6]" />
            <p className="text-[#1c1c1e] font-bold">No batches assigned yet</p>
            <p className="text-[13px] text-[#8e8e93] mt-1">Once assigned, they will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {myBatches.map((batch) => {
              const isExpanded = expandedBatch === batch._id;
              const studentCount = (batch.studentIds || []).filter(Boolean).length;
              const sortedSchedule = [...(batch.schedule || [])].sort(
                (a, b) => DAY_ORDER.indexOf(Number(a.dayOfWeek)) - DAY_ORDER.indexOf(Number(b.dayOfWeek))
              );

              return (
                <div
                  key={batch._id}
                  className={`border border-[#f2f2f7] rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'shadow-md border-teal-100' : 'hover:border-teal-100 hover:shadow-sm'}`}
                >
                  {/* Batch Header */}
                  <div
                    onClick={() => setExpandedBatch(isExpanded ? null : batch._id)}
                    className="w-full flex items-center justify-between p-5 cursor-pointer bg-white"
                  >
                    <div className="flex items-center gap-5 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center shrink-0">
                        <Users className="w-6 h-6 text-teal-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-[#1c1c1e] text-[15px]">{batch.name}</span>
                          {batch.grade && (
                            <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Grade {batch.grade}{batch.section ? `-${batch.section}` : ''}
                            </span>
                          )}
                          <span className="text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {batch.subject}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[13px] text-[#8e8e93] font-medium flex-wrap">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {sortedSchedule.length > 0 ? (
                              <>
                                {getDayName(sortedSchedule[0].dayOfWeek).slice(0, 3)} {formatScheduleTime(sortedSchedule[0].startTime)}
                                {sortedSchedule.length > 1 && ` (+${sortedSchedule.length - 1} more)`}
                              </>
                            ) : 'No schedule'}
                          </span>
                          <span className="flex items-center gap-1.5 text-teal-600 font-bold">
                            <Users className="w-3.5 h-3.5" />
                            {studentCount} Students
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${batch.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                        {batch.status}
                      </div>
                      <div className={`p-2 rounded-xl transition-colors ${isExpanded ? 'bg-teal-50 text-teal-600' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100'}`}>
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: student list */}
                  {isExpanded && (
                    <div className="bg-[#f8f9fb] border-t border-[#f2f2f7]">
                      {/* Batch Info */}
                      <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 border-b border-[#f2f2f7]">
                        <div className="bg-white p-3 rounded-xl border border-[#f2f2f7] shadow-sm">
                          <p className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider mb-1">Full Schedule</p>
                          <div className="space-y-1">
                            {sortedSchedule.map((sch, i) => (
                              <p key={i} className="text-[12px] font-semibold text-[#1c1c1e]">
                                {getDayName(sch.dayOfWeek)}: {formatScheduleTime(sch.startTime)} – {formatScheduleTime(sch.endTime)}
                              </p>
                            ))}
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-[#f2f2f7] shadow-sm">
                          <p className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider mb-1">Duration &amp; Location</p>
                          <p className="text-[12px] font-semibold text-[#1c1c1e]">
                            {new Date(batch.startDate).toLocaleDateString()} – {new Date(batch.endDate).toLocaleDateString()}
                          </p>
                          <p className="text-[12px] text-[#8e8e93] font-medium mt-1">
                            Location: {sortedSchedule[0]?.location || 'Not set'}
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-[#f2f2f7] shadow-sm">
                          <p className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider mb-1">Academic Info</p>
                          <p className="text-[12px] font-semibold text-[#1c1c1e]">Year: {batch.academicYear}</p>
                          <p className="text-[12px] text-teal-600 font-bold mt-1">Status: {batch.status.toUpperCase()}</p>
                        </div>
                      </div>

                      {/* Student Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-white border-b border-[#f2f2f7]">
                              <th className="px-6 py-4 text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider w-16">#</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider">Student Name</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider">Details</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider">ID</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f2f2f7]">
                            {batch.studentIds.filter(Boolean).map((student, idx) => {
                              const s = student as BatchStudent;
                              const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email || '—';
                              const initial = fullName[0].toUpperCase();
                              return (
                                <tr key={s._id || idx} className="hover:bg-white transition-colors">
                                  <td className="px-6 py-4 text-[12px] font-medium text-[#8e8e93]">{idx + 1}</td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center font-bold text-teal-600 text-sm">
                                        {initial}
                                      </div>
                                      <div>
                                        <p className="text-[13px] font-bold text-[#1c1c1e]">{fullName}</p>
                                        <p className="text-[11px] text-[#8e8e93]">{s.email}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      {[s.grade, s.section].filter(Boolean).map((v, i) => (
                                        <span key={i} className="text-[11px] font-bold bg-gray-100 rounded-md px-1.5 py-0.5 text-gray-600">
                                          {v}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-[12px] font-medium text-[#c7c7cc]">{s.studentId || 'N/A'}</td>
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
            })}
          </div>
        )}
      </div>

      {/* Today's Schedule */}
      <div className="bg-white border border-[#f2f2f7] rounded-xl p-6 shadow-sm mb-6" style={{ borderTop: '3px solid #6366f1' }}>
        <h2 className="text-[#1c1c1e] font-bold text-[17px] flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Calendar className="w-6 h-6 text-indigo-600" />
          </div>
          Today's Classes
        </h2>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-[#8e8e93] font-medium tracking-wide">Fetching today's schedule...</p>
          </div>
        ) : todaysClasses.length === 0 ? (
          <div className="text-center py-16 bg-[#f8f9fb] rounded-2xl border border-dashed border-gray-200">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-[#d1d1d6]" />
            <p className="text-[#1c1c1e] font-bold">No classes</p>
            <p className="text-[13px] text-[#8e8e93] mt-1">Check back later or view full schedule.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todaysClasses.map((cls) => (
              <div
                key={cls._id}
                className="flex items-center justify-between p-4 rounded-xl border border-[#f2f2f7] bg-white hover:shadow-md transition-all duration-300 group"
              >
                <div className="flex items-center gap-5">
                  <div className="text-center min-w-[70px] p-2 rounded-lg bg-[#f8f9fb] group-hover:bg-indigo-50 transition-colors">
                    <p className="text-[13px] font-bold text-indigo-600">{formatTime(cls.startTime)}</p>
                    <p className="text-[11px] text-[#8e8e93] font-medium">{formatTime(cls.endTime)}</p>
                  </div>
                  <div>
                    <p className="font-bold text-[#1c1c1e] text-[15px]">{cls.title}</p>
                    <div className="flex items-center gap-4 mt-1 text-[12px] text-[#8e8e93] font-medium">
                      {cls.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#c7c7cc]" /> {cls.location}
                        </span>
                      )}
                      {cls.batchId && (
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-[#c7c7cc]" /> {cls.batchId.studentIds?.length || 0} students
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  cls.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                  cls.status === 'in_progress' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  'bg-gray-50 text-gray-500 border-gray-100'
                }`}>
                  {cls.status.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboardPage;
