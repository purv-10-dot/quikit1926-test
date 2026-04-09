"use client";

import { useState, useEffect } from "react";
import { BarChart2, TrendingUp, CheckSquare, Users, AlertTriangle, Activity } from "lucide-react";

function scoreColor(score: number | null) {
  if (score === null) return { text: "text-gray-400", bg: "bg-gray-100", label: "—" };
  if (score >= 80) return { text: "text-green-700", bg: "bg-green-100", label: `${score}%` };
  if (score >= 60) return { text: "text-amber-700", bg: "bg-amber-100", label: `${score}%` };
  return { text: "text-red-700", bg: "bg-red-100", label: `${score}%` };
}

function ScoreBadge({ score }: { score: number | null }) {
  const c = scoreColor(score);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="grid grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-lg" />)}
      </div>
      <div className="h-8 bg-gray-200 rounded w-1/2" />
      <div className="h-48 bg-gray-200 rounded-lg" />
    </div>
  );
}

export default function ScorecardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/performance/scorecard")
      .then(r => r.json())
      .then(j => {
        if (j.success) setData(j.data);
        else setError(j.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <div className="p-6 text-xs text-red-600">Error: {error}</div>;
  if (!data) return null;

  const kpiTotal = data.kpi.total || 1;
  const onTrackPct = Math.round((data.kpi.onTrack / kpiTotal) * 100);
  const atRiskPct = Math.round((data.kpi.atRisk / kpiTotal) * 100);
  const criticalPct = Math.round((data.kpi.critical / kpiTotal) * 100);

  const cards = [
    {
      label: "Org Score",
      value: data.orgScore,
      icon: BarChart2,
      border: data.orgScore >= 80 ? "border-green-400" : data.orgScore >= 60 ? "border-amber-400" : "border-red-400",
      sub: "Overall health",
    },
    {
      label: "KPI Attainment",
      value: data.kpi.attainment,
      icon: TrendingUp,
      border: "border-blue-400",
      sub: `${data.kpi.onTrack} of ${data.kpi.total} on track`,
    },
    {
      label: "Priority Rate",
      value: data.priority.rate,
      icon: CheckSquare,
      border: "border-purple-400",
      sub: `${data.priority.completed} of ${data.priority.total} completed`,
    },
    {
      label: "Attendance",
      value: data.meetings.attendanceRate,
      icon: Users,
      border: "border-teal-400",
      sub: `${data.meetings.total} meetings`,
    },
    {
      label: "Open Issues",
      value: null,
      icon: AlertTriangle,
      border: data.www.overdue > 0 ? "border-red-400" : "border-gray-300",
      sub: `${data.www.overdue} overdue`,
      rawValue: data.www.open,
      rawSuffix: " open",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Company Scorecard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Organisation-wide performance health</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{data.members} members</span>
          <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" />{data.teams} teams</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map(card => {
            const Icon = card.icon;
            const c = scoreColor(card.value);
            return (
              <div key={card.label} className={`bg-white rounded-lg border-l-4 ${card.border} shadow-sm p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <Icon className="h-4 w-4 text-gray-400" />
                  {card.value !== null ? (
                    <span className={`text-lg font-bold ${c.text}`}>{card.value}%</span>
                  ) : (
                    <span className="text-lg font-bold text-gray-700">{card.rawValue}{card.rawSuffix}</span>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-700">{card.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
            );
          })}
        </div>

        {/* KPI Health bar */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-700 mb-3">KPI Health Breakdown</h2>
          <div className="flex h-5 rounded overflow-hidden gap-px">
            {data.kpi.onTrack > 0 && (
              <div
                className="bg-green-500 flex items-center justify-center text-white text-[10px] font-medium transition-all"
                style={{ width: `${onTrackPct}%` }}
                title={`On Track: ${data.kpi.onTrack}`}
              >
                {onTrackPct > 10 ? `${onTrackPct}%` : ""}
              </div>
            )}
            {data.kpi.atRisk > 0 && (
              <div
                className="bg-amber-400 flex items-center justify-center text-white text-[10px] font-medium transition-all"
                style={{ width: `${atRiskPct}%` }}
                title={`At Risk: ${data.kpi.atRisk}`}
              >
                {atRiskPct > 10 ? `${atRiskPct}%` : ""}
              </div>
            )}
            {data.kpi.critical > 0 && (
              <div
                className="bg-red-500 flex items-center justify-center text-white text-[10px] font-medium transition-all"
                style={{ width: `${criticalPct}%` }}
                title={`Critical: ${data.kpi.critical}`}
              >
                {criticalPct > 10 ? `${criticalPct}%` : ""}
              </div>
            )}
            {data.kpi.total === 0 && (
              <div className="flex-1 bg-gray-200 flex items-center justify-center text-xs text-gray-400">No KPIs</div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />On Track ({data.kpi.onTrack})</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />At Risk ({data.kpi.atRisk})</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Critical ({data.kpi.critical})</span>
          </div>
        </div>

        {/* Summary grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Priority summary */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5 text-purple-500" />Priority Summary
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Total Priorities</span>
                <span className="font-medium text-gray-800">{data.priority.total}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Completed</span>
                <span className="font-medium text-green-700">{data.priority.completed}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Completion Rate</span>
                <ScoreBadge score={data.priority.rate} />
              </div>
            </div>
          </div>

          {/* WWW summary */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />WWW Action Items
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Total Items</span>
                <span className="font-medium text-gray-800">{data.www.total}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Open / In Progress</span>
                <span className="font-medium text-amber-700">{data.www.open}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Overdue</span>
                <span className={`font-medium ${data.www.overdue > 0 ? "text-red-700" : "text-gray-500"}`}>{data.www.overdue}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
