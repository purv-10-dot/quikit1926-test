'use client';

import { useState, useEffect } from 'react';
import {
  Users, Award, AlertTriangle, BookOpen, TrendingUp, BarChart3,
  Shield, Clock, Timer, ChevronRight,
  UserPlus, RefreshCw, FileSpreadsheet, Mail,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/app/providers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import UserProfileModal from '@/components/manager/UserProfileModal';
import ReadMoreText from '@/components/ReadMoreText';
import TeamEnrollmentModal from '@/components/manager/TeamEnrollmentModal';
import AssessmentAuditModal from '@/components/manager/AssessmentAuditModal';
import NudgeBulkModal from '@/components/manager/NudgeBulkModal';
import AttendanceModal from '@/components/manager/AttendanceModal';

// ─── Types ───────────────────────────────────────────────────────────
interface TeamStats {
  totalTeamMembers: number;
  averageTeamScore: number;
  overdueCourses: number;
  certificatesEarnedThisMonth: number;
  complianceRate: number;
  completionFunnel: { enrolled: number; inProgress: number; completed: number };
  skillGapHeatmap: Array<{ topic: string; courseId: string; failureRate: number; affectedLearners: number }>;
  struggleHeatmap: Array<{ moduleTitle: string; courseTitle: string; moduleId: string; failureRate: number; totalAttempts: number; failedAttempts: number }>;
  timeToComplete: { averageDays: number; expectedDays: number; variance: number };
  idleLearners: Array<{ userId: string; userName: string; email: string; daysSinceLastLogin: number }>;
  teamMembers: Array<{ userId: string; userName: string; email: string; completionPercentage: number; coursesCompleted: number; activeCoursesCount: number; lastLogin?: string }>;
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
  userId: string;
  userName: string;
  email: string;
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

// ─── Reusable sub-components ─────────────────────────────────────────

const KpiCard = ({ label, value, subtitle, icon: Icon, color }: {
  label: string; value: string | number; subtitle: string;
  icon: React.ElementType; color: 'blue' | 'purple' | 'emerald' | 'red' | 'amber';
}) => {
  const palette = {
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-200', iconBg: 'bg-blue-100', iconText: 'text-blue-600',    valueText: 'text-blue-700',    subText: 'text-blue-500' },
    purple:  { bg: 'bg-purple-50',  border: 'border-purple-200', iconBg: 'bg-purple-100', iconText: 'text-purple-600',  valueText: 'text-purple-700',  subText: 'text-purple-500' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', valueText: 'text-emerald-700', subText: 'text-emerald-500' },
    red:     { bg: 'bg-red-50',     border: 'border-red-200', iconBg: 'bg-red-100', iconText: 'text-red-600',     valueText: 'text-red-700',     subText: 'text-red-500' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200', iconBg: 'bg-amber-100', iconText: 'text-amber-600',   valueText: 'text-amber-700',   subText: 'text-amber-500' },
  }[color];

  return (
    <div className={`${palette.bg} border ${palette.border} rounded-2xl p-5 transition-shadow hover:shadow-md`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${palette.valueText}`}>{value}</p>
        </div>
        <div className={`p-3 ${palette.iconBg} rounded-xl`}>
          <Icon className={`w-6 h-6 ${palette.iconText}`} />
        </div>
      </div>
      <p className={`text-xs mt-3 ${palette.subText}`}>{subtitle}</p>
    </div>
  );
};

const SectionCard = ({ title, subtitle, icon: Icon, children, headerRight }: {
  title: string; subtitle?: string; icon?: React.ElementType;
  children: React.ReactNode; headerRight?: React.ReactNode;
}) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2 bg-gray-100 rounded-lg">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {headerRight}
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const EmptyState = ({ icon: Icon, title, description, action }: {
  icon: React.ElementType; title: string; description: string;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="text-center py-12 px-4">
    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
      <Icon className="w-8 h-8 text-gray-400" />
    </div>
    <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
    <p className="text-sm text-gray-500 max-w-sm mx-auto">{description}</p>
    {action && (
      <button
        onClick={action.onClick}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
      >
        {action.label}
      </button>
    )}
  </div>
);

const StatusBadge = ({ percentage }: { percentage: number }) => {
  if (percentage >= 100) {
    return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium">Completed</span>;
  }
  if (percentage > 0) {
    return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">In Progress</span>;
  }
  return <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium">Not Started</span>;
};

const tooltipStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  color: '#111827',
};

// ─── Main Component ──────────────────────────────────────────────────

const ManagerDashboardPage = () => {
  const { user: currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'overview' | 'learner_courses'>('overview');
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [learnerCourses, setLearnerCourses] = useState<LearnerCourseOverview[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [selectedCourseIdForTab, setSelectedCourseIdForTab] = useState<string | null>(null);
  const [selectedCourseDetail, setSelectedCourseDetail] = useState<LearnerCourseDetail | null>(null);
  const [courseDetailLoading, setCourseDetailLoading] = useState(false);
  const [nudgeLoading, setNudgeLoading] = useState<string | null>(null);

  const loadTeamStats = async () => {
    setError(null);
    try {
      const response = await api.get<any>('/manager/team-stats');
      const data = response.data.data || response.data;
      setStats({
        totalTeamMembers: data.totalTeamMembers ?? 0,
        averageTeamScore: data.averageTeamScore ?? 0,
        overdueCourses: data.overdueCourses ?? 0,
        certificatesEarnedThisMonth: data.certificatesEarnedThisMonth ?? 0,
        complianceRate: data.complianceRate ?? 0,
        completionFunnel: data.completionFunnel ?? { enrolled: 0, inProgress: 0, completed: 0 },
        skillGapHeatmap: data.skillGapHeatmap ?? [],
        struggleHeatmap: data.struggleHeatmap ?? [],
        timeToComplete: data.timeToComplete ?? { averageDays: 0, expectedDays: 0, variance: 0 },
        idleLearners: data.idleLearners ?? [],
        teamMembers: data.teamMembers ?? [],
      });
    } catch (err: any) {
      console.error('Failed to load team stats:', err);
      setError(err?.message || 'Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const managerId = currentUser?.id;
      if (!managerId) throw new Error('Manager ID not found');
      const r = await fetch(`/api/manager/export/${managerId}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Export request failed');
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `team-report-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const loadLearnerCourses = async () => {
    setCoursesLoading(true);
    try {
      const response = await api.get<any>('/manager/learner-courses');
      const rows = response.data || [];
      setLearnerCourses(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setLearnerCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  };

  const loadLearnersByCourse = async (courseId: string) => {
    setSelectedCourseIdForTab(courseId);
    setCourseDetailLoading(true);
    try {
      const response = await api.get<any>(`/manager/learner-courses/${courseId}`);
      setSelectedCourseDetail(response.data || null);
    } catch (err: any) {
      setSelectedCourseDetail(null);
    } finally {
      setCourseDetailLoading(false);
    }
  };

  const nudgeSingleLearner = async (userId: string) => {
    setNudgeLoading(userId);
    try {
      await api.post<any>(`/manager/nudge/${userId}`, {});
      if (selectedCourseIdForTab) await loadLearnersByCourse(selectedCourseIdForTab);
    } catch (err: any) {
      alert('Failed to send nudge');
    } finally {
      setNudgeLoading(null);
    }
  };

  const nudgePendingInCourse = async () => {
    if (!selectedCourseDetail) return;
    const pendingUserIds = selectedCourseDetail.learners
      .filter((l) => l.status !== 'completed')
      .map((l) => l.userId)
      .filter(Boolean);

    if (pendingUserIds.length === 0) {
      alert('All learners have completed this course.');
      return;
    }

    setNudgeLoading('bulk');
    try {
      await api.post<any>('/manager/nudge', {
        userIds: pendingUserIds,
        message: `Please complete "${selectedCourseDetail.courseTitle}" assigned by your manager.`,
      });
      alert(`Nudge sent to ${pendingUserIds.length} learner(s).`);
      if (selectedCourseIdForTab) await loadLearnersByCourse(selectedCourseIdForTab);
    } catch (err: any) {
      alert('Failed to send course nudges');
    } finally {
      setNudgeLoading(null);
    }
  };

  useEffect(() => { loadTeamStats(); }, []);
  useEffect(() => {
    if (activeTab === 'learner_courses') {
      loadLearnerCourses();
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-gray-100 rounded-2xl" />
          <div className="h-80 bg-gray-100 rounded-2xl" />
        </div>
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Something went wrong</h3>
        <p className="text-sm text-gray-500 mb-4 text-center max-w-md">{error}</p>
        <button
          onClick={() => { setLoading(true); loadTeamStats(); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const hasTeam = stats.totalTeamMembers > 0;

  if (!hasTeam) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Dashboard</h1>
          <p className="text-gray-500 mt-1">Monitor your team's learning progress and performance</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <KpiCard label="Team Members" value={0} subtitle="No learners assigned yet" icon={Users} color="blue" />
          <KpiCard label="Compliance Rate" value="—" subtitle="Awaiting data" icon={Shield} color="purple" />
          <KpiCard label="Avg Team Score" value="—" subtitle="Awaiting data" icon={TrendingUp} color="emerald" />
          <KpiCard label="Overdue Tasks" value={0} subtitle="All clear" icon={AlertTriangle} color="red" />
          <KpiCard label="Certificates" value={0} subtitle="This month" icon={Award} color="amber" />
        </div>

        <div className="bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-200 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-5 bg-white rounded-2xl shadow-sm flex items-center justify-center">
            <UserPlus className="w-10 h-10 text-primary-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Learners Assigned Yet</h2>
          <p className="text-gray-600 max-w-lg mx-auto mb-6">
            Your Tenant Admin needs to assign learners to you before you can see team data here.
            Once learners are assigned, their profiles, enrolled courses, progress, certificates,
            and assessment results will automatically appear on this dashboard.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowEnrollmentModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm"
            >
              <BookOpen className="w-4 h-4" />
              Assign Team to Course
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Ask your Tenant Admin to go to Learner Management → Edit a learner → set you as their Manager.
          </p>
        </div>

        {showEnrollmentModal && (
          <TeamEnrollmentModal
            onClose={() => setShowEnrollmentModal(false)}
            onEnrollSuccess={() => loadTeamStats()}
          />
        )}
      </div>
    );
  }

  const funnelData = [
    { name: 'Enrolled', value: stats.completionFunnel.enrolled, fill: '#3b82f6' },
    { name: 'In Progress', value: stats.completionFunnel.inProgress, fill: '#f59e0b' },
    { name: 'Completed', value: stats.completionFunnel.completed, fill: '#10b981' },
  ];

  const memberChartData = stats.teamMembers.map(m => ({
    name: m.userName.length > 15 ? m.userName.substring(0, 15) + '…' : m.userName,
    fullName: m.userName,
    completion: m.completionPercentage,
  }));

  if (activeTab === 'learner_courses') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Team Dashboard</h1>
            <p className="text-gray-500 mt-1">Course-wise learner completion and nudges</p>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('overview')}
              className="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-white"
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('learner_courses')}
              className="px-3 py-1.5 text-sm rounded-md bg-white text-primary-700 shadow-sm"
            >
              Learner Courses
            </button>
          </div>
        </div>

        <SectionCard title="Learner Courses" subtitle="Click a course to view learner completion and nudge pending users" icon={BookOpen}>
          {coursesLoading ? (
            <div className="text-sm text-gray-500">Loading learner courses...</div>
          ) : learnerCourses.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No assigned courses found"
              description="Once courses are assigned to your learners, they appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4">Course</th>
                    <th className="text-left py-2 pr-4">Learners</th>
                    <th className="text-left py-2 pr-4">Completed</th>
                    <th className="text-left py-2 pr-4">In Progress</th>
                    <th className="text-left py-2 pr-4">Not Started</th>
                    <th className="text-left py-2 pr-4">Completion Rate</th>
                    <th className="text-right py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {learnerCourses.map((c) => (
                    <tr key={c.courseId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900" title={c.courseTitle}>{c.courseTitle}</p>
                        {c.courseDescription && <ReadMoreText text={c.courseDescription} maxLines={2} className="text-xs text-gray-500" />}
                      </td>
                      <td className="py-3 pr-4">{c.totalLearners}</td>
                      <td className="py-3 pr-4 text-emerald-700 font-medium">{c.completed}</td>
                      <td className="py-3 pr-4 text-blue-700 font-medium">{c.inProgress}</td>
                      <td className="py-3 pr-4 text-gray-700 font-medium">{c.notStarted}</td>
                      <td className="py-3 pr-4">{c.completionRate}%</td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => loadLearnersByCourse(c.courseId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 hover:bg-white"
                        >
                          View Learners <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {selectedCourseIdForTab && (
          <SectionCard
            title={selectedCourseDetail ? `Learners in ${selectedCourseDetail.courseTitle}` : 'Course Learners'}
            subtitle="Completion reality and quick nudges"
            icon={Users}
            headerRight={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedCourseIdForTab(null);
                    setSelectedCourseDetail(null);
                  }}
                  className="px-3 py-1.5 border rounded-md text-sm hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={nudgePendingInCourse}
                  disabled={nudgeLoading === 'bulk' || !selectedCourseDetail}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-60"
                >
                  <Mail className="w-4 h-4" />
                  {nudgeLoading === 'bulk' ? 'Sending...' : 'Nudge Pending'}
                </button>
              </div>
            }
          >
            {courseDetailLoading ? (
              <div className="text-sm text-gray-500">Loading learners...</div>
            ) : !selectedCourseDetail || selectedCourseDetail.learners.length === 0 ? (
              <EmptyState icon={Users} title="No learners in this course" description="No assigned learners found for this course." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4">Learner</th>
                      <th className="text-left py-2 pr-4">Completion</th>
                      <th className="text-left py-2 pr-4">Status</th>
                      <th className="text-left py-2 pr-4">Due Date</th>
                      <th className="text-right py-2">Nudge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCourseDetail.learners.map((learner) => (
                      <tr key={learner.userId} className="border-b border-gray-100">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-900">{learner.userName}</p>
                          <p className="text-xs text-gray-500">{learner.email}</p>
                        </td>
                        <td className="py-3 pr-4">{learner.completionPercentage}%</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            learner.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : learner.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-700'
                          }`}>
                            {learner.status === 'in_progress' ? 'In Progress' : learner.status === 'not_started' ? 'Not Started' : 'Completed'}
                          </span>
                        </td>
                        <td className="py-3 pr-4">{learner.dueDate ? new Date(learner.dueDate).toLocaleDateString() : '—'}</td>
                        <td className="py-3 text-right">
                          {learner.status === 'completed' ? (
                            <span className="text-xs text-emerald-700 font-medium">Done</span>
                          ) : (
                            <button
                              onClick={() => learner.userId && nudgeSingleLearner(learner.userId)}
                              disabled={nudgeLoading === learner.userId}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-primary-300 text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                            >
                              <Mail className="w-4 h-4" />
                              {nudgeLoading === learner.userId ? 'Sending...' : 'Nudge'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Dashboard</h1>
          <p className="text-gray-500 mt-1">Monitor your team's learning progress and performance</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg mr-2">
            <button
              onClick={() => setActiveTab('overview')}
              className="px-3 py-1.5 text-sm rounded-md bg-white text-primary-700 shadow-sm"
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('learner_courses')}
              className="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-white"
            >
              Learner Courses
            </button>
          </div>
          <button
            onClick={() => { setLoading(true); loadTeamStats(); }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard label="Team Members" value={stats.totalTeamMembers} subtitle={`${stats.totalTeamMembers} active learner${stats.totalTeamMembers !== 1 ? 's' : ''}`} icon={Users} color="blue" />
        <KpiCard label="Compliance Rate" value={`${stats.complianceRate}%`} subtitle="Mandatory course completion" icon={Shield} color="purple" />
        <KpiCard label="Avg Team Score" value={`${stats.averageTeamScore}%`} subtitle="Across all assessments" icon={TrendingUp} color="emerald" />
        <KpiCard label="Overdue Tasks" value={stats.overdueCourses} subtitle={stats.overdueCourses > 0 ? 'Needs attention' : 'All on track'} icon={AlertTriangle} color="red" />
        <KpiCard label="Certificates" value={stats.certificatesEarnedThisMonth} subtitle="Earned this month" icon={Award} color="amber" />
      </div>

      <SectionCard title="Time-to-Complete Analysis" subtitle="Average vs expected duration" icon={Timer}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-500 mb-1">Average Completion</p>
            <p className="text-3xl font-bold text-blue-700">{stats.timeToComplete.averageDays}</p>
            <p className="text-xs text-gray-400 mt-1">days</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-500 mb-1">Expected Duration</p>
            <p className="text-3xl font-bold text-emerald-700">{stats.timeToComplete.expectedDays}</p>
            <p className="text-xs text-gray-400 mt-1">days</p>
          </div>
          <div className={`rounded-xl p-4 border ${stats.timeToComplete.variance > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
            <p className="text-sm font-medium text-gray-500 mb-1">Variance</p>
            <p className={`text-3xl font-bold ${stats.timeToComplete.variance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {stats.timeToComplete.variance > 0 ? '+' : ''}{stats.timeToComplete.variance}%
            </p>
            <p className="text-xs text-gray-400 mt-1">{stats.timeToComplete.variance > 0 ? 'Slower than expected' : 'On track or faster'}</p>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        <SectionCard title="Completion Funnel" icon={BarChart3}>
          {funnelData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 13 }} />
                <YAxis tick={{ fill: '#6b7280' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart3} title="No enrollments yet" description="Assign courses to your team to see the completion funnel." action={{ label: 'Assign Course', onClick: () => setShowEnrollmentModal(true) }} />
          )}
        </SectionCard>

        <SectionCard title="Skill Gap Heatmap" subtitle="Topics with highest failure rates" icon={AlertTriangle}>
          {stats.skillGapHeatmap.length > 0 ? (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {stats.skillGapHeatmap.map((gap, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 text-sm truncate mr-2">{gap.topic}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      gap.failureRate >= 50 ? 'bg-red-100 text-red-700' :
                      gap.failureRate >= 25 ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {gap.failureRate}% failure
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${
                        gap.failureRate >= 50 ? 'bg-red-500' :
                        gap.failureRate >= 25 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      }`} style={{ width: `${gap.failureRate}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{gap.affectedLearners} learner{gap.affectedLearners !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="No skill gaps identified" description="Great news! Your team has no significant failure patterns in assessments." />
          )}
        </SectionCard>
      </div>

      {stats.idleLearners.length > 0 && (
        <SectionCard
          title="Idle Learners"
          subtitle={`${stats.idleLearners.length} team member${stats.idleLearners.length !== 1 ? 's' : ''} inactive for 10+ days`}
          icon={Clock}
          headerRight={
            <button
              onClick={() => setShowNudgeModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Nudge All
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.idleLearners.slice(0, 6).map((learner) => (
              <div
                key={learner.userId}
                className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl p-3 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => setSelectedUserId(learner.userId)}
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{learner.userName}</p>
                  <p className="text-xs text-gray-500 truncate">{learner.email}</p>
                </div>
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full shrink-0 ml-2">
                  {learner.daysSinceLastLogin}d idle
                </span>
              </div>
            ))}
          </div>
          {stats.idleLearners.length > 6 && (
            <p className="text-sm text-gray-400 mt-3 text-center">
              +{stats.idleLearners.length - 6} more idle learner{stats.idleLearners.length - 6 !== 1 ? 's' : ''}
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Team Completion Progress" icon={BarChart3}>
        {memberChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(280, stats.teamMembers.length * 48)}>
            <BarChart data={memberChartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280' }} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#374151', fontSize: 13 }} />
              <Tooltip
                formatter={(value: any) => [`${value}%`, 'Completion']}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="completion" name="Completion %" radius={[0, 8, 8, 0]}>
                {memberChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.completion >= 80 ? '#10b981' : entry.completion >= 50 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={BarChart3} title="No progress data" description="Assign courses to your team members to track their completion progress." action={{ label: 'Assign Course', onClick: () => setShowEnrollmentModal(true) }} />
        )}
      </SectionCard>

      <SectionCard
        title="Team Members"
        subtitle={`${stats.teamMembers.length} learner${stats.teamMembers.length !== 1 ? 's' : ''} in your team`}
        icon={Users}
        headerRight={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAttendanceModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Attendance
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button
              onClick={() => setShowEnrollmentModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Assign Course
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Team Member</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Progress</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Courses</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Last Active</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.teamMembers.map((member) => (
                <tr key={member.userId} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-primary-700 font-semibold text-sm">
                          {member.userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.userName}</p>
                        <p className="text-xs text-gray-500 truncate">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            member.completionPercentage >= 80 ? 'bg-emerald-500' :
                            member.completionPercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(member.completionPercentage, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-10">{member.completionPercentage}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-sm text-gray-700">{member.coursesCompleted}/{member.activeCoursesCount}</span>
                    <span className="text-xs text-gray-400 ml-1">completed</span>
                  </td>
                  <td className="py-4 px-6">
                    <StatusBadge percentage={member.completionPercentage} />
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-500">
                    {member.lastLogin ? new Date(member.lastLogin).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => setSelectedUserId(member.userId)}
                      className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium transition-colors"
                    >
                      View Details
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {selectedUserId && !selectedCourseId && (
        <UserProfileModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onResetQuiz={() => loadTeamStats()}
          onNudge={() => loadTeamStats()}
          onViewResults={(courseId: string) => setSelectedCourseId(courseId)}
        />
      )}

      {showEnrollmentModal && (
        <TeamEnrollmentModal
          onClose={() => setShowEnrollmentModal(false)}
          onEnrollSuccess={() => loadTeamStats()}
        />
      )}

      {selectedUserId && selectedCourseId && (
        <AssessmentAuditModal
          userId={selectedUserId}
          courseId={selectedCourseId}
          onClose={() => { setSelectedCourseId(null); setSelectedUserId(null); }}
        />
      )}

      {showNudgeModal && stats && (
        <NudgeBulkModal
          idleLearners={stats.idleLearners}
          onClose={() => setShowNudgeModal(false)}
          onSuccess={() => { loadTeamStats(); setShowNudgeModal(false); }}
        />
      )}

      {showAttendanceModal && (
        <AttendanceModal
          teamMembers={stats.teamMembers}
          onClose={() => setShowAttendanceModal(false)}
          onSuccess={() => { loadTeamStats(); setShowAttendanceModal(false); }}
        />
      )}
    </div>
  );
};

export default ManagerDashboardPage;
