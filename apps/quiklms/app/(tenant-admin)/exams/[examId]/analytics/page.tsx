'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import { ArrowLeft, BarChart3, Download, Users, Award, TrendingUp, Target } from 'lucide-react';

interface AnalyticsData {
  totalSubmissions: number;
  avgScore: number;
  highestScore: number;
  lowestScore: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  distribution: Record<string, number>;
  questionAccuracy: { questionId: string; text: string; attempted: number; correct: number; incorrect: number; total: number; correctPct: number; incorrectPct: number }[];
}

export default function ExamAnalyticsPage() {
  const params = useParams();
  const examId = params.examId as string;
  const router = useRouter();
  const { branding } = useBranding();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [examTitle, setExamTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [analyticsRes, examRes] = await Promise.all([
          api.get<any>(`/exam-sessions/exam/${examId}/analytics`),
          api.get<any>(`/exams/${examId}`),
        ]);
        setAnalytics(analyticsRes.data);
        setExamTitle(examRes.data?.title || 'Exam');
      } catch (e: any) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [examId]);

  const maxDistVal = useMemo(() => {
    if (!analytics?.distribution) return 1;
    return Math.max(1, ...Object.values(analytics.distribution));
  }, [analytics]);

  const handleExportCSV = async () => {
    if (!analytics) return;
    const header = 'Metric,Value\n';
    const rows = [
      `Total Submissions,${analytics.totalSubmissions}`,
      `Average Score,${analytics.avgScore}%`,
      `Highest Score,${analytics.highestScore}%`,
      `Lowest Score,${analytics.lowestScore}%`,
      `Pass Rate,${analytics.passRate}%`,
      `Passed,${analytics.passedCount}`,
      `Failed,${analytics.failedCount}`,
    ].join('\n');
    const distRows = Object.entries(analytics.distribution).map(([k, v]) => `Score Range ${k},${v}`).join('\n');
    const csv = header + rows + '\n' + distRows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${examTitle.replace(/\s+/g, '_')}_analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading analytics...</div>;
  if (!analytics || analytics.totalSubmissions === 0) {
    return (
      <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 p-6">
        <button onClick={() => router.push('/exams')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Exams
        </button>
        <div className="text-center py-16 bg-gray-50 rounded-xl max-w-5xl mx-auto">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No submissions yet. Analytics will appear after students submit the exam.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => router.push('/exams')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 pt-4">
        <ArrowLeft className="w-4 h-4" /> Back to Exams
      </button>

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
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">{examTitle} — Analytics</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">{analytics.totalSubmissions} submissions analyzed</p>
            </div>
          </div>
          <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 rounded-xl text-white text-sm font-medium transition-all">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-8">
        <div className="bg-white border rounded-xl p-4">
          <Users className="w-5 h-5 text-indigo-500 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{analytics.totalSubmissions}</p>
          <p className="text-xs text-gray-500">Submissions</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <TrendingUp className="w-5 h-5 text-blue-500 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{analytics.avgScore}%</p>
          <p className="text-xs text-gray-500">Average</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <Award className="w-5 h-5 text-green-500 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{analytics.highestScore}%</p>
          <p className="text-xs text-gray-500">Highest</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <Target className="w-5 h-5 text-red-500 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{analytics.lowestScore}%</p>
          <p className="text-xs text-gray-500">Lowest</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="w-5 h-5 bg-green-500 rounded-full mb-2" />
          <p className="text-2xl font-bold text-green-600">{analytics.passedCount}</p>
          <p className="text-xs text-gray-500">Passed</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="w-5 h-5 bg-red-500 rounded-full mb-2" />
          <p className="text-2xl font-bold text-red-600">{analytics.failedCount}</p>
          <p className="text-xs text-gray-500">Failed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        {/* Score Distribution */}
        <div className="bg-white border rounded-xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Score Distribution</h3>
          <div className="space-y-3">
            {Object.entries(analytics.distribution).map(([range, count]) => (
              <div key={range} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-16 text-right">{range}%</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max(5, (count / maxDistVal) * 100)}%` }}
                  >
                    <span className="text-xs text-white font-medium">{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pass/Fail Ratio */}
        <div className="bg-white border rounded-xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Pass / Fail Ratio</h3>
          <div className="flex items-center gap-8">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                <circle
                  cx="50" cy="50" r="40" fill="none" stroke="#22c55e" strokeWidth="12"
                  strokeDasharray={`${analytics.passRate * 2.51} 251`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{analytics.passRate}%</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <span className="text-sm text-gray-600">Passed: {analytics.passedCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-300 rounded-full" />
                <span className="text-sm text-gray-600">Failed: {analytics.failedCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question-wise Analysis */}
      {analytics.questionAccuracy.length > 0 && (
        <div className="bg-white border rounded-xl p-6 mt-6">
          <h3 className="font-semibold text-gray-800 mb-1">Question-wise Attempt Rate</h3>
          <p className="text-xs text-gray-500 mb-4">Showing attempts and correctness for each question across all submissions</p>
          <div className="space-y-4">
            {analytics.questionAccuracy.map((qa, i) => (
              <div key={qa.questionId}>
                <div className="flex items-start gap-3 mb-1">
                  <span className="text-xs font-semibold text-gray-500 w-6 pt-0.5 flex-shrink-0">Q{i + 1}</span>
                  <p className="text-sm text-gray-700 flex-1 min-w-0">{qa.text || `Question ${i + 1}`}</p>
                  <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                    <span className="text-gray-500">{qa.attempted}/{qa.total} attempted</span>
                    {qa.attempted > 0 && (
                      <>
                        <span className="text-green-600 font-medium">{qa.correct} correct</span>
                        <span className="text-red-500">{qa.incorrect} wrong</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Stacked bar: correct (green) + incorrect (red) + not attempted (gray) */}
                <div className="ml-9 h-3 bg-gray-100 rounded-full overflow-hidden flex">
                  {qa.total > 0 && (
                    <>
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${(qa.correct / qa.total) * 100}%` }}
                        title={`${qa.correct} correct`}
                      />
                      <div
                        className="h-full bg-red-400 transition-all"
                        style={{ width: `${(qa.incorrect / qa.total) * 100}%` }}
                        title={`${qa.incorrect} incorrect`}
                      />
                    </>
                  )}
                </div>
                {qa.attempted > 0 && (
                  <div className="ml-9 flex gap-4 mt-1">
                    <span className="text-xs text-green-600">{qa.correctPct}% correct</span>
                    <span className="text-xs text-red-500">{qa.incorrectPct}% incorrect</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-xs text-gray-600">Correct</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><span className="text-xs text-gray-600">Incorrect</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-gray-200" /><span className="text-xs text-gray-600">Not Attempted</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
