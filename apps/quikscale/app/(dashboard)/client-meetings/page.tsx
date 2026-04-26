"use client";

/**
 * Meeting Rhythm Dashboard — per-client monthly performance.
 *
 * Port of meetingrythm.md §6. Renders 6-month rolling performance with
 * color-coded cells (spec §10 palette), a "Total Calls Assessed" chip, and
 * a Member Punch-In tab in Weekly mode.
 */
import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@quikit/ui";
import type { PerformanceColor } from "@/lib/services/clientMeetingsMath";

interface ClientOpt { id: string; name: string }
interface MonthInfo { year: number; month: number; monthName: string }
interface MonthlyStat {
  monthName: string; year: number; monthNumber: number;
  totalCalls: number; heldCalls: number;
  avgHeld: number; avgPunctual: number; avgDurationFollowed: number;
  avgFormat: number; avgAttendance: number; avgStuckCalls: number;
  avgAuality: number; avgKP: number; avgWWW: number; avgEF: number; avgCI: number;
  Total: number; isUpdate: boolean;
}
interface Overall {
  TotalavgHeld: number; TotalavgPunctual: number; TotalavgDurationFollowed: number;
  TotalavgFormat: number; TotalavgAttendance: number; TotalavgStuckCalls: number;
  TotalavgAuality: number; TotalavgKP: number; TotalavgWWW: number;
  TotalavgEF: number; TotalavgCI: number; TotalTotal: number;
}
interface DashboardPayload {
  client: { id: string; name: string };
  mode: "daily" | "weekly";
  months: MonthInfo[];
  monthlyStats: MonthlyStat[];
  overallStats: Overall;
  totalCallsAssessed: number;
  roster: Array<{ userId: string; name: string }>;
  punchIn: null | {
    memberId: string; memberName: string;
    weeks: Array<{ meetingDate: string; kpiWeeklyQTD: number | "AB" | "NA"; kpiCoding: number | "AB" | "NA"; priorityNotes: number | "AB" | "NA"; priorityStartEndDate: number | "AB" | "NA"; priorityColor: number | "AB" | "NA" }>;
    totals: { kpiWeeklyQTD: number; kpiCoding: number; priorityNotes: number; priorityStartEndDate: number; priorityColor: number };
    WeeklyTotalAverage: number;
  };
  punchInOverallAverage: number | null;
}

const DAILY_METRICS = [
  { key: "avgHeld",             label: "Meeting Held",       totalKey: "TotalavgHeld" },
  { key: "avgPunctual",         label: "Punctuality",        totalKey: "TotalavgPunctual" },
  { key: "avgDurationFollowed", label: "Duration Followed",  totalKey: "TotalavgDurationFollowed" },
  { key: "avgFormat",           label: "Format Followed",    totalKey: "TotalavgFormat" },
  { key: "avgAttendance",       label: "Attendance",         totalKey: "TotalavgAttendance" },
  { key: "avgStuckCalls",       label: "Stuck Issue Called", totalKey: "TotalavgStuckCalls" },
] as const;

const WEEKLY_METRICS = [
  { key: "avgHeld",             label: "Meeting Held",         totalKey: "TotalavgHeld" },
  { key: "avgPunctual",         label: "Punctuality",          totalKey: "TotalavgPunctual" },
  { key: "avgDurationFollowed", label: "Duration Followed",    totalKey: "TotalavgDurationFollowed" },
  { key: "avgAuality",          label: "Dashboard Quality",    totalKey: "TotalavgAuality" },
  { key: "avgKP",               label: "K&P Gaps Discussed",   totalKey: "TotalavgKP" },
  { key: "avgWWW",              label: "WWW Review",           totalKey: "TotalavgWWW" },
  { key: "avgEF",               label: "Employee Feedback",    totalKey: "TotalavgEF" },
  { key: "avgCI",               label: "Collective Intel",     totalKey: "TotalavgCI" },
  { key: "avgAttendance",       label: "Attendance",           totalKey: "TotalavgAttendance" },
] as const;

function cellClass(pct: number, isUpdate: boolean): string {
  const color: PerformanceColor = !isUpdate ? "gray" : pct >= 98 ? "blue" : pct >= 90 ? "green" : pct >= 80 ? "yellow" : "red";
  switch (color) {
    case "blue":   return "bg-blue-500 text-white";
    case "green":  return "bg-green-500 text-white";
    case "yellow": return "bg-yellow-400 text-black";
    case "red":    return "bg-red-600 text-white";
    case "gray":   return "bg-gray-300 text-white";
  }
}

export default function ClientMeetingsDashboardPage() {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"performance" | "punch">("performance");
  const [punchUserId, setPunchUserId] = useState<string>("");

  useEffect(() => {
    fetch("/api/client-meetings/clients").then(r => r.json()).then(j => {
      if (j.success) {
        setClients(j.data);
        if (j.data.length && !clientId) setClientId(j.data[0].id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (!clientId) { setData(null); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ clientId, mode });
      if (mode === "weekly" && punchUserId) qs.set("punchInUserId", punchUserId);
      const res = await fetch(`/api/client-meetings/dashboard?${qs.toString()}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally { setLoading(false); }
  }, [clientId, mode, punchUserId]);

  useEffect(() => { refresh(); }, [refresh]);

  const metrics = mode === "daily" ? DAILY_METRICS : WEEKLY_METRICS;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-gray-800">Meeting Rhythm Dashboard</h1>
            {data && (
              <span className="text-xs bg-accent-50 text-accent-700 px-2 py-0.5 rounded-full font-medium">
                Total Calls Assessed: {data.totalCallsAssessed}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => { setMode("daily"); setTab("performance"); }}
                className={`px-3 py-1.5 font-medium ${mode === "daily" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                Daily
              </button>
              <button
                onClick={() => setMode("weekly")}
                className={`px-3 py-1.5 font-medium border-l border-gray-200 ${mode === "weekly" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                Weekly
              </button>
            </div>
            {/* Client picker */}
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400">
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              disabled={!clientId}
              onClick={async () => {
                const res = await fetch(`/api/client-meetings/export/${mode}`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ clientId }),
                });
                if (!res.ok) { alert("Export failed"); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `${data?.client.name ?? "client"}_${mode}.xlsx`;
                document.body.appendChild(a); a.click(); a.remove();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 text-xs bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-lg disabled:opacity-40"
            >
              Export {mode === "daily" ? "Daily" : "Weekly"}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-blue-500" /> ≥98% Excellent</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-green-500" /> 90–97% Good</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-yellow-400" /> 80–89% Fair</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-red-600" /> &lt;80% Poor</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-gray-300" /> No Data</span>
        </div>

        {/* Tabs (weekly only) */}
        {mode === "weekly" && (
          <div className="flex gap-0 mt-3 border-b border-gray-200">
            <button onClick={() => setTab("performance")}
              className={`relative px-4 py-2 text-xs font-medium ${tab === "performance" ? "text-gray-900" : "text-gray-400 hover:text-gray-600"}`}>
              Performance
              {tab === "performance" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />}
            </button>
            <button onClick={() => setTab("punch")}
              className={`relative px-4 py-2 text-xs font-medium ${tab === "punch" ? "text-gray-900" : "text-gray-400 hover:text-gray-600"}`}>
              Member Punch-In
              {tab === "punch" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0 p-6">
        {loading ? (
          <div className="text-xs text-gray-400">Loading…</div>
        ) : !data ? (
          <EmptyState
            icon={LayoutDashboard}
            title={clients.length === 0 ? "Create a client first" : "Pick a client"}
            message="Dashboard shows per-client performance over the last 6 months once a client is selected and meetings have been logged."
          />
        ) : tab === "performance" ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">#</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">Metric</th>
                  {data.months.map(m => (
                    <th key={`${m.year}-${m.month}`} className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">
                      {m.monthName.slice(0, 3)} {String(m.year).slice(-2)}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">Total Avg</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => (
                  <tr key={m.key} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-700 font-medium">{m.label}</td>
                    {data.monthlyStats.map(s => {
                      const val = s[m.key as keyof MonthlyStat] as number;
                      return (
                        <td key={`${s.year}-${s.monthNumber}`} className={`text-center px-3 py-2 font-semibold ${cellClass(val, s.isUpdate)}`}>
                          {val}%
                        </td>
                      );
                    })}
                    <td className={`text-center px-3 py-2 font-bold ${cellClass(data.overallStats[m.totalKey as keyof Overall], true)}`}>
                      {data.overallStats[m.totalKey as keyof Overall]}%
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">—</td>
                  <td className="px-3 py-2 text-gray-700 font-semibold">Total</td>
                  {data.monthlyStats.map(s => (
                    <td key={`t-${s.year}-${s.monthNumber}`} className={`text-center px-3 py-2 font-bold ${cellClass(s.Total, s.isUpdate)}`}>
                      {s.Total}%
                    </td>
                  ))}
                  <td className={`text-center px-3 py-2 font-bold ${cellClass(data.overallStats.TotalTotal, true)}`}>
                    {data.overallStats.TotalTotal}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          /* Member Punch-In */
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Member:</label>
              <select value={punchUserId} onChange={e => setPunchUserId(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400">
                <option value="">Select member…</option>
                {data.roster.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
              {data.punchIn && (
                <span className="text-xs bg-accent-50 text-accent-700 px-2 py-0.5 rounded-full font-medium ml-auto">
                  Total Weekly Average: {data.punchIn.WeeklyTotalAverage}%
                </span>
              )}
            </div>

            {!data.punchIn ? (
              <EmptyState icon={LayoutDashboard} title="Pick a member" message="Select a client roster member to view their weekly punch-in history." />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">Meeting Date</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">KPI QTD</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">KPI Coding</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">Priority Notes</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">Priority Dates</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">Priority Color</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.punchIn.weeks.map(w => (
                      <tr key={w.meetingDate} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{w.meetingDate}</td>
                        {[w.kpiWeeklyQTD, w.kpiCoding, w.priorityNotes, w.priorityStartEndDate, w.priorityColor].map((v, i) => {
                          const isNum = typeof v === "number";
                          const cls = isNum ? cellClass(v, true) : v === "AB" ? "bg-red-500 text-white" : "bg-gray-300 text-white";
                          return <td key={i} className={`text-center px-3 py-2 font-semibold ${cls}`}>{isNum ? `${v}%` : v}</td>;
                        })}
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2 text-gray-700">Total Avg</td>
                      {[data.punchIn.totals.kpiWeeklyQTD, data.punchIn.totals.kpiCoding, data.punchIn.totals.priorityNotes, data.punchIn.totals.priorityStartEndDate, data.punchIn.totals.priorityColor].map((v, i) => (
                        <td key={i} className={`text-center px-3 py-2 ${cellClass(v, true)}`}>{v}%</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
