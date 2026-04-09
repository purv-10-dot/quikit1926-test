"use client";

import { useState, useEffect } from "react";
import { Users, Trophy } from "lucide-react";

function scoreColor(score: number | null) {
  if (score === null) return { text: "text-gray-400", bg: "bg-gray-100", label: "—" };
  if (score >= 80) return { text: "text-green-700", bg: "bg-green-100", label: `${score}%` };
  if (score >= 60) return { text: "text-amber-700", bg: "bg-amber-100", label: `${score}%` };
  return { text: "text-red-700", bg: "bg-red-100", label: `${score}%` };
}

function ScorePill({ score }: { score: number | null }) {
  const c = scoreColor(score);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[40px]">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <ScorePill score={score} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse p-6 space-y-3">
      <div className="h-8 bg-gray-200 rounded w-1/3" />
      {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded" />)}
    </div>
  );
}

export default function TeamsPerformancePage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/performance/teams")
      .then(r => r.json())
      .then(j => {
        if (j.success) setTeams(j.data);
        else setError(j.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <div className="p-6 text-xs text-red-600">Error: {error}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Team Leaderboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Ranked by overall performance score</p>
        </div>
        <span className="text-xs text-gray-500 flex items-center gap-1"><Users className="h-3.5 w-3.5" />{teams.length} teams</span>
      </div>

      <div className="flex-1 overflow-auto">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Users className="h-8 w-8 mb-2" />
            <p className="text-xs">No teams found</p>
          </div>
        ) : (
          <table className="border-separate border-spacing-0 text-xs w-full">
            <thead className="sticky top-0 z-30 bg-gray-50">
              <tr>
                {["Rank", "Team", "Members", "KPI Score", "Priority Score", "Attendance", "Overall Score"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {teams.map((t, idx) => {
                const isTop = idx === 0 && t.overallScore !== null;
                return (
                  <tr key={t.teamId} className={isTop ? "bg-amber-50" : "hover:bg-gray-50"}>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-center">
                      {isTop ? (
                        <Trophy className="h-4 w-4 text-amber-500 mx-auto" />
                      ) : (
                        <span className="text-gray-400 font-mono">{idx + 1}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center uppercase flex-shrink-0">
                          {t.teamName.slice(0, 2)}
                        </span>
                        <span className={`font-medium ${isTop ? "text-amber-800" : "text-gray-800"}`}>{t.teamName}</span>
                        {isTop && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Top</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600 text-center">{t.memberCount}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 min-w-[140px]"><ScoreBar score={t.kpiScore} /></td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 min-w-[140px]"><ScoreBar score={t.priorityScore} /></td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 min-w-[140px]"><ScoreBar score={t.attendanceScore} /></td>
                    <td className="px-3 py-2.5 border-b border-gray-100">
                      <ScorePill score={t.overallScore} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
