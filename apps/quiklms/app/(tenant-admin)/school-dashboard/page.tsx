'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBranding } from '@/app/providers';
import {
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  LayoutDashboard,
  DollarSign,
  CreditCard,
  CheckCircle,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { api } from '@/lib/api';

interface SchoolStats {
  totalStudents: number;
  totalTeachers: number;
  totalBatches: number;
  activeBatches: number;
  todaysClasses: number;
}

interface FinancialSummary {
  totalRevenue: number;
  totalPayouts: number;
  profitMargin: number;
}

interface AttendanceTrend {
  date: string;
  total: number;
  present: number;
  absent: number;
  attendanceRate: number;
}

interface TodayClass {
  _id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  status: string;
  teacherId?: { firstName: string; lastName: string };
  batchId?: { name: string; studentIds?: string[] };
}

const SchoolAdminDashboardPage = () => {
  const { branding } = useBranding();
  const primaryColor = branding.primaryColor;
  const secondaryColor = branding.secondaryColor;

  const [stats, setStats] = useState<SchoolStats>({
    totalStudents: 0,
    totalTeachers: 0,
    totalBatches: 0,
    activeBatches: 0,
    todaysClasses: 0,
  });
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrend[]>([]);
  const [todaysClasses, setTodaysClasses] = useState<TodayClass[]>([]);
  const [financialData, setFinancialData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextClassCountdown, setNextClassCountdown] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const futureClasses = todaysClasses
        .filter((c) => new Date(c.startTime) > now)
        .sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

      if (futureClasses.length > 0) {
        const diff =
          new Date(futureClasses[0].startTime).getTime() - now.getTime();
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setNextClassCountdown(`${h}h ${m}m ${s}s`);
      } else {
        setNextClassCountdown('');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [todaysClasses]);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboardData = async () => {
    try {
      const [overviewRes, trendRes, , financialRes] = await Promise.allSettled([
        api.get<any>('/analytics/school'),
        api.get<any>('/analytics/attendance-trend', { params: { days: 14 } }),
        api.get<any>('/batches/statistics'),
        api.get<any>('/analytics/financial'),
      ]);

      if (overviewRes.status === 'fulfilled') {
        const data = (overviewRes.value as any).data;
        setStats({
          totalStudents: data.totalStudents || 0,
          totalTeachers: data.totalTeachers || 0,
          totalBatches: data.totalBatches || data.activeBatches || 0,
          activeBatches: data.activeBatches || 0,
          todaysClasses: data.todaysClasses || 0,
        });
      }

      if (trendRes.status === 'fulfilled') {
        const data = (trendRes.value as any).data;
        setAttendanceTrend(Array.isArray(data) ? data : []);
      }

      if (financialRes.status === 'fulfilled' && (financialRes.value as any)?.data) {
        const fd = (financialRes.value as any).data;
        setFinancialData({
          totalRevenue: fd.totalRevenue ?? 0,
          totalPayouts: fd.totalPayouts ?? 0,
          profitMargin: fd.profitMargin ?? 0,
        });
      }

      try {
        const today = new Date();
        const startOfDay = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        ).toISOString();
        const endOfDay = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          23,
          59,
          59
        ).toISOString();
        const classesRes = await api.get<any>('/scheduling/teacher/classes', {
          params: { startDate: startOfDay, endDate: endOfDay },
        });
        setTodaysClasses(
          Array.isArray(classesRes.data) ? classesRes.data : []
        );
      } catch {
        // Not critical if this fails
      }
    } catch (error: any) {
      console.error('Failed to load school dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  const kpiCards = [
    {
      color: '#10b981',
      icon: GraduationCap,
      label: 'Students',
      value: stats.totalStudents,
      path: 'students',
      text: 'Active',
    },
    {
      color: '#3b82f6',
      icon: Users,
      label: 'Teachers',
      value: stats.totalTeachers,
      path: 'teachers',
      text: 'Active',
    },
    {
      color: '#f59e0b',
      icon: BookOpen,
      label: 'Active Batches',
      value: stats.activeBatches,
      path: 'batches',
      text: 'Running',
    },
    {
      color: '#ef4444',
      icon: Calendar,
      label: "Today's Classes",
      value: stats.todaysClasses,
      path: null,
      text: 'Scheduled',
    },
    {
      color: '#8b5cf6',
      icon: BarChart3,
      label: 'Analytics',
      value:
        attendanceTrend.length > 0
          ? `${Math.round(
              attendanceTrend.reduce((s, t) => s + t.attendanceRate, 0) /
                attendanceTrend.length
            )}%`
          : '--',
      path: 'school-analytics',
      text: 'Attendance Rate',
    },
  ];

  const financialCards = [
    {
      color: '#10b981',
      icon: DollarSign,
      label: 'TOTAL REVENUE',
      value: `₹${(financialData?.totalRevenue ?? 0).toLocaleString()}`,
      subtitle: 'Earnings this period',
      badge: 'This Period',
      badgeIcon: true,
    },
    {
      color: '#f97316',
      icon: CreditCard,
      label: 'TOTAL PAYOUTS',
      value: `₹${(financialData?.totalPayouts ?? 0).toLocaleString()}`,
      subtitle: 'Teacher payouts issued',
      badge: 'Disbursed',
      badgeIcon: false,
    },
    {
      color: '#8b5cf6',
      icon: CheckCircle,
      label: 'PROFIT MARGIN',
      value: `${financialData?.profitMargin ?? 0}%`,
      subtitle: 'Net margin after payouts',
      badge: `₹${(
        (financialData?.totalRevenue ?? 0) - (financialData?.totalPayouts ?? 0)
      ).toLocaleString()} Net`,
      badgeIcon: false,
    },
  ];

  const quickActions = [
    { tag: 'Batches', path: 'batches', icon: BookOpen, color: 'var(--brand-primary)' },
    { tag: 'Teachers', path: 'teachers', icon: Users, color: 'emerald-600' },
    { tag: 'Students', path: 'students', icon: GraduationCap, color: 'blue-600' },
    { tag: 'Credits Config', path: 'credits-config', icon: CreditCard, color: 'purple-600' },
    { tag: 'Payouts', path: 'payouts', icon: DollarSign, color: 'amber-600' },
    { tag: 'Analytics', path: 'school-analytics', icon: BarChart3, color: 'pink-600' },
  ];

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">
                Dashboard
              </h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">
                School Overview &amp; Analytics
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi, i) => {
          const content = (
            <div className="h-full">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[#8e8e93] text-[10px] font-bold uppercase tracking-wider mb-1">
                    {kpi.label}
                  </p>
                  <p className="text-[24px] font-bold text-[#1c1c1e] leading-none mb-2">
                    {kpi.value}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: kpi.color }}
                    ></span>
                    <span className="text-[11px] font-medium text-[#48484a]">
                      {kpi.text}
                    </span>
                  </div>
                </div>
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${kpi.color}10` }}
                >
                  <kpi.icon
                    className="w-5 h-5"
                    style={{ color: kpi.color }}
                  />
                </div>
              </div>
            </div>
          );
          const baseStyles =
            'relative overflow-hidden bg-white border border-[#f2f2f7] rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300';
          const borderStyle = { borderTop: `3px solid ${kpi.color}` };

          return kpi.path ? (
            <Link
              key={i}
              href={`/${kpi.path}`}
              className={baseStyles}
              style={borderStyle}
            >
              {content}
            </Link>
          ) : (
            <div key={i} className={baseStyles} style={borderStyle}>
              {content}
            </div>
          );
        })}
      </div>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {financialCards.map((kpi, i) => (
          <div
            key={i}
            className="bg-white border border-[#f2f2f7] rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300"
            style={{ borderTop: `3px solid ${kpi.color}` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[#8e8e93] text-[11px] font-bold uppercase tracking-wider mb-2">
                  {kpi.label}
                </p>
                <p className="text-[28px] font-bold text-[#1c1c1e]">
                  {kpi.value}
                </p>
                <p className="text-[#8e8e93] text-xs font-medium mt-1">
                  {kpi.subtitle}
                </p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: `${kpi.color}10` }}
              >
                <kpi.icon className="w-7 h-7" style={{ color: kpi.color }} />
              </div>
            </div>
            <div className="flex items-center">
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: `${kpi.color}15`,
                  color: kpi.color,
                }}
              >
                {kpi.badgeIcon && <span className="mr-1">↑</span>}
                {kpi.badge}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Attendance Trend Chart + Today's Classes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Trend */}
        <div className="bg-white border border-[#f2f2f7] rounded-xl shadow-sm p-6">
          <div className="mb-6">
            <h3 className="text-[15px] font-bold text-[#1c1c1e]">
              Attendance Rate
            </h3>
            <p className="text-[#8e8e93] text-[11px] font-medium mt-0.5">
              Last 2 recorded dates
            </p>
          </div>
          {attendanceTrend.length > 0 ? (
            <div className="relative">
              <div className="flex gap-4 mb-4">
                {attendanceTrend.slice(-2).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{
                        backgroundColor:
                          item.attendanceRate >= 80 ? '#10b981' : '#ef4444',
                      }}
                    ></div>
                    <span className="text-[11px] font-bold text-[#8e8e93]">
                      {new Date(item.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      — {item.attendanceRate}%
                    </span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={attendanceTrend.slice(-2)} barGap={20}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f2f2f7"
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#8e8e93', fontSize: 10, fontWeight: 700 }}
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#8e8e93', fontSize: 10, fontWeight: 700 }}
                    domain={[0, 100]}
                    tickCount={6}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                    formatter={(value: any, name: any) => [
                      value ?? 0,
                      name ?? '',
                    ]}
                  />
                  <Bar
                    dataKey="attendanceRate"
                    radius={[4, 4, 0, 0]}
                    barSize={120}
                  >
                    {attendanceTrend.slice(-2).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.attendanceRate >= 80 ? '#10b981' : '#f87171'
                        }
                        fillOpacity={0.8}
                        stroke={
                          entry.attendanceRate >= 80 ? '#10b981' : '#ef4444'
                        }
                        strokeWidth={1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-gray-400">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>No data</p>
              </div>
            </div>
          )}
        </div>

        {/* Today's Classes */}
        <div className="bg-white border border-[#f2f2f7] rounded-xl shadow-sm p-6 flex flex-col h-full">
          <div className="mb-6">
            <h3 className="text-[15px] font-bold text-[#1c1c1e]">
              Today&apos;s Classes
            </h3>
            <p className="text-[#8e8e93] text-[11px] font-medium mt-0.5">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}{' '}
              — {todaysClasses.length} sessions
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
            {todaysClasses.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400">
                <div className="text-center">
                  <Calendar className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No classes scheduled</p>
                </div>
              </div>
            ) : (
              todaysClasses.map((cls) => (
                <div
                  key={cls._id}
                  className="flex items-center justify-between group"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-left min-w-[60px]">
                      <p className="text-[12px] font-bold text-[#1c1c1e]">
                        {formatTime(cls.startTime)}
                      </p>
                      <p className="text-[10px] font-medium text-[#8e8e93]">
                        {formatTime(cls.endTime)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-[#1c1c1e] group-hover:text-[var(--brand-primary)] transition-colors">
                        {cls.title}
                      </p>
                      <p className="text-[11px] font-medium text-[#8e8e93]">
                        {cls.teacherId
                          ? `${cls.teacherId.firstName} ${cls.teacherId.lastName}`
                          : 'TBA'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      cls.status === 'scheduled'
                        ? 'bg-[#f2f2f7] text-[var(--brand-primary)]'
                        : cls.status === 'in_progress'
                        ? 'bg-[#e5f9f0] text-[#10b981]'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {cls.status === 'scheduled'
                      ? 'Scheduled'
                      : cls.status === 'in_progress'
                      ? 'In Progress'
                      : 'Completed'}
                  </span>
                </div>
              ))
            )}
          </div>

          {nextClassCountdown && (
            <div className="mt-6 p-4 bg-[#f8f9fb] rounded-xl border border-[#f2f2f7] text-center">
              <p className="text-[#8e8e93] text-[10px] font-bold uppercase tracking-widest mb-1">
                Next class in
              </p>
              <p className="text-[20px] font-black text-[#1c1c1e] tracking-tight">
                {nextClassCountdown}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 lg:p-8">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-[var(--brand-primary)] flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </span>
          Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {quickActions.map((action, i) => (
            <Link
              key={i}
              href={`/${action.path}`}
              className="p-5 bg-gray-50 border border-gray-100 rounded-2xl hover:bg-white hover:shadow-xl hover:border-transparent transition-all group text-center"
            >
              <div
                className="p-4 rounded-2xl inline-block mb-3 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-sm"
                style={{
                  backgroundColor: action.color.startsWith('var')
                    ? `var(--brand-primary-light)`
                    : undefined,
                }}
              >
                <action.icon
                  className="w-7 h-7 mx-auto"
                  style={{
                    color: action.color.startsWith('var')
                      ? action.color
                      : undefined,
                  }}
                />
              </div>
              <p className="font-bold text-sm text-gray-800 group-hover:text-[var(--brand-primary)] transition-colors uppercase tracking-tight">
                {action.tag}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SchoolAdminDashboardPage;
