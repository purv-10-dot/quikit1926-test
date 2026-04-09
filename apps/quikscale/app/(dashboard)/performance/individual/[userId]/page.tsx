"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Target, CheckSquare, Users, Calendar } from "lucide-react";

function scoreColor(score: number | null) {
  if (score === null) return { text: "text-gray-400", bg: "bg-gray-100", label: "—" };
  if (score >= 80) return { text: "text-green-700", bg: "bg-green-100", label: `${score}%` };
  if (score >= 60) return { text: "text-amber-700", bg: "bg-amber-100", label: `${score}%` };
  return { text: "text-red-700", bg: "bg-red-100", label: `${score}%` };
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    "on-track": "bg-green-100 text-green-700",
    "complete": "bg-green-100 text-green-700",
    "at-risk": "bg-amber-100 text-amber-700",
    "critical": "bg-red-100 text-red-700",
    "completed": "bg-green-100 text-green-700",
    "not-started": "bg-gray-100 text-gray-500",
    "in-progress": "bg-blue-100 text-blue-700",
    "blocked": "bg-red-100 text-red-700",
  };
  return map[s] || "bg-gray-100 text-gray-500";
}

function Skeleton() {
  return (
    <div className="animate-pulse p-6 space-y-4">
      <div className="h-20 bg-gray-200 rounded-lg" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-lg" />)}</div>
      <div className="h-48 bg-gray-200 rounded-lg" />
    </div>
  );
}

function SparkDots({ weeklyValues }: { weeklyValues: { weekNumber: number; value: number | null }[] }) {
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const wv = weeklyValues.find(v => v.weekNumber === i + 1);
    return wv?.value ?? null;
  });
  return (
    <div className="flex items-center gap-0.5">
      {weeks.map((v, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${v !== null ? "bg-blue-500" : "bg-gray-200"}`}
          title={v !== null ? `W${i + 1}: ${v}` : `W${i + 1}: —`}
        />
      ))}
    </div>
  );
}

export default function UserPerformancePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/performance/individual/${userId}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) setData(j.data);
        else setError(j.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Skeleton />;
  if (error) return <div className="p-6 text-xs text-red-600">Error: {error}</div>;
  if (!data) return null;

  const u = data.user;
  const membership = u.memberships?.[0];
  const kpis: any[] = u.kpisOwned || [];
  const priorities: any[] = u.prioritiesOwned || [];
  const reviews: any[] = u.reviewsReceived || [];
  const meetings: any[] = data.meetings || [];

  const kpiScore = kpis.length > 0
    ? Math.round(kpis.reduce((s: number, k: any) => s + (k.progressPercent || 0), 0) / kpis.length)
    : null;
  const completedP = priorities.filter((p: any) => p.overallStatus === "completed").length;
  const priorityScore = priorities.length > 0 ? Math.round((completedP / priorities.length) * 100) : null;
  const userMeetingSlots = meetings.flatMap((m: any) => m.attendees);
  const attendedSlots = userMeetingSlots.filter((a: any) => a.attended).length;
  const attendanceScore = userMeetingSlots.length > 0 ? Math.round((attendedSlots / userMeetingSlots.length) * 100) : null;

  const scores = [kpiScore, priorityScore, attendanceScore].filter(s => s !== null) as number[];
  const weights = [0.5, 0.3, 0.2];
  const validWeights = [kpiScore, priorityScore, attendanceScore].map((s, i) => s !== null ? weights[i] : 0);
  const totalWeight = validWeights.reduce((a, b) => a + b, 0);
  const overallScore = totalWeight > 0
    ? Math.round(([kpiScore, priorityScore, attendanceScore] as (number | null)[]).reduce<number>((sum, s, i) => s !== null ? sum + s * validWeights[i] : sum, 0) / totalWeight)
    : null;

  const fullName = `${u.firstName} ${u.lastName}`;
  const initials = `${u.firstName?.[0] || ""}${u.lastName?.[0] || ""}`.toUpperCase();

  const scoreCards = [
    { label: "KPI Score", score: kpiScore, icon: Target, sub: `${kpis.length} KPIs` },
    { label: "Priority Score", score: priorityScore, icon: CheckSquare, sub: `${completedP}/${priorities.length} done` },
    { label: "Attendance", score: attendanceScore, icon: Calendar, sub: `${attendedSlots}/${userMeetingSlots.length} attended` },
    { label: "Overall Score", score: overallScore, icon: Users, sub: "Weighted" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={() => router.push("/performance/individual")}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />Back to Individual
        </button>
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center">{initials}</span>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">{fullName}</h1>
            <p className="text-xs text-gray-500">{u.email} · {membership?.role || "—"} {membership?.team?.name ? `· ${membership.team.name}` : ""}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
        {/* Score cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {scoreCards.map(sc => {
            const Icon = sc.icon;
            const c = scoreColor(sc.score);
            return (
              <div key={sc.label} className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center justify-between mb-1">
                  <Icon className="h-4 w-4 text-gray-400" />
                  <span className={`text-lg font-bold ${c.text}`}>{c.label}</span>
                </div>
                <p className="text-xs font-medium text-gray-700">{sc.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sc.sub}</p>
              </div>
            );
          })}
        </div>

        {/* KPI Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-blue-500" />
            <h2 className="text-xs font-semibold text-gray-700">KPIs ({kpis.length})</h2>
          </div>
          {kpis.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">No KPIs assigned</div>
          ) : (
            <table className="border-separate border-spacing-0 text-xs w-full">
              <thead>
                <tr className="bg-gray-50">
                  {["KPI Name", "Quarter", "Status", "Progress", "Weekly Trend"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-100">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kpis.map((k: any) => (
                  <tr key={k.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 font-medium text-gray-800">{k.name}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-500">{k.quarter} {k.year}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${statusBadge(k.healthStatus)}`}>{k.healthStatus}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-20">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, k.progressPercent || 0)}%` }}
                          />
                        </div>
                        <span className="text-gray-600 w-8 text-right">{Math.round(k.progressPercent || 0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 border-b border-gray-100">
                      <SparkDots weeklyValues={k.weeklyValues || []} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Priority Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5 text-purple-500" />
            <h2 className="text-xs font-semibold text-gray-700">Priorities ({priorities.length})</h2>
          </div>
          {priorities.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">No priorities assigned</div>
          ) : (
            <table className="border-separate border-spacing-0 text-xs w-full">
              <thead>
                <tr className="bg-gray-50">
                  {["Priority Name", "Quarter", "Status", "Weeks"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-100">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priorities.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 font-medium text-gray-800">{p.name}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-500">{p.quarter} {p.year}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${statusBadge(p.overallStatus)}`}>{p.overallStatus}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-gray-100">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 13 }, (_, i) => {
                          const ws = p.weeklyStatuses?.find((w: any) => w.weekNumber === i + 1);
                          const dotColor = ws ? (
                            ws.status === "completed" || ws.status === "done" ? "bg-green-500" :
                            ws.status === "in-progress" ? "bg-blue-500" :
                            ws.status === "blocked" ? "bg-red-500" : "bg-amber-400"
                          ) : "bg-gray-200";
                          return <span key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} title={`W${i + 1}`} />;
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Review history */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-700">Review History ({reviews.length})</h2>
          </div>
          {reviews.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">No reviews yet</div>
          ) : (
            <table className="border-separate border-spacing-0 text-xs w-full">
              <thead>
                <tr className="bg-gray-50">
                  {["Quarter", "Year", "Reviewer", "Overall Score", "Rating", "Status"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-100">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviews.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-700">{r.quarter}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-700">{r.year}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{r.reviewer?.firstName} {r.reviewer?.lastName}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100">
                      {r.overallScore != null ? (
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${scoreColor(r.overallScore).bg} ${scoreColor(r.overallScore).text}`}>{r.overallScore}%</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">
                      {r.rating ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating) : "—"}
                    </td>
                    <td className="px-3 py-2.5 border-b border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${r.status === "submitted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
