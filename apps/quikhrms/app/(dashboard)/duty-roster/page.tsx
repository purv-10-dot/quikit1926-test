"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useAccessibleDepartments } from "@/lib/hooks/use-ref-data";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { FormActions, FormField, FormInput } from "@/components/hrms/form";
import { EmptyState } from "@/components/hrms/empty-state";
import { useToast } from "@/components/hrms/toast";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Users, CalendarOff, X, CheckCircle2, Lock } from "lucide-react";
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

  const [mode, setMode] = useState<Mode>("Week");
  const [cursor, setCursor] = useState(todayLocalISO());
  const [departmentId, setDepartmentId] = useState("");
  const [editCell, setEditCell] = useState<{ emp: RosterRow; date: string; cell?: RosterCell } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
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
    onSuccess: () => { refresh(); setEditCell(null); setShowBulk(false); },
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
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
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
              <button onClick={() => setShowWeekOff(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"><CalendarOff size={13} /> Week-offs</button>
              <button onClick={() => setShowBulk(true)} disabled={!editable} className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"><Users size={13} /> Bulk assign</button>
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
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
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
        <div className="mb-3 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          No roster covers this period. Create a <button onClick={() => setShowCreate(true)} className="text-[#22c55e] font-semibold hover:underline">new draft</button> to start assigning shifts.
        </div>
      )}
      {canManage && publishedRoster && !draftRoster && (
        <div className="mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          This roster is published and locked. Use <span className="font-semibold">Reopen</span> to make changes.
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-gray-500">Loading roster…</div>
        ) : employees.length === 0 ? (
          <div className="p-1"><EmptyState variant="bot" title="No employees" description="No accessible employees for this filter." className="border-0 shadow-none" /></div>
        ) : (
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-table-head">
                <th className="sticky left-0 z-10 bg-gray-50 text-left px-3 py-2 font-medium border-b border-r border-gray-200 min-w-[180px]">Employee</th>
                {days.map((d) => (
                  <th key={d.date} className={clsx("px-2 py-2 font-medium border-b border-gray-200 text-center min-w-[64px]", d.isHoliday && "bg-purple-50")}>
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

      {showBulk && activeRoster && (
        <BulkAssignModal
          shifts={shifts}
          days={days}
          onClose={() => setShowBulk(false)}
          onSubmit={(entries) => entriesMut.mutate(entries)}
          pending={entriesMut.isPending}
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

function BulkAssignModal({ shifts, days, onClose, onSubmit, pending }: {
  shifts: ShiftLegend[]; days: DayMeta[];
  onClose: () => void; onSubmit: (entries: Record<string, unknown>[]) => void; pending: boolean;
}) {
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [shiftId, setShiftId] = useState("");
  const [skipWeekoff, setSkipWeekoff] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (picked.length === 0) { setError("Select at least one employee"); return; }
    if (!shiftId) { setError("Select a shift"); return; }
    const entries: Record<string, unknown>[] = [];
    for (const p of picked) {
      for (const d of days) {
        if (skipWeekoff && (d.dow === 0 || d.dow === 6)) continue;
        entries.push({ employeeId: p.id, date: d.date, shiftId, type: "Duty" });
      }
    }
    if (entries.length === 0) { setError("Nothing to assign for this period"); return; }
    onSubmit(entries);
  };

  return (
    <Modal open onClose={onClose} title="Bulk assign shift" size="md">
      <div className="p-4 space-y-4">
        <FormField label="Employees">
          <EmployeeSelect value="" onChange={() => {}} accessibleOnly clearable={false} placeholder="Add employees"
            excludeIds={picked.map((p) => p.id)}
            onPick={(emp) => setPicked((prev) => prev.some((x) => x.id === emp.id) ? prev : [...prev, { id: emp.id, name: `${emp.firstName} ${emp.lastName}`.trim() }])} />
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {picked.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-medium">
                  {p.name}<button type="button" onClick={() => setPicked((arr) => arr.filter((x) => x.id !== p.id))} className="hover:text-green-900"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </FormField>
        <FormField label="Shift" required>
          <Select value={shiftId} onChange={setShiftId} placeholder="Select shift" searchable
            options={shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` }))} />
        </FormField>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={skipWeekoff} onChange={(e) => setSkipWeekoff(e.target.checked)} />
          Skip Saturdays &amp; Sundays
        </label>
        <p className="text-[11px] text-gray-500">Applies the shift to every {skipWeekoff ? "weekday" : "day"} in the visible period for the selected employees.</p>
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
        <FormActions>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="button" onClick={submit} disabled={pending} className="btn btn-primary">{pending ? "Assigning…" : "Assign"}</button>
        </FormActions>
      </div>
    </Modal>
  );
}

function WeekOffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const api = useApiClient();
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [days, setDays] = useState<string[]>(["Saturday", "Sunday"]);
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.put("/api/v1/hrms/roster/weekly-offs", { employeeIds: picked.map((p) => p.id), days }),
    onSuccess: onSaved,
  });
  const toggle = (d: string) => setDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]);
  return (
    <Modal open onClose={onClose} title="Set week-off pattern" size="md">
      <div className="p-4 space-y-4">
        <FormField label="Employees">
          <EmployeeSelect value="" onChange={() => {}} accessibleOnly clearable={false} placeholder="Add employees"
            excludeIds={picked.map((p) => p.id)}
            onPick={(emp) => setPicked((prev) => prev.some((x) => x.id === emp.id) ? prev : [...prev, { id: emp.id, name: `${emp.firstName} ${emp.lastName}`.trim() }])} />
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {picked.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-medium">
                  {p.name}<button type="button" onClick={() => setPicked((arr) => arr.filter((x) => x.id !== p.id))} className="hover:text-green-900"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </FormField>
        <FormField label="Week-off days">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_FULL.map((d) => (
              <button key={d} type="button" onClick={() => toggle(d)} className={clsx("px-2.5 py-1.5 rounded-md text-xs font-semibold border", days.includes(d) ? "bg-[#22c55e] text-white border-[#22c55e]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </FormField>
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
        <FormActions>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="button" onClick={() => { setError(null); if (picked.length === 0) { setError("Select at least one employee"); return; } mut.mutate(); }} disabled={mut.isPending} className="btn btn-primary">{mut.isPending ? "Saving…" : "Save pattern"}</button>
        </FormActions>
      </div>
    </Modal>
  );
}
