'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { BarChart3, TrendingUp, Users, ArrowRight } from 'lucide-react';

interface AnalyticsData {
  summary: {
    totalDemo: number;
    totalTrial: number;
    totalRegular: number;
    convertedBatches: number;
    conversionRate: number;
    completedDemoClasses: number;
    totalDemoClasses: number;
    demoAttendanceRate: number;
  };
  monthlyTrend: { _id: { year: number; month: number }; total: number; converted: number }[];
}

interface TeacherPerfItem {
  _id: string;
  teacherId: string;
  teacherName?: string;
  totalDemoTrial: number;
  converted: number;
  conversionRate: number;
}

export default function DemoAnalyticsPage() {
  const { branding } = useBranding();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [teacherPerf, setTeacherPerf] = useState<TeacherPerfItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    fetchTeacherPerformance();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const res = await api.get<any>('/demo-analytics');
      setData(res.data || null);
    } catch (err) {
      console.error('Failed to fetch demo analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeacherPerformance = async () => {
    try {
      const res = await api.get<any>('/demo-analytics/teacher-performance');
      setTeacherPerf(res.data || []);
    } catch (err) {
      console.error('Failed to fetch teacher performance:', err);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;
  if (!data) return <div className="p-6 text-center text-gray-500">No data available</div>;

  const { summary } = data;
  const monthlyTrend = data.monthlyTrend ?? [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mb-6"
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
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Demo & Trial Analytics</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Track demo/trial class performance and conversion rates</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
          <p className="text-sm text-blue-600 mb-1">Demo Batches</p>
          <p className="text-3xl font-bold text-blue-800">{summary.totalDemo}</p>
        </div>
        <div className="p-5 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
          <p className="text-sm text-purple-600 mb-1">Trial Batches</p>
          <p className="text-3xl font-bold text-purple-800">{summary.totalTrial}</p>
        </div>
        <div className="p-5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
          <p className="text-sm text-green-600 mb-1">Conversion Rate</p>
          <p className="text-3xl font-bold text-green-800">{summary.conversionRate}%</p>
        </div>
        <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl">
          <p className="text-sm text-amber-600 mb-1">Demo Attendance</p>
          <p className="text-3xl font-bold text-amber-800">{summary.demoAttendanceRate}%</p>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white border rounded-xl p-6 mb-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" /> Conversion Funnel
        </h2>
        <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
          <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-xl flex-1 min-w-[120px]">
            <p className="text-3xl font-bold text-blue-700">{summary.totalDemo + summary.totalTrial}</p>
            <p className="text-sm text-blue-600">Demo/Trial</p>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-400 hidden sm:block" />
          <div className="text-center p-3 sm:p-4 bg-amber-50 rounded-xl flex-1 min-w-[120px]">
            <p className="text-3xl font-bold text-amber-700">{summary.completedDemoClasses}</p>
            <p className="text-sm text-amber-600">Classes Completed</p>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-400 hidden sm:block" />
          <div className="text-center p-3 sm:p-4 bg-green-50 rounded-xl flex-1 min-w-[120px]">
            <p className="text-3xl font-bold text-green-700">{summary.convertedBatches}</p>
            <p className="text-sm text-green-600">Converted to Regular</p>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-400 hidden sm:block" />
          <div className="text-center p-3 sm:p-4 bg-indigo-50 rounded-xl flex-1 min-w-[120px]">
            <p className="text-3xl font-bold text-indigo-700">{summary.totalRegular}</p>
            <p className="text-sm text-indigo-600">Total Regular</p>
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="font-bold text-lg mb-4">Monthly Trend (Last 6 Months)</h2>
        {monthlyTrend.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No trend data available yet</p>
        ) : (
          <div className="space-y-3">
            {monthlyTrend.map((m, i) => {
              const maxTotal = Math.max(...monthlyTrend.map(t => t.total), 1);
              return (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm text-gray-500 w-20">
                    {monthNames[(m._id.month - 1) % 12]} {m._id.year}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${(m.total / maxTotal) * 100}%` }}
                      />
                      <div
                        className="h-full bg-green-500 rounded-full absolute top-0 left-0"
                        style={{ width: `${(m.converted / maxTotal) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-24">
                      {m.total} total, {m.converted} conv.
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" /> Demo/Trial</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded" /> Converted</span>
        </div>
      </div>

      {/* Teacher Conversion Performance */}
      <div className="bg-white border rounded-xl p-6 mt-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" /> Teacher Conversion Performance
        </h2>
        {teacherPerf.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No teacher performance data available yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Teacher Name</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Demo/Trial Batches</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Converted</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Conversion Rate %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {teacherPerf.map(t => (
                  <tr key={t._id || t.teacherId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {t.teacherName || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{t.totalDemoTrial}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{t.converted}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-medium text-green-700">{t.conversionRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
