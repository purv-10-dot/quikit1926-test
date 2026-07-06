'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import jsPDF from 'jspdf';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  BarChart3,
  Users,
  TrendingUp,
  DollarSign,
  Calendar,
  Download,
  FileText,
  ArrowUp,
  ArrowDown,
  GraduationCap,
  BookOpen,
  ClipboardList,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────

type DateRangeOption = 'this_month' | 'last_month' | 'last_3_months' | 'this_year';
type TabId = 'overview' | 'teacher' | 'financial' | 'engagement' | 'comparison';

interface SchoolOverviewData {
  totalStudents?: number;
  totalTeachers?: number;
  totalBatches?: number;
  activeBatches?: number;
  todaysClasses?: number;
  classesThisMonth?: number;
  attendanceRate?: number;
  revenueThisMonth?: number;
  revenuePrevMonth?: number;
  revenueChange?: number;
  pendingPayouts?: number;
  enrollmentTrend?: { month: string; count: number }[];
  enrollmentByGrade?: { grade: string; count: number }[];
}

interface AttendanceTrendItem {
  date: string;
  total: number;
  present: number;
  absent: number;
  attendanceRate?: number;
}

interface TeacherPerformanceItem {
  rank?: number;
  teacherId: string;
  teacherName: string;
  completedClasses: number;
  totalClasses?: number;
  attendanceRate: number;
  onTimeRate: number;
  avgGradingDays: number;
}

interface BatchUtilizationItem {
  batchId?: string;
  name?: string;
  grade?: string;
  enrolledStudents?: number;
  maxCapacity?: number;
}

interface FinancialData {
  totalRevenue?: number;
  totalPayouts?: number;
  netProfit?: number;
  profitMargin?: number;
  avgRevenuePerStudent?: number;
  pendingPayoutCount?: number;
  pendingPayoutAmount?: number;
  totalUnusedCredits?: number;
  revenueByMonth?: { month: string; revenue: number }[];
  payoutsByMonth?: { month: string; amount: number }[];
  revenueByPackage?: { package: string; revenue: number; count: number }[];
}

interface EngagementData {
  activeStudents?: number;
  activeTeachers?: number;
  dailyActiveUsers?: { date: string; count: number }[];
  homeworkSubmissionTrend?: { date: string; count: number }[];
}

interface ArrMonthEntry {
  month: string;
  creditRevenue: number;
  teacherPayouts: number;
  nonTeachingExpense: number;
  netCashFlow: number;
}

interface ArrData {
  arr: number;
  mrrBase: number;
  totalCreditRevenue: number;
  totalPayouts: number;
  totalNonTeachingExpense: number;
  totalExpenses: number;
  totalNetProfit: number;
  profitMargin: number;
  monthlyTrend: ArrMonthEntry[];
}

// ── Date range helpers ───────────────────────────────────────

function getDateRange(option: DateRangeOption): { dateFrom: string; dateTo: string; days: number } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  let from: Date;

  switch (option) {
    case 'this_month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to.setFullYear(now.getFullYear());
      to.setMonth(now.getMonth() - 1);
      to.setDate(new Date(now.getFullYear(), now.getMonth(), 0).getDate());
      break;
    case 'last_3_months':
      from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      break;
    case 'this_year':
      from = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  return {
    dateFrom: from.toISOString().split('T')[0],
    dateTo: to.toISOString().split('T')[0],
    days,
  };
}

// ── CSV Export helper ───────────────────────────────────────

function convertToCSV(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0] as object).join(',');
    const rows = data.map((row) =>
      Object.values(row as object)
        .map((v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v))
        .join(',')
    );
    return [headers, ...rows].join('\n');
  }
  if (typeof data === 'object' && data !== null) {
    const flat: Record<string, unknown> = {};
    const flatten = (obj: object, prefix = '') => {
      Object.entries(obj).forEach(([k, v]) => {
        if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
          flatten(v as object, `${prefix}${k}.`);
        } else {
          flat[`${prefix}${k}`] = v;
        }
      });
    };
    flatten(data as object);
    return Object.entries(flat)
      .map(([k, v]) => `${k},${v}`)
      .join('\n');
  }
  return String(data);
}

// ── KPI Card Component ──────────────────────────────────────

function KPICard({
  label,
  value,
  trend,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string | number;
  trend?: { value: number; isPositive: boolean };
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-gray-400 font-normal">vs previous</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${iconBg}`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function SchoolAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('financial');
  const [dateRange, setDateRange] = useState<DateRangeOption>('this_month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab 1: School Overview
  const [schoolData, setSchoolData] = useState<SchoolOverviewData | null>(null);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrendItem[]>([]);
  const [batchUtilization, setBatchUtilization] = useState<BatchUtilizationItem[]>([]);

  // Tab 2: Teacher Performance
  const [teacherPerformance, setTeacherPerformance] = useState<TeacherPerformanceItem[]>([]);
  const [teacherSortField, setTeacherSortField] = useState<keyof TeacherPerformanceItem>('completedClasses');
  const [teacherSortDir, setTeacherSortDir] = useState<'asc' | 'desc'>('desc');

  // Tab 3: Financial
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [arrData, setArrData] = useState<ArrData | null>(null);

  // Tab 4: Engagement
  const [engagementData, setEngagementData] = useState<EngagementData | null>(null);

  const { branding } = useBranding();

  // Filters
  const [batches, setBatches] = useState<{ _id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ _id: string; firstName: string; lastName: string }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');

  // Comparison tab
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const tenantId = useMemo(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem('user') || '{}');
      return user.tenantId;
    } catch {
      return null;
    }
  }, []);

  const { dateFrom, dateTo, days } = useMemo(() => getDateRange(dateRange), [dateRange]);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      setError('Please log in to view analytics.');
      return;
    }
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, dateFrom, dateTo, days]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schoolRes, attRes, batchRes, teacherRes, financialRes, engagementRes, arrRes] = await Promise.allSettled([
        api.get<any>('/analytics/school', { params: { dateFrom, dateTo } }),
        api.get<any>('/analytics/attendance-trend', { params: { days } }),
        api.get<any>('/analytics/batch-utilization'),
        api.get<any>('/analytics/teacher-performance', { params: { dateFrom, dateTo } }),
        api.get<any>('/analytics/financial', { params: { dateFrom, dateTo } }),
        api.get<any>('/analytics/engagement', { params: { days } }),
        api.get<any>('/analytics/arr'),
      ]);

      setSchoolData(
        schoolRes.status === 'fulfilled' && (schoolRes.value as any)?.data
          ? ((schoolRes.value as any).data as SchoolOverviewData)
          : null
      );
      setAttendanceTrend(
        attRes.status === 'fulfilled' && Array.isArray((attRes.value as any)?.data)
          ? ((attRes.value as any).data as AttendanceTrendItem[])
          : []
      );
      setBatchUtilization(
        batchRes.status === 'fulfilled' && Array.isArray((batchRes.value as any)?.data)
          ? ((batchRes.value as any).data as BatchUtilizationItem[])
          : []
      );
      setTeacherPerformance(
        teacherRes.status === 'fulfilled' && Array.isArray((teacherRes.value as any)?.data)
          ? ((teacherRes.value as any).data as TeacherPerformanceItem[])
          : []
      );
      setFinancialData(
        financialRes.status === 'fulfilled' && (financialRes.value as any)?.data
          ? ((financialRes.value as any).data as FinancialData)
          : null
      );
      setEngagementData(
        engagementRes.status === 'fulfilled' && (engagementRes.value as any)?.data
          ? ((engagementRes.value as any).data as EngagementData)
          : null
      );
      setArrData(
        arrRes.status === 'fulfilled' && (arrRes.value as any)?.data
          ? ((arrRes.value as any).data as ArrData)
          : null
      );
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err);
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [batchRes, teacherRes] = await Promise.allSettled([
          api.get<any>('/batches'),
          api.get<any>('/users', { params: { role: 'TEACHER' } }),
        ]);
        if (batchRes.status === 'fulfilled') {
          const bData = (batchRes.value as any).data;
          setBatches(Array.isArray(bData) ? bData : bData?.data || []);
        }
        if (teacherRes.status === 'fulfilled') {
          const tData = (teacherRes.value as any).data;
          setTeachers(Array.isArray(tData) ? tData : tData?.data || []);
        }
      } catch {}
    };
    loadFilters();
  }, []);

  useEffect(() => {
    if (activeTab === 'comparison') {
      const fetchComparison = async () => {
        setComparisonLoading(true);
        try {
          const res = await api.get<any>('/analytics/comparison', { params: { dateFrom, dateTo } });
          setComparisonData(res.data);
        } catch (err: any) {
          console.error('Failed to fetch comparison:', err);
        } finally {
          setComparisonLoading(false);
        }
      };
      fetchComparison();
    }
  }, [activeTab, dateFrom, dateTo]);

  const getExportType = (): string => {
    const typeMap: Record<TabId, string> = {
      overview: 'school-overview',
      teacher: 'teacher-performance',
      financial: 'financial',
      engagement: 'school-overview',
      comparison: 'school-overview',
    };
    return typeMap[activeTab];
  };

  const handleExportCSV = async () => {
    const type = getExportType();
    try {
      const qs = new URLSearchParams({ type, dateFrom, dateTo }).toString();
      const fetchRes = await fetch(`/api/analytics/export/csv?${qs}`, { credentials: 'include' });
      const blob = await fetchRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${type}-${dateFrom}-to-${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      try {
        const res = await api.get<any>('/analytics/export', { params: { type, dateFrom, dateTo } });
        const payload = res.data?.data ?? res.data;
        const csv = convertToCSV(payload);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${type}-${dateFrom}-to-${dateTo}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: any) {
        console.error('CSV export failed:', err);
      }
    }
  };

  const handleExportPDF = async () => {
    const type = getExportType();
    try {
      const res = await api.get<any>('/analytics/export', { params: { type, dateFrom, dateTo } });
      const payload = res.data?.data ?? res.data;

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('School Analytics Report', pageWidth / 2, y, { align: 'center' });
      y += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Report Type: ${type.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`, pageWidth / 2, y, { align: 'center' });
      y += 6;
      doc.text(`Period: ${dateFrom} to ${dateTo}`, pageWidth / 2, y, { align: 'center' });
      y += 6;
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, y, { align: 'center' });
      y += 12;

      doc.setDrawColor(200);
      doc.line(14, y, pageWidth - 14, y);
      y += 8;

      doc.setTextColor(0);

      if (Array.isArray(payload) && payload.length > 0) {
        const headers = Object.keys(payload[0]);
        const colWidth = (pageWidth - 28) / Math.min(headers.length, 5);
        const visibleHeaders = headers.slice(0, 5);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(240, 240, 250);
        doc.rect(14, y - 4, pageWidth - 28, 8, 'F');
        visibleHeaders.forEach((h, i) => {
          doc.text(h.replace(/([A-Z])/g, ' $1').trim(), 14 + i * colWidth, y, { maxWidth: colWidth - 2 });
        });
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        payload.forEach((row: any) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          visibleHeaders.forEach((h, i) => {
            const val = row[h] != null ? String(row[h]) : '';
            doc.text(val.slice(0, 30), 14 + i * colWidth, y, { maxWidth: colWidth - 2 });
          });
          y += 6;
        });
      } else if (typeof payload === 'object' && payload !== null) {
        const flat: [string, string][] = [];
        const flatten = (obj: any, prefix = '') => {
          for (const [k, v] of Object.entries(obj)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              flatten(v, `${prefix}${k}.`);
            } else {
              flat.push([`${prefix}${k}`, v != null ? String(v) : '']);
            }
          }
        };
        flatten(payload);

        doc.setFontSize(9);
        flat.forEach(([key, val]) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.setFont('helvetica', 'bold');
          doc.text(key.replace(/([A-Z])/g, ' $1').trim(), 14, y);
          doc.setFont('helvetica', 'normal');
          doc.text(val.slice(0, 80), 90, y);
          y += 6;
        });
      }

      doc.save(`analytics-${type}-${dateFrom}-to-${dateTo}.pdf`);
    } catch (err: any) {
      console.error('PDF export failed:', err);
    }
  };

  const attendanceByGradeData = useMemo(() => {
    if (schoolData?.enrollmentByGrade && schoolData.enrollmentByGrade.length > 0) {
      return schoolData.enrollmentByGrade;
    }
    const byGrade: Record<string, number> = {};
    batchUtilization.forEach((b) => {
      const grade = b.grade || 'Unknown';
      byGrade[grade] = (byGrade[grade] || 0) + (b.enrolledStudents ?? 0);
    });
    return Object.entries(byGrade).map(([grade, count]) => ({ grade, count }));
  }, [schoolData, batchUtilization]);

  // Sorted teachers
  const sortedTeachers = useMemo(() => {
    const arr = [...teacherPerformance];
    arr.sort((a, b) => {
      const aVal = a[teacherSortField];
      const bVal = b[teacherSortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return teacherSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      return teacherSortDir === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
    return arr;
  }, [teacherPerformance, teacherSortField, teacherSortDir]);

  const handleTeacherSort = (field: keyof TeacherPerformanceItem) => {
    if (teacherSortField === field) {
      setTeacherSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTeacherSortField(field);
      setTeacherSortDir('desc');
    }
  };

  // Financial chart: revenue vs payouts by month
  const financialChartData = useMemo(() => {
    const revMap: Record<string, number> = {};
    const payMap: Record<string, number> = {};
    financialData?.revenueByMonth?.forEach((r) => (revMap[r.month] = r.revenue));
    financialData?.payoutsByMonth?.forEach((p) => (payMap[p.month] = p.amount));
    const months = new Set([...Object.keys(revMap), ...Object.keys(payMap)]);
    return Array.from(months)
      .sort()
      .map((m) => ({ month: m, revenue: revMap[m] ?? 0, payouts: payMap[m] ?? 0 }));
  }, [financialData]);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'School Overview', icon: BarChart3 },
    { id: 'teacher', label: 'Teacher Performance', icon: Users },
    { id: 'financial', label: 'Financial', icon: DollarSign },
    { id: 'engagement', label: 'Engagement', icon: TrendingUp },
    { id: 'comparison', label: 'Period Comparison', icon: ArrowUp },
  ];

  if (loading && !schoolData) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6 mt-4 sm:mt-6 lg:mt-8"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">School Analytics</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Comprehensive analytics dashboard for school admins</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {batches.length > 0 && (
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="border border-white/20 bg-white/10 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent outline-none backdrop-blur-md [&>option]:text-gray-900"
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            )}
            {teachers.length > 0 && (
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="border border-white/20 bg-white/10 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent outline-none backdrop-blur-md [&>option]:text-gray-900"
              >
                <option value="all">All Teachers</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
                ))}
              </select>
            )}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeOption)}
              className="border border-white/20 bg-white/10 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent outline-none backdrop-blur-md [&>option]:text-gray-900"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="last_3_months">Last 3 Months</option>
              <option value="this_year">This Year</option>
            </select>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base"
            >
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
            <KPICard
              label="Total Students"
              value={schoolData?.totalStudents ?? 0}
              icon={GraduationCap}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <KPICard
              label="Total Teachers"
              value={schoolData?.totalTeachers ?? 0}
              icon={Users}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
            />
            <KPICard
              label="Active Batches"
              value={schoolData?.activeBatches ?? 0}
              icon={BookOpen}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
            />
            <KPICard
              label="Today's Classes"
              value={schoolData?.todaysClasses ?? 0}
              icon={Calendar}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
            />
            <KPICard
              label="Attendance Rate"
              value={`${schoolData?.attendanceRate ?? 0}%`}
              icon={ClipboardList}
              iconBg="bg-teal-100"
              iconColor="text-teal-600"
            />
            <KPICard
              label="Revenue This Month"
              value={`₹${(schoolData?.revenueThisMonth ?? 0).toLocaleString()}`}
              trend={
                schoolData?.revenueChange !== undefined
                  ? { value: schoolData.revenueChange, isPositive: schoolData.revenueChange >= 0 }
                  : undefined
              }
              icon={DollarSign}
              iconBg="bg-green-100"
              iconColor="text-green-600"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Enrollment Trend</h3>
              {schoolData?.enrollmentTrend && schoolData.enrollmentTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={schoolData.enrollmentTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} name="Enrollments" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-400">No enrollment data</div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Enrollment by Grade</h3>
              {attendanceByGradeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={attendanceByGradeData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="grade" width={60} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" name="Students" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-400">No grade data</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'teacher' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Teacher Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    { key: 'rank' as const, label: 'Rank' },
                    { key: 'teacherName' as const, label: 'Teacher Name' },
                    { key: 'completedClasses' as const, label: 'Classes Completed' },
                    { key: 'attendanceRate' as const, label: 'Attendance Rate' },
                    { key: 'onTimeRate' as const, label: 'On-Time Rate' },
                    { key: 'avgGradingDays' as const, label: 'Grading Days' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleTeacherSort(key)}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-1">
                        {label}
                        {teacherSortField === key && (
                          teacherSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedTeachers.map((t, idx) => {
                  const isTop = t.attendanceRate >= 80 && t.onTimeRate >= 80;
                  const isBelow = t.attendanceRate < 60 || t.onTimeRate < 60;
                  const rowBg = isTop ? 'bg-green-50' : isBelow ? 'bg-red-50' : '';
                  return (
                    <tr key={t.teacherId} className={`hover:bg-gray-50 ${rowBg}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.rank ?? idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.teacherName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.completedClasses}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${t.attendanceRate >= 80 ? 'text-green-600' : t.attendanceRate < 60 ? 'text-red-600' : 'text-gray-600'}`}>
                          {t.attendanceRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${t.onTimeRate >= 80 ? 'text-green-600' : t.onTimeRate < 60 ? 'text-red-600' : 'text-gray-600'}`}>
                          {t.onTimeRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.avgGradingDays.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sortedTeachers.length === 0 && (
            <div className="p-12 text-center text-gray-500">No teacher performance data available</div>
          )}
        </div>
      )}

      {activeTab === 'financial' && (
        <div className="space-y-6">

          {/* Summary bar */}
          {(() => {
            const rev = financialData?.totalRevenue ?? 0;
            const pay = financialData?.totalPayouts ?? 0;
            const net = financialData?.netProfit ?? (rev - pay);
            const margin = financialData?.profitMargin ?? 0;
            const isProfit = net >= 0;
            return (
              <div className={`rounded-xl border p-4 flex flex-wrap gap-6 items-center ${isProfit ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Net Position</p>
                  <p className={`text-2xl font-bold mt-0.5 ${isProfit ? 'text-green-700' : 'text-red-600'}`}>
                    {isProfit ? '+' : ''}₹{net.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Revenue ₹{rev.toLocaleString()} − Payouts ₹{pay.toLocaleString()}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${isProfit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {isProfit ? `${margin}% Margin` : `${margin}% Operating Loss`}
                </div>
                {!isProfit && (
                  <p className="text-xs text-red-500 flex-1 min-w-[200px]">
                    Teacher payouts exceed credit income this period. Margin shown as loss relative to total payouts.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Income KPIs */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Income — Credit Purchases by Students / Parents
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-white border border-green-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Revenue</p>
                <p className="text-2xl font-bold text-green-700 mt-1">₹{(financialData?.totalRevenue ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">Credit packages purchased by students / parents</p>
              </div>
              <div className="bg-white border border-teal-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Avg Revenue / Student</p>
                <p className="text-2xl font-bold text-teal-700 mt-1">₹{(financialData?.avgRevenuePerStudent ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">Per enrolled learner</p>
              </div>
              <div className="bg-white border border-blue-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Unused Credits (Balance)</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">₹{(financialData?.totalUnusedCredits ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">Remaining credit balance across all students</p>
              </div>
            </div>
          </div>

          {/* Expense KPIs */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Expenses — Teacher Payouts
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white border border-red-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Paid to Teachers</p>
                <p className="text-2xl font-bold text-red-600 mt-1">₹{(financialData?.totalPayouts ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">Approved &amp; paid payouts</p>
              </div>
              <div className="bg-white border border-amber-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pending Payouts</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{financialData?.pendingPayoutCount ?? 0}</p>
                <p className="text-xs text-gray-400 mt-1">Records awaiting approval / payment</p>
              </div>
              <div className="bg-white border border-orange-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pending Amount</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">₹{(financialData?.pendingPayoutAmount ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">Amount owed but not yet paid</p>
              </div>
              <div className={`bg-white rounded-xl p-4 sm:p-5 shadow-sm border ${(financialData?.netProfit ?? 0) >= 0 ? 'border-green-200' : 'border-red-200'}`}>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Net Position</p>
                <p className={`text-2xl font-bold mt-1 ${(financialData?.netProfit ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  ₹{(financialData?.netProfit ?? ((financialData?.totalRevenue ?? 0) - (financialData?.totalPayouts ?? 0))).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1">Income minus teacher expenses</p>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Revenue vs Payouts by Month</h3>
              {financialChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={financialChartData} barCategoryGap="40%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: any) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any, name: any) => [value != null ? `₹${value.toLocaleString()}` : '', name ?? '']} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#22c55e" name="Revenue (Credits)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="payouts" fill="#ef4444" name="Teacher Payouts" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex flex-col items-center justify-center text-gray-400 gap-2">
                  <p className="text-base">No financial data for this period</p>
                  <p className="text-xs text-center">Data appears once students purchase credits and teachers have payouts</p>
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Monthly Revenue Trend</h3>
              {financialData?.revenueByMonth && financialData.revenueByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={financialData.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: any) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any, name: any) => [value != null ? `₹${value.toLocaleString()}` : '', name ?? '']} />
                    <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} name="Credit Revenue" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex flex-col items-center justify-center text-gray-400 gap-2">
                  <p className="text-base">No revenue data for this period</p>
                  <p className="text-xs text-center">Revenue is recorded when parents / students purchase credit packages</p>
                </div>
              )}
            </div>
          </div>

          {/* Revenue by Package breakdown */}
          {financialData?.revenueByPackage && financialData.revenueByPackage.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Revenue by Credit Package</h3>
              <div className="space-y-3">
                {financialData.revenueByPackage.map((pkg) => {
                  const max = financialData.revenueByPackage![0].revenue;
                  const pct = max > 0 ? Math.round((pkg.revenue / max) * 100) : 0;
                  return (
                    <div key={pkg.package} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-44 truncate flex-shrink-0">{pkg.package}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-24 text-right flex-shrink-0">
                        ₹{pkg.revenue.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
                        {pkg.count} purchase{pkg.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ARR / Annual Cash Flow Report */}
          {arrData && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900 text-base">Annual Run Rate (ARR) — Full Cash Flow</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Based on last 12 months: credit sales, teacher payouts &amp; non-teaching task payments</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 text-center">
                  <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wide">ARR</p>
                  <p className="text-2xl font-bold text-indigo-700">₹{arrData.arr.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-0.5">MRR ₹{arrData.mrrBase.toLocaleString()} × 12</p>
                </div>
              </div>

              {/* 4 summary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Total Income (12m)</p>
                  <p className="text-xl font-bold text-green-700 mt-1">₹{arrData.totalCreditRevenue.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Credit package sales</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Teacher Payouts (12m)</p>
                  <p className="text-xl font-bold text-red-600 mt-1">₹{arrData.totalPayouts.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Approved &amp; paid</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium">Non-Teaching Tasks (12m)</p>
                  <p className="text-xl font-bold text-orange-600 mt-1">₹{arrData.totalNonTeachingExpense.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Approved task payments</p>
                </div>
                <div className={`border rounded-xl p-4 ${arrData.totalNetProfit >= 0 ? 'bg-teal-50 border-teal-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-xs text-gray-500 uppercase font-medium">Net Position (12m)</p>
                  <p className={`text-xl font-bold mt-1 ${arrData.totalNetProfit >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                    ₹{arrData.totalNetProfit.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{arrData.profitMargin}% margin</p>
                </div>
              </div>

              {/* 12-month cash flow chart */}
              {arrData.monthlyTrend.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">12-Month Cash Flow Breakdown</h4>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={arrData.monthlyTrend} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: any, name: any) => [value != null ? `₹${value.toLocaleString()}` : '', name ?? '']} />
                      <Legend />
                      <Bar dataKey="creditRevenue" fill="#22c55e" name="Credit Revenue" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="teacherPayouts" fill="#ef4444" name="Teacher Payouts" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="nonTeachingExpense" fill="#f97316" name="Non-Teaching Tasks" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Net cash flow line */}
              {arrData.monthlyTrend.some((m) => m.netCashFlow !== 0) && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Net Cash Flow Trend</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={arrData.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: any, name: any) => [value != null ? `₹${value.toLocaleString()}` : '', name ?? '']} />
                      <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="netCashFlow"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Net Cash Flow"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'engagement' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <p className="text-sm text-gray-500">Active Students</p>
              <p className="text-3xl font-bold text-indigo-600 mt-1">{engagementData?.activeStudents ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">Last {days} days</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <p className="text-sm text-gray-500">Active Teachers</p>
              <p className="text-3xl font-bold text-indigo-600 mt-1">{engagementData?.activeTeachers ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">Last {days} days</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Daily Active Users</h3>
              {engagementData?.dailyActiveUsers && engagementData.dailyActiveUsers.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={engagementData.dailyActiveUsers}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} name="DAU" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-400">No DAU data</div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Homework Submission Trend</h3>
              {engagementData?.homeworkSubmissionTrend && engagementData.homeworkSubmissionTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={engagementData.homeworkSubmissionTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} name="Submissions" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-400">No homework submission data</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'comparison' && (
        <div className="space-y-6">
          {comparisonLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
            </div>
          ) : comparisonData ? (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-2">Period Comparison</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Current: {comparisonData.currentPeriod?.from} to {comparisonData.currentPeriod?.to} | Previous: {comparisonData.previousPeriod?.from} to {comparisonData.previousPeriod?.to}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {Object.entries(comparisonData.comparison || {}).map(([key, val]: [string, any]) => (
                    <div key={key} className="border border-gray-100 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-500 capitalize">{key}</p>
                      <div className="flex items-end gap-3 mt-2">
                        <div>
                          <p className="text-xs text-gray-400">Current</p>
                          <p className="text-2xl font-bold text-gray-900">{val.current?.toLocaleString?.() ?? val.current}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Previous</p>
                          <p className="text-lg text-gray-500">{val.previous?.toLocaleString?.() ?? val.previous}</p>
                        </div>
                        <div className={`ml-auto px-2 py-1 rounded-md text-sm font-semibold ${val.change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {val.change >= 0 ? '+' : ''}{val.change}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-500">
              No comparison data available for the selected period
            </div>
          )}
        </div>
      )}
    </div>
  );
}
