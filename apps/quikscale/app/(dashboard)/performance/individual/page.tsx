"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Users } from "lucide-react";

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

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return (
    <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center uppercase flex-shrink-0">
      {init}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse p-6 space-y-3">
      <div className="h-8 bg-gray-200 rounded w-1/3" />
      {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-200 rounded" />)}
    </div>
  );
}

export default function IndividualPerformancePage() {
  const router = useRouter();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/performance/individual")
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          const sorted = [...j.data].sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));
          setPeople(sorted);
        } else setError(j.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = people.filter(p => {
    const full = `${p.firstName} ${p.lastName}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  if (loading) return <Skeleton />;
  if (error) return <div className="p-6 text-xs text-red-600">Error: {error}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Individual Performance</h1>
          <p className="text-xs text-gray-500 mt-0.5">Per-person KPI, priority and attendance scores</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Users className="h-8 w-8 mb-2" />
            <p className="text-xs">No people found</p>
          </div>
        ) : (
          <table className="border-separate border-spacing-0 text-xs w-full">
            <thead className="sticky top-0 z-30 bg-gray-50">
              <tr>
                {["#", "Name", "Team", "Role", "KPI Score", "Priority Score", "Attendance", "Overall", "KPIs", "Priorities"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {filtered.map((p, idx) => (
                <tr
                  key={p.userId}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/performance/individual/${p.userId}`)}
                >
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-400 font-mono">{idx + 1}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <Initials name={`${p.firstName} ${p.lastName}`} />
                      <div>
                        <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                        <p className="text-gray-400 text-[11px]">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{p.teamName || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px]">{p.role}</span>
                  </td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100"><ScorePill score={p.kpiScore} /></td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100"><ScorePill score={p.priorityScore} /></td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100"><ScorePill score={p.attendanceScore} /></td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 font-semibold"><ScorePill score={p.overallScore} /></td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600 text-center">{p.kpiCount}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-gray-600 text-center">{p.priorityCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
