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
import { EmptyState, UserPicker, DropdownPicker, type PickerUser } from "@quikit/ui";
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
  { key: "avgHeld",             label: "Avg. % of Calls happened",                                    totalKey: "TotalavgHeld" },
  { key: "avgPunctual",         label: "Avg. % of Calls where call punctuality was followed",         totalKey: "TotalavgPunctual" },
  { key: "avgDurationFollowed", label: "Avg. % of Calls where call duration + time per member was followed", totalKey: "TotalavgDurationFollowed" },
  { key: "avgFormat",           label: "Avg. % of format being followed",                             totalKey: "TotalavgFormat" },
  { key: "avgAttendance",       label: "Avg. % of people attending the calls",                        totalKey: "TotalavgAttendance" },
  { key: "avgStuckCalls",       label: "Avg. % of Stucks called out",                                 totalKey: "TotalavgStuckCalls" },
] as const;

const WEEKLY_METRICS = [
  { key: "avgHeld",             label: "Avg. % of Calls happened",                              totalKey: "TotalavgHeld" },
  { key: "avgPunctual",         label: "Avg. % of Calls where call punctuality was followed",   totalKey: "TotalavgPunctual" },
  { key: "avgDurationFollowed", label: "Average % of call end-time adherence.",                 totalKey: "TotalavgDurationFollowed" },
  { key: "avgAuality",          label: "Quality of the dashboards",                             totalKey: "TotalavgAuality" },
  { key: "avgKP",               label: "Active discussion on K&P achivement gaps & action plan",totalKey: "TotalavgKP" },
  { key: "avgWWW",              label: "WWW review and follow up",                              totalKey: "TotalavgWWW" },
  { key: "avgEF",               label: "Customer and employee feedback segment done",           totalKey: "TotalavgEF" },
  { key: "avgCI",               label: "Collective intelligence discussion done",               totalKey: "TotalavgCI" },
  { key: "avgAttendance",       label: "Avg. % of people attending the calls",                  totalKey: "TotalavgAttendance" },
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
  // Single member at a time — the Member Punch-In tab only ever queries
  // for one user (see `punchUserId` below), and the picker UI was confusing
  // when admins could tick multiple but only see results for the first.
  const [punchUserIds, setPunchUserIds] = useState<string[]>([]);
  const [punchYear, setPunchYear] = useState<number>(new Date().getFullYear());
  const [punchMonth, setPunchMonth] = useState<number>(new Date().getMonth() + 1);
  // API supports one member at a time; for multi-select we use the first id.
  const punchUserId = punchUserIds[0] ?? "";

  // Excel Report modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportType, setExportType] = useState<"daily" | "weekly" | "member">("daily");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportMonth, setExportMonth] = useState<number>(new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState<number>(new Date().getFullYear());
  const [exportClientId, setExportClientId] = useState("");
  const [exporting, setExporting] = useState(false);
  // Inline error message shown inside the Export Report modal — replaces
  // the previous alert() so a "no data in range" 404 surfaces visibly.
  const [exportError, setExportError] = useState<string | null>(null);

  // Clear any stale export error the moment the user changes a filter so
  // they can re-try without manually dismissing the banner.
  useEffect(() => {
    setExportError(null);
  }, [exportType, exportFrom, exportTo, exportYear, exportMonth, exportClientId]);

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
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs bg-white">
              <button
                onClick={() => { setMode("daily"); setTab("performance"); }}
                className={`px-3 py-1.5 font-medium transition-colors ${mode === "daily" ? "bg-accent-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                Daily
              </button>
              <button
                onClick={() => setMode("weekly")}
                className={`px-3 py-1.5 font-medium border-l border-gray-200 transition-colors ${mode === "weekly" ? "bg-accent-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                Weekly
              </button>
            </div>
            {/* Client picker — searchable single-select for consistency */}
            <div className="min-w-[200px]">
              <UserPicker
                value={clientId}
                onChange={setClientId}
                users={clients.map<PickerUser>(c => {
                  const parts = c.name.trim().split(/\s+/);
                  return { id: c.id, firstName: parts[0] ?? c.name, lastName: parts.slice(1).join(" "), email: "" };
                })}
                placeholder={clients.length ? "Select a client…" : "No clients yet"}
                disabled={!clients.length}
              />
            </div>
            <button
              onClick={() => {
                setExportClientId(clientId || clients[0]?.id || "");
                setExportType(mode === "weekly" ? "weekly" : "daily");
                // Default both From and To to current year + month so the year
                // is preselected. User can change either freely.
                const now = new Date();
                const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                setExportFrom(ym);
                setExportTo(ym);
                setExportOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-lg whitespace-nowrap"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
              </svg>
              Excel Report
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
                  <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">Sr No.</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">Metric Description</th>
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
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 min-w-[260px]">
                <label className="text-xs text-gray-600 whitespace-nowrap">Select Member:</label>
                <div className="flex-1">
                  <UserPicker
                    value={punchUserIds[0] ?? ""}
                    onChange={(id) => setPunchUserIds(id ? [id] : [])}
                    users={data.roster.map<PickerUser>(m => {
                      const parts = m.name.trim().split(/\s+/);
                      return { id: m.userId, firstName: parts[0] ?? m.name, lastName: parts.slice(1).join(" "), email: "" };
                    })}
                    placeholder={data.roster.length ? "Select a member…" : "No team members on this client"}
                    disabled={!data.roster.length}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-[160px]">
                <label className="text-xs text-gray-600 whitespace-nowrap">Select Year:</label>
                <div className="flex-1">
                  <DropdownPicker
                    value={String(punchYear)}
                    onChange={(v) => setPunchYear(parseInt(v, 10))}
                    options={Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => ({ value: String(y), label: String(y) }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-[200px]">
                <label className="text-xs text-gray-600 whitespace-nowrap">Select Month:</label>
                <div className="flex-1">
                  <DropdownPicker
                    value={String(punchMonth)}
                    onChange={(v) => setPunchMonth(parseInt(v, 10))}
                    options={["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                </div>
              </div>
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
                      <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">Meeting Date</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">KPI Weekly QTD Update</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">KPI Color Coding</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">Priority Notes</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">Priority Start and End Date</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">Priority Color</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.punchIn.weeks
                      .filter(w => {
                        const d = new Date(w.meetingDate);
                        return d.getUTCFullYear() === punchYear && d.getUTCMonth() + 1 === punchMonth;
                      })
                      .map(w => (
                      <tr key={w.meetingDate} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{w.meetingDate}</td>
                        {[w.kpiWeeklyQTD, w.kpiCoding, w.priorityNotes, w.priorityStartEndDate, w.priorityColor].map((v, i) => {
                          // No color coding on Member Punch-In rows — admin
                          // wants plain values. AB / NA still distinguished
                          // by the literal label (no background tint).
                          const isNum = typeof v === "number";
                          return (
                            <td key={i} className="text-center px-3 py-2 font-semibold text-gray-800">
                              {isNum ? `${v}%` : v}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2 text-gray-700">Total Avg</td>
                      {[data.punchIn.totals.kpiWeeklyQTD, data.punchIn.totals.kpiCoding, data.punchIn.totals.priorityNotes, data.punchIn.totals.priorityStartEndDate, data.punchIn.totals.priorityColor].map((v, i) => (
                        <td key={i} className="text-center px-3 py-2 text-gray-800">{v}%</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {exportOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
          onClick={() => { setExportOpen(false); setExportError(null); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900">Export Report</h3>
              </div>
              <button
                onClick={() => { setExportOpen(false); setExportError(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {exportError && (
              <div className="mb-3 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <svg className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{exportError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  Client
                </label>
                <select
                  value={exportClientId}
                  onChange={(e) => setExportClientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                >
                  <option value="">Select a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Report Type</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "daily",   label: "Daily",   icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                    { value: "weekly",  label: "Weekly",  icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                    { value: "member",  label: "Member",  icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
                  ] as const).map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setExportType(opt.value)}
                      className={`flex flex-col items-center gap-1 px-3 py-3 border rounded-lg text-xs font-medium transition-colors ${
                        exportType === opt.value
                          ? "border-accent-300 bg-accent-50 text-accent-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} />
                      </svg>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportType === "member" ? (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Period
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Month</label>
                      <select
                        value={exportMonth}
                        onChange={(e) => setExportMonth(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                      >
                        {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Year</label>
                      <select
                        value={exportYear}
                        onChange={(e) => setExportYear(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                      >
                        {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                (() => {
                  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                  const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);
                  // Parse YYYY-MM strings into separate year/month dropdowns; rebuild on change.
                  const parse = (v: string) => {
                    const [y, m] = v ? v.split("-") : ["", ""];
                    return { y, m };
                  };
                  const fromParts = parse(exportFrom);
                  const toParts = parse(exportTo);
                  const compose = (y: string, m: string) => (y && m ? `${y}-${m}` : "");
                  return (
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Month Range
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {/* From: Year + Month */}
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">From</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={fromParts.y}
                              onChange={(e) => {
                                const newY = e.target.value;
                                setExportFrom(compose(newY, fromParts.m));
                                // Sync To's year to match — user can still override afterwards.
                                if (newY) setExportTo(compose(newY, toParts.m));
                              }}
                              className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                            >
                              <option value="">Year</option>
                              {YEAR_OPTIONS.map((y) => (<option key={y} value={String(y)}>{y}</option>))}
                            </select>
                            <select
                              value={fromParts.m}
                              onChange={(e) => setExportFrom(compose(fromParts.y, e.target.value))}
                              className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                            >
                              <option value="">Month</option>
                              {MONTH_NAMES.map((name, i) => (
                                <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {/* To: Year + Month */}
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">To</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={toParts.y}
                              onChange={(e) => setExportTo(compose(e.target.value, toParts.m))}
                              className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                            >
                              <option value="">Year</option>
                              {YEAR_OPTIONS.map((y) => (<option key={y} value={String(y)}>{y}</option>))}
                            </select>
                            <select
                              value={toParts.m}
                              onChange={(e) => setExportTo(compose(toParts.y, e.target.value))}
                              className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                            >
                              <option value="">Month</option>
                              {MONTH_NAMES.map((name, i) => (
                                <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                      {exportFrom && exportTo && exportFrom > exportTo && (
                        <p className="text-[10px] text-red-500 mt-1.5">From month must be before or equal to To month.</p>
                      )}
                    </div>
                  );
                })()
              )}

              <button
                disabled={
                  !exportClientId ||
                  (exportType !== "member" && (!exportTo || (!!exportFrom && exportFrom > exportTo))) ||
                  exporting
                }
                onClick={async () => {
                  if (!exportClientId) return;
                  if (exportType !== "member" && !exportTo) return;
                  if (exportType !== "member" && exportFrom && exportFrom > exportTo) return;
                  setExporting(true);
                  setExportError(null);
                  try {
                    let year: number;
                    let month: number;
                    if (exportType === "member") {
                      year = exportYear;
                      month = exportMonth;
                    } else {
                      const toDate = new Date(exportTo);
                      year = toDate.getUTCFullYear();
                      month = toDate.getUTCMonth() + 1;
                    }
                    const endpoint =
                      exportType === "member"
                        ? "/api/client-meetings/export/punch"
                        : `/api/client-meetings/export/${exportType}`;
                    const body: Record<string, unknown> = { clientId: exportClientId, year, month };
                    if (exportType !== "member") {
                      body.from = exportFrom || null;
                      body.to = exportTo;
                    }
                    const res = await fetch(endpoint, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    if (!res.ok) {
                      const j = await res.json().catch(() => ({}));
                      // Inline error inside the modal (also covers the 404
                      // "no data in selected range" case).
                      setExportError(j.error ?? "Export failed");
                      return;
                    }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    const cName = clients.find((c) => c.id === exportClientId)?.name ?? "client";
                    a.href = url;
                    a.download = `${cName}_${exportType}_${year}-${String(month).padStart(2, "0")}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    setExportOpen(false);
                  } finally {
                    setExporting(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg>
                {exporting ? "Exporting…" : "Export Data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
