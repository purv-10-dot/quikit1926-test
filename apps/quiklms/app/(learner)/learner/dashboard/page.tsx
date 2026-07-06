'use client';

import { useMemo, useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  BookOpen, Clock, CheckCircle, AlertCircle, Award, Play,
  Download, Search, TrendingUp,
  ChevronRight, Calendar, Target, Trophy, ArrowUp, FileText, ClipboardList,
  X, CheckCircle2, XCircle, BarChart2, Building2, MapPin, Mail, HardDrive, CreditCard, Pencil, Pause, ExternalLink
} from 'lucide-react';
import { api } from '@/lib/api';
import { useFeatures } from '@/app/providers';
import { useBranding } from '@/app/providers';
import ReadMoreText from '@/components/ReadMoreText';

// Error Boundary to catch rendering errors
class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Dashboard] Render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-50">
          <div className="text-center p-8 bg-white rounded-2xl border border-gray-200 shadow-lg max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-500 mb-4">{this.state.error?.message || 'An error occurred while loading the dashboard'}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary px-8"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CourseAssignment {
  _id: string;
  courseId: {
    _id: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    thumbnailUrlPresigned?: string;
  };
  dueDate?: string;
  isMandatory: boolean;
  assignedAt: string;
}

interface Progress {
  courseId: string;
  completionPercentage: number;
  status: string;
  quizScore?: number;
  isPassed: boolean;
  completedAt?: string;
  lastAccessedAt?: string;
  currentModuleId?: string;
}

const normalizeStatus = (raw: string | undefined): string => {
  const s = (raw || '').toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'completed') return 'Completed';
  if (s === 'in progress') return 'In Progress';
  if (s === 'overdue') return 'Overdue';
  return 'Not Started';
};

interface Certificate {
  _id: string;
  courseId: {
    _id: string;
    title: string;
  } | null;
  certificateId: string;
  issuedAt: string;
  pdfUrl?: string;
  verificationUrl?: string;
}

type MonthFilter = 'all' | `${number}-${string}`;

const toMonthKey = (d: Date): `${number}-${string}` => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}` as const;
};

const parseDateInput = (value: string | null | undefined, endOfDay: boolean): Date | null => {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
};

const LearnerDashboardPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { features, loaded } = useFeatures();
  const { branding } = useBranding();
  const primaryColor = branding.primaryColor;
  const secondaryColor = branding.secondaryColor;

  const isSchoolTenant = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('user') || '{}');
      return u.tenantType === 'school';
    } catch { return false; }
  })();

  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'required' | 'in-progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [upcomingExams, setUpcomingExams] = useState<any[]>([]);
  const [pastExamResults, setPastExamResults] = useState<any[]>([]);
  const [resultModal, setResultModal] = useState<any>(null);
  const [achievementMonth, setAchievementMonth] = useState<MonthFilter>('all');
  const [achievementFromDate, setAchievementFromDate] = useState<string>('');
  const [achievementToDate, setAchievementToDate] = useState<string>('');

  useEffect(() => {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!isMounted) return;
      setLoading(true);

      try {
        const assignmentsResponse = await api.get<any>('/course-assignments/my-assignments');
        let assignmentsData = assignmentsResponse.data?.data || assignmentsResponse.data || [];
        if (!Array.isArray(assignmentsData)) {
          assignmentsData = [];
        }

        const validAssignments = assignmentsData.filter(
          (assignment: any) => assignment.courseId && assignment.courseId._id
        );

        if (!isMounted) return;
        setAssignments(validAssignments);
        setError(null);

        const progressPromises = validAssignments.map(async (assignment: CourseAssignment) => {
          try {
            const progressResponse = await api.get<any>(`/progress/${assignment.courseId._id}`);
            return {
              courseId: assignment.courseId._id,
              progress: progressResponse.data,
            };
          } catch {
            return {
              courseId: assignment.courseId._id,
              progress: null,
            };
          }
        });

        const progressResults = await Promise.all(progressPromises);
        const progressMapData: Record<string, Progress> = {};
        progressResults.forEach(({ courseId, progress }) => {
          if (progress) {
            progressMapData[courseId] = {
              courseId: progress.courseId,
              completionPercentage: progress.completionPercentage || 0,
              status: normalizeStatus(progress.status),
              quizScore: progress.quizScore,
              isPassed: progress.isPassed || false,
              completedAt: progress.completedAt,
              lastAccessedAt: progress.updatedAt || progress.createdAt,
              currentModuleId: progress.currentModuleId,
            };
          } else {
            progressMapData[courseId] = {
              courseId,
              completionPercentage: 0,
              status: 'Not Started',
              isPassed: false,
            };
          }
        });

        if (!isMounted) return;
        setProgressMap(progressMapData);

        let loadedCertsRaw: any[] = [];
        const loadCerts = async () => {
          try {
            const certResponse = await api.get<any>('/certificates/my-certificates');
            if (isMounted) {
              const certData = certResponse.data?.data || certResponse.data || [];
              const certsArray = Array.isArray(certData) ? certData : [];
              loadedCertsRaw = certsArray;

              const seen = new Set<string>();
              const uniqueCerts = certsArray.filter((cert: any) => {
                const courseKey = cert.courseId?._id || cert.courseId || cert._id;
                if (!courseKey) return true;
                const key = typeof courseKey === 'object' ? courseKey.toString() : courseKey;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });

              setCertificates(uniqueCerts);
              return uniqueCerts.length;
            }
            return 0;
          } catch (certError) {
            console.error('[Dashboard] Failed to load certificates:', certError);
            return 0;
          }
        };

        const certCount = await loadCerts();

        try {
          const examsRes = await api.get<any>('/exams/student');
          const examsData: any[] = examsRes.data?.data || examsRes.data || [];
          if (isMounted) {
            const now = new Date();
            const hasStudentSubmitted = (e: any) => {
              const s = e.mySession?.status;
              return s === 'submitted' || s === 'auto_submitted' || s === 'timed_out';
            };
            const examTimeEnded = (e: any) => e.scheduledEndTime ? new Date(e.scheduledEndTime) < now : false;

            const upcoming = examsData.filter((e: any) => {
              if (hasStudentSubmitted(e)) return false;
              if (e.status === 'results_published') return false;
              if (e.status === 'draft') return false;
              if (examTimeEnded(e) && !e.mySession) return false;
              return true;
            });
            setUpcomingExams(upcoming.slice(0, 3));

            const past = examsData.filter((e: any) => {
              if (e.status === 'draft') return false;
              if (hasStudentSubmitted(e)) return true;
              if (e.status === 'results_published') return true;
              if (examTimeEnded(e) && !e.mySession) return true;
              return false;
            });
            setPastExamResults(past.slice(0, 5));
          }
        } catch (examErr) {
          console.warn('[Dashboard] Failed to fetch exams:', examErr);
        }

        const certCourseIds = new Set<string>(
          loadedCertsRaw.map((c: any) => {
            const cid = c.courseId?._id || c.courseId;
            return typeof cid === 'object' ? cid?.toString() : String(cid || '');
          }).filter(Boolean)
        );

        const completedCourseIds = Object.entries(progressMapData)
          .filter(([, p]) => p.completionPercentage >= 100 || normalizeStatus(p.status) === 'Completed')
          .map(([courseId]) => courseId);

        const missingCertCourses = completedCourseIds.filter(cid => !certCourseIds.has(cid));

        if (missingCertCourses.length > 0 && isMounted) {
          try {
            await api.post<any>('/progress/generate-missing-certificates', {});
            if (isMounted) {
              await loadCerts();
            }
          } catch (err: any) {
            console.error('[Dashboard] Failed to generate missing certificates:', err);
          }
        }

      } catch (error: any) {
        console.error('Failed to load dashboard data:', error);
        if (isMounted) {
          if (error?.statusCode === 401) {
            setError('Session expired. Please login again.');
            sessionStorage.removeItem('access_token');
            sessionStorage.removeItem('user');
            setTimeout(() => router.push('/role-select'), 2000);
          } else if (error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error')) {
            setError('Unable to connect to server. Please check your connection.');
          } else {
            setError('Failed to load dashboard. Please try again.');
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const getContinueLearningCourse = () => {
    try {
      if (!Array.isArray(assignments) || assignments.length === 0) return undefined;

      const coursesWithProgress = assignments
        .filter(assignment => assignment?.courseId?._id)
        .map(assignment => ({
          assignment,
          progress: progressMap[assignment.courseId._id],
        }))
        .filter(({ progress }) => progress && progress.completionPercentage < 100 && progress.lastAccessedAt)
        .sort((a, b) => {
          const timeA = new Date(a.progress?.lastAccessedAt || 0).getTime();
          const timeB = new Date(b.progress?.lastAccessedAt || 0).getTime();
          return timeB - timeA;
        });

      return coursesWithProgress[0];
    } catch (err: any) {
      console.error('[Dashboard] Error in getContinueLearningCourse:', err);
      return undefined;
    }
  };

  const getFilteredCourses = () => {
    try {
      if (!Array.isArray(assignments)) return [];

      let filtered = assignments.filter(a => a?.courseId?._id);

      if (activeFilter === 'required') {
        filtered = filtered.filter(a => a.isMandatory);
      } else if (activeFilter === 'in-progress') {
        filtered = filtered.filter(a => {
          const progress = progressMap[a.courseId._id];
          if (!progress) return false;
          const isCompleted = progress.completionPercentage >= 100 || progress.status === 'Completed';
          if (isCompleted) return false;
          return progress.status === 'In Progress' || progress.status === 'Overdue' || progress.completionPercentage > 0;
        });
      } else if (activeFilter === 'completed') {
        filtered = filtered.filter(a => {
          const progress = progressMap[a.courseId._id];
          return progress && (progress.completionPercentage >= 100 || progress.status === 'Completed');
        });
      }

      if (searchQuery) {
        filtered = filtered.filter(a =>
          a.courseId?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.courseId?.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      return filtered;
    } catch (err: any) {
      console.error('[Dashboard] Error in getFilteredCourses:', err);
      return [];
    }
  };

  const getStatusBadge = (status: string, completionPercentage: number) => {
    if (status === 'Completed' || completionPercentage >= 100) {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm">
          <CheckCircle className="w-3 h-3" />
          Completed
        </span>
      );
    } else if (status === 'Overdue') {
      return (
        <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm">
          <AlertCircle className="w-3 h-3" />
          Overdue
        </span>
      );
    } else if (status === 'In Progress' || completionPercentage > 0) {
      return (
        <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm">
          <Clock className="w-3 h-3" />
          In Progress
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm">
          <AlertCircle className="w-3 h-3" />
          Not Started
        </span>
      );
    }
  };

  const isOverdue = (dueDate: string | undefined, completionPercentage: number) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && completionPercentage < 100;
  };

  const getDaysUntilDue = (dueDate?: string) => {
    if (!dueDate) return null;
    const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const continueLearning = getContinueLearningCourse();
  const filteredCourses = getFilteredCourses();
  const achievementsCount = certificates.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full border-2 animate-ping opacity-20" style={{ borderColor: primaryColor }} />
            <div className="absolute inset-1 rounded-full border-2 animate-ping opacity-40" style={{ borderColor: primaryColor, animationDelay: '0.15s' }} />
            <div className="w-16 h-16 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${primaryColor}40`, borderTopColor: primaryColor }} />
          </div>
          <p className="text-gray-500 text-sm font-medium">Loading your learning dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-2xl border border-gray-200 shadow-lg max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
              className="btn-primary"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
      {/* Premium Header with Glassmorphism */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-extrabold tracking-tight">
              Welcome back, {user?.firstName || 'Learner'}!
            </h1>
            <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light">
              Always keep learning and growing your skills.
            </p>
          </div>
          {continueLearning && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push(`/learner/course/${continueLearning.assignment.courseId._id}/view`)}
                className="group bg-white px-8 py-3 rounded-2xl font-semibold inline-flex items-center gap-2 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
                style={{ color: primaryColor }}
              >
                <Play className="w-5 h-5 transition-transform group-hover:scale-110" />
                Resume: {continueLearning.assignment.courseId.title}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats (Premium Dark Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          { label: 'Total Courses', value: assignments.length, icon: BookOpen, color: 'indigo', gradient: 'from-[#0f172a] to-[#1e1b4b]' },
          { label: 'In Progress', value: assignments.filter(a => progressMap[a.courseId._id]?.completionPercentage > 0 && progressMap[a.courseId._id]?.completionPercentage < 100).length, icon: Clock, color: 'blue', gradient: 'from-[#0f172a] to-[#172554]' },
          { label: 'Completed', value: assignments.filter(a => progressMap[a.courseId._id]?.completionPercentage >= 100).length, icon: CheckCircle, color: 'emerald', gradient: 'from-[#0f172a] to-[#064e3b]' },
          { label: 'Certificates', value: certificates.length, icon: Award, color: 'amber', gradient: 'from-[#0f172a] to-[#451a03]' },
        ].map((stat) => (
          <div key={stat.label} className={`group relative bg-gradient-to-br ${stat.gradient} rounded-3xl shadow-xl border border-white/5 p-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 overflow-hidden`}>
            <div className={`absolute -top-10 -right-10 w-24 h-24 bg-${stat.color}-500/10 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-500`} />

            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-medium text-gray-400 capitalize">{stat.label}</p>
                <p className="text-3xl font-extrabold text-white mt-1">{stat.value}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center transition-all duration-300 group-hover:bg-white/10 group-hover:scale-110">
                <stat.icon className={`w-6 h-6 text-${stat.color}-400`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming Exams (Premium Style) */}
      {upcomingExams.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 italic">Scheduled Exams</h2>
                <p className="text-gray-500 dark:text-gray-400">Don't miss your upcoming assessments</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/learner/exams')}
              className="font-semibold hover:underline flex items-center gap-1 transition-colors"
              style={{ color: primaryColor }}
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingExams.map((exam: any) => {
              const now = new Date();
              const sessionS = exam.mySession?.status || null;
              const hasStarted = exam.scheduledStartTime ? new Date(exam.scheduledStartTime) <= now : true;
              const hasEnded = exam.scheduledEndTime ? new Date(exam.scheduledEndTime) < now : false;
              const hasSubmitted = sessionS === 'submitted' || sessionS === 'auto_submitted' || sessionS === 'timed_out';
              const isAvailable = !hasSubmitted && hasStarted && !hasEnded && exam.status !== 'draft';

              let label = 'Not Started';
              if (hasEnded) label = 'Ended';
              if (sessionS === 'in_progress') label = 'Resume';

              return (
                <div key={exam._id} className="group bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-gray-700 shadow-lg hover:shadow-2xl transition-all hover:-translate-y-1">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 line-clamp-1">{exam.title}</h3>
                    {exam.proctoringLevel === 'soft' && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase">Proctored</span>
                    )}
                  </div>
                  <div className="space-y-3 text-sm text-gray-500 mb-6">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {exam.duration} Minutes
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {exam.scheduledStartTime ? new Date(exam.scheduledStartTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Flexible'}
                    </div>
                  </div>
                  <button
                    disabled={!isAvailable}
                    onClick={() => router.push(`/exam/${exam._id}/take`)}
                    className={`w-full py-3 rounded-2xl font-bold transition-all ${isAvailable
                        ? 'text-white shadow-lg hover:scale-[1.02] active:scale-95'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    style={isAvailable ? { backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}40` } : {}}
                  >
                    {isAvailable ? (sessionS === 'in_progress' ? 'Resume Exam' : 'Start Exam') : label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Exam Results (Premium Table-like Style) */}
      {pastExamResults.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <BarChart2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recent Results</h2>
                <p className="text-gray-500 dark:text-gray-400">Your performance in recent exams</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Exam</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Score</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {pastExamResults.map((exam: any) => {
                    const session = exam.mySession;
                    const resultsPublished = exam.status === 'results_published';
                    return (
                      <tr key={exam._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900 dark:text-gray-100">{exam.title}</p>
                          <p className="text-xs text-gray-400">{new Date(exam.scheduledEndTime || exam.updatedAt).toLocaleDateString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          {resultsPublished && session ? (
                            <span className="font-bold" style={{ color: primaryColor }}>{session.score} / {exam.totalMarks}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {resultsPublished && session ? (
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${session.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {session.passed ? 'Passed' : 'Failed'}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {resultsPublished && session && (
                            <button
                              onClick={() => setResultModal(exam)}
                              className="hover:opacity-80 font-bold text-sm transition-opacity"
                              style={{ color: primaryColor }}
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters (Premium Style) */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-14 pr-6 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-gray-50/50 dark:bg-gray-700/50"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'required', 'in-progress', 'completed'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${activeFilter === filter
                  ? 'text-white shadow-lg'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              style={activeFilter === filter ? { backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}40` } : {}}
            >
              {filter === 'all' ? 'All' : filter === 'required' ? 'Mandatory' : filter === 'in-progress' ? 'In Progress' : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      {/* Course Assignments Grid (Premium Card Style - 4 per row) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 sm:gap-8">
        {getFilteredCourses().map((assignment) => {
          const progress = progressMap[assignment.courseId._id] || { completionPercentage: 0, status: 'Not Started' };
          const isCompleted = progress.completionPercentage >= 100;

          return (
            <div
              key={assignment._id}
              className="group relative bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl transition-all duration-500 overflow-hidden hover:-translate-y-2 cursor-pointer flex flex-col"
              onClick={() => router.push(`/learner/course/${assignment.courseId._id}/view`)}
            >
              {/* Card Header with Gradient Thumbnail */}
              <div className="relative h-36 sm:h-40 overflow-hidden">
                {assignment.courseId.thumbnailUrl ? (
                  <img
                    src={assignment.courseId.thumbnailUrlPresigned || assignment.courseId.thumbnailUrl}
                    alt={assignment.courseId.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center transition-all duration-500"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
                  >
                    <BookOpen className="w-12 h-12 text-white/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                {/* Float status badge */}
                <div className="absolute top-3 right-3 scale-90 origin-top-right">
                  {getStatusBadge(progress.status, progress.completionPercentage)}
                </div>

                {assignment.isMandatory && (
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full shadow-lg">
                      Mandatory
                    </span>
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 sm:p-5 flex-1 flex flex-col">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 line-clamp-1 transition-colors">
                  {assignment.courseId.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-xs mb-4 line-clamp-2">
                  {assignment.courseId.description || 'No description available for this course.'}
                </p>

                {/* Progress Section */}
                <div className="mt-auto space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Progress</span>
                      <span className="text-sm font-bold" style={{ color: primaryColor }}>{Math.round(progress.completionPercentage)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-1000"
                        style={{ width: `${progress.completionPercentage}%`, background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {assignment.dueDate ? `Due ${new Date(assignment.dueDate).toLocaleDateString()}` : 'No due date'}
                    </div>
                    <button
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${isCompleted
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'hover:opacity-80'
                        }`}
                      style={!isCompleted ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
                    >
                      {isCompleted ? 'Review' : 'Continue'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Achievement Gallery */}
      {certificates.length > 0 && (
        <div className="mt-12 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Your Achievements</h2>
              <p className="text-gray-500 dark:text-gray-400">Certificates you've earned upon completion</p>
            </div>
            <button
              onClick={() => router.push('/learner/certificates')}
              className="text-indigo-600 font-semibold hover:underline flex items-center gap-1"
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {certificates.slice(0, 4).map((cert) => (
              <div key={cert._id} className="group relative bg-[#0a0e27] rounded-3xl p-8 border border-amber-500/20 hover:border-amber-500/50 transition-all duration-500 hover:-translate-y-2">
                <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-100 transition-opacity">
                  <Trophy className="w-24 h-24 text-amber-500" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-6">
                    <Award className="w-6 h-6 text-amber-500" />
                  </div>
                  <h4 className="text-white font-bold text-lg mb-2 truncate pr-16">{cert.courseId?.title || 'Certificate'}</h4>
                  <p className="text-indigo-200/60 text-xs mb-6">ID: {cert.certificateId}</p>

                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const r = await fetch(`/api/certificates/${cert._id}/download`, { credentials: 'include' });
                        const blob = await r.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        const certName = cert.courseId?.title || 'Certificate';
                        link.download = `${certName.replace(/[^a-zA-Z0-9\s-]/g, '')}_Certificate.pdf`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                      } catch (err: any) {
                        console.error('Certificate download failed:', err);
                      }
                    }}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result Modal */}
      {resultModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full p-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold">Exam Results</h3>
                <p className="text-gray-500">{resultModal.title}</p>
              </div>
              <button onClick={() => setResultModal(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="text-center py-8 rounded-3xl bg-indigo-50 dark:bg-indigo-900/30 mb-6">
              <p className="text-4xl font-extrabold text-indigo-600">
                {resultModal.mySession?.score ?? '—'} <span className="text-xl text-gray-400 font-normal"> / {resultModal.totalMarks}</span>
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-indigo-400 font-semibold">{resultModal.mySession?.percentage ?? 0}%</span>
                {resultModal.mySession?.passed != null && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${resultModal.mySession.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {resultModal.mySession.passed ? 'Passed' : 'Failed'}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-600">
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">Duration</p>
                <p className="text-sm font-bold">{resultModal.duration} min</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-600">
                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">Passing</p>
                <p className="text-sm font-bold">{resultModal.settings?.passingScore ?? 40}%</p>
              </div>
            </div>

            <button
              onClick={() => setResultModal(null)}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-indigo-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LearnerDashboardPageWithErrorBoundary = () => (
  <DashboardErrorBoundary>
    <LearnerDashboardPage />
  </DashboardErrorBoundary>
);

export default LearnerDashboardPageWithErrorBoundary;
