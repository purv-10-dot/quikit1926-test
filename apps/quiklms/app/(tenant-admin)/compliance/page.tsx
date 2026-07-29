'use client';

import { useState, useEffect } from 'react';
import { FileCheck, Mail, AlertCircle, Trophy, BookOpen, Clock, User as UserIcon, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Skeleton } from '@/components/ui';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { cn } from '@/lib/cn';

interface CompletionRates {
  completed: number;
  inProgress: number;
  notStarted: number;
}

interface TopPerformer {
  userId: string;
  userName: string;
  email: string;
  coursesCompleted: number;
  averageScore: number;
}

interface DifficultModule {
  courseId: string;
  courseTitle: string;
  averageScore: number;
  totalAttempts: number;
}

interface OverdueCourse {
  courseId: string;
  courseTitle: string;
  dueDate: string;
  daysOverdue: number;
}

interface NudgeUser {
  userId: string;
  userName: string;
  email: string;
  reason: 'no_login' | 'overdue_course';
  daysSinceLastLogin?: number;
  overdueCourses?: OverdueCourse[];
}

const CompliancePage = () => {
  const { branding } = useBranding();
  const [loading, setLoading] = useState(true);
  const [completionRates, setCompletionRates] = useState<CompletionRates>({ completed: 0, inProgress: 0, notStarted: 0 });
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [difficultModules, setDifficultModules] = useState<DifficultModule[]>([]);
  const [nudgeUsers, setNudgeUsers] = useState<NudgeUser[]>([]);
  const [sendingNudges, setSendingNudges] = useState(false);

  useEffect(() => {
    loadComplianceData();
  }, []);

  const loadComplianceData = async () => {
    try {
      setLoading(true);
      const [analyticsResponse, nudgeResponse] = await Promise.all([
        api.get('/compliance/analytics'),
        api.get('/compliance/nudge-users'),
      ]);

      const analyticsData = (analyticsResponse as any)?.data;
      if (analyticsData) {
        setCompletionRates(analyticsData.completionRates ?? { completed: 0, inProgress: 0, notStarted: 0 });
        setTopPerformers(analyticsData.topPerformers ?? []);
        setDifficultModules(analyticsData.difficultModules ?? []);
      }

      const nudgeData = (nudgeResponse as any)?.data;
      if (nudgeData) {
        setNudgeUsers(nudgeData.users ?? []);
      }
    } catch (error) {
      console.error('Failed to load compliance data:', error);
      toast.error('Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  };

  const handleNudgeAll = async () => {
    if (nudgeUsers.length === 0) {
      toast.error('No users to nudge');
      return;
    }

    if (!confirm(`Send reminder emails to ${nudgeUsers.length} users?`)) {
      return;
    }

    try {
      setSendingNudges(true);
      const response = await api.post('/compliance/nudge-all', {
        userIds: nudgeUsers.map(u => u.userId),
      });

      if ((response as any)?.success) {
        toast.success(`Successfully sent reminder emails to ${(response as any).data?.sentCount ?? 0} users!`);
        await loadComplianceData();
      }
    } catch (error: any) {
      console.error('Failed to send nudge emails:', error);
      toast.error(error?.message || 'Failed to send reminder emails');
    } finally {
      setSendingNudges(false);
    }
  };

  const pieChartData = [
    { name: 'Completed', value: completionRates.completed, color: '#10b981' },
    { name: 'In Progress', value: completionRates.inProgress, color: '#f59e0b' },
    { name: 'Not Started', value: completionRates.notStarted, color: '#ef4444' },
  ];

  const total = completionRates.completed + completionRates.inProgress + completionRates.notStarted;
  const completionPercentage = total > 0 ? ((completionRates.completed / total) * 100).toFixed(1) : '0';

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
        <Toaster position="top-right" />
        <Skeleton className="h-40 rounded-2xl mt-4 sm:mt-6 lg:mt-8" />
        <Skeleton className="h-80 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Premium Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
        style={{ background: `linear-gradient(135deg, ${branding?.primaryColor || '#4f46e5'}, ${branding?.secondaryColor || '#ec4899'})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <FileCheck className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">Compliance & Analytics</h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                Monitor training progress and system performance
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={handleNudgeAll}
            disabled={sendingNudges || nudgeUsers.length === 0}
            loading={sendingNudges}
            className="px-6 py-3 bg-white text-gray-900 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 shadow-lg hover:bg-gray-100 hover:translate-y-[-2px] disabled:opacity-50 disabled:translate-y-0"
          >
            {!sendingNudges && <Mail className="w-5 h-5" />}
            Nudge All Overdue
          </Button>
        </div>
      </div>

      {/* Completion Rates Pie Chart */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-fg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[var(--brand-primary)]" />
                Course Completion Rates
              </h2>
              <p className="text-sm text-fg-muted mt-1">Overall organization completion status</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-[var(--brand-primary)]">{completionPercentage}%</div>
              <div className="text-sm text-fg-muted">Completion Rate</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-col justify-center space-y-4">
              {pieChartData.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-surface-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium text-fg">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-fg">{item.value}</div>
                    <div className="text-xs text-fg-muted">
                      {total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Performers and Difficult Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        {/* Top Performers */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold text-fg flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Top Performers
            </h2>
            {topPerformers.length === 0 ? (
              <div className="text-center text-fg-muted py-8">No performance data available</div>
            ) : (
              <div className="space-y-3">
                {topPerformers.map((performer, index) => (
                  <div key={performer.userId} className="flex items-center justify-between p-3 bg-surface-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center font-bold text-[var(--brand-primary)]">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-fg">{performer.userName}</div>
                        <div className="text-sm text-fg-muted">{performer.email}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-fg">{performer.coursesCompleted} courses</div>
                      <div className="text-sm text-fg-muted">{performer.averageScore.toFixed(1)}% avg</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Difficult Modules */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold text-fg flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-red-500" />
              Most Difficult Modules
            </h2>
            {difficultModules.length === 0 ? (
              <div className="text-center text-fg-muted py-8">No module data available</div>
            ) : (
              <div className="space-y-3">
                {difficultModules.map((module) => (
                  <div key={module.courseId} className="flex items-center justify-between p-3 bg-surface-muted rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-fg truncate">{module.courseTitle}</div>
                      <div className="text-sm text-fg-muted">{module.totalAttempts} attempts</div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="font-bold text-red-600">{module.averageScore.toFixed(1)}%</div>
                      <div className="text-xs text-fg-muted">avg score</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nudge Section */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-fg flex items-center gap-2">
                <Mail className="w-5 h-5 text-[var(--brand-primary)]" />
                Nudge Learners
              </h2>
              <p className="text-sm text-fg-muted mt-1">
                Users who haven't logged in for 7+ days or have overdue courses
              </p>
            </div>
            <Button
              variant="primary"
              onClick={handleNudgeAll}
              disabled={nudgeUsers.length === 0 || sendingNudges}
              loading={sendingNudges}
            >
              {!sendingNudges && <Mail className="w-4 h-4 mr-2" />}
              {sendingNudges ? 'Sending...' : `Nudge All (${nudgeUsers.length})`}
            </Button>
          </div>

          {nudgeUsers.length === 0 ? (
            <div className="text-center text-fg-muted py-8 border-2 border-dashed border-line rounded-lg">
              <AlertCircle className="w-12 h-12 mx-auto text-fg-subtle mb-2" />
              <p>No users need nudging at this time!</p>
              <p className="text-sm mt-1">All learners are up to date.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {nudgeUsers.map((user) => (
                <div key={user.userId} className="border border-line rounded-lg p-4 hover:bg-surface-muted transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center flex-shrink-0">
                        <UserIcon className="w-5 h-5 text-[var(--brand-primary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-fg">{user.userName}</span>
                          <span className="text-sm text-fg-muted">({user.email})</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {user.reason === 'no_login' && user.daysSinceLastLogin && (
                            <Badge tone="warning">
                              <Clock className="w-3 h-3 mr-1" />
                              No login for {user.daysSinceLastLogin} days
                            </Badge>
                          )}
                          {user.overdueCourses && user.overdueCourses.length > 0 && (
                            <Badge tone="danger">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              {user.overdueCourses.length} overdue course{user.overdueCourses.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        {user.overdueCourses && user.overdueCourses.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {user.overdueCourses.map((course, index) => (
                              <div key={index} className="text-sm text-fg-muted flex items-center gap-2">
                                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                                <span>{course.courseTitle}</span>
                                <span className="text-red-600 font-medium">({course.daysOverdue} days overdue)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompliancePage;
