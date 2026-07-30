"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { Modal } from "@/components/hrms/modal";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { PageBackground } from "@/components/hrms/page-background";
import {
  UserMinus, Plus, ClipboardList, UserX, TrendingDown, CalendarClock, Filter, Search,
  ChevronRight, ChevronLeft, Building2, Clock, MapPin, RotateCcw, Loader, CheckCircle2,
} from "lucide-react";
import { clsx } from "clsx";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { ExitedEmployeesTab } from "./_components/exited-employees-tab";
import { AttritionTab } from "./_components/attrition-tab";
import { NoticePeriodTab } from "./_components/notice-period-tab";
import {
  BOARDING_THEMES, ProgressRing, FilterDropdown, RadioList, ActiveFilterRow, CheckboxList,
  spaceCase, niceDate,
} from "@/components/hrms/boarding/ui";

interface Instance {
  id: string; employeeId: string; resignationDate: string; lastWorkingDate: string;
  reason: string; status: string; exitInterviewDone: boolean;
  _count: { tasks: number };
  taskDone: number; taskTotal: number; progressPct: number;
  employee: {
    id: string; firstName: string; lastName: string;
    displayName: string | null; employeeCode: string;
    employmentType: string; workLocation: string; department: string | null;
  } | null;
}

const OFF_STATUS_META = [
  { key: "Initiated",          label: "Initiated",         icon: CalendarClock, tile: "bg-blue-100 text-blue-600" },
  { key: "OffboardInProgress", label: "In Progress",       icon: Loader,        tile: "bg-amber-100 text-amber-600" },
  { key: "ClearancePending",   label: "Clearance Pending", icon: ClipboardList, tile: "bg-purple-100 text-purple-600" },
  { key: "OffboardCompleted",  label: "Completed",         icon: CheckCircle2,  tile: "bg-green-100 text-green-600" },
] as const;
const OFF_STATUS_LABEL: Record<string, string> = Object.fromEntries(OFF_STATUS_META.map((s) => [s.key, s.label]));
const LASTDAY_LABEL: Record<string, string> = { week: "This week", month: "This month" };
const PAGE_SIZES = [12, 24, 48];

interface ListResponse { instances: Instance[]; counts: Array<{ status: string; _count: number }>; }

interface NoticePeriodOption { id: string; name: string; duration: number; unit: "Days" | "Weeks" | "Months"; }

const REASONS = ["Resignation", "Termination", "Retirement", "ContractEnd"] as const;

/** Format a Date as a local `yyyy-mm-dd` string for <input type="date">. */
function toDateInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function OffboardingDashboardPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { hasPermission, navKeys, permissions } = useDashboardConfig();
  // Offboarding / Exited / Notice lists need offboarding read/write; the
  // Attrition analytics tab is separately grantable via
  // hrms.offboarding.attrition.read.
  const canRead = hasPermission("hrms.offboarding.read") || hasPermission("hrms.offboarding.write");
  const canAttrition = hasPermission("hrms.offboarding.attrition.read");

  // Per-tab navigation allow-list (mirrors the sidebar). Default-allow — a role
  // with no configured navKeys (or super-admin) sees every tab its permissions
  // allow. Legacy "people.offboarding" key grants the whole page.
  const isSuper = permissions.includes("*");
  const navSet = new Set(navKeys);
  const navConfigured = !isSuper && navSet.size > 0;
  const legacyAll = navSet.has("people.offboarding");
  const navAllowed = (key: string) => !navConfigured || legacyAll || navSet.has(key);

  const showActive = canRead && navAllowed("people.offboarding.active");
  const showExited = canRead && navAllowed("people.offboarding.exited");
  const showAttrition = canAttrition && navAllowed("people.offboarding.attrition");
  const showNotice = canRead && navAllowed("people.offboarding.notice");

  const [showInit, setShowInit] = useState(false);
  const [tab, setTab] = useState<"active" | "exited" | "attrition" | "notice">("active");
  const [search, setSearch] = useState("");
  const [deptSel, setDeptSel] = useState<string[]>([]);
  const [lastDaySel, setLastDaySel] = useState<"" | "week" | "month">("");
  const [statusSel, setStatusSel] = useState("");
  const [reasonSel, setReasonSel] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenKey(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => { setPage(1); }, [search, deptSel.join(","), lastDaySel, statusSel, reasonSel, pageSize]);

  // Keep the active tab within what the user is allowed to see.
  const visibleMap = { active: showActive, exited: showExited, attrition: showAttrition, notice: showNotice };
  const firstVisibleTab = showActive ? "active" : showExited ? "exited" : showAttrition ? "attrition" : showNotice ? "notice" : null;
  useEffect(() => {
    if (!visibleMap[tab] && firstVisibleTab) setTab(firstVisibleTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, showActive, showExited, showAttrition, showNotice, firstVisibleTab]);
  const [form, setForm] = useState({ employeeId: "", resignationDate: "", noticePeriodId: "", templateId: "", reason: "Resignation" as typeof REASONS[number], notes: "" });

  const { data } = useQuery({
    queryKey: ["offboarding", "list"],
    queryFn: () => api.get<ListResponse>("/api/v1/hrms/offboarding?limit=100"),
  });

  const { data: noticeData } = useQuery({
    queryKey: ["notice-periods", "all"],
    queryFn: () => api.get<NoticePeriodOption[]>("/api/v1/hrms/offboarding/notice-periods?limit=100"),
  });
  const noticePeriods = noticeData?.data ?? [];

  const { data: templateData } = useQuery({
    queryKey: ["offboarding-templates", "active"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/hrms/offboarding/templates?isActive=true&limit=100"),
  });
  const templates = templateData?.data ?? [];

  // Last working date = resignation date + selected notice period (mirrors the
  // server-side calculation in /offboarding/initiate). Read-only in the form.
  const selectedNotice = noticePeriods.find((n) => n.id === form.noticePeriodId);
  const computedLastWorkingDate = (() => {
    if (!form.resignationDate || !selectedNotice) return "";
    const d = new Date(`${form.resignationDate}T00:00:00`);
    if (selectedNotice.unit === "Months") d.setMonth(d.getMonth() + selectedNotice.duration);
    else d.setDate(d.getDate() + (selectedNotice.unit === "Weeks" ? selectedNotice.duration * 7 : selectedNotice.duration));
    return toDateInput(d);
  })();

  const initMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/offboarding/initiate", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding"] }); setShowInit(false); },
  });

  const d = data?.data;
  const countsMap: Record<string, number> = {};
  (d?.counts ?? []).forEach((c) => { countsMap[c.status] = c._count; });

  const instances = d?.instances ?? [];
  const deptOptions = Array.from(new Set(instances.map((i) => i.employee?.department).filter(Boolean) as string[])).sort();

  const nowDay = new Date(); nowDay.setHours(0, 0, 0, 0);
  const weekEnd = new Date(nowDay); weekEnd.setDate(nowDay.getDate() + 7);
  const monthEnd = new Date(nowDay.getFullYear(), nowDay.getMonth() + 1, 0);
  const inRange = (dt: string | null, end: Date) => !!dt && new Date(dt) >= nowDay && new Date(dt) <= end;

  const q = search.trim().toLowerCase();
  const filteredInstances = instances.filter((i) => {
    if (deptSel.length && !deptSel.includes(i.employee?.department ?? "")) return false;
    if (lastDaySel === "week" && !inRange(i.lastWorkingDate, weekEnd)) return false;
    if (lastDaySel === "month" && !inRange(i.lastWorkingDate, monthEnd)) return false;
    if (statusSel && i.status !== statusSel) return false;
    if (reasonSel && i.reason !== reasonSel) return false;
    if (q) {
      const hay = i.employee
        ? `${i.employee.firstName} ${i.employee.lastName} ${i.employee.displayName ?? ""} ${i.employee.employeeCode}`.toLowerCase()
        : "";
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const activeFilterCount = (deptSel.length ? 1 : 0) + (lastDaySel ? 1 : 0) + (statusSel ? 1 : 0) + (reasonSel ? 1 : 0);
  const clearAll = () => { setDeptSel([]); setLastDaySel(""); setStatusSel(""); setReasonSel(""); };

  const total = filteredInstances.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredInstances.slice((safePage - 1) * pageSize, safePage * pageSize);
  const fromN = total ? (safePage - 1) * pageSize + 1 : 0;
  const toN = Math.min(safePage * pageSize, total);

  // Flatten each offboarding instance (the currently rendered set) into one
  // export row, matching the visible table columns.
  const excelColumns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Employee Code", key: "employeeCode", width: 16 },
    { header: "Reason", key: "reason", width: 16 },
    { header: "Last Working Day", key: "lastWorkingDay", width: 18 },
    { header: "Tasks", key: "tasks", width: 10 },
    { header: "Status", key: "status", width: 20 },
  ];
  const excelRows = filteredInstances.map((i) => ({
    employee: i.employee ? (i.employee.displayName ?? `${i.employee.firstName} ${i.employee.lastName}`) : i.employeeId,
    employeeCode: i.employee?.employeeCode ?? "",
    reason: i.reason,
    lastWorkingDay: i.lastWorkingDate
      ? new Date(i.lastWorkingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "",
    tasks: i._count.tasks,
    status: i.status,
  }));

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-start gap-2">
          <span className="w-8 h-8 rounded-lg bg-green-100 text-green-600 grid place-items-center shrink-0">
            <UserMinus size={16} />
          </span>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Offboarding</h1>
            <p className="text-[11px] text-gray-500 mt-0.5 max-w-xl">
              Employees on notice — clearance tasks, asset returns, and exit formalities through their last working day.
            </p>
          </div>
        </div>
        {tab === "active" && showActive && (
          <div className="flex items-center gap-1.5">
            <ExcelExportButton filename="offboarding" sheetName="Offboardings" columns={excelColumns} rows={excelRows} label="Excel"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium shadow-sm hover:bg-gray-50 transition disabled:opacity-50" />
            <button onClick={() => setShowInit(true)}
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm transition">
              <Plus size={13} /> Initiate offboarding
            </button>
          </div>
        )}
      </div>

      <TabSwitcher
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as "active" | "exited" | "attrition" | "notice")}
        tabs={[
          ...(showActive ? [{ value: "active" as const, label: "Offboarding", icon: <ClipboardList size={14} /> }] : []),
          ...(showExited ? [{ value: "exited" as const, label: "Exited Employees", icon: <UserX size={14} /> }] : []),
          ...(showAttrition ? [{ value: "attrition" as const, label: "Attrition", icon: <TrendingDown size={14} /> }] : []),
          ...(showNotice ? [{ value: "notice" as const, label: "Notice Period", icon: <CalendarClock size={14} /> }] : []),
        ]}
      />

      {tab === "exited" && showExited && <ExitedEmployeesTab />}
      {tab === "attrition" && showAttrition && <AttritionTab />}
      {tab === "notice" && showNotice && <NoticePeriodTab />}

      {tab === "active" && showActive && (
      <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {OFF_STATUS_META.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
              <span className={clsx("w-10 h-10 rounded-xl grid place-items-center shrink-0", s.tile)}>
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide truncate">{s.label}</div>
                <div className="text-xl font-bold text-gray-900 leading-tight">{countsMap[s.key] ?? 0}</div>
                <div className="text-[10px] text-gray-400">Employees</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter bar */}
      <div ref={barRef} className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-2.5 py-1.5 flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input placeholder="Search by name or employee ID..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[11px] bg-transparent focus:outline-none" />
        </div>

        <FilterDropdown id="filters" label="Filters" icon={Filter} active={activeFilterCount > 0} openKey={openKey} setOpenKey={setOpenKey}
          badge={activeFilterCount > 0 ? activeFilterCount : undefined}>
          {activeFilterCount === 0 ? (
            <p className="text-[11px] text-gray-400 px-1 py-1.5">No filters applied.</p>
          ) : (
            <div className="space-y-1.5">
              {deptSel.length > 0 && <ActiveFilterRow label={`Department: ${deptSel.join(", ")}`} onClear={() => setDeptSel([])} />}
              {lastDaySel && <ActiveFilterRow label={`Last day: ${LASTDAY_LABEL[lastDaySel]}`} onClear={() => setLastDaySel("")} />}
              {statusSel && <ActiveFilterRow label={`Status: ${OFF_STATUS_LABEL[statusSel] ?? statusSel}`} onClear={() => setStatusSel("")} />}
              {reasonSel && <ActiveFilterRow label={`Reason: ${reasonSel}`} onClear={() => setReasonSel("")} />}
              <button type="button" onClick={clearAll} className="w-full text-center text-[11px] font-medium text-red-600 hover:underline pt-1">
                Clear all filters
              </button>
            </div>
          )}
        </FilterDropdown>

        <FilterDropdown id="dept" label="Department" icon={Building2} active={deptSel.length > 0} openKey={openKey} setOpenKey={setOpenKey}>
          <CheckboxList options={deptOptions} selected={deptSel} empty="No departments"
            onToggle={(dd) => setDeptSel((s) => s.includes(dd) ? s.filter((x) => x !== dd) : [...s, dd])} />
        </FilterDropdown>

        <FilterDropdown id="lastday" label="Last Day" icon={CalendarClock} active={!!lastDaySel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList value={lastDaySel} onChange={(v) => { setLastDaySel(v as typeof lastDaySel); setOpenKey(null); }}
            options={[["", "Any time"], ["week", "This week"], ["month", "This month"]]} />
        </FilterDropdown>

        <FilterDropdown id="status" label="Status" active={!!statusSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList value={statusSel} onChange={(v) => { setStatusSel(v); setOpenKey(null); }}
            options={[["", "Any status"], ...OFF_STATUS_META.map((s) => [s.key, s.label] as [string, string])]} />
        </FilterDropdown>

        <FilterDropdown id="reason" label="Reason" active={!!reasonSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList value={reasonSel} onChange={(v) => { setReasonSel(v); setOpenKey(null); }}
            options={[["", "Any reason"], ...REASONS.map((r) => [r, r] as [string, string])]} />
        </FilterDropdown>

        <button type="button" onClick={clearAll}
          className="inline-flex items-center gap-1.5 ml-auto text-xs font-medium text-green-700 hover:text-green-800 px-2 py-2">
          <RotateCcw size={13} /> Clear All
        </button>
      </div>

      {/* Cards */}
      {total === 0 ? (
        <div className="surface-card p-10 text-center text-gray-500">
          <UserMinus size={30} className="mx-auto mb-2 text-gray-300" />
          <p>{activeFilterCount > 0 || search ? "No offboardings match your filters." : "No active offboardings."}</p>
          <p className="text-xs mt-1">Start one with &ldquo;Initiate offboarding&rdquo; when an employee is on notice.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pageItems.map((i, idx) => {
              const t = BOARDING_THEMES[idx % BOARDING_THEMES.length];
              const name = i.employee ? (i.employee.displayName ?? `${i.employee.firstName} ${i.employee.lastName}`.trim()) : i.employeeId;
              const inits = i.employee ? `${i.employee.firstName?.[0] ?? ""}${i.employee.lastName?.[0] ?? ""}`.toUpperCase() : "—";
              const lwd = niceDate(i.lastWorkingDate);
              return (
                <Link key={i.id} href={`/offboarding/${i.employeeId}`}
                  className="group bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 hover:shadow-md hover:border-gray-200 transition">
                  <div className="flex items-start gap-2.5">
                    <div className="relative shrink-0">
                      <span className={clsx("w-10 h-10 rounded-full grid place-items-center text-xs font-bold", t.avatar)}>{inits}</span>
                      <span className={clsx("absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white", t.dot)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-gray-900 truncate">{name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{i.employee?.employeeCode ?? "—"}</div>
                      <span className={clsx("inline-flex items-center mt-1 px-2 py-0.5 rounded-md text-[10px] font-medium", t.pill)}>
                        {lwd ? `Last day: ${lwd}` : "Last day TBD"}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                  </div>

                  <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap mt-2.5 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Building2 size={12} className="text-gray-400" />{i.employee?.department ?? "—"}</span>
                    <span className="inline-flex items-center gap-1"><Clock size={12} className="text-gray-400" />{i.employee ? spaceCase(i.employee.employmentType) : "—"}</span>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gray-400" />{i.employee?.workLocation ?? "—"}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Stage Progress</div>
                      <ProgressRing pct={i.progressPct} color={t.ring} track={t.track} />
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Tasks</div>
                      <div className={clsx("text-[13px] font-bold", t.val)}>{i.taskDone} / {i.taskTotal}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Status</div>
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ring-1", t.badge)}>
                        {OFF_STATUS_LABEL[i.status] ?? i.status}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Footer / pagination */}
          <div className="flex items-center justify-between gap-3 mt-5 flex-wrap text-xs text-gray-500">
            <span>Showing {fromN} to {toN} of {total} employees</span>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="w-7 h-7 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-7 h-7 px-2 grid place-items-center rounded-lg bg-green-600 text-white text-xs font-semibold">{safePage}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="w-7 h-7 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>Show</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-200">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>per page</span>
            </div>
          </div>
        </>
      )}
      </>
      )}

      <Modal open={showInit} onClose={() => setShowInit(false)} title="Initiate Offboarding">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            initMut.mutate(form);
          }}
          className="space-y-4"
        >
          <EmployeeSelect
            label="Employee"
            required
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">{
              form.reason === "Termination" ? "Termination Date"
                : form.reason === "Retirement" ? "Retirement Date"
                : form.reason === "ContractEnd" ? "Contract End Date"
                : "Resignation Date"
            }</label>
              <input
                type="date"
                required
                min={toDateInput(new Date())}
                value={form.resignationDate}
                onChange={(e) => setForm({ ...form, resignationDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Notice Period</label>
              <Select
                value={form.noticePeriodId}
                onChange={(v) => setForm({ ...form, noticePeriodId: v })}
                options={[
                  { value: "", label: noticePeriods.length ? "Select notice period" : "No notice periods — add one first" },
                  ...noticePeriods.map((n) => ({ value: n.id, label: `${n.name} (${n.duration} ${n.unit})` })),
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Last Working Date</label>
              <input
                type="date"
                readOnly
                tabIndex={-1}
                value={computedLastWorkingDate}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-gray-50 text-gray-600 cursor-not-allowed" />
            </div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
              <Select
                value={form.reason}
                onChange={(v) => setForm({ ...form, reason: v as typeof REASONS[number] })}
                options={REASONS.map((r) => ({ value: r, label: r }))}
              /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Offboarding Template <span className="text-gray-400 font-normal">(optional)</span></label>
            <Select
              value={form.templateId}
              onChange={(v) => setForm({ ...form, templateId: v })}
              options={[
                { value: "", label: templates.length ? "Default clearance tasks" : "No templates — default tasks" },
                ...templates.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <p className="text-[11px] text-gray-500 mt-1">Pick a template to pre-fill the clearance task list.</p>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowInit(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={initMut.isPending || !form.noticePeriodId} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">Initiate</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
