'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users, BookOpen, CheckCircle, Clock, TrendingUp, FileCheck,
  AlertCircle, Award, ChevronRight, BarChart3, Search, X,
  ChevronDown, Filter, Trash2, Palette,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';
import { useFeatures, useBranding } from '@/app/providers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalLearners: number;
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  notStartedCourses: number;
  overdueCourses: number;
  completionRate: number;
  totalCertificates: number;
}

interface LearnerCourseOverview {
  courseId: string;
  courseTitle: string;
  courseDescription?: string;
  totalLearners: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  pendingLearners: number;
  completionRate: number;
}

interface LearnerCourseRow {
  assignmentId?: string;
  userId: string;
  userName: string;
  email: string;
  role: 'LEARNER' | 'MANAGER';
  completionPercentage: number;
  status: 'completed' | 'in_progress' | 'not_started';
  dueDate?: string;
  isMandatory: boolean;
  lastLogin?: string;
}

interface LearnerCourseDetail {
  courseId: string;
  courseTitle: string;
  courseDescription?: string;
  totalLearners: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  learners: LearnerCourseRow[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  not_started: 'Not Started',
  missed: 'Missed (Mandatory)',
  all: 'All Learners',
};

type DrillFilter = 'all' | 'completed' | 'in_progress' | 'not_started' | 'missed' | null;

// ---------------------------------------------------------------------------
// StatusBadge helper (defined outside to avoid re-creation on each render)
// ---------------------------------------------------------------------------

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`px-2 py-0.5 text-xs rounded-full font-medium ${
      status === 'completed'
        ? 'bg-emerald-100 text-emerald-700'
        : status === 'in_progress'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-gray-100 text-gray-600'
    }`}
  >
    {status === 'in_progress'
      ? 'In Progress'
      : status === 'not_started'
      ? 'Not Started'
      : 'Completed'}
  </span>
);

// ---------------------------------------------------------------------------
// ReadMoreText — inlined logic (replaces the old ReadMoreText component)
// ---------------------------------------------------------------------------

const ReadMoreText = ({
  text,
  maxLines,
  className,
}: {
  text: string;
  maxLines: number;
  className?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  // Simple truncation: use CSS line-clamp when not expanded
  return (
    <span className={className}>
      <span
        style={
          !expanded
            ? {
                display: '-webkit-box',
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
            : undefined
        }
      >
        {text}
      </span>
      {text.length > 80 && (
        <button
          onClick={e => {
            e.stopPropagation();
            setExpanded(p => !p);
          }}
          className="ml-1 text-indigo-500 hover:underline text-[10px] font-medium"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// CorporateDashboard
// ---------------------------------------------------------------------------

const CorporateDashboard = () => {
  const router = useRouter();
  const { branding } = useBranding();
  const primaryColor = branding?.primaryColor;
  const secondaryColor = branding?.secondaryColor;

  // No basePath. `(tenant-admin)` is a ROUTE GROUP — parentheses add no URL
  // segment — so every page in this group is a sibling at the root: /courses,
  // /compliance, /branding, /course-analytics, /user-management. The old
  // `basePath = '/tenant-dashboard'` prefixed all six links below with this
  // page's own path, and /tenant-dashboard has no children, so each one 404'd.

  const [stats, setStats] = useState<DashboardStats>({
    totalLearners: 0,
    totalCourses: 0,
    completedCourses: 0,
    inProgressCourses: 0,
    notStartedCourses: 0,
    overdueCourses: 0,
    completionRate: 0,
    totalCertificates: 0,
  });
  const [loading, setLoading] = useState(true);
  const [courseProgressData, setCourseProgressData] = useState<any[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<any[]>([]);
  const [learnerCourses, setLearnerCourses] = useState<LearnerCourseOverview[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Course filter
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Per-course detail & drill-down
  const [selectedCourseDetail, setSelectedCourseDetail] = useState<LearnerCourseDetail | null>(null);
  const [courseDetailLoading, setCourseDetailLoading] = useState(false);
  const [drillFilter, setDrillFilter] = useState<DrillFilter>(null);
  const drillRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    loadDashboardData();
    loadLearnerCourses();
  }, []);

  // When course changes, load its detail & reset drill filter
  useEffect(() => {
    if (selectedCourseId) {
      loadLearnersByCourse(selectedCourseId);
    } else {
      setSelectedCourseDetail(null);
    }
    setDrillFilter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId]);

  // Scroll to drill table when filter is set
  useEffect(() => {
    if (drillFilter && drillRef.current) {
      setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [drillFilter]);

  const loadDashboardData = async () => {
    try {
      const analyticsRes = await api.get('/analytics/corporate').catch(() => null);
      const certificatesRes = await api.get('/certificates/tenant/issued-certificates').catch(() => null);
      const totalCertificates =
        (certificatesRes as any)?.count ||
        (certificatesRes as any)?.data?.length ||
        0;

      if (analyticsRes) {
        const data = analyticsRes as any;
        const s: DashboardStats = {
          totalLearners: data.totalLearners || 0,
          totalCourses: data.totalCourses || 0,
          completedCourses: data.completedCourses || 0,
          inProgressCourses: data.inProgressCourses || 0,
          notStartedCourses: data.notStartedCourses || 0,
          overdueCourses: data.overdueCourses || 0,
          completionRate: data.completionRate || 0,
          totalCertificates,
        };
        setStats(s);
        setCourseProgressData([
          { name: 'Completed', value: s.completedCourses },
          { name: 'In Progress', value: s.inProgressCourses },
          { name: 'Not Started', value: s.notStartedCourses },
        ]);
        setStatusDistribution([
          { name: 'Completed', value: s.completedCourses, color: '#10b981' },
          { name: 'In Progress', value: s.inProgressCourses, color: '#3b82f6' },
          { name: 'Not Started', value: s.notStartedCourses, color: '#6b7280' },
          { name: 'Overdue', value: s.overdueCourses, color: '#ef4444' },
        ]);
      } else {
        const [usersRes, coursesRes] = await Promise.all([
          api.get('/users').catch(() => ({ data: [] })),
          api.get('/courses').catch(() => ({ data: [] })),
        ]);
        const learners = ((usersRes as any).data || []).filter(
          (u: any) => u.role === 'LEARNER' || u.role === 'MANAGER'
        );
        const courses = (coursesRes as any).data || [];
        setStats({
          totalLearners: learners.length,
          totalCourses: courses.length,
          completedCourses: 0,
          inProgressCourses: 0,
          notStartedCourses: courses.length,
          overdueCourses: 0,
          completionRate: 0,
          totalCertificates: 0,
        });
        setCourseProgressData([
          { name: 'Completed', value: 0 },
          { name: 'In Progress', value: 0 },
          { name: 'Not Started', value: courses.length },
        ]);
        setStatusDistribution([
          { name: 'Completed', value: 0, color: '#10b981' },
          { name: 'In Progress', value: 0, color: '#3b82f6' },
          { name: 'Not Started', value: courses.length, color: '#6b7280' },
          { name: 'Overdue', value: 0, color: '#ef4444' },
        ]);
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadLearnerCourses = async () => {
    setCoursesLoading(true);
    try {
      const res = await api.get('/analytics/corporate/learner-courses');
      const rows = (res as any) || [];
      setLearnerCourses(Array.isArray(rows) ? rows : []);
    } catch {
      setLearnerCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  };

  const loadLearnersByCourse = async (courseId: string) => {
    setCourseDetailLoading(true);
    try {
      const res = await api.get(`/analytics/corporate/learner-courses/${courseId}`);
      setSelectedCourseDetail((res as any) || null);
    } catch {
      setSelectedCourseDetail(null);
    } finally {
      setCourseDetailLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------

  const courseOverdue = selectedCourseDetail
    ? selectedCourseDetail.learners.filter(
        l => l.dueDate && new Date(l.dueDate) < new Date() && l.status !== 'completed'
      ).length
    : 0;

  const courseCertificates = selectedCourseDetail
    ? selectedCourseDetail.learners.filter(l => l.status === 'completed').length
    : 0;

  const courseMissedMandatory = selectedCourseDetail
    ? selectedCourseDetail.learners.filter(
        l =>
          !!(l.isMandatory && l.dueDate && new Date(l.dueDate) < new Date() && l.status !== 'completed')
      ).length
    : 0;

  const displayStats = selectedCourseDetail
    ? {
        totalLearners: selectedCourseDetail.totalLearners,
        completedCourses: selectedCourseDetail.completed,
        inProgressCourses: selectedCourseDetail.inProgress,
        notStartedCourses: selectedCourseDetail.notStarted,
        completionRate:
          selectedCourseDetail.totalLearners > 0
            ? Math.round(
                (selectedCourseDetail.completed / selectedCourseDetail.totalLearners) * 100
              )
            : 0,
        totalCourses: 1,
        overdueCourses: courseOverdue,
        totalCertificates: courseCertificates,
      }
    : stats;

  const courseChartData = selectedCourseDetail
    ? [
        { name: 'Completed', value: selectedCourseDetail.completed },
        { name: 'In Progress', value: selectedCourseDetail.inProgress },
        { name: 'Not Started', value: selectedCourseDetail.notStarted },
      ]
    : courseProgressData;

  const coursePieData = selectedCourseDetail
    ? [
        { name: 'Completed', value: selectedCourseDetail.completed, color: '#10b981' },
        { name: 'In Progress', value: selectedCourseDetail.inProgress, color: '#3b82f6' },
        { name: 'Not Started', value: selectedCourseDetail.notStarted, color: '#6b7280' },
      ]
    : statusDistribution;

  // Filtered learners for drill-down
  const filteredLearners = (selectedCourseDetail?.learners || []).filter(l => {
    if (!drillFilter || drillFilter === 'all') return true;
    if (drillFilter === 'missed') {
      return !!(
        l.isMandatory &&
        l.dueDate &&
        new Date(l.dueDate) < new Date() &&
        l.status !== 'completed'
      );
    }
    return l.status === drillFilter;
  });

  const filteredCourses = learnerCourses.filter(c =>
    c.courseTitle.toLowerCase().includes(courseSearch.toLowerCase())
  );

  const handleStatClick = (filter: DrillFilter) => {
    if (!selectedCourseId) return;
    setDrillFilter(prev => (prev === filter ? null : filter));
  };

  const handleRemoveLearner = async (assignmentId: string, userName: string) => {
    if (!assignmentId || !selectedCourseId) return;
    try {
      await api.delete(`/course-assignments/${assignmentId}`);
      toast.success(`${userName} removed from course`);
      await loadLearnersByCourse(selectedCourseId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove learner from course');
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Course table rows (derived inline to avoid IIFE in JSX)
  // ---------------------------------------------------------------------------

  const tableRows = selectedCourseId
    ? learnerCourses.filter(c => c.courseId === selectedCourseId)
    : learnerCourses;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{
          background: `linear-gradient(135deg, ${primaryColor || '#4f46e5'}, ${secondaryColor || '#ec4899'})`,
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">
                Dashboard
              </h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                Overview of your learning management system
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 px-4 py-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md">
            <div className="text-right">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none mb-1">
                Status
              </p>
              <p className="text-white text-xs font-bold uppercase tracking-wide">System Active</p>
            </div>
            <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)] animate-pulse" />
          </div>
        </div>
      </div>

      {/* Course Filter Bar */}
      <div className="relative z-50 bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 sm:p-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Filter className="w-4 h-4 text-indigo-600" />
            </div>
            Filter by Course:
          </div>

          {/* Dropdown */}
          <div className="relative flex-1 min-w-[240px] max-w-sm" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(prev => !prev)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white/80 hover:bg-white hover:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 shadow-sm"
            >
              <span className={selectedCourseName ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
                {selectedCourseName || 'All Courses (Overall)'}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {showDropdown && (
              <div className="absolute z-30 mt-2 w-full bg-white border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Search input */}
                <div className="p-3 border-b border-slate-50 bg-slate-50/50">
                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                    <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input
                      autoFocus
                      value={courseSearch}
                      onChange={e => setCourseSearch(e.target.value)}
                      placeholder="Search courses..."
                      className="flex-1 bg-transparent text-sm outline-none text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>
                {/* All courses option */}
                <button
                  onClick={() => {
                    setSelectedCourseId(null);
                    setSelectedCourseName('');
                    setShowDropdown(false);
                    setCourseSearch('');
                  }}
                  className={`w-full text-left px-5 py-3 text-sm hover:bg-indigo-50 transition-colors ${
                    !selectedCourseId
                      ? 'bg-indigo-50/80 text-indigo-700 font-bold'
                      : 'text-slate-600 font-medium'
                  }`}
                >
                  All Courses (Overall)
                </button>
                <div className="max-h-64 overflow-y-auto">
                  {coursesLoading ? (
                    <div className="px-5 py-4 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-slate-400">Loading courses...</p>
                    </div>
                  ) : filteredCourses.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-400 italic font-medium">
                      No courses found matching your search
                    </p>
                  ) : (
                    filteredCourses.map(c => (
                      <button
                        key={c.courseId}
                        onClick={() => {
                          setSelectedCourseId(c.courseId);
                          setSelectedCourseName(c.courseTitle);
                          setShowDropdown(false);
                          setCourseSearch('');
                        }}
                        className={`w-full text-left px-5 py-3 text-sm hover:bg-indigo-50 transition-all flex items-center justify-between gap-3 border-b border-slate-50 last:border-0 ${
                          selectedCourseId === c.courseId
                            ? 'bg-indigo-50/80 text-indigo-700 font-bold'
                            : 'text-slate-600 font-medium'
                        }`}
                      >
                        <span className="truncate">{c.courseTitle}</span>
                        <span className="text-[10px] bg-white px-2 py-1 rounded-full border border-slate-100 text-slate-400 font-bold flex-shrink-0">
                          {c.totalLearners} LEARNERS
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Active filter pill */}
          {selectedCourseId && (
            <div className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl text-sm font-bold animate-in zoom-in duration-200">
              <BookOpen className="w-4 h-4" />
              <span className="truncate max-w-[180px]">{selectedCourseName}</span>
              <button
                onClick={() => {
                  setSelectedCourseId(null);
                  setSelectedCourseName('');
                  setDrillFilter(null);
                }}
                className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-indigo-200 transition-colors ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {selectedCourseId && (
            <button
              // /course-analytics reads the id from the QUERY STRING
              // (`searchParams.get('courseId')`) and returns early without it —
              // there is no [courseId] path segment.
              onClick={() => router.push(`/course-analytics?courseId=${selectedCourseId}`)}
              className="flex items-center gap-2 px-4 py-2.5 border border-indigo-200 bg-white text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 hover:shadow-md transition-all shadow-sm"
            >
              <BarChart3 className="w-4 h-4" /> Full Analytics
            </button>
          )}
        </div>
      </div>

      {/* Loading indicator for course data */}
      {courseDetailLoading && (
        <div className="flex items-center gap-3 text-sm text-gray-500 px-1">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500" />
          Loading course data…
        </div>
      )}

      {/* KPI Stat Cards (Top Row) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            color: '#10b981',
            icon: Users,
            label: selectedCourseId ? 'ENROLLED LEARNERS' : 'TOTAL LEARNERS',
            value: displayStats.totalLearners,
            filter: 'all',
            text: 'Active',
          },
          {
            color: '#3b82f6',
            icon: CheckCircle,
            label: 'COMPLETED COURSES',
            value: displayStats.completedCourses,
            filter: 'completed',
            text: 'Success',
          },
          {
            color: '#f59e0b',
            icon: Clock,
            label: 'IN PROGRESS',
            value: displayStats.inProgressCourses,
            filter: 'in_progress',
            text: 'Running',
          },
          {
            color: '#6b7280',
            icon: FileCheck,
            label: 'NOT STARTED',
            value: displayStats.notStartedCourses,
            filter: 'not_started',
            text: 'Pending',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            onClick={() => handleStatClick(kpi.filter as DrillFilter)}
            className={`group relative overflow-hidden bg-white/70 backdrop-blur-sm border border-white/50 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all duration-300 ${
              selectedCourseId
                ? 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]'
                : ''
            } ${drillFilter === kpi.filter ? 'ring-2 ring-offset-2 shadow-xl scale-[1.02]' : ''}`}
            style={{
              borderColor:
                drillFilter === kpi.filter ? kpi.color : 'rgba(255,255,255,0.5)',
              boxShadow:
                drillFilter === kpi.filter ? `0 20px 40px ${kpi.color}15` : '',
            }}
          >
            {/* Color accent bar */}
            <div
              className="absolute top-0 left-0 w-full h-1.5"
              style={{ background: `linear-gradient(90deg, ${kpi.color}, ${kpi.color}dd)` }}
            />

            <div className="flex items-start justify-between relative z-10">
              <div>
                <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.1em] mb-2.5">
                  {kpi.label}
                </p>
                <div className="flex items-baseline gap-1">
                  <p className="text-3xl font-black text-slate-800 tracking-tight leading-none">
                    {kpi.value.toLocaleString()}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{ backgroundColor: kpi.color }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-2 w-2"
                      style={{ backgroundColor: kpi.color }}
                    />
                  </span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    {kpi.text}
                  </span>
                </div>
              </div>
              <div
                className="p-3.5 rounded-2xl transition-transform group-hover:scale-110 duration-300"
                style={{ backgroundColor: `${kpi.color}12` }}
              >
                <kpi.icon className="w-7 h-7" style={{ color: kpi.color }} />
              </div>
            </div>

            {/* Backdrop decorative element */}
            <div
              className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-300"
              style={{ backgroundColor: kpi.color }}
            />
          </div>
        ))}
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: 'COMPLETION RATE',
            value: `${displayStats.completionRate}%`,
            icon: TrendingUp,
            color: '#8b5cf6',
            subtitle: 'Global progress',
          },
          {
            label: selectedCourseId ? 'COURSE SELECTED' : 'TOTAL COURSES',
            value: displayStats.totalCourses,
            icon: BookOpen,
            color: '#3b82f6',
            subtitle: 'Active catalog',
          },
          {
            label: selectedCourseId ? 'MISSED MANDATORY' : 'OVERDUE',
            value: selectedCourseId ? courseMissedMandatory : displayStats.overdueCourses,
            icon: AlertCircle,
            color: '#ef4444',
            subtitle: 'Action required',
          },
          {
            label: 'CERTIFICATES ISSUED',
            value: displayStats.totalCertificates,
            icon: Award,
            color: '#f59e0b',
            subtitle: 'Total achievements',
          },
        ].map((item, i) => (
          <div
            key={i}
            className="group relative overflow-hidden bg-white/70 backdrop-blur-sm border border-white/50 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]"
            style={{ borderLeft: `4px solid ${item.color}` }}
          >
            <div className="flex items-center gap-4 relative z-10">
              <div
                className="p-3 rounded-xl transition-all duration-300 group-hover:rotate-6 shadow-sm"
                style={{
                  backgroundColor: `${item.color}12`,
                  border: `1px solid ${item.color}20`,
                }}
              >
                <item.icon className="w-6 h-6" style={{ color: item.color }} />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.1em] mb-1">
                  {item.label}
                </p>
                <p className="text-2xl font-black text-slate-800 tracking-tight">{item.value}</p>
              </div>
            </div>
            {item.label === (selectedCourseId ? 'MISSED MANDATORY' : 'OVERDUE') &&
              selectedCourseId && (
                <button
                  onClick={() => setDrillFilter(prev => (prev === 'missed' ? null : 'missed'))}
                  className="mt-4 text-[10px] font-black text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-all inline-flex items-center gap-1.5 group/btn"
                >
                  VIEW DETAILS{' '}
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                </button>
              )}
            <div
              className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-[0.03]"
              style={{ backgroundColor: item.color }}
            />
          </div>
        ))}
      </div>

      {/* Drill-down Learner List */}
      {selectedCourseId && drillFilter && (
        <div ref={drillRef} className="bg-white border border-indigo-200 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {STATUS_LABELS[drillFilter]} — {selectedCourseName}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {filteredLearners.length} learner{filteredLearners.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'completed', 'in_progress', 'not_started', 'missed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setDrillFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    drillFilter === f
                      ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                  }`}
                >
                  {STATUS_LABELS[f]}
                  {selectedCourseDetail && (
                    <span className="ml-1.5 opacity-75">
                      (
                      {f === 'all'
                        ? selectedCourseDetail.totalLearners
                        : f === 'completed'
                        ? selectedCourseDetail.completed
                        : f === 'in_progress'
                        ? selectedCourseDetail.inProgress
                        : f === 'not_started'
                        ? selectedCourseDetail.notStarted
                        : courseMissedMandatory}
                      )
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setDrillFilter(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 hover:bg-gray-100 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Close
              </button>
            </div>
          </div>

          {courseDetailLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading learners…</p>
          ) : filteredLearners.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No learners in this category.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      #
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Learner
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Role
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Completion %
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Due Date
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Last Active
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLearners.map((l, idx) => {
                    const isMissed = !!(
                      l.isMandatory &&
                      l.dueDate &&
                      new Date(l.dueDate) < new Date() &&
                      l.status !== 'completed'
                    );
                    return (
                      <tr
                        key={l.userId}
                        className={`transition-colors ${
                          isMissed ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{l.userName}</p>
                          <p className="text-xs text-gray-500">{l.email}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {l.role === 'MANAGER' ? 'Manager' : 'Learner'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-16 overflow-hidden">
                              <div
                                className="h-full bg-[var(--brand-primary)] rounded-full"
                                style={{ width: `${l.completionPercentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-700">
                              {l.completionPercentage}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={l.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {l.dueDate ? new Date(l.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {l.lastLogin ? new Date(l.lastLogin).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.assignmentId ? (
                            <button
                              onClick={() => handleRemoveLearner(l.assignmentId!, l.userName)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium border border-red-200 hover:border-red-300 transition"
                              title="Remove from course"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Charts (always visible) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Bar Chart */}
        <div className="bg-white/70 backdrop-blur-md border border-white/50 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] p-8 transition-all duration-500 hover:shadow-[0_30px_70px_rgba(0,0,0,0.06)] group">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                Course Progress
                {selectedCourseName && (
                  <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full font-bold uppercase tracking-wider ml-2">
                    Selected
                  </span>
                )}
              </h3>
              <p className="text-sm text-slate-400 font-medium mt-1">
                Status overview across learners
              </p>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
              <BarChart3 className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={courseChartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748B' }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748B' }}
                />
                <Tooltip
                  cursor={{ fill: '#F8FAFC', radius: 10 } as any}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: 'none',
                    borderRadius: 16,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1E293B',
                    padding: '12px 16px',
                  }}
                />
                <Bar dataKey="value" barSize={40} radius={[10, 10, 10, 10]}>
                  {courseChartData.map((_, i) => (
                    <Cell key={i} fill={['#10B981', '#3B82F6', '#94A3B8'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white/70 backdrop-blur-md border border-white/50 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] p-8 transition-all duration-500 hover:shadow-[0_30px_70px_rgba(0,0,0,0.06)] group">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                Status Distribution
                {selectedCourseName && (
                  <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full font-bold uppercase tracking-wider ml-2">
                    Selected
                  </span>
                )}
              </h3>
              <p className="text-sm text-slate-400 font-medium mt-1">
                Percentage breakdown of activities
              </p>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
              {/* PieChart icon from lucide conflicts with recharts PieChart — use BarChart3 variant */}
              <BarChart3 className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={coursePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={8}
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                  }
                  dataKey="value"
                  stroke="none"
                >
                  {coursePieData.map((e: any, i: number) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: 'none',
                    borderRadius: 16,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1E293B',
                    padding: '12px 16px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Course Table (filtered when a course is selected) */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {selectedCourseId ? 'Course Detail' : 'All Courses'}
            </h3>
            {selectedCourseId && (
              <p className="text-xs text-gray-500 mt-0.5">
                Showing data for:{' '}
                <span className="font-medium text-[var(--brand-primary)]">{selectedCourseName}</span>
              </p>
            )}
          </div>
          {!selectedCourseId && (
            <p className="text-xs text-gray-500">
              Click a row to filter the dashboard by that course
            </p>
          )}
          {selectedCourseId && (
            <button
              onClick={() => {
                setSelectedCourseId(null);
                setSelectedCourseName('');
                setDrillFilter(null);
              }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-[var(--brand-primary)] border border-gray-300 hover:border-[var(--brand-primary-light)]/50 px-3 py-1.5 rounded-lg transition"
            >
              <X className="w-3 h-3" /> Show all courses
            </button>
          )}
        </div>
        {coursesLoading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading courses…</p>
        ) : tableRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No assigned learner courses found.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Course
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Learners
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-emerald-600">
                    Completed
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-blue-600">
                    In Progress
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Not Started
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Rate
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableRows.map(course => (
                  <tr
                    key={course.courseId}
                    onClick={() => {
                      setSelectedCourseId(course.courseId);
                      setSelectedCourseName(course.courseTitle);
                      setDrillFilter(null);
                    }}
                    className={`hover:bg-[var(--brand-primary-light)]/20 transition-colors ${
                      selectedCourseId === course.courseId
                        ? 'bg-[var(--brand-primary-light)]/30 border-l-4 border-l-[var(--brand-primary)]'
                        : 'cursor-pointer'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{course.courseTitle}</p>
                      {course.courseDescription && (
                        <ReadMoreText
                          text={course.courseDescription}
                          maxLines={1}
                          className="text-xs text-gray-400 mt-0.5"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{course.totalLearners}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedCourseId(course.courseId);
                          setSelectedCourseName(course.courseTitle);
                          setDrillFilter('completed');
                        }}
                        className="text-emerald-700 font-semibold hover:underline"
                      >
                        {course.completed}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedCourseId(course.courseId);
                          setSelectedCourseName(course.courseTitle);
                          setDrillFilter('in_progress');
                        }}
                        className="text-blue-700 font-semibold hover:underline"
                      >
                        {course.inProgress}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedCourseId(course.courseId);
                          setSelectedCourseName(course.courseTitle);
                          setDrillFilter('not_started');
                        }}
                        className="text-gray-600 font-semibold hover:underline"
                      >
                        {course.notStarted}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${course.completionRate}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700">
                          {course.completionRate}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() =>
                          router.push(`/course-analytics?courseId=${course.courseId}`)
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[var(--brand-primary-light)]/50 bg-[var(--brand-primary-light)]/10 text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]/20 text-xs font-medium transition"
                      >
                        <BarChart3 className="w-3 h-3" /> Analytics
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-[#f2f2f7] rounded-3xl shadow-xl p-8 mb-12">
        <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)] flex items-center justify-center shadow-lg shadow-[var(--brand-primary-light)]">
            <CheckCircle className="w-7 h-7 text-white" />
          </div>
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              // There is no `/learners` route — users are managed on
              // /user-management, which is where "add or remove users" lives.
              href: '/user-management',
              icon: Users,
              label: 'Manage Learners',
              color: '#3b82f6',
              desc: 'Add or remove users',
            },
            {
              // "Select courses for learners" is assignment, not the catalogue:
              // /course-assignments. /courses is the course list.
              href: '/course-assignments',
              icon: BookOpen,
              label: 'Assign Courses',
              color: '#6366f1',
              desc: 'Select courses for learners',
            },
            {
              href: '/compliance',
              icon: FileCheck,
              label: 'Compliance',
              color: '#10b981',
              desc: 'Check training status',
            },
            {
              href: '/branding',
              icon: Palette,
              label: 'Branding',
              color: '#06b6d4',
              desc: 'Customize your portal',
            },
          ].map((a, i) => (
            <Link
              key={i}
              href={a.href}
              className="group relative p-6 bg-[#f8f9fb] border border-[#f2f2f7] rounded-xl hover:bg-white hover:shadow-lg hover:border-transparent transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                  <a.icon
                    className="w-6 h-6"
                    style={{
                      color: a.color && a.color.startsWith('#') ? a.color : 'var(--brand-primary)',
                    }}
                  />
                </div>
                <div>
                  <p className="font-bold text-[#1c1c1e] group-hover:text-[var(--brand-primary)] transition-colors text-sm">
                    {a.label}
                  </p>
                  <p className="text-[#8e8e93] text-[11px] mt-1 font-medium">{a.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// TenantDashboardPage — top-level export
// Note: SchoolAdminDashboardPage is no longer imported here. If school-tenant
// support is needed, create a separate school-dashboard page and redirect from
// the layout based on tenantType.
// ---------------------------------------------------------------------------

export default function TenantDashboardPage() {
  const { tenantType, loaded } = useFeatures();

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Corporate tenants (or unknown) get the corporate dashboard.
  // School tenants: redirect to the dedicated school-dashboard route from middleware/layout.
  return <CorporateDashboard />;
}
