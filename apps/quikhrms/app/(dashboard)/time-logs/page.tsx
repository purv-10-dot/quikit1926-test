"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";
import {
  Calendar, ChevronLeft, ChevronRight, List, Filter, MoreHorizontal,
  Maximize2, Plus, Clock, Upload, Download, Printer, FileDown, CalendarDays,
  ChevronDown, X, FileSpreadsheet, Briefcase, FolderKanban,
} from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";

type Tab = "time-logs" | "timesheets" | "jobs" | "projects" | "job-schedule";

interface TimeLog {
  id: string; date: string; startTime: string; endTime: string | null;
  duration: string | number; projectId: string | null; taskId: string | null;
  description: string | null; isBillable: boolean; status: string;
}

interface Timesheet {
  id: string; periodType: string; periodStart: string; periodEnd: string;
  totalHours: string | number; status: string;
}

interface Project {
  id: string; name: string; code: string | null; clientName: string | null;
  status: string; isBillable: boolean;
  _count: { jobs: number };
}

interface Job {
  id: string; name: string; code: string | null; assigneeId: string | null;
  status: string; isBillable: boolean; estimatedHours: string | number | null;
  project: { id: string; name: string };
}

interface ScheduleEntry {
  id: string; date: string; startTime: string; endTime: string;
  hours: string | number; note: string | null; status: string;
}

export default function TimeTrackerPage() {
  const [tab, setTab] = useState<Tab>("time-logs");

  const TABS = [
    { id: "time-logs",    label: "Time Logs",    icon: <Clock size={14} /> },
    { id: "timesheets",   label: "Timesheets",   icon: <FileSpreadsheet size={14} /> },
    { id: "jobs",         label: "Jobs",         icon: <Briefcase size={14} /> },
    { id: "projects",     label: "Projects",     icon: <FolderKanban size={14} /> },
    { id: "job-schedule", label: "Job Schedule", icon: <CalendarDays size={14} /> },
  ] as { id: Tab; label: string; icon: React.ReactNode }[];

  return (
    <div>
      <div className="surface-card p-1 inline-flex items-center gap-1 mb-4">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-semibold transition",
                active
                  ? "bg-green-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-[#166534] hover:bg-gray-50",
              )}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {tab === "time-logs" && <TimeLogsTab />}
      {tab === "timesheets" && <TimesheetsTab />}
      {tab === "jobs" && <JobsTab />}
      {tab === "projects" && <ProjectsTab />}
      {tab === "job-schedule" && <JobScheduleTab />}
    </div>
  );
}

// ─── TIME LOGS ──────────────────────────────────────────

function TimeLogsTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [showFilter, setShowFilter] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logMenuOpen, setLogMenuOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<null | "daily" | "weekly" | "semi" | "monthly">(null);
  const logMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (logMenuRef.current && !logMenuRef.current.contains(e.target as Node)) setLogMenuOpen(false);
    };
    if (logMenuOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [logMenuOpen]);
  const [filter, setFilter] = useState({
    clientId: "", projectId: "", jobId: "",
    billableStatus: "All" as "All" | "Billable" | "Non-Billable",
    approvalStatus: "All" as "All" | "Submitted" | "Approved" | "Rejected" | "Draft",
  });
  const [cursor, setCursor] = useState(() => view === "calendar" ? monthStart(new Date()) : weekStart(new Date()));
  const [form, setForm] = useState({ projectId: "", jobId: "", description: "", isBillable: false });
  const [logForm, setLogForm] = useState({ date: "", startTime: "", endTime: "", projectId: "", jobId: "", description: "", isBillable: false });

  const todayStr = todayLocalISO();
  const isTodayLog = logForm.date === todayStr;
  const currentTimeStr = nowHHMM();

  const rangeStart = view === "calendar" ? monthStart(cursor) : cursor;
  const rangeEnd = view === "calendar" ? monthEnd(cursor) : (() => { const d = new Date(cursor); d.setDate(cursor.getDate() + 6); return d; })();
  const qs = `from=${rangeStart.toISOString()}&to=${rangeEnd.toISOString()}`;

  const { data } = useQuery({
    queryKey: ["time-logs", view, cursor.toISOString()],
    queryFn: () => api.get<TimeLog[]>(`/api/v1/hrms/time-logs?limit=200&${qs}`),
  });

  const { data: projects } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<Project[]>("/api/v1/hrms/time-projects?limit=100"),
  });

  const { data: jobs } = useQuery({
    queryKey: ["time-jobs", form.projectId],
    queryFn: () => api.get<Job[]>(`/api/v1/hrms/time-jobs?limit=100${form.projectId ? `&projectId=${form.projectId}` : ""}`),
    enabled: !!form.projectId,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/time-logs", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time-logs"] }),
  });


  const allLogs = data?.data ?? [];
  const logs = allLogs.filter((l) => {
    if (filter.projectId && l.projectId !== filter.projectId) return false;
    if (filter.jobId && l.taskId !== filter.jobId) return false;
    if (filter.billableStatus === "Billable" && !l.isBillable) return false;
    if (filter.billableStatus === "Non-Billable" && l.isBillable) return false;
    if (filter.approvalStatus !== "All") {
      const map = { Submitted: "LogSubmitted", Approved: "LogApproved", Rejected: "LogRejected", Draft: "LogDraft" } as const;
      if (l.status !== map[filter.approvalStatus]) return false;
    }
    return true;
  });
  const totals = logs.reduce((acc, l) => {
    const h = Number(l.duration);
    acc.total += h;
    if (l.status === "LogSubmitted" || l.status === "LogApproved") acc.submitted += h;
    else acc.notSubmitted += h;
    return acc;
  }, { total: 0, submitted: 0, notSubmitted: 0 });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
          <button onClick={() => {
            const d = new Date(cursor);
            if (view === "calendar") d.setMonth(d.getMonth() - 1);
            else d.setDate(d.getDate() - 7);
            setCursor(d);
          }} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={12} /></button>
          <Calendar size={14} className="text-gray-500" />
          <span className="text-xs font-medium">
            {view === "calendar"
              ? cursor.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
              : `${fmtDate(rangeStart)} - ${fmtDate(rangeEnd)}`}
          </span>
          <button onClick={() => {
            const d = new Date(cursor);
            if (view === "calendar") d.setMonth(d.getMonth() + 1);
            else d.setDate(d.getDate() + 7);
            setCursor(d);
          }} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={12} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div ref={logMenuRef} className="relative inline-flex shadow-sm rounded-lg ring-1 ring-[#16a34a]/10 hover:ring-[#16a34a]/20 transition">
            <button
              onClick={() => {
                setLogForm({ date: todayStr, startTime: "", endTime: "", projectId: "", jobId: "", description: "", isBillable: false });
                setShowLog(true);
              }}
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-medium rounded-l-lg transition">
              <Plus size={13} strokeWidth={2.5} />
              Log Time
            </button>
            <div className="w-px bg-white/25" />
            <button
              onClick={() => setLogMenuOpen((o) => !o)}
              aria-label="More log options"
              className={clsx(
                "bg-gradient-to-r from-[#16a34a] to-[#15803d] hover:from-[#15803d] hover:to-[#15803d] text-white px-2.5 rounded-r-lg flex items-center justify-center transition",
                logMenuOpen && "from-[#15803d] to-[#15803d]",
              )}>
              <ChevronDown size={12} className={clsx("transition-transform duration-200", logMenuOpen && "rotate-180")} />
            </button>
            {logMenuOpen && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl py-2 w-56 z-50 origin-top-right animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 pb-2 mb-1 border-b border-gray-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Log Entry Type</p>
                </div>
                {[
                  { id: "single", icon: <Clock size={14} />, label: "Log Time", desc: "Single entry" },
                  { id: "daily", icon: <Calendar size={14} />, label: "Daily Log", desc: "One day grid" },
                  { id: "weekly", icon: <CalendarDays size={14} />, label: "Weekly Log", desc: "7 days" },
                  { id: "semi", icon: <CalendarDays size={14} />, label: "Semi Monthly", desc: "15 days" },
                  { id: "monthly", icon: <CalendarDays size={14} />, label: "Monthly Log", desc: "Full month" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setLogMenuOpen(false);
                      if (m.id === "single") {
                        setLogForm({ date: todayStr, startTime: "", endTime: "", projectId: "", jobId: "", description: "", isBillable: false });
                        setShowLog(true);
                      } else {
                        setBulkMode(m.id as "daily" | "weekly" | "semi" | "monthly");
                      }
                    }}
                    className="group w-full flex items-center gap-3 px-3 py-2 text-xs text-gray-700 hover:bg-[#dcfce7] transition"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-500 group-hover:bg-[#dcfce7] group-hover:text-[#22c55e] transition">
                      {m.icon}
                    </span>
                    <span className="flex flex-col items-start">
                      <span className="font-medium text-gray-800 group-hover:text-[#16a34a]">{m.label}</span>
                      <span className="text-[11px] text-gray-400">{m.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Tooltip content="List view">
            <button onClick={() => { setView("list"); setCursor(weekStart(new Date())); }}
              className={clsx("p-2 border rounded-lg", view === "list" ? "border-[#86efac] bg-[#dcfce7]" : "border-gray-200 bg-white hover:bg-gray-50")}>
              <List size={12} className={view === "list" ? "text-[#22c55e]" : "text-gray-500"} />
            </button>
          </Tooltip>
          <Tooltip content="Calendar view">
            <button onClick={() => { setView("calendar"); setCursor(monthStart(new Date())); }}
              className={clsx("p-2 border rounded-lg", view === "calendar" ? "border-[#86efac] bg-[#dcfce7]" : "border-gray-200 bg-white hover:bg-gray-50")}>
              <CalendarDays size={12} className={view === "calendar" ? "text-[#22c55e]" : "text-gray-500"} />
            </button>
          </Tooltip>
          <Tooltip content="Filter">
            <button onClick={() => setShowFilter(true)} className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
              <Filter size={12} className="text-gray-500" />
            </button>
          </Tooltip>
          <MoreMenu />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex items-center gap-3">
        <Select
          value={form.projectId}
          onChange={(v) => setForm({ ...form, projectId: v, jobId: "" })}
          placeholder="Select Project"
          searchable
          options={(projects?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
          className="w-48"
        />
        <Select
          value={form.jobId}
          onChange={(v) => setForm({ ...form, jobId: v })}
          disabled={!form.projectId}
          placeholder="Select Job"
          searchable
          options={(jobs?.data ?? []).map((j) => ({ value: j.id, label: j.name }))}
          className="w-48"
        />
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What are you working on?"
          className="flex-1 border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
        <Select
          value={form.isBillable ? "Billable" : "Non-Billable"}
          onChange={(v) => setForm({ ...form, isBillable: v === "Billable" })}
          options={[
            { value: "Billable", label: "Billable" },
            { value: "Non-Billable", label: "Non-Billable" },
          ]}
          className="w-36"
        />
      </div>

      {view === "calendar" ? (
        <CalendarView cursor={cursor} logs={logs} />
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-[#dcfce7] flex items-center justify-center mb-3">
            <Clock size={40} className="text-[#bbf7d0]" />
          </div>
          <p className="text-xs text-gray-500">No time logs added currently. To add new time logs, click Log Time</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">
              <tr>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Start</th>
                <th className="text-left px-4 py-2.5">End</th>
                <th className="text-right px-4 py-2.5">Hours</th>
                <th className="text-left px-4 py-2.5">Description</th>
                <th className="text-left px-4 py-2.5">Billable</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5">{new Date(l.date).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2.5 text-xs">{new Date(l.startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5 text-xs">{l.endTime ? new Date(l.endTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium font-mono">{formatHMM(Number(l.duration))}</td>
                  <td className="px-4 py-2.5 text-gray-600">{l.description ?? "—"}</td>
                  <td className="px-4 py-2.5">{l.isBillable ? <span className="text-green-600">✓</span> : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{l.status.replace("Log", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FilterDrawer
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filter={filter}
        setFilter={setFilter}
        projects={projects?.data ?? []}
        jobs={jobs?.data ?? []}
      />

      <Modal open={showLog} onClose={() => setShowLog(false)} title="Log Time">
        <form
          onSubmit={(e) => {
            e.preventDefault();

            if (logForm.date > todayStr) {
              toast.error("Invalid date", "Future dates are not allowed.");
              return;
            }
            if (logForm.date === todayStr && logForm.endTime && logForm.endTime > currentTimeStr) {
              toast.error("Invalid end time", "End time cannot be greater than current time for today.");
              return;
            }
            if (logForm.date === todayStr && logForm.startTime && logForm.startTime > currentTimeStr) {
              toast.error("Invalid start time", "Start time cannot be in the future.");
              return;
            }
            if (logForm.endTime && logForm.endTime <= logForm.startTime) {
              toast.error("Invalid time range", "End time must be after start time.");
              return;
            }

            const start = new Date(`${logForm.date}T${logForm.startTime}`);
            const end = logForm.endTime ? new Date(`${logForm.date}T${logForm.endTime}`) : null;
            const duration = end ? Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100 : undefined;

            createMut.mutate({
              date: logForm.date,
              startTime: start.toISOString(),
              endTime: end?.toISOString(),
              duration,
              projectId: logForm.projectId || undefined,
              taskId: logForm.jobId || undefined,
              description: logForm.description || undefined,
              isBillable: logForm.isBillable,
            }, {
              onSuccess: () => { setShowLog(false); },
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input type="date" required max={todayStr} value={logForm.date}
                onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project</label>
              <Select
                value={logForm.projectId}
                onChange={(v) => setLogForm({ ...logForm, projectId: v, jobId: "" })}
                placeholder="Select Project"
                searchable
                options={(projects?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" required max={isTodayLog ? currentTimeStr : undefined} value={logForm.startTime}
                onChange={(e) => setLogForm({ ...logForm, startTime: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" required max={isTodayLog ? currentTimeStr : undefined} value={logForm.endTime}
                onChange={(e) => setLogForm({ ...logForm, endTime: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea value={logForm.description} rows={2}
              placeholder="What did you work on?"
              onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={logForm.isBillable}
              onChange={(e) => setLogForm({ ...logForm, isBillable: e.target.checked })} />
            Billable
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowLog(false)}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={createMut.isPending}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              {createMut.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      {bulkMode && (
        <BulkLogGrid
          mode={bulkMode}
          projects={projects?.data ?? []}
          jobs={jobs?.data ?? []}
          onClose={() => setBulkMode(null)}
          onSaved={() => {
            setBulkMode(null);
            qc.invalidateQueries({ queryKey: ["time-logs"] });
          }}
          api={api}
          toast={toast}
        />
      )}

      <div className="mt-4 flex items-center justify-end gap-4 text-xs">
        <div className="border-l-2 border-[#22c55e] pl-3">
          <div className="text-xs text-gray-500">Total</div>
          <div className="font-semibold"><span className="text-[#22c55e]">{formatHMM(totals.total)} Hrs</span></div>
        </div>
        <div className="border-l-2 border-green-500 pl-3">
          <div className="text-xs text-gray-500">Submitted</div>
          <div className="font-semibold"><span className="text-green-600">{formatHMM(totals.submitted)} Hrs</span></div>
        </div>
        <div className="border-l-2 border-orange-500 pl-3 bg-orange-50 rounded px-3 py-1">
          <div className="text-xs text-orange-600">Not Submitted</div>
          <div className="font-semibold text-orange-700">{formatHMM(totals.notSubmitted)} Hrs <ChevronRight size={12} className="inline" /></div>
        </div>
      </div>
    </div>
  );
}

// ─── BULK LOG GRID ──────────────────────────────────────

type BulkMode = "daily" | "weekly" | "semi" | "monthly";
type BulkRow = {
  projectId: string; jobId: string; workItem: string;
  isBillable: boolean; description: string;
  hours: Record<string, string>;
};

function emptyRow(): BulkRow {
  return { projectId: "", jobId: "", workItem: "", isBillable: true, description: "", hours: {} };
}

function rangeForMode(mode: BulkMode, anchor: Date): Date[] {
  if (mode === "daily") return [startOfDay(anchor)];
  if (mode === "weekly") {
    const start = weekStart(anchor);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }
  if (mode === "semi") {
    const day = anchor.getDate();
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), day <= 15 ? 1 : 16);
    const end = day <= 15 ? new Date(anchor.getFullYear(), anchor.getMonth(), 15) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
    return days;
  }
  // monthly
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return days;
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function shiftMode(mode: BulkMode, cursor: Date, dir: number): Date {
  const d = new Date(cursor);
  if (mode === "daily") d.setDate(d.getDate() + dir);
  else if (mode === "weekly") d.setDate(d.getDate() + 7 * dir);
  else if (mode === "semi") d.setDate(d.getDate() + 15 * dir);
  else d.setMonth(d.getMonth() + dir);
  return d;
}

function parseHoursInput(v: string): number {
  if (!v) return 0;
  if (v.includes(":")) {
    const [h, m] = v.split(":").map(Number);
    return (h || 0) + (m || 0) / 60;
  }
  return Number(v) || 0;
}

function fmtHM(h: number): string {
  if (!h) return "00:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function modeLabel(mode: BulkMode): string {
  return { daily: "Daily Log", weekly: "Weekly Log", semi: "Semi Monthly Log", monthly: "Monthly Log" }[mode];
}

function headerLabel(mode: BulkMode, days: Date[]): string {
  if (mode === "daily") {
    const d = days[0];
    const today = new Date(); today.setHours(0,0,0,0);
    return d.toDateString() === today.toDateString() ? "Today" : fmtDate(d);
  }
  if (mode === "monthly") return days[0].toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return `${fmtDate(days[0])} - ${fmtDate(days[days.length - 1])}`;
}

function BulkLogGrid({
  mode, projects, jobs, onClose, onSaved, api, toast,
}: {
  mode: BulkMode;
  projects: Project[];
  jobs: Job[];
  onClose: () => void;
  onSaved: () => void;
  api: ReturnType<typeof useApiClient>;
  toast: ReturnType<typeof useToast>;
}) {
  const [currentMode, setCurrentMode] = useState<BulkMode>(mode);
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: 5 }, emptyRow));
  const [saving, setSaving] = useState(false);
  const days = rangeForMode(currentMode, cursor);

  const setRow = (i: number, patch: Partial<BulkRow>) =>
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const setHour = (i: number, dk: string, val: string) =>
    setRow(i, { hours: { ...rows[i].hours, [dk]: val } });

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);

  const clone = () => {
    if (rows.length === 0) return;
    const lastFilled = [...rows].reverse().find((r) => r.projectId || r.description);
    if (!lastFilled) return;
    setRows((rs) => [...rs, { ...lastFilled, hours: { ...lastFilled.hours } }]);
  };

  const colTotal = (dk: string) =>
    rows.reduce((s, r) => s + parseHoursInput(r.hours[dk] ?? ""), 0);
  const rowTotal = (r: BulkRow) =>
    days.reduce((s, d) => s + parseHoursInput(r.hours[dayKey(d)] ?? ""), 0);
  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  const save = async () => {
    const entries: Array<{ date: Date; hours: number; row: BulkRow }> = [];
    rows.forEach((r) => {
      days.forEach((d) => {
        const h = parseHoursInput(r.hours[dayKey(d)] ?? "");
        if (h > 0 && r.projectId) entries.push({ date: d, hours: h, row: r });
      });
    });
    if (entries.length === 0) {
      toast.error("Nothing to save", "Select a project and add hours for at least one day.");
      return;
    }
    setSaving(true);
    try {
      for (const e of entries) {
        const start = new Date(e.date); start.setHours(9, 0, 0, 0);
        const end = new Date(start.getTime() + e.hours * 3600000);
        await api.post("/api/v1/hrms/time-logs", {
          date: e.date.toISOString().slice(0, 10),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          duration: e.hours,
          projectId: e.row.projectId,
          taskId: e.row.jobId || undefined,
          description: e.row.description || e.row.workItem || undefined,
          isBillable: e.row.isBillable,
        });
      }
      toast.success("Saved", `${entries.length} time log${entries.length > 1 ? "s" : ""} created.`);
      onSaved();
    } catch {
      // global onError toast fires from QueryClient
    } finally {
      setSaving(false);
    }
  };

  const isCellWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isCellToday = (d: Date) => d.toDateString() === today.toDateString();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] max-h-[94vh] flex flex-col overflow-hidden ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1 shadow-sm">
              <button onClick={() => setCursor(shiftMode(currentMode, cursor, -1))}
                className="p-1.5 hover:bg-slate-100 rounded-md transition">
                <ChevronLeft size={15} className="text-slate-600" />
              </button>
              <div className="flex items-center gap-1.5 px-2">
                <Calendar size={14} className="text-[#22c55e]" />
                <span className="text-[13px] font-semibold text-slate-800">{headerLabel(currentMode, days)}</span>
              </div>
              <button onClick={() => setCursor(shiftMode(currentMode, cursor, 1))}
                className="p-1.5 hover:bg-slate-100 rounded-md transition">
                <ChevronRight size={15} className="text-slate-600" />
              </button>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#16a34a] text-[11px] font-semibold border border-[#86efac]">
              {modeLabel(currentMode)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={currentMode}
              onChange={(v) => setCurrentMode(v as BulkMode)}
              options={[
                { value: "daily", label: "Daily Log" },
                { value: "weekly", label: "Weekly Log" },
                { value: "semi", label: "Semi Monthly Log" },
                { value: "monthly", label: "Monthly Log" },
              ]}
              className="w-44"
            />
            <button onClick={clone}
              className="inline-flex items-center gap-1 border border-[#86efac] text-[#22c55e] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#dcfce7] transition shadow-sm">
              <Plus size={14} /> Clone
            </button>
            <button onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition">
              <X size={12} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-auto flex-1 bg-slate-50/50">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gradient-to-b from-slate-100 to-slate-50">
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-12">#</th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 min-w-[140px]">Project</th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 min-w-[140px]">Job</th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 min-w-[120px]">Work Item</th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 min-w-[120px]">Billable</th>
                {currentMode === "daily" && <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 min-w-[180px]">Description</th>}
                {days.map((d) => {
                  const weekend = isCellWeekend(d);
                  const isToday = isCellToday(d);
                  return (
                    <th key={dayKey(d)} className={clsx(
                      "px-2 py-2 border-b border-slate-200 text-center min-w-[82px]",
                      weekend && !isToday && "bg-amber-50/70",
                      isToday && "bg-[#dcfce7]/70",
                    )}>
                      <div className={clsx("text-[11px] font-semibold", isToday ? "text-[#16a34a]" : "text-slate-600")}>
                        {d.toLocaleDateString("en-IN", { month: "short", day: "2-digit" })}
                      </div>
                      <div className={clsx("text-[10px] mt-0.5", isToday ? "text-[#22c55e]" : weekend ? "text-amber-700" : "text-slate-400")}>
                        {d.toLocaleDateString("en-IN", { weekday: "short" })}
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 min-w-[80px] bg-slate-100">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={clsx("transition", i % 2 === 0 ? "bg-white" : "bg-slate-50/40", "hover:bg-[#dcfce7]/30")}>
                  <td className="px-3 py-2.5 text-slate-400 font-medium border-b border-slate-100">{i + 1}</td>
                  <td className="px-2 py-2 border-b border-slate-100">
                    <Select
                      value={r.projectId}
                      onChange={(v) => setRow(i, { projectId: v, jobId: "" })}
                      placeholder="Select"
                      size="sm"
                      searchable
                      options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </td>
                  <td className="px-2 py-2 border-b border-slate-100">
                    <Select
                      value={r.jobId}
                      disabled={!r.projectId}
                      onChange={(v) => setRow(i, { jobId: v })}
                      placeholder="Select"
                      size="sm"
                      searchable
                      options={jobs.filter((j) => j.project.id === r.projectId).map((j) => ({ value: j.id, label: j.name }))}
                    />
                  </td>
                  <td className="px-2 py-2 border-b border-slate-100">
                    <input value={r.workItem}
                      onChange={(e) => setRow(i, { workItem: e.target.value })}
                      placeholder="Task"
                      className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                  </td>
                  <td className="px-2 py-2 border-b border-slate-100">
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 w-full">
                      <button type="button" onClick={() => setRow(i, { isBillable: true })}
                        className={clsx("flex-1 text-[11px] font-medium px-2 py-1 rounded transition",
                          r.isBillable ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                        Billable
                      </button>
                      <button type="button" onClick={() => setRow(i, { isBillable: false })}
                        className={clsx("flex-1 text-[11px] font-medium px-2 py-1 rounded transition",
                          !r.isBillable ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                        Non-Bill
                      </button>
                    </div>
                  </td>
                  {currentMode === "daily" && (
                    <td className="px-2 py-2 border-b border-slate-100">
                      <input value={r.description}
                        onChange={(e) => setRow(i, { description: e.target.value })}
                        placeholder="Enter description"
                        className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                    </td>
                  )}
                  {days.map((d) => {
                    const dk = dayKey(d);
                    const weekend = isCellWeekend(d);
                    const isToday = isCellToday(d);
                    const cellVal = r.hours[dk] ?? "";
                    const hasValue = parseHoursInput(cellVal) > 0;
                    return (
                      <td key={dk} className={clsx(
                        "px-1 py-2 border-b border-slate-100",
                        weekend && !isToday && "bg-amber-50/40",
                        isToday && "bg-[#dcfce7]/40",
                      )}>
                        <input value={cellVal}
                          onChange={(e) => setHour(i, dk, e.target.value)}
                          placeholder="00:00"
                          className={clsx(
                            "w-full rounded-md px-1 py-1.5 text-xs text-center font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#166534] transition",
                            hasValue ? "border border-[#86efac] text-[#16a34a] font-semibold bg-[#dcfce7]/50" : "border border-slate-200 text-slate-700",
                          )} />
                      </td>
                    );
                  })}
                  <td className={clsx("px-3 py-2 text-right font-bold text-xs border-b border-slate-100 bg-slate-50",
                    rowTotal(r) > 0 && "text-[#16a34a]")}>
                    {fmtHM(rowTotal(r))}
                  </td>
                </tr>
              ))}

              <tr className="bg-gradient-to-r from-slate-100 to-slate-50 sticky bottom-0">
                <td colSpan={currentMode === "daily" ? 6 : 5} className="px-3 py-3 text-right font-semibold text-slate-600 text-[11px] uppercase tracking-wider">Column Total</td>
                {days.map((d) => {
                  const dk = dayKey(d);
                  const t = colTotal(dk);
                  return (
                    <td key={dk} className={clsx("px-2 py-3 text-center font-semibold text-xs font-mono",
                      t > 0 ? "text-[#16a34a]" : "text-slate-400")}>
                      {fmtHM(t)}
                    </td>
                  );
                })}
                <td className={clsx("px-3 py-3 text-right font-bold text-sm",
                  grandTotal > 0 ? "text-[#15803d]" : "text-slate-400")}>
                  {fmtHM(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-white">
          <button onClick={addRow}
            className="inline-flex items-center gap-1.5 text-[#22c55e] text-xs font-medium hover:bg-[#dcfce7] px-3 py-1.5 rounded-lg transition">
            <Plus size={14} /> Add Row
          </button>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500">
              Grand total: <span className="font-bold text-slate-800 font-mono">{fmtHM(grandTotal)}</span>
            </div>
            <button onClick={onClose}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 transition font-medium">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 transition">
              {saving ? "Saving..." : "Save Log"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function dayKey(d: Date) { return d.toISOString().slice(0, 10); }

// ─── TIMESHEETS ─────────────────────────────────────────

function TimesheetsTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(new Date());
  const [filter, setFilter] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ periodType: "Weekly", periodStart: "", periodEnd: "", notes: "" });

  const { data } = useQuery({
    queryKey: ["timesheets", cursor.toISOString()],
    queryFn: () => api.get<Timesheet[]>("/api/v1/hrms/timesheets?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/timesheets", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timesheets"] }); setShowCreate(false); },
  });

  const sheets = (data?.data ?? []).filter((s) => filter === "All" || s.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
          <button onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d); }} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={12} /></button>
          <Calendar size={14} className="text-gray-500" />
          <span className="text-xs font-medium">{cursor.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
          <button onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d); }} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={12} /></button>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filter}
            onChange={(v) => setFilter(v)}
            options={[
              { value: "All", label: "All" },
              { value: "TsDraft", label: "Draft" },
              { value: "TsSubmitted", label: "Submitted" },
              { value: "TsApproved", label: "Approved" },
              { value: "TsRejected", label: "Rejected" },
            ]}
            className="w-36"
          />
          <button onClick={() => setShowCreate(true)}
            className="btn btn-primary">
            Create Timesheet
          </button>
          <button className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"><Filter size={12} className="text-gray-500" /></button>
        </div>
      </div>

      {sheets.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-[#dcfce7] flex items-center justify-center mb-3">
            <Clock size={40} className="text-[#bbf7d0]" />
          </div>
          <p className="text-xs text-gray-500 text-center">No timesheets found for the applied filters.<br />To add new timesheets, click Create Timesheet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sheets.map((s) => (
            <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold">{new Date(s.periodStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {new Date(s.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.periodType} • {Number(s.totalHours).toFixed(1)} hrs</div>
              </div>
              <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium",
                s.status === "TsApproved" ? "bg-green-100 text-green-700" :
                s.status === "TsSubmitted" ? "bg-[#dcfce7] text-[#16a34a]" :
                s.status === "TsRejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600")}>
                {s.status.replace("Ts", "")}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Timesheet">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Period Type</label>
            <Select
              value={form.periodType}
              onChange={(v) => setForm({ ...form, periodType: v })}
              options={[
                { value: "Weekly", label: "Weekly" },
                { value: "BiWeekly", label: "BiWeekly" },
                { value: "Monthly", label: "Monthly" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
              <input type="date" required value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
              <input type="date" required value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── JOBS ───────────────────────────────────────────────

function JobsTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [view, setView] = useState<"Employee" | "Department">("Employee");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ projectId: "", name: "", code: "", assigneeId: "", estimatedHours: 0, isBillable: false });

  const { data } = useQuery({
    queryKey: ["time-jobs"],
    queryFn: () => api.get<Job[]>("/api/v1/hrms/time-jobs?limit=100"),
  });

  const { data: projects } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<Project[]>("/api/v1/hrms/time-projects?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/time-jobs", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-jobs"] }); setShowAdd(false); },
  });

  const jobs = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Select
          value="Jobs"
          onChange={() => {}}
          options={[{ value: "Jobs", label: "Jobs" }]}
          className="w-32"
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {(["Employee", "Department"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={clsx("px-4 py-1.5 text-xs", view === v ? "bg-white text-[#22c55e] font-medium border border-[#22c55e]" : "bg-gray-50 text-gray-500")}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)}
            className="btn btn-primary">
            Add Job
          </button>
          <button className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"><Maximize2 size={12} className="text-gray-500" /></button>
          <button className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"><Filter size={12} className="text-gray-500" /></button>
          <MoreMenu />
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-[#dcfce7] flex items-center justify-center mb-3">
            <Clock size={40} className="text-[#bbf7d0]" />
          </div>
          <p className="text-xs text-gray-500">No Jobs added currently. To add new Jobs, click Add Job</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-500 tracking-[0.04em]">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Project</th>
                <th className="text-left px-4 py-2.5">Assignee</th>
                <th className="text-right px-4 py-2.5">Est Hours</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2.5 text-[13px] font-medium">{j.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{j.project.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{j.assigneeId ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">{j.estimatedHours ? Number(j.estimatedHours).toFixed(1) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", j.status === "JobActive" ? "bg-[#dcfce7] text-[#16a34a]" : "bg-gray-100 text-gray-600")}>
                      {j.status.replace("Job", "")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Job">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ ...form, estimatedHours: form.estimatedHours || undefined }); }} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
            <Select
              required
              value={form.projectId}
              onChange={(v) => setForm({ ...form, projectId: v })}
              placeholder="Select"
              searchable
              options={(projects?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assignee ID</label>
              <input value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estimated Hours</label>
            <NumberInput step="0.5" value={form.estimatedHours} onChange={(v) => setForm({ ...form, estimatedHours: v ?? 0 })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.isBillable} onChange={(e) => setForm({ ...form, isBillable: e.target.checked })} /> Billable
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── PROJECTS ───────────────────────────────────────────

function ProjectsTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [view, setView] = useState<"Employee" | "Department">("Employee");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", clientName: "", budgetHours: 0, isBillable: false });

  const { data } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<Project[]>("/api/v1/hrms/time-projects?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/time-projects", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-projects"] }); setShowAdd(false); },
  });

  const projects = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Select
          value="Projects"
          onChange={() => {}}
          options={[{ value: "Projects", label: "Projects" }]}
          className="w-32"
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {(["Employee", "Department"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={clsx("px-4 py-1.5 text-xs", view === v ? "bg-white text-[#22c55e] font-medium border border-[#22c55e]" : "bg-gray-50 text-gray-500")}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)}
            className="btn btn-primary">
            Add Project
          </button>
          <button className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"><Maximize2 size={12} className="text-gray-500" /></button>
          <button className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"><Filter size={12} className="text-gray-500" /></button>
          <MoreMenu />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-[#dcfce7] flex items-center justify-center mb-3">
            <Clock size={40} className="text-[#bbf7d0]" />
          </div>
          <p className="text-xs text-gray-500">No Projects added currently. To add new Projects, click Add Project</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-500 tracking-[0.04em]">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Code</th>
                <th className="text-left px-4 py-2.5">Client</th>
                <th className="text-right px-4 py-2.5">Jobs</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-[13px] font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.code ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.clientName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">{p._count.jobs}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium",
                      p.status === "ProjectActive" ? "bg-green-100 text-green-700" :
                      p.status === "ProjectOnHold" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600")}>
                      {p.status.replace("Project", "")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Project">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ ...form, budgetHours: form.budgetHours || undefined, code: form.code || undefined, clientName: form.clientName || undefined }); }} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Project Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
              <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Budget Hours</label>
            <NumberInput value={form.budgetHours} onChange={(v) => setForm({ ...form, budgetHours: v ?? 0 })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.isBillable} onChange={(e) => setForm({ ...form, isBillable: e.target.checked })} /> Billable
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── JOB SCHEDULE ───────────────────────────────────────

function JobScheduleTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"Day" | "Week">("Week");
  const [cursor, setCursor] = useState(() => weekStart(new Date()));

  const weekEnd = new Date(cursor); weekEnd.setDate(cursor.getDate() + 6);

  const { data } = useQuery({
    queryKey: ["job-schedule", cursor.toISOString()],
    queryFn: () => api.get<{ entries: ScheduleEntry[]; pendingCount: number }>(
      `/api/v1/hrms/job-schedule?from=${cursor.toISOString()}&to=${weekEnd.toISOString()}`,
    ),
  });

  const publishMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/job-schedule/publish?from=${cursor.toISOString()}&to=${weekEnd.toISOString()}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-schedule"] }),
  });

  const entries = data?.data.entries ?? [];
  const pendingCount = data?.data.pendingCount ?? 0;

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(cursor); d.setDate(cursor.getDate() + i);
    return d;
  });

  const hoursPerDay = days.map((d) => {
    const dk = d.toISOString().slice(0, 10);
    return entries.filter((e) => e.date.slice(0, 10) === dk).reduce((s, e) => s + Number(e.hours), 0);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
          <button onClick={() => shiftDays(cursor, setCursor, -7)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={12} /></button>
          <Calendar size={14} className="text-gray-500" />
          <span className="text-xs font-medium">{fmtDate(cursor)} - {fmtDate(weekEnd)}</span>
          <button onClick={() => shiftDays(cursor, setCursor, 7)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={12} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {(["Day", "Week"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={clsx("px-4 py-1.5 text-xs", mode === m ? "bg-white text-[#22c55e] font-medium border border-[#22c55e]" : "bg-gray-50 text-gray-500")}>
                {m}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary">Clone</button>
          <span className="text-xs text-gray-500">
            <span className="text-orange-600 font-semibold">{pendingCount}</span> pending changes
          </span>
          <button onClick={() => publishMut.mutate()} disabled={publishMut.isPending || pendingCount === 0}
            className="btn btn-primary disabled:bg-[#86efac]">
            {publishMut.isPending ? "Publishing..." : "Published"}
          </button>
          <button className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"><Filter size={12} className="text-gray-500" /></button>
          <MoreMenu />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <div className="grid min-w-[1600px]" style={{ gridTemplateColumns: `100px repeat(${hours.length}, minmax(40px, 1fr))` }}>
          <div className="bg-gray-50 border-b border-gray-200" />
          {hours.map((h) => (
            <div key={h} className="bg-gray-50 border-b border-l border-gray-200 px-1 py-2 text-xs font-medium text-gray-500 text-center">
              {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
            </div>
          ))}

          {days.map((d, idx) => {
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={idx} className="contents">
                <div className={clsx("border-t border-gray-100 px-2 py-2", isWeekend && "bg-amber-50")}>
                  <div className="text-xs text-gray-500">{d.toLocaleDateString("en-IN", { weekday: "short" })}</div>
                  <div className={clsx("font-semibold", isToday ? "bg-[#dcfce7]0 text-white inline-flex items-center justify-center rounded-full w-6 h-6 text-xs" : "text-gray-900")}>{d.getDate()}</div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Clock size={10} /> {hoursPerDay[idx].toFixed(2)} hrs
                  </div>
                </div>
                {hours.map((h, hi) => (
                  <div key={hi} className={clsx("border-l border-t border-gray-100 min-h-[80px]", isWeekend && "bg-amber-50/70")} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SHARED ─────────────────────────────────────────────

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Tooltip content="More actions">
        <button onClick={() => setOpen(!open)}
          className={clsx("p-2 border rounded-lg", open ? "bg-gray-800 text-white border-gray-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}>
          <MoreHorizontal size={12} />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52 z-50">
          <MenuItem icon={<Upload size={14} />} label="Import" />
          <MenuItem icon={<Download size={14} />} label="Export" />
          <MenuItem icon={<FileDown size={14} />} label="Download as PDF" onClick={() => window.print()} />
          <MenuItem icon={<Printer size={14} />} label="Print" onClick={() => window.print()} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">
      <span className="text-gray-500">{icon}</span>
      {label}
    </button>
  );
}

// ─── utilities ──────────────────────────────────────────

function CalendarView({ cursor, logs }: { cursor: Date; logs: TimeLog[] }) {
  const start = monthStart(cursor);
  const end = monthEnd(cursor);
  const daysInMonth = end.getDate();
  const firstDow = start.getDay();
  const cells: Array<Date | null> = Array(firstDow).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const hoursByDay = new Map<string, number>();
  for (const l of logs) {
    const key = new Date(l.date).toISOString().slice(0, 10);
    hoursByDay.set(key, (hoursByDay.get(key) ?? 0) + Number(l.duration));
  }

  const weekTotals = rows.map((row) =>
    row.reduce((s, d) => s + (d ? (hoursByDay.get(d.toISOString().slice(0, 10)) ?? 0) : 0), 0),
  );

  const today = new Date();
  const isToday = (d: Date) => d.toDateString() === today.toDateString();

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-[repeat(7,_1fr)_120px] border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-3 py-2 font-medium">{d}</div>
        ))}
        <div className="px-3 py-2 font-medium border-l border-gray-200">Total Hours</div>
      </div>
      {rows.map((row, rIdx) => (
        <div key={rIdx} className="grid grid-cols-[repeat(7,_1fr)_120px] border-b border-gray-100 last:border-b-0">
          {row.map((d, cIdx) => {
            if (!d) return <div key={cIdx} className="min-h-[120px] border-r border-gray-100 bg-gray-50/40" />;
            const dow = d.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const key = d.toISOString().slice(0, 10);
            const dayHours = hoursByDay.get(key) ?? 0;
            const dayLogs = logs.filter((l) => new Date(l.date).toISOString().slice(0, 10) === key);
            return (
              <div key={cIdx} className={clsx("min-h-[120px] border-r border-gray-100 px-2 py-2 relative",
                isWeekend && "bg-amber-50/60")}>
                <div className={clsx("inline-flex items-center justify-center w-6 h-6 rounded text-xs font-semibold mb-1",
                  isToday(d) ? "bg-[#dcfce7]0 text-white" : isWeekend ? "text-amber-800" : "text-gray-900")}>
                  {d.getDate()}
                </div>
                {dayLogs.slice(0, 2).map((l) => (
                  <div key={l.id} className="text-[11px] bg-[#dcfce7] text-[#16a34a] rounded px-1.5 py-0.5 mb-1 truncate">
                    {formatHMM(Number(l.duration))} · {l.description ?? "Work"}
                  </div>
                ))}
                {dayLogs.length > 2 && <div className="text-[10px] text-gray-400">+{dayLogs.length - 2} more</div>}
              </div>
            );
          })}
          <div className="min-h-[120px] border-l border-gray-200 px-3 py-2 flex items-start">
            <span className="text-xs font-mono text-gray-700">{formatHMM(weekTotals[rIdx])}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterDrawer({
  open, onClose, filter, setFilter, projects, jobs,
}: {
  open: boolean; onClose: () => void;
  filter: { clientId: string; projectId: string; jobId: string; billableStatus: "All" | "Billable" | "Non-Billable"; approvalStatus: "All" | "Submitted" | "Approved" | "Rejected" | "Draft" };
  setFilter: (f: typeof filter) => void;
  projects: Project[];
  jobs: Job[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[13px] font-semibold text-gray-900">Filter</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><Plus size={12} className="rotate-45 text-gray-500" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Clients</label>
            <Select
              value={filter.clientId}
              onChange={(v) => setFilter({ ...filter, clientId: v })}
              placeholder="All Clients"
              searchable
              options={[
                { value: "", label: "All Clients" },
                ...[...new Set(projects.map((p) => p.clientName).filter(Boolean))].map((c) => ({ value: c!, label: c! })),
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Projects</label>
            <Select
              value={filter.projectId}
              onChange={(v) => setFilter({ ...filter, projectId: v, jobId: "" })}
              placeholder="All Projects"
              searchable
              options={[
                { value: "", label: "All Projects" },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Jobs</label>
            <Select
              value={filter.jobId}
              onChange={(v) => setFilter({ ...filter, jobId: v })}
              placeholder="All Jobs"
              searchable
              options={[
                { value: "", label: "All Jobs" },
                ...jobs.map((j) => ({ value: j.id, label: j.name })),
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Billable Status</label>
            <Select
              value={filter.billableStatus}
              onChange={(v) => setFilter({ ...filter, billableStatus: v as "All" })}
              options={[
                { value: "All", label: "All" },
                { value: "Billable", label: "Billable" },
                { value: "Non-Billable", label: "Non-Billable" },
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Approval Status</label>
            <Select
              value={filter.approvalStatus}
              onChange={(v) => setFilter({ ...filter, approvalStatus: v as "All" })}
              options={[
                { value: "All", label: "All" },
                { value: "Draft", label: "Draft" },
                { value: "Submitted", label: "Submitted" },
                { value: "Approved", label: "Approved" },
                { value: "Rejected", label: "Rejected" },
              ]}
            />
          </div>

          <div className="flex gap-2 pt-4 border-t border-gray-100">
            <button onClick={() => setFilter({ clientId: "", projectId: "", jobId: "", billableStatus: "All", approvalStatus: "All" })}
              className="flex-1 btn btn-secondary">
              Reset
            </button>
            <button onClick={onClose}
              className="flex-1 btn btn-primary">
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function weekStart(d: Date): Date {
  const s = new Date(d); s.setDate(d.getDate() - d.getDay()); s.setHours(0, 0, 0, 0); return s;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
}

function formatHMM(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function shiftDays(cursor: Date, setCursor: (d: Date) => void, days: number) {
  const d = new Date(cursor); d.setDate(cursor.getDate() + days); setCursor(d);
}

function todayLocalISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function nowHHMM() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(11, 16);
}
