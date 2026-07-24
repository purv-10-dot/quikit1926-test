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
import { UserMinus, Plus, LogOut, ClipboardList, UserX, TrendingDown, CalendarClock, ArrowRight, Filter } from "lucide-react";
import { clsx } from "clsx";
import { ExitedEmployeesTab } from "./_components/exited-employees-tab";
import { AttritionTab } from "./_components/attrition-tab";
import { NoticePeriodTab } from "./_components/notice-period-tab";

interface Instance {
  id: string; employeeId: string; resignationDate: string; lastWorkingDate: string;
  reason: string; status: string; exitInterviewDone: boolean;
  _count: { tasks: number };
  employee: {
    id: string; firstName: string; lastName: string;
    displayName: string | null; employeeCode: string;
  } | null;
}

interface ListResponse { instances: Instance[]; counts: Array<{ status: string; _count: number }>; }

interface NoticePeriodOption { id: string; name: string; duration: number; unit: "Days" | "Weeks" | "Months"; }

const REASONS = ["Resignation", "Termination", "Retirement", "ContractEnd"] as const;
const OFF_STATUSES = ["Initiated", "OffboardInProgress", "ClearancePending", "OffboardCompleted"];

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
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<{ status: string[]; reason: string[] }>({ status: [], reason: [] });
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilters(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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
  const filteredInstances = instances.filter((i) => {
    if (filters.status.length && !filters.status.includes(i.status)) return false;
    if (filters.reason.length && !filters.reason.includes(i.reason)) return false;
    return true;
  });
  const activeFilterCount = filters.status.length + filters.reason.length;

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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <UserMinus size={28} className="text-[#22c55e] mt-1.5" />
          <h1 className="text-base font-semibold text-gray-900">Offboarding</h1>
        </div>
        {tab === "active" && showActive && (
          <div className="flex items-center gap-2">
            <ExcelExportButton filename="offboarding" sheetName="Offboardings" columns={excelColumns} rows={excelRows} label="Excel" />
            <button onClick={() => setShowInit(true)} className="btn btn-primary">
              <Plus size={13} /> Initiate offboarding
            </button>
          </div>
        )}
      </div>

      <div className="surface-card p-1 inline-flex items-center gap-1 flex-wrap mb-4">
        {showActive && <TabButton active={tab === "active"} onClick={() => setTab("active")} icon={<ClipboardList size={14} />} label="Offboarding" />}
        {showExited && <TabButton active={tab === "exited"} onClick={() => setTab("exited")} icon={<UserX size={14} />} label="Exited Employees" />}
        {showAttrition && <TabButton active={tab === "attrition"} onClick={() => setTab("attrition")} icon={<TrendingDown size={14} />} label="Attrition" />}
        {showNotice && <TabButton active={tab === "notice"} onClick={() => setTab("notice")} icon={<CalendarClock size={14} />} label="Notice Period" />}
      </div>

      {tab === "exited" && showExited && <ExitedEmployeesTab />}
      {tab === "attrition" && showAttrition && <AttritionTab />}
      {tab === "notice" && showNotice && <NoticePeriodTab />}

      {tab === "active" && showActive && (
      <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {["Initiated", "OffboardInProgress", "ClearancePending", "OffboardCompleted"].map((s) => (
          <div key={s} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="text-xs text-gray-500 uppercase">{s}</div>
            <div className="font-serif-display text-lg md:text-xl font-bold text-gray-900 mt-1">{countsMap[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="text-[13px] font-semibold text-gray-700">Active Offboardings</div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative" ref={filterRef}>
              <button type="button" onClick={() => setShowFilters((v) => !v)}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition",
                  activeFilterCount > 0 ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}>
                <Filter size={14} /> Filters
                {activeFilterCount > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold">{activeFilterCount}</span>}
              </button>
              {showFilters && (
                <div className="absolute right-0 top-full mt-1.5 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Status</div>
                    <div className="space-y-1">
                      {OFF_STATUSES.map((s) => (
                        <label key={s} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input type="checkbox" className="accent-green-600" checked={filters.status.includes(s)}
                            onChange={() => setFilters((f) => ({ ...f, status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s] }))} />
                          {s}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Reason</div>
                    <div className="space-y-1">
                      {REASONS.map((r) => (
                        <label key={r} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input type="checkbox" className="accent-green-600" checked={filters.reason.includes(r)}
                            onChange={() => setFilters((f) => ({ ...f, reason: f.reason.includes(r) ? f.reason.filter((x) => x !== r) : [...f.reason, r] }))} />
                          {r}
                        </label>
                      ))}
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={() => setFilters({ status: [], reason: [] })}
                      className="w-full text-center text-[11px] font-medium text-red-600 hover:underline pt-1">
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>
            {filters.status.map((s) => (
              <span key={`fs-${s}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-medium">
                {s}
                <button onClick={() => setFilters((f) => ({ ...f, status: f.status.filter((x) => x !== s) }))} className="hover:text-green-900">×</button>
              </span>
            ))}
            {filters.reason.map((r) => (
              <span key={`fr-${r}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium">
                {r}
                <button onClick={() => setFilters((f) => ({ ...f, reason: f.reason.filter((x) => x !== r) }))} className="hover:text-blue-900">×</button>
              </span>
            ))}
          </div>
        </div>
        {filteredInstances.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500 text-xs">{activeFilterCount > 0 ? "No offboardings match filters." : "No offboardings"}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredInstances.map((i, idx) => {
              const name = i.employee ? (i.employee.displayName ?? `${i.employee.firstName} ${i.employee.lastName}`.trim()) : i.employeeId;
              const initials = i.employee ? `${i.employee.firstName?.[0] ?? ""}${i.employee.lastName?.[0] ?? ""}`.toUpperCase() : "—";
              return (
                <Link key={i.id} href={`/offboarding/${i.employeeId}`}
                  className="row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center gap-3 hover:border-[#166534]/30 hover:shadow-md transition group"
                  style={{ ["--i" as never]: Math.min(idx, 10) }}>
                  <span className="w-10 h-10 rounded-full bg-[#166534]/10 text-[#166534] grid place-items-center text-sm font-bold shrink-0">{initials}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-[#166534]">{name}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {i.employee?.employeeCode ? `${i.employee.employeeCode} · ` : ""}{i.reason}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Last day {new Date(i.lastWorkingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      <span>· {i._count.tasks} task{i._count.tasks === 1 ? "" : "s"}</span>
                      <span className={clsx("px-2 py-0.5 rounded-full text-[9.5px] font-bold",
                        i.status === "OffboardCompleted" ? "bg-green-100 text-green-700" : "bg-[#dcfce7] text-[#16a34a]")}>{i.status}</span>
                    </div>
                  </div>
                  <ArrowRight size={15} className="text-gray-300 shrink-0 group-hover:text-[#166534]" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
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

/** Offboarding tab pill — icon + label, matching the app-wide tab style. */
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-semibold transition",
        active ? "bg-green-600 text-white shadow-sm" : "text-gray-600 hover:text-[#166534] hover:bg-gray-50",
      )}
    >
      {icon} {label}
    </button>
  );
}
