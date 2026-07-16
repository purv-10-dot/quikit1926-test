"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useAccessibleDepartments } from "@/lib/hooks/use-ref-data";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { FormActions, FormField, FormInput } from "@/components/hrms/form";
import { EmptyState } from "@/components/hrms/empty-state";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, CalendarOff, CheckCircle2, Lock, Search, Check, Info, Users, Clock } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { todayInput } from "@/lib/utils/date-input";

type CellType = "Duty" | "WeekOff" | "Leave" | "Holiday" | "Empty";

interface RosterCell {
  type: CellType;
  shiftId?: string | null;
  shiftName?: string | null;
  shiftCode?: string | null;
  shiftColor?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  leaveTypeName?: string | null;
  holidayName?: string | null;
  note?: string | null;
  source: string;
}
interface DayMeta { date: string; dow: number; isHoliday: boolean; holidayName: string | null }
interface RosterRow {
  id: string; name: string; employeeCode: string | null; department: string | null;
  weeklyOffDays: number[];
  cells: Record<string, RosterCell>;
}
interface ShiftLegend { id: string; name: string; code: string; color: string | null; startTime: string; endTime: string }
interface RosterMeta { id: string; name: string; status: "Draft" | "Published" | "Archived"; periodStart: string; periodEnd: string }
interface RosterGrid {
  from: string; to: string;
  days: DayMeta[];
  shifts: ShiftLegend[];
  employees: RosterRow[];
  rosters: RosterMeta[];
}

type Mode = "Week" | "Month";
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayLocalISO(): string { return isoOf(new Date()); }
function rangeOf(mode: Mode, cursor: string): { from: string; to: string } {
  const d = new Date(cursor + "T00:00:00");
  if (mode === "Week") {
    const diffToMon = (d.getDay() + 6) % 7;
    const start = new Date(d); start.setDate(d.getDate() - diffToMon);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: isoOf(start), to: isoOf(end) };
  }
  return { from: isoOf(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
function shiftCursor(cursor: string, mode: Mode, dir: number): string {
  const d = new Date(cursor + "T00:00:00");
  if (mode === "Week") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return isoOf(d);
}
function fmt(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function DutyRosterPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useDashboardConfig();
  const canManage = hasPermission("hrms.roster.manage");
  const { data: deptsData } = useAccessibleDepartments();
  const departments = deptsData?.data ?? [];

  const [mode, setMode] = useState<Mode>("Month");
  const [cursor, setCursor] = useState(todayLocalISO());
  const [departmentId, setDepartmentId] = useState("");
  const [editCell, setEditCell] = useState<{ emp: RosterRow; date: string; cell?: RosterCell } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showWeekOff, setShowWeekOff] = useState(false);

  const { from, to } = useMemo(() => rangeOf(mode, cursor), [mode, cursor]);
  const query = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (departmentId) p.set("departmentId", departmentId);
    return p.toString();
  }, [from, to, departmentId]);

  const { data, isLoading } = useQuery({
    queryKey: ["roster", "grid", query],
    queryFn: () => api.get<RosterGrid>(`/api/v1/hrms/roster?${query}`),
    staleTime: 15_000,
  });
  const grid = data?.data;
  const days = grid?.days ?? [];
  const employees = grid?.employees ?? [];
  const shifts = grid?.shifts ?? [];

  // Rosters overlapping the visible period. Draft = editable target; Published = locked.
  const draftRoster = useMemo(() => (grid?.rosters ?? []).find((r) => r.status === "Draft") ?? null, [grid]);
  const publishedRoster = useMemo(() => (grid?.rosters ?? []).find((r) => r.status === "Published") ?? null, [grid]);
  const activeRoster = draftRoster;
  const editable = canManage && !!draftRoster;

  const refresh = () => qc.invalidateQueries({ queryKey: ["roster", "grid"] });

  const entriesMut = useMutation({
    mutationFn: (entries: Record<string, unknown>[]) =>
      api.post(`/api/v1/hrms/roster/${activeRoster!.id}/entries`, { entries }),
    onSuccess: () => { refresh(); setEditCell(null); },
  });

  const publishMut = useMutation({
    mutationFn: (v: { id: string; action: "publish" | "reopen" }) =>
      api.post(`/api/v1/hrms/roster/${v.id}/publish`, { action: v.action }),
    onSuccess: (_d, v) => { refresh(); toast.success(v.action === "publish" ? "Roster published" : "Roster reopened"); },
  });

  const label = mode === "Month"
    ? new Date(cursor + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : `${fmt(from)} — ${fmt(to)}`;

  return (
    <div className="w-full h-full flex flex-col px-5 py-4 overflow-hidden">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Duty Roster</h1>
          <p className="text-xs text-gray-500 mt-1">Who works which shift on which day — with week-offs, leaves and holidays.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={departmentId}
            onChange={(v) => setDepartmentId(v)}
            placeholder="All departments"
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {(["Week", "Month"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={clsx("px-2.5 py-1 text-xs font-medium", mode === m ? "bg-[#22c55e] text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>{m}</button>
            ))}
          </div>
          {canManage && (
            <>
              <Link href="/shifts" className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"><Clock size={13} /> Shifts</Link>
              <button onClick={() => setShowWeekOff(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"><CalendarOff size={13} /> Week-offs</button>
              {draftRoster && (
                <button
                  onClick={() => { if (confirm("Publish this roster? Employees will be notified and it will drive attendance.")) publishMut.mutate({ id: draftRoster.id, action: "publish" }); }}
                  disabled={publishMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                ><CheckCircle2 size={13} /> Publish</button>
              )}
              {!draftRoster && publishedRoster && (
                <button
                  onClick={() => publishMut.mutate({ id: publishedRoster.id, action: "reopen" })}
                  disabled={publishMut.isPending}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                ><Lock size={13} /> Reopen</button>
              )}
              {!draftRoster && !publishedRoster && (
                <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-[#243a5e]"><Plus size={13} /> New draft</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Period nav + status + legend */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(shiftCursor(cursor, mode, -1))} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><ChevronLeft size={12} /></button>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 min-w-[180px] justify-center"><CalendarDays size={14} className="text-gray-500" /> {label}</span>
          <button onClick={() => setCursor(shiftCursor(cursor, mode, 1))} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><ChevronRight size={12} /></button>
          <button onClick={() => setCursor(todayLocalISO())} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">Today</button>
          {draftRoster ? (
            <span className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
              Draft · {draftRoster.name}
            </span>
          ) : publishedRoster ? (
            <span className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
              <CheckCircle2 size={11} /> Published · {publishedRoster.name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-600">
          {shifts.slice(0, 8).map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: (s.color ?? "#e5e7eb") + "33", borderColor: s.color ?? "#d1d5db" }} />
              {s.code || s.name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-300" /> Week-off</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-50 border border-green-200" /> Leave</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-50 border border-purple-200" /> Holiday</span>
        </div>
      </div>

      {canManage && !draftRoster && !publishedRoster && (
        <div className="mb-3 shrink-0 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          No roster covers this period. Create a <button onClick={() => setShowCreate(true)} className="text-[#22c55e] font-semibold hover:underline">new draft</button> to start assigning shifts.
        </div>
      )}
      {canManage && publishedRoster && !draftRoster && (
        <div className="mb-3 shrink-0 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          This roster is published and locked. Use <span className="font-semibold">Reopen</span> to make changes.
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-auto scrollbar-x-only flex-1 min-h-0">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-gray-500">Loading roster…</div>
        ) : employees.length === 0 ? (
          <div className="p-1"><EmptyState variant="bot" title="No employees" description="No accessible employees for this filter." className="border-0 shadow-none" /></div>
        ) : (
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-table-head">
                <th className="sticky left-0 top-0 z-30 bg-gray-50 text-left px-3 py-2 font-medium border-b border-r border-gray-200 min-w-[180px]">Employee</th>
                {days.map((d) => (
                  <th key={d.date} className={clsx("sticky top-0 z-20 bg-gray-50 px-2 py-2 font-medium border-b border-gray-200 text-center min-w-[64px]", d.isHoliday && "bg-purple-50")}>
                    <div>{WEEKDAY[d.dow]}</div>
                    <div className="text-gray-900 font-semibold tabular-nums" title={d.holidayName ?? undefined}>{new Date(d.date + "T00:00:00").getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-gray-200">
                    <div className="text-[13px] font-semibold text-gray-900 truncate max-w-[170px]">{emp.name}</div>
                    <div className="text-[11px] text-gray-500">{emp.employeeCode ?? "—"}{emp.department ? ` · ${emp.department}` : ""}</div>
                  </td>
                  {days.map((d) => (
                    <Cell
                      key={d.date}
                      cell={emp.cells[d.date]}
                      editable={editable}
                      onClick={editable ? () => setEditCell({ emp, date: d.date, cell: emp.cells[d.date] }) : undefined}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!canManage && <p className="text-[11px] text-gray-400 mt-3">Read-only view.</p>}

      {/* ── Cell editor ── */}
      {editCell && activeRoster && (
        <Modal open onClose={() => setEditCell(null)} title={`${editCell.emp.name} · ${fmt(editCell.date)}`} size="sm">
          <div className="p-4 space-y-3">
            <div className="text-[11px] font-semibold text-gray-500 uppercase">Assign shift</div>
            <div className="grid grid-cols-2 gap-2">
              {shifts.map((s) => {
                const color = s.color ?? "#22c55e";
                const active = editCell.cell?.type === "Duty" && editCell.cell?.shiftId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => entriesMut.mutate([{ employeeId: editCell.emp.id, date: editCell.date, shiftId: s.id, type: "Duty" }])}
                    disabled={entriesMut.isPending}
                    className={clsx("px-2 py-2 rounded-md border text-xs font-semibold text-left disabled:opacity-50", active && "ring-2 ring-offset-1")}
                    style={{ backgroundColor: color + "1A", borderColor: color + "66", color }}
                  >
                    <div className="truncate">{s.name}</div>
                    <div className="text-[10px] opacity-70">{s.startTime}–{s.endTime}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => entriesMut.mutate([{ employeeId: editCell.emp.id, date: editCell.date, type: "WeekOff" }])} disabled={entriesMut.isPending} className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Mark week-off</button>
              <button onClick={() => entriesMut.mutate([{ employeeId: editCell.emp.id, date: editCell.date, clear: true }])} disabled={entriesMut.isPending} className="flex-1 px-3 py-2 rounded-md border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Clear</button>
            </div>
          </div>
        </Modal>
      )}

      {showCreate && (
        <CreateRosterModal
          defaultName={label}
          from={from}
          to={to}
          departmentId={departmentId}
          departments={departments}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {showWeekOff && <WeekOffModal onClose={() => setShowWeekOff(false)} onSaved={() => { setShowWeekOff(false); refresh(); }} />}
    </div>
  );
}

function Cell({ cell, editable, onClick }: { cell?: RosterCell; editable?: boolean; onClick?: () => void }) {
  const base = clsx("px-1.5 py-1 text-center border-l border-gray-100", editable && "cursor-pointer hover:bg-green-50/60");
  if (!cell || cell.type === "Empty") return <td className={clsx(base, "text-gray-300")} onClick={onClick}>—</td>;
  if (cell.type === "Duty") {
    const color = cell.shiftColor ?? "#22c55e";
    return (
      <td className={base} onClick={onClick}>
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border truncate max-w-[60px]" style={{ backgroundColor: color + "22", borderColor: color + "66", color }} title={[cell.shiftName, cell.shiftStart && cell.shiftEnd ? `${cell.shiftStart}–${cell.shiftEnd}` : null, cell.note].filter(Boolean).join(" · ")}>
          {cell.shiftCode || cell.shiftName || "Shift"}
        </span>
      </td>
    );
  }
  if (cell.type === "WeekOff") return <td className={clsx(base, "bg-gray-100/70")} onClick={onClick}><span className="text-[10px] font-medium text-gray-500">WO</span></td>;
  if (cell.type === "Leave") return <td className={clsx(base, "bg-green-50")} onClick={onClick} title={cell.leaveTypeName ?? "Leave"}><span className="text-[10px] font-medium text-green-700">Leave</span></td>;
  return <td className={clsx(base, "bg-purple-50")} onClick={onClick} title={cell.holidayName ?? "Holiday"}><span className="text-[10px] font-medium text-purple-700">Hol</span></td>;
}

function CreateRosterModal({ defaultName, from, to, departmentId, departments, onClose, onCreated }: {
  defaultName: string; from: string; to: string; departmentId: string;
  departments: { id: string; name: string }[]; onClose: () => void; onCreated: () => void;
}) {
  const api = useApiClient();
  const [name, setName] = useState(defaultName);
  const [periodStart, setPeriodStart] = useState(from);
  const [periodEnd, setPeriodEnd] = useState(to);
  const [dept, setDept] = useState(departmentId);
  const mut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/roster", { name, periodStart, periodEnd, departmentId: dept || undefined }),
    onSuccess: onCreated,
  });
  return (
    <Modal open onClose={onClose} title="New draft roster" size="sm">
      <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="p-4 space-y-4">
        <FormField label="Name" required><FormInput value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Ops — June 2026" /></FormField>
        <FormField label="Period" required>
          <div className="grid grid-cols-2 gap-2">
            <FormInput type="date" min={todayInput()} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            <FormInput type="date" min={todayInput()} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
          </div>
        </FormField>
        <FormField label="Department">
          <Select
            value={dept}
            onChange={(v) => setDept(v)}
            placeholder="All departments"
            className="w-full"
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
        </FormField>
        <FormActions>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" disabled={mut.isPending} className="btn btn-primary">{mut.isPending ? "Creating…" : "Create draft"}</button>
        </FormActions>
      </form>
    </Modal>
  );
}

interface WeekOffEmp {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  jobTitle: string | null;
}

function WeekOffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const api = useApiClient();
  const dialog = useDialog();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [days, setDays] = useState<string[]>(["Saturday", "Sunday"]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: empResp, isLoading } = useQuery({
    queryKey: ["roster", "weekoff-employees"],
    queryFn: () => api.get<WeekOffEmp[]>("/api/v1/hrms/employees?limit=500&status=Active"),
    staleTime: 60_000,
  });
  const allEmps = useMemo(() => empResp?.data ?? [], [empResp]);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? allEmps.filter((e) => `${e.firstName} ${e.lastName} ${e.employeeCode ?? ""} ${e.jobTitle ?? ""}`.toLowerCase().includes(q))
    : allEmps;
  const selectedEmps = allEmps.filter((e) => selected.has(e.id));

  const mut = useMutation({
    mutationFn: () => api.put("/api/v1/hrms/roster/weekly-offs", { employeeIds: [...selected], days }),
    onSuccess: onSaved,
  });

  const toggleDay = (d: string) => setDays((arr) => (arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]));
  const toggleEmp = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = async () => {
    setError(null);
    if (selected.size === 0) { setError("Select at least one employee"); return; }
    const n = selected.size;
    const who = `${n} employee${n === 1 ? "" : "s"}`;

    // 0 days = clear the existing pattern.
    if (days.length === 0) {
      const ok = await dialog.confirm({
        title: "Remove week-off pattern?",
        description: `This will clear all recurring week-offs for ${who}. Their off-days will no longer be applied automatically.`,
        variant: "danger",
        confirmLabel: "Clear pattern",
      });
      if (!ok) return;
    } else if (days.length === 7) {
      // All 7 off = never scheduled to work.
      const ok = await dialog.confirm({
        title: "All 7 days off?",
        description: `Every day is marked as a week-off, so ${who} will never be scheduled to work. Apply anyway?`,
        variant: "warning",
        confirmLabel: "Apply anyway",
      });
      if (!ok) return;
    } else if (days.length >= 4) {
      // Unusual number of off-days — soft confirm.
      const ok = await dialog.confirm({
        title: `${days.length} week-off days?`,
        description: `That's an unusual number of weekly off-days for ${who} (${days.join(", ")}). Apply anyway?`,
        variant: "warning",
        confirmLabel: "Apply anyway",
      });
      if (!ok) return;
    }
    mut.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Set week-off pattern"
      subtitle="Assign recurring weekly off-days to the selected employees."
      headerIcon={<CalendarOff size={18} className="text-[#22c55e]" />}
      maxWidthClass="max-w-4xl"
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-gray-100">
        {/* LEFT — employee picker */}
        <div className="p-5">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Select employees</h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, email…"
              className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#bbf7d0] focus:border-[#22c55e]"
            />
          </div>
          <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
            <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-gray-400">Loading employees…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">No employees found.</div>
              ) : (
                filtered.map((e) => {
                  const on = selected.has(e.id);
                  const meta = [e.employeeCode, e.jobTitle].filter(Boolean).join(" · ");
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleEmp(e.id)}
                      aria-pressed={on}
                      className={clsx("w-full flex items-center gap-3 px-3 py-2.5 text-left transition", on ? "bg-emerald-50" : "hover:bg-gray-50")}
                    >
                      <span className={clsx("w-5 h-5 rounded-md border flex items-center justify-center shrink-0", on ? "bg-[#22c55e] border-[#22c55e] text-white" : "border-gray-300 bg-white")}>
                        {on && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {`${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?"}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-gray-900 truncate">{`${e.firstName} ${e.lastName}`.trim()}</span>
                        <span className="block text-[11px] text-gray-500 truncate">{meta || "—"}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs">
              <span className="font-semibold text-[#16a34a]">{selected.size} selected</span>
              <button type="button" onClick={() => setSelected(new Set())} disabled={selected.size === 0} className="text-gray-500 hover:text-gray-800 disabled:opacity-40">
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — days + preview */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900">Week-off days</h3>
            <p className="text-xs text-gray-500 mt-0.5">Choose days that will be set as weekly off.</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {WEEKDAY_FULL.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(d)}
                  className={clsx(
                    "inline-flex items-center justify-center gap-1 py-2.5 rounded-lg border text-[13px] font-semibold transition",
                    on ? "bg-emerald-50 text-[#16a34a] border-[#22c55e]" : "bg-white text-gray-600 border-gray-200 hover:border-[#86efac]",
                  )}
                >
                  {d.slice(0, 3)}
                  {on && <Check size={13} strokeWidth={3} />}
                </button>
              );
            })}
          </div>

          {/* Info banner */}
          <div className={clsx("flex items-start gap-2 rounded-lg ring-1 px-3 py-2.5 text-xs", days.length === 0 ? "bg-amber-50 ring-amber-100 text-amber-800" : "bg-emerald-50 ring-emerald-100 text-emerald-800")}>
            <Info size={14} className={clsx("mt-0.5 shrink-0", days.length === 0 ? "text-amber-600" : "text-emerald-600")} />
            <span>
              {days.length === 0 ? (
                <>No days selected — saving will <b>clear</b> the week-off pattern for the selected employees.</>
              ) : (
                <>Selected employees will have week-off on <b>{days.join(", ")}</b> every week.</>
              )}
            </span>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-[13px] font-semibold text-gray-900">Preview</p>
            <p className="text-[11px] text-gray-500 mt-0.5">The following employees will be assigned this pattern.</p>
            <div className="flex items-start gap-2.5 mt-2.5">
              <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Users size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-900">
                  {selected.size} employee{selected.size === 1 ? "" : "s"} selected
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {selectedEmps.length === 0
                    ? "None yet"
                    : selectedEmps
                        .slice(0, 3)
                        .map((e) => `${`${e.firstName} ${e.lastName}`.trim()}${e.employeeCode ? ` (${e.employeeCode})` : ""}`)
                        .join(", ")}
                  {selectedEmps.length > 3 ? ` +${selectedEmps.length - 3} more` : ""}
                </p>
              </div>
            </div>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button type="button" onClick={save} disabled={mut.isPending} className="btn btn-primary">
          {mut.isPending ? "Saving…" : days.length === 0 ? "Clear pattern" : "Save pattern"}
        </button>
      </div>
    </Modal>
  );
}
