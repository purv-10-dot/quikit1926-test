'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  Award,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  BookOpen,
  Clock,
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { Card, CardContent } from '@/components/ui';
import { Skeleton } from '@/components/ui';
import { DashboardScaffold } from '@/components/DashboardScaffold';

interface CorporateAnalytics {
  totalLearners: number;
  activeLearners: number;
  completionRate: number;
  complianceRate: number;
  certificatesIssued: number;
  overdueAssignments: number;
  totalCourses: number;
  avgCompletionTime: number;
  activeCoursesCount: number;
  topCourses: { name: string; completions: number; enrolled: number }[];
}

const defaultAnalytics: CorporateAnalytics = {
  totalLearners: 0,
  activeLearners: 0,
  completionRate: 0,
  complianceRate: 0,
  certificatesIssued: 0,
  overdueAssignments: 0,
  totalCourses: 0,
  avgCompletionTime: 0,
  activeCoursesCount: 0,
  topCourses: [],
};

// SVG Circular Progress Ring
const CircularProgress = ({
  percentage,
  size = 80,
  strokeWidth = 8,
  color = '#3b82f6',
  bgColor = '#e5e7eb',
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
};

// Skeleton loader components
const SkeletonCard = () => (
  <div className="bg-surface rounded-xl shadow-lg border border-line p-6 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="space-y-3 flex-1">
        <div className="h-4 bg-surface-muted rounded w-24" />
        <div className="h-8 bg-surface-muted rounded w-16" />
      </div>
      <div className="w-14 h-14 bg-surface-muted rounded-xl" />
    </div>
    <div className="mt-4 h-3 bg-surface-muted rounded w-20" />
  </div>
);

const SkeletonSection = () => (
  <div className="bg-surface rounded-xl shadow-lg border border-line p-6 animate-pulse">
    <div className="h-5 bg-surface-muted rounded w-40 mb-4" />
    <div className="h-6 bg-surface-muted rounded w-full mb-3" />
    <div className="h-4 bg-surface-muted rounded w-3/4" />
  </div>
);

const CorporateAnalyticsPage = () => {
  const { branding } = useBranding();
  const [analytics, setAnalytics] = useState<CorporateAnalytics>(defaultAnalytics);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await api.get<any>('/analytics/corporate');
      // Route returns the overview object directly, but tolerate a { success, data }
      // envelope too. Pull whatever fields the API provides; fall back per-field so
      // missing keys render as 0 / [] rather than NaN or crashes.
      const payload =
        response && typeof response === 'object' && 'data' in response && !('totalLearners' in response)
          ? response.data
          : response;
      const src = (payload ?? {}) as Partial<CorporateAnalytics>;
      setAnalytics({
        totalLearners: src.totalLearners ?? 0,
        activeLearners: src.activeLearners ?? 0,
        completionRate: src.completionRate ?? 0,
        complianceRate: src.complianceRate ?? 0,
        certificatesIssued: src.certificatesIssued ?? 0,
        overdueAssignments: src.overdueAssignments ?? 0,
        totalCourses: src.totalCourses ?? 0,
        avgCompletionTime: src.avgCompletionTime ?? 0,
        activeCoursesCount: src.activeCoursesCount ?? 0,
        topCourses: src.topCourses ?? [],
      });
    } catch (error) {
      console.error('Failed to fetch corporate analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Toaster position="top-right" />
        {/* Header skeleton */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 animate-pulse">
          <div className="h-8 bg-white/20 rounded w-64 mb-2" />
          <div className="h-4 bg-white/20 rounded w-96" />
        </div>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        {/* Sections skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonSection />
          <SkeletonSection />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Learners',
      value: analytics.totalLearners,
      icon: Users,
      color: 'indigo',
      bgFrom: 'from-indigo-50',
      bgTo: 'to-blue-50',
      borderColor: 'border-indigo-200',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      subtitle: 'Enrolled users',
    },
    {
      label: 'Active Learners',
      value: analytics.activeLearners,
      icon: UserCheck,
      color: 'green',
      bgFrom: 'from-green-50',
      bgTo: 'to-emerald-50',
      borderColor: 'border-green-200',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      subtitle: 'Currently active',
    },
    {
      label: 'Completion Rate',
      value: `${analytics.completionRate}%`,
      icon: TrendingUp,
      color: 'blue',
      bgFrom: 'from-blue-50',
      bgTo: 'to-cyan-50',
      borderColor: 'border-blue-200',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      subtitle: 'Course completions',
      isPercentage: true,
      percentValue: analytics.completionRate,
      ringColor: '#3b82f6',
    },
    {
      label: 'Compliance Rate',
      value: `${analytics.complianceRate}%`,
      icon: TrendingUp,
      color: 'emerald',
      bgFrom: 'from-emerald-50',
      bgTo: 'to-teal-50',
      borderColor: 'border-emerald-200',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      subtitle: 'Mandatory training',
      isPercentage: true,
      percentValue: analytics.complianceRate,
      ringColor: '#10b981',
    },
    {
      label: 'Certificates Issued',
      value: analytics.certificatesIssued,
      icon: Award,
      color: 'purple',
      bgFrom: 'from-purple-50',
      bgTo: 'to-pink-50',
      borderColor: 'border-purple-200',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      subtitle: 'Total awarded',
    },
    {
      label: 'Overdue Assignments',
      value: analytics.overdueAssignments,
      icon: AlertTriangle,
      color: 'red',
      bgFrom: 'from-red-50',
      bgTo: 'to-amber-50',
      borderColor: 'border-red-200',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      subtitle: 'Need attention',
    },
  ];

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Premium Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8"
        style={{
          background: `linear-gradient(135deg, ${branding.primaryColor || '#4f46e5'}, ${branding.secondaryColor || '#ec4899'})`,
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
            <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
              Analytics Dashboard
            </h1>
            <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
              Corporate learning performance overview
            </p>
          </div>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`bg-gradient-to-br ${card.bgFrom} ${card.bgTo} border ${card.borderColor} rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">{card.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                </div>
                {card.isPercentage ? (
                  <div className="relative">
                    <CircularProgress
                      percentage={card.percentValue || 0}
                      size={56}
                      strokeWidth={6}
                      color={card.ringColor || '#3b82f6'}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                      {card.percentValue}%
                    </span>
                  </div>
                ) : (
                  <div className={`p-3.5 ${card.iconBg} rounded-xl`}>
                    <Icon className={`w-6 h-6 ${card.iconColor}`} />
                  </div>
                )}
              </div>
              <div className={`mt-3 flex items-center ${card.iconColor} text-sm`}>
                <Icon className="w-3.5 h-3.5 mr-1" />
                <span>{card.subtitle}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        {/* Completion Overview */}
        <div className="bg-surface rounded-xl shadow-lg border border-line p-6 hover:shadow-xl transition-all">
          <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Completion Overview
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-fg-muted">Course Completion Rate</span>
                <span className="text-sm font-bold text-blue-600">{analytics.completionRate}%</span>
              </div>
              <div className="w-full bg-surface-muted rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${analytics.completionRate}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-xl font-bold text-blue-600">{analytics.totalCourses}</p>
                <p className="text-xs text-fg-muted">Total Courses</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-xl font-bold text-green-600">{analytics.activeCoursesCount}</p>
                <p className="text-xs text-fg-muted">Active</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-xl font-bold text-purple-600">{analytics.certificatesIssued}</p>
                <p className="text-xs text-fg-muted">Certified</p>
              </div>
            </div>
          </div>
        </div>

        {/* Compliance Status */}
        <div className="bg-surface rounded-xl shadow-lg border border-line p-6 hover:shadow-xl transition-all">
          <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-600" />
            Compliance Status
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-fg-muted">Compliance Rate</span>
                <span className="text-sm font-bold text-emerald-600">
                  {analytics.complianceRate}%
                </span>
              </div>
              <div className="w-full bg-surface-muted rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${analytics.complianceRate}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <div className="flex-1 p-3 bg-emerald-50 rounded-lg text-center">
                <p className="text-xl font-bold text-emerald-600">
                  {Math.round((analytics.totalLearners * analytics.complianceRate) / 100)}
                </p>
                <p className="text-xs text-fg-muted">Compliant</p>
              </div>
              <div className="flex-1 p-3 bg-red-50 rounded-lg text-center">
                <p className="text-xl font-bold text-red-600">
                  {analytics.totalLearners -
                    Math.round((analytics.totalLearners * analytics.complianceRate) / 100)}
                </p>
                <p className="text-xs text-fg-muted">Non-Compliant</p>
              </div>
              <div className="flex-1 p-3 bg-amber-50 rounded-lg text-center">
                <p className="text-xl font-bold text-amber-600">{analytics.overdueAssignments}</p>
                <p className="text-xs text-fg-muted">Overdue</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-surface rounded-xl shadow-lg border border-line p-6">
        <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          Quick Stats
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-medium text-fg-muted">Total Courses</span>
            </div>
            <p className="text-2xl font-bold text-fg">{analytics.totalCourses}</p>
          </div>
          <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-fg-muted">Active Rate</span>
            </div>
            <p className="text-2xl font-bold text-fg">
              {analytics.totalLearners > 0
                ? Math.round((analytics.activeLearners / analytics.totalLearners) * 100)
                : 0}
              %
            </p>
          </div>
          <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-medium text-fg-muted">Avg. Completion</span>
            </div>
            <p className="text-2xl font-bold text-fg">
              {analytics.avgCompletionTime}
              <span className="text-sm font-normal text-fg-subtle ml-1">days</span>
            </p>
          </div>
          <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-medium text-fg-muted">Overdue</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{analytics.overdueAssignments}</p>
          </div>
        </div>
      </div>

      {/* Top Courses - Simple Bar Chart */}
      {analytics.topCourses && analytics.topCourses.length > 0 && (
        <div className="bg-surface rounded-xl shadow-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            Top Courses by Completion
          </h3>
          <div className="space-y-3">
            {analytics.topCourses.map((course, idx) => {
              const completionPct =
                course.enrolled > 0
                  ? Math.round((course.completions / course.enrolled) * 100)
                  : 0;
              return (
                <div key={idx} className="flex items-center gap-4">
                  <span className="text-sm text-fg-muted w-48 truncate">{course.name}</span>
                  <div className="flex-1 bg-surface-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-700"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-fg w-16 text-right">
                    {completionPct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CorporateAnalyticsPage;
