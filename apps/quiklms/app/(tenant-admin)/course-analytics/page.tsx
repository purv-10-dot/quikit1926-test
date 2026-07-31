'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users, CheckCircle, Clock, BookOpen, Award,
  TrendingUp, BarChart3, ArrowLeft, AlertCircle,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

interface QuizPerformance {
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  participantCount: number;
}

interface ProgressDistributionItem {
  range: string;
  count: number;
}

interface CourseAnalyticsData {
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  totalEnrolled: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  averageCompletionPercentage: number;
  certificatesIssued: number;
  quizPerformance: QuizPerformance | null;
  progressDistribution: ProgressDistributionItem[];
}

const STATUS_COLORS = ['#10b981', '#3b82f6', '#9ca3af'];
const DIST_COLORS = ['#ef4444', '#f97316', '#3b82f6', '#10b981'];

function LocalStatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

function CourseAnalyticsPageInner() {
  const { branding } = useBranding();
  const primaryColor = branding?.primaryColor;
  const secondaryColor = branding?.secondaryColor;
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');

  const [data, setData] = useState<CourseAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    api
      .get(`/analytics/corporate/course/${courseId}`)
      .then((res: any) => {
        // Route returns the analytics object directly (no { success, data } envelope).
        // Support both shapes defensively in case the route is later wrapped.
        const payload = res && typeof res === 'object' && 'data' in res && !('courseId' in res) ? res.data : res;
        if (payload && payload.courseId) setData(payload as CourseAnalyticsData);
        else setError('No data returned for this course.');
      })
      .catch(() => setError('Failed to load course analytics. Please try again.'))
      .finally(() => setLoading(false));
  }, [courseId]);

  const goBack = () => router.back();

  const completionRate =
    data && data.totalEnrolled > 0
      ? Math.round((data.completed / data.totalEnrolled) * 100)
      : 0;

  const statusPieData = data
    ? [
        { name: 'Completed', value: data.completed },
        { name: 'In Progress', value: data.inProgress },
        { name: 'Not Started', value: data.notStarted },
      ].filter((d) => d.value > 0)
    : [];

  const quizChartData =
    data?.quizPerformance
      ? [
          { label: 'Avg Score', value: data.quizPerformance.averageScore ?? 0 },
          { label: 'Highest', value: data.quizPerformance.highestScore ?? 0 },
          { label: 'Lowest', value: data.quizPerformance.lowestScore ?? 0 },
        ]
      : [];

  if (loading) {
    return (
      <>
        <Toaster position="top-right" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading analytics...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Toaster position="top-right" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Analytics</h3>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={goBack}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              Go Back
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
        {/* Premium Hero Header */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
          style={{ background: `linear-gradient(135deg, ${primaryColor || '#4f46e5'}, ${secondaryColor || '#ec4899'})` }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}
          />
          <div className="relative">
            <button
              onClick={goBack}
              className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-all duration-300"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                  <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">{data.courseTitle}</h1>
                  <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1 line-clamp-1">{data.courseDescription}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/10">
              {[
                { label: 'Total Enrolled', value: data.totalEnrolled },
                { label: 'Completed', value: data.completed },
                { label: 'In Progress', value: data.inProgress },
                { label: 'Completion Rate', value: `${completionRate}%` },
              ].map((item) => (
                <div key={item.label} className="text-center sm:text-left">
                  <p className="text-2xl sm:text-3xl font-bold">{item.value}</p>
                  <p className="text-white/60 text-xs sm:text-sm font-medium mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <LocalStatCard
            icon={Users}
            label="Total Enrolled"
            value={data.totalEnrolled}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <LocalStatCard
            icon={CheckCircle}
            label="Completed"
            value={data.completed}
            sub={`${completionRate}% completion rate`}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
          <LocalStatCard
            icon={Clock}
            label="In Progress"
            value={data.inProgress}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
          <LocalStatCard
            icon={BookOpen}
            label="Not Started"
            value={data.notStarted}
            iconBg="bg-gray-50"
            iconColor="text-gray-500"
          />
          <LocalStatCard
            icon={TrendingUp}
            label="Avg Completion"
            value={`${data.averageCompletionPercentage}%`}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
          />
          <LocalStatCard
            icon={Award}
            label="Certificates Issued"
            value={data.certificatesIssued}
            iconBg="bg-yellow-50"
            iconColor="text-yellow-600"
          />
          {data.quizPerformance && (
            <LocalStatCard
              icon={BarChart3}
              label="Avg Quiz Score"
              value={`${data.quizPerformance.averageScore ?? 0}%`}
              sub={`${data.quizPerformance.participantCount} participants`}
              iconBg="bg-indigo-50"
              iconColor="text-indigo-600"
            />
          )}
        </div>

        {/* Overall Progress Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            Overall Course Progress
          </h2>
          <div className="space-y-4">
            {[
              { label: 'Completed', value: data.completed, total: data.totalEnrolled, color: 'bg-emerald-500', textColor: 'text-emerald-700' },
              { label: 'In Progress', value: data.inProgress, total: data.totalEnrolled, color: 'bg-blue-500', textColor: 'text-blue-700' },
              { label: 'Not Started', value: data.notStarted, total: data.totalEnrolled, color: 'bg-gray-300', textColor: 'text-gray-600' },
            ].map((bar) => {
              const pct = data.totalEnrolled > 0 ? Math.round((bar.value / data.totalEnrolled) * 100) : 0;
              return (
                <div key={bar.label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className={`font-medium ${bar.textColor}`}>{bar.label}</span>
                    <span className="text-gray-500">
                      {bar.value} learner{bar.value !== 1 ? 's' : ''} &middot; {pct}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`${bar.color} h-3 rounded-full transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Completion Status Pie Chart */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              Completion Status
            </h2>
            {statusPieData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={95}
                      dataKey="value"
                      labelLine={false}
                      label={CustomPieLabel}
                    >
                      {statusPieData.map((_, i) => (
                        <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any) => [value ?? 0, name ?? '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  {statusPieData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                      <span className="text-sm text-gray-600">{item.name}</span>
                      <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                No enrollment data available
              </div>
            )}
          </div>

          {/* Learner Progress Distribution */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Learner Progress Distribution
            </h2>
            {data.totalEnrolled > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.progressDistribution} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: any) => [value, 'Learners']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {data.progressDistribution.map((_, i) => (
                      <Cell key={i} fill={DIST_COLORS[i % DIST_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                No progress data available
              </div>
            )}
          </div>
        </div>

        {/* Quiz Performance */}
        {data.quizPerformance && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              Quiz Performance
              <span className="text-xs text-gray-400 font-normal ml-1">
                ({data.quizPerformance.participantCount} participant{data.quizPerformance.participantCount !== 1 ? 's' : ''})
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Score metric cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Average Score', value: data.quizPerformance.averageScore, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
                  { label: 'Highest Score', value: data.quizPerformance.highestScore, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                  { label: 'Lowest Score', value: data.quizPerformance.lowestScore, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-100' },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl border p-4 text-center ${item.bg}`}>
                    <p className={`text-3xl font-bold ${item.color}`}>{item.value ?? 0}%</p>
                    <p className="text-xs text-gray-500 mt-1 font-medium">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Quiz bar chart */}
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={quizChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip
                    formatter={(value: any) => [`${value ?? 0}%`, 'Score']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {quizChartData.map((_, i) => (
                      <Cell key={i} fill={(['#6366f1', '#10b981', '#f43f5e'] as string[])[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* No quiz data notice */}
        {!data.quizPerformance && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-center gap-3 text-sm text-gray-500">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-gray-400" />
            No quiz attempts recorded for this course yet. Quiz performance will appear here once learners complete assessments.
          </div>
        )}
      </div>
    </>
  );
}

export default function CourseAnalyticsPage() {
  return <Suspense><CourseAnalyticsPageInner /></Suspense>;
}
