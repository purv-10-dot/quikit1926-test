"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useAccessibleDepartments } from "@/lib/hooks/use-ref-data";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { EmptyState } from "@/components/hrms/empty-state";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  Download,
  Search,
  Palmtree,
  ArrowUpRight,
  ArrowDownRight,
  Home,
} from "lucide-react";
import { clsx } from "clsx";

interface LeaveBalance {
  id: string;
  year: number;
  opening: number;
  accrued: string | number;
  taken: string | number;
  adjusted: string | number;
  carriedForward: string | number;
  encashed: string | number;
  lapsed: string | number;
  available: number;
  leaveType: { id: string; name: string; code: string; color: string | null; isPaid: boolean; maxBalance: string };
}

interface EmployeeMini {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  profilePhoto: string | null;
  department: { id: string; name: string } | null;
}

interface Punch {
  in?: string;
  out?: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  punches: Punch[] | null;
  effectiveHours: string | null;
  grossHours: string | null;
  breakDuration: string | null;
  status:
    | "Present" | "Absent" | "HalfDay" | "OnLeave" | "Holiday"
    | "WeekOff" | "CompOff" | "WFH" | "OnDuty" | "NotMarked";
  source: string | null;
  isLateCheckIn: boolean;
  isEarlyCheckOut: boolean;
  lateByMinutes: number;
  earlyByMinutes: number;
  regularizationStatus: "None" | "Pending" | "Approved" | "Rejected";
  shiftName?: string | null;
  shiftCode?: string | null;
  employee: EmployeeMini;
}

const STATUS_COLORS: Record<string, string> = {
  Present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Absent: "bg-red-50 text-red-700 border-red-200",
  HalfDay: "bg-amber-50 text-amber-700 border-amber-200",
  OnLeave: "bg-green-50 text-green-700 border-green-200",
  Holiday: "bg-purple-50 text-purple-700 border-purple-200",
  WeekOff: "bg-gray-50 text-gray-600 border-gray-200",
  CompOff: "bg-green-50 text-green-700 border-green-200",
  WFH: "bg-cyan-50 text-cyan-700 border-cyan-200",
  OnDuty: "bg-violet-50 text-violet-700 border-violet-200",
  NotMarked: "bg-gray-50 text-gray-400 border-gray-200",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

type Period = "week" | "month" | "custom";

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayLocalISO(): string {
  return isoOf(new Date());
}

function weekRange(iso: string): { start: string; end: string } {
  const d = new Date(iso + "T00:00:00");
  const diffToMon = (d.getDay() + 6) % 7; // Monday-based week
  const start = new Date(d);
  start.setDate(d.getDate() - diffToMon);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: isoOf(start), end: isoOf(end) };
}

function monthRange(iso: string): { start: string; end: string } {
  const d = new Date(iso + "T00:00:00");
  return {
    start: isoOf(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

function shiftCursor(iso: string, period: Period, dir: number): string {
  const d = new Date(iso + "T00:00:00");
  if (period === "week") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return isoOf(d);
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ADMIN_EXPORT_COLUMNS = [
  { header: "Date", key: "date", width: 16 },
  { header: "Employee", key: "employee", width: 22 },
  { header: "Employee Code", key: "code", width: 16 },
  { header: "Department", key: "department", width: 18 },
  { header: "Shift", key: "shift", width: 14 },
  { header: "Status", key: "status", width: 16 },
  { header: "Check In", key: "checkIn", width: 12 },
  { header: "Check Out", key: "checkOut", width: 12 },
  { header: "Worked", key: "worked", width: 12 },
  { header: "Late", key: "late", width: 10 },
  { header: "OT", key: "ot", width: 10 },
];

export default function AdminAttendancePage() {
  const api = useApiClient();
  const { data: deptsData } = useAccessibleDepartments();
  const departments = deptsData?.data ?? [];

  const [employeeId, setEmployeeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [cursor, setCursor] = useState(todayLocalISO());
  const [customFrom, setCustomFrom] = useState(startOfMonthISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { dateFrom, dateTo } = useMemo(() => {
    if (period === "week") {
      const r = weekRange(cursor);
      return { dateFrom: r.start, dateTo: r.end };
    }
    if (period === "month") {
      const r = monthRange(cursor);
      return { dateFrom: r.start, dateTo: r.end };
    }
    return { dateFrom: customFrom, dateTo: customTo };
  }, [period, cursor, customFrom, customTo]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE_SIZE));
    p.set("page", String(page));
    if (employeeId) p.set("employeeId", employeeId);
    if (departmentId) p.set("departmentId", departmentId);
    if (status) p.set("status", status);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (search) p.set("search", search);
    return p.toString();
  }, [employeeId, departmentId, status, dateFrom, dateTo, search, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "admin", query],
    queryFn: () => api.get<AttendanceRecord[]>(`/api/v1/hrms/attendance/records?${query}`),
    staleTime: 30_000,
  });
  const records = data?.data ?? [];
  const total = data?.meta?.total ?? records.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const year = useMemo(() => new Date(dateTo || todayISO()).getFullYear(), [dateTo]);
  const { data: balancesData, isLoading: balancesLoading } = useQuery({
    queryKey: ["leaves", "balances", employeeId, year],
    queryFn: () => api.get<LeaveBalance[]>(`/api/v1/hrms/leaves/balances?employeeId=${employeeId}&year=${year}`),
    enabled: !!employeeId,
    staleTime: 60_000,
  });
  const balances = balancesData?.data ?? [];
  const selectedEmployee = useMemo(
    () => records.find((r) => r.employeeId === employeeId)?.employee ?? null,
    [records, employeeId],
  );

  const kpi = useMemo(() => {
    const k = { present: 0, absent: 0, late: 0, leave: 0, wfh: 0, totalHours: 0 };
    for (const r of records) {
      if (r.status === "Present") k.present++;
      else if (r.status === "Absent") k.absent++;
      else if (r.status === "OnLeave") k.leave++;
      else if (r.status === "WFH") k.wfh++;
      if (r.isLateCheckIn) k.late++;
      if (r.effectiveHours) k.totalHours += Number(r.effectiveHours);
    }
    const denom = records.length || 1;
    const pct = (n: number) => `${((n / denom) * 100).toFixed(1)}%`;
    return { ...k, total: records.length, presentPct: pct(k.present), latePct: pct(k.late), absentPct: pct(k.absent), leavePct: pct(k.leave), wfhPct: pct(k.wfh) };
  }, [records]);

  const exportRows = useMemo(
    () =>
      records.map((r) => {
        const workedMin = r.effectiveHours != null ? Math.round(Number(r.effectiveHours) * 60) : null;
        const worked = workedMin != null ? `${Math.floor(workedMin / 60)}h ${String(workedMin % 60).padStart(2, "0")}m` : "";
        const otMin = workedMin != null ? Math.max(0, workedMin - 480) : 0;
        const isLate = r.status === "Present" && r.lateByMinutes > 0;
        return {
          date: fmtDate(r.date),
          employee: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
          code: r.employee.employeeCode ?? "",
          department: r.employee.department?.name ?? "",
          shift: r.shiftCode || r.shiftName || "",
          status: isLate ? `Late (${r.lateByMinutes}m)` : r.status,
          checkIn: r.checkIn ? fmtTime(r.checkIn) : "",
          checkOut: r.checkOut ? fmtTime(r.checkOut) : "",
          worked,
          late: isLate ? `${r.lateByMinutes}m` : "",
          ot: otMin > 0 ? `${otMin}m` : "",
        };
      }),
    [records],
  );

  const clearFilters = () => {
    setEmployeeId(""); setDepartmentId(""); setStatus("");
    setPeriod("month"); setCursor(todayLocalISO());
    setCustomFrom(startOfMonthISO()); setCustomTo(todayISO()); setSearch(""); setPage(1);
  };

  const exportCsv = () => {
    if (records.length === 0) return;
    const headers = [
      "Date", "Employee Code", "Name", "Department", "Status",
      "Check In", "Check Out", "Effective Hrs", "Gross Hrs", "Break Hrs",
      "Late (min)", "Early Out (min)", "Late Check-In", "Early Check-Out",
      "Source", "Regularization", "Punches",
    ];
    const rows = records.map((r) => [
      r.date.slice(0, 10),
      r.employee.employeeCode ?? "",
      `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      r.employee.department?.name ?? "",
      r.status,
      r.checkIn ? new Date(r.checkIn).toISOString() : "",
      r.checkOut ? new Date(r.checkOut).toISOString() : "",
      r.effectiveHours ?? "",
      r.grossHours ?? "",
      r.breakDuration ?? "",
      r.lateByMinutes || "",
      r.earlyByMinutes || "",
      r.isLateCheckIn ? "Yes" : "No",
      r.isEarlyCheckOut ? "Yes" : "No",
      r.source ?? "",
      r.regularizationStatus,
      Array.isArray(r.punches)
        ? r.punches.map((p) => `${p.in ?? "?"}→${p.out ?? "?"}`).join(" ; ")
        : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Admin Attendance</h1>
          <p className="text-xs text-gray-500 mt-1">View all employees check-in/out, hours, and status.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm disabled:opacity-40"
          >
            <Download size={13} /> Export CSV ({records.length})
          </button>
          <ExcelExportButton filename="attendance-admin" sheetName="Attendance" columns={ADMIN_EXPORT_COLUMNS} rows={exportRows} label={`Excel (${records.length})`} />
        </div>
      </div>

      {/* Leave balances panel (visible when single employee filtered) */}
      {employeeId && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Palmtree size={16} className="text-emerald-600" />
              <h2 className="text-[13px] font-semibold text-gray-900">
                Leave Quota {selectedEmployee && `· ${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
              </h2>
              <span className="text-[11px] text-gray-500">Year {year}</span>
            </div>
            <Link
              href={`/leaves?employeeId=${employeeId}`}
              className="text-xs font-medium text-[#22c55e] hover:underline"
            >
              View full leave history →
            </Link>
          </div>
          {balancesLoading ? (
            <div className="py-6 text-center text-xs text-gray-500">Loading balances…</div>
          ) : balances.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-500">No leave balance records for this employee/year.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {balances.map((b) => {
                const used = Number(b.taken);
                const allocated = b.opening + Number(b.accrued) + Number(b.adjusted) + Number(b.carriedForward);
                const pct = allocated > 0 ? Math.min(100, Math.max(0, (used / allocated) * 100)) : 0;
                const color = b.leaveType.color || "#22c55e";
                return (
                  <div key={b.id} className="border border-gray-200 rounded-lg p-2.5 bg-gradient-to-br from-white to-gray-50/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold text-gray-800 truncate" title={b.leaveType.name}>
                        {b.leaveType.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: `${color}20`, color }}>
                        {b.leaveType.code}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-xl font-bold text-gray-900">{b.available.toFixed(1)}</span>
                      <span className="text-[10px] text-gray-500">/ {allocated.toFixed(1)} avail</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <div className="grid grid-cols-3 gap-0.5 text-[10px]">
                      <div title="Used"><span className="text-gray-400">Used </span><span className="font-semibold text-gray-700">{used.toFixed(1)}</span></div>
                      <div title="Carried forward"><span className="text-gray-400">CF </span><span className="font-semibold text-gray-700">{Number(b.carriedForward).toFixed(1)}</span></div>
                      <div title="Accrued"><span className="text-gray-400">Acc </span><span className="font-semibold text-gray-700">{Number(b.accrued).toFixed(1)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard icon={<CheckCircle2 size={14} />} label="Present" value={kpi.present} tone="emerald" sub={kpi.presentPct} />
        <KpiCard icon={<Clock size={14} />} label="Late" value={kpi.late} tone="amber" sub={kpi.latePct} />
        <KpiCard icon={<AlertCircle size={14} />} label="Absent" value={kpi.absent} tone="red" sub={kpi.absentPct} />
        <KpiCard icon={<CalendarDays size={14} />} label="On Leave" value={kpi.leave} tone="blue" sub={kpi.leavePct} />
        <KpiCard icon={<Home size={14} />} label="WFH" value={kpi.wfh} tone="cyan" sub={kpi.wfhPct} />
        <KpiCard icon={<Users size={14} />} label="Total Records" value={kpi.total} tone="indigo" />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
            <EmployeeSelect
              key={departmentId || "all"}
              value={employeeId}
              onChange={(id) => { setEmployeeId(id); setPage(1); }}
              placeholder="All employees"
              departmentId={departmentId || undefined}
              accessibleOnly
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
            <Select
              value={departmentId}
              onChange={(v) => { setDepartmentId(v); setEmployeeId(""); setPage(1); }}
              placeholder="All departments"
              className="w-full"
              options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <Select
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[
                { value: "", label: "All statuses" },
                { value: "Present", label: "Present" },
                { value: "Absent", label: "Absent" },
                { value: "HalfDay", label: "Half Day" },
                { value: "OnLeave", label: "On Leave" },
                { value: "WFH", label: "WFH" },
                { value: "OnDuty", label: "On Duty" },
                { value: "Holiday", label: "Holiday" },
                { value: "WeekOff", label: "Week Off" },
                { value: "NotMarked", label: "Not Marked" },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Search name/code</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1.5 border border-[var(--border)] rounded-lg text-xs"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {/* Period toggle: Week / Month / Custom */}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden self-end">
            {(["week", "month", "custom"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setPage(1); }}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  period === p ? "bg-[#22c55e] text-white" : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {period === "custom" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }}
                  className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => { setCustomTo(e.target.value); setPage(1); }}
                  className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 self-end">
              <button
                onClick={() => { setCursor(shiftCursor(cursor, period, -1)); setPage(1); }}
                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                title={period === "week" ? "Previous week" : "Previous month"}
              >
                <ChevronLeft size={12} />
              </button>
              <div className="min-w-[190px] text-center">
                <div className="text-[13px] font-semibold text-gray-900">
                  {period === "month"
                    ? new Date(cursor + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
                    : `${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`}
                </div>
                <div className="text-[10px] text-gray-500 capitalize">{period} view</div>
              </div>
              <button
                onClick={() => { setCursor(shiftCursor(cursor, period, 1)); setPage(1); }}
                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                title={period === "week" ? "Next week" : "Next month"}
              >
                <ChevronRight size={12} />
              </button>
              <button
                onClick={() => { setCursor(todayLocalISO()); setPage(1); }}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Today
              </button>
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            <button
              onClick={clearFilters}
              className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Reset
            </button>
            <span className="text-xs text-gray-500 self-center">
              {total} records · page {page}/{totalPages}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-gray-500">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-1">
            <EmptyState variant="bot" title="No records" description="Adjust filters to see results." className="border-0 shadow-none" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-table-head uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Date</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Employee</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Department</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Shift</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Check In</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Check Out</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Worked</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">Late</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]">OT</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const workedMin = r.effectiveHours != null ? Math.round(Number(r.effectiveHours) * 60) : null;
                const worked = workedMin != null ? `${Math.floor(workedMin / 60)}h ${String(workedMin % 60).padStart(2, "0")}m` : "—";
                const otMin = workedMin != null ? Math.max(0, workedMin - 480) : 0;
                const isLate = r.status === "Present" && r.lateByMinutes > 0;
                const init = `${r.employee.firstName?.[0] ?? ""}${r.employee.lastName?.[0] ?? ""}`.toUpperCase();
                return (
                <tr key={r.id} className={clsx("row-stagger border-t border-gray-100",
                  r.effectiveHours != null && Number(r.effectiveHours) < 8 ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50")}
                  style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2.5 text-xs text-gray-700 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[11px] font-bold shrink-0">{init}</div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-gray-900 truncate">{r.employee.firstName} {r.employee.lastName}</div>
                        {r.employee.employeeCode && <div className="text-[11px] text-gray-500 font-mono">{r.employee.employeeCode}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.employee.department?.name
                      ? <span className="text-gray-700">{r.employee.department.name}</span>
                      : <><span className="text-gray-400">—</span><div className="text-[11px] text-gray-400">Not Assigned</div></>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.shiftName || r.shiftCode
                      ? <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-100" title={r.shiftName ?? undefined}>{r.shiftCode || r.shiftName}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex items-center gap-1.5 text-[13px] font-medium",
                      r.status === "Absent" ? "text-red-600" : isLate ? "text-amber-600" : r.status === "Present" ? "text-emerald-600" : "text-gray-600")}>
                      <span className={clsx("w-1.5 h-1.5 rounded-full",
                        r.status === "Absent" ? "bg-red-500" : isLate ? "bg-amber-500" : r.status === "Present" ? "bg-emerald-500" : "bg-gray-400")} />
                      {isLate ? `Late (${r.lateByMinutes}m)` : r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                    {r.checkIn ? <span className="inline-flex items-center gap-1"><ArrowUpRight size={12} className="text-emerald-500" /> {fmtTime(r.checkIn)}</span> : "—"}
                    {isLate && <div className="text-[10px] text-amber-600 font-sans">+{r.lateByMinutes}m</div>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                    {r.checkOut ? <span className="inline-flex items-center gap-1"><ArrowDownRight size={12} className="text-rose-500" /> {fmtTime(r.checkOut)}</span> : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 whitespace-nowrap">{worked}</td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {isLate ? <span className="text-amber-600 font-medium">{r.lateByMinutes}m</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {otMin > 0 ? <span className="inline-flex px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 ring-1 ring-violet-100 text-[11px] font-medium">{otMin}m</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs">
            <span className="text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function KpiCard({
  icon, label, value, tone, sub,
}: {
  icon: React.ReactNode; label: string; value: number | string; tone: string; sub?: string;
}) {
  const bg: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-green-50 text-green-700",
    cyan: "bg-cyan-50 text-cyan-700",
    indigo: "bg-green-50 text-green-700",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <div className={clsx("inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium", bg[tone])}>
        {icon} {label}
      </div>
      <div className="text-xl font-bold text-gray-900 mt-1.5">{value}</div>
      {sub && <div className="text-[11px] font-semibold text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
