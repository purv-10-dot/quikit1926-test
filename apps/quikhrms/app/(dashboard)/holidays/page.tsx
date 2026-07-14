"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { withBasePath } from "@/lib/utils/base-path";
import {
  CalendarDays, ChevronLeft, ChevronRight, Filter, Settings, Users, Clock,
} from "lucide-react";
import { clsx } from "clsx";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Tooltip } from "@/components/hrms/tooltip";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  isOptional?: boolean;
}
interface Emp { id: string; firstName: string; lastName: string; profilePhoto: string | null }
interface Leave {
  id: string;
  startDate: string;
  endDate: string;
  duration: string | number;
  employee: Emp;
  leaveType: { name: string; color: string | null };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type View = "month" | "week" | "list";

const isCompanyHoliday = (type: string) => type === "Company";
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const leaveIsHalfDay = (l: Leave) => l.startDate.split("T")[0] === l.endDate.split("T")[0] && Number(l.duration) < 1;
const empShort = (e: Emp) => `${e.firstName} ${e.lastName ? e.lastName[0] + "." : ""}`.trim();
const initials = (e: Emp) => `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";

function Avatar({ e, size = 18 }: { e: Emp; size?: number }) {
  const cls = "rounded-full ring-2 ring-white object-cover shrink-0";
  const style = { width: size, height: size };
  return e.profilePhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={withBasePath(e.profilePhoto)} alt="" title={`${e.firstName} ${e.lastName}`} className={cls} style={style} />
  ) : (
    <span
      title={`${e.firstName} ${e.lastName}`}
      className={clsx(cls, "inline-flex items-center justify-center bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-white font-semibold")}
      style={{ ...style, fontSize: size * 0.42 }}
    >
      {initials(e)}
    </span>
  );
}

export default function HRCalendarPage() {
  const api = useApiClient();
  const { hasAnyPermission, hasPermission } = useDashboardConfig();
  const canFilterPeople = hasAnyPermission(["hrms.leave.read", "hrms.leave.read_team"]);
  const canManageHolidays = hasPermission("hrms.settings.write");

  const now = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [view, setView] = useState<View>("month");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const onClick = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [filtersOpen]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const { data: holidaysData } = useQuery({
    queryKey: ["hrcal-holidays", year],
    queryFn: () => api.get<Holiday[]>(`/api/v1/hrms/holidays?year=${year}&limit=200`),
  });
  const { data: leavesData } = useQuery({
    queryKey: ["hrcal-leaves", year, month, employeeFilter],
    queryFn: () => {
      const start = ymd(new Date(year, month, 1));
      const end = ymd(new Date(year, month + 1, 0));
      const params = new URLSearchParams({ dateFrom: start, dateTo: end, status: "Approved", limit: "300" });
      if (employeeFilter) params.set("employeeId", employeeFilter);
      return api.get<Leave[]>(`/api/v1/hrms/leaves/requests?${params.toString()}`);
    },
  });

  const holidays = useMemo(() => holidaysData?.data ?? [], [holidaysData]);
  const leaves = useMemo(() => leavesData?.data ?? [], [leavesData]);

  // Per-day lookups (keyed by YYYY-MM-DD).
  const holidaysByDay = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const key = h.date.split("T")[0];
      (m.get(key) ?? m.set(key, []).get(key)!).push(h);
    }
    return m;
  }, [holidays]);

  const leavesOnDay = (date: Date): Leave[] => {
    const k = ymd(date);
    return leaves.filter((l) => k >= l.startDate.split("T")[0] && k <= l.endDate.split("T")[0]);
  };

  // 6-week grid (leading/trailing days from adjacent months, greyed out).
  const gridDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [year, month]);

  // Week view = the 7 days of the week containing the cursor's "today-or-1st".
  const weekDays = useMemo(() => {
    const anchor = now.getFullYear() === year && now.getMonth() === month ? new Date(year, month, now.getDate()) : new Date(year, month, 1);
    const ws = new Date(anchor);
    ws.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d; });
  }, [year, month, now]);

  // Holidays that fall in the currently-selected month only.
  const monthHolidayList = useMemo(() => {
    return [...holidays]
      .filter((h) => { const d = new Date(h.date); return d.getUTCFullYear() === year && d.getUTCMonth() === month; })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, year, month]);

  // Distinct leaves overlapping the visible month, for the side panel.
  const peopleOnLeave = useMemo(() => {
    return [...leaves].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [leaves]);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const isToday = (d: Date) => d.toDateString() === now.toDateString();
  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => setCursor(new Date(now.getFullYear(), now.getMonth(), 1));

  const durationBadge = (l: Leave): string => {
    if (leaveIsHalfDay(l)) return "Half Day";
    const days = Math.max(1, Math.round(Number(l.duration)));
    return `${days} Day${days > 1 ? "s" : ""}`;
  };
  const dateRange = (l: Leave): string => {
    const s = new Date(l.startDate), e = new Date(l.endDate);
    const f = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
    return s.toDateString() === e.toDateString() ? f(s) : `${f(s)} – ${f(e)}`;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#dcfce7] text-[#16a34a] flex items-center justify-center">
          <CalendarDays size={18} />
        </div>
        <div>
          <h1 className="text-page-title text-gray-900 leading-tight">HR Calendar</h1>
          <p className="text-xs text-gray-500">View holidays, leaves and team availability.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Today</button>
          <div className="inline-flex items-center gap-1">
            <button onClick={goPrev} title="Previous month" className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><ChevronLeft size={15} /></button>
            <div className="min-w-[140px] text-center text-[15px] font-semibold text-gray-900">{monthLabel}</div>
            <button onClick={goNext} title="Next month" className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><ChevronRight size={15} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm font-medium">
            {(["month", "week", "list"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={clsx("px-3 py-1.5 capitalize", view === v ? "bg-[#dcfce7] text-[#16a34a]" : "text-gray-600 hover:bg-gray-50", v !== "month" && "border-l border-gray-200")}
              >
                {v}
              </button>
            ))}
          </div>
          <div ref={filtersRef} className="relative">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
            >
              <Filter size={13} /> Filters
            </button>
            {filtersOpen && (
              <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-gray-200 bg-white shadow-xl p-3 space-y-3">
                {canFilterPeople ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Employee</p>
                    <EmployeeSelect value={employeeFilter} onChange={setEmployeeFilter} accessibleOnly clearable placeholder="All employees" className="w-full" />
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No filters available.</p>
                )}
              </div>
            )}
          </div>
          {canManageHolidays && (
            <a href="/settings/holiday-calendar" title="Add or edit holidays" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700">
              <Settings size={13} /> Manage Holidays
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Calendar / list */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b border-gray-100 text-xs text-gray-600">
            <Legend color="bg-green-500" label="Holiday" />
            <Legend color="bg-purple-500" label="Company Holiday" />
            <Legend color="bg-gray-300" label="Weekend" />
            <Legend color="bg-blue-500" label="On Leave" />
            <Legend color="bg-amber-500" label="Half Day" />
            <Legend color="bg-indigo-500" label="Multiple on Leave" />
          </div>

          {view === "list" ? (
            <ListView holidaysByDay={holidaysByDay} leaves={peopleOnLeave} year={year} month={month} durationBadge={durationBadge} dateRange={dateRange} />
          ) : (
            <>
              <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
                {DAY_LABELS.map((d, i) => (
                  <div key={d} className={clsx("px-2 py-2.5 text-[12px] font-semibold", i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500")}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {(view === "week" ? weekDays : gridDays).map((d, i) => (
                  <DayCell
                    key={i}
                    date={d}
                    inMonth={d.getMonth() === month}
                    today={isToday(d)}
                    holidays={holidaysByDay.get(ymd(d)) ?? []}
                    dayLeaves={leavesOnDay(d)}
                    tall={view === "week"}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Panel title="Holidays">
            {monthHolidayList.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No holidays this month.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {monthHolidayList.map((h) => {
                  const d = new Date(h.date);
                  const company = isCompanyHoliday(h.type);
                  return (
                    <div key={h.id} className="flex items-start gap-3">
                      <DateChip date={d} tone={company ? "purple" : "green"} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{h.name}</p>
                        <p className="text-[11px] text-gray-500">{d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
                        <span className={clsx("inline-flex items-center gap-1 text-[11px] font-medium mt-0.5", company ? "text-purple-600" : "text-green-600")}>
                          <span className={clsx("w-1.5 h-1.5 rounded-full", company ? "bg-purple-500" : "bg-green-500")} />
                          {company ? "Company Holiday" : "National Holiday"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="People on Leave">
            {peopleOnLeave.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nobody on leave this month.</p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto">
                {peopleOnLeave.map((l) => (
                  <div key={l.id} className="flex items-center gap-2.5">
                    <Avatar e={l.employee} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{l.employee.firstName} {l.employee.lastName}</p>
                      <p className="text-[11px] text-gray-500">{dateRange(l)}</p>
                    </div>
                    <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full", leaveIsHalfDay(l) ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700")}>{durationBadge(l)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={clsx("w-2 h-2 rounded-full", color)} />{label}</span>;
}

function DayCell({ date, inMonth, today, holidays, dayLeaves, tall }: {
  date: Date; inMonth: boolean; today: boolean; holidays: Holiday[]; dayLeaves: Leave[]; tall?: boolean;
}) {
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const half = dayLeaves.filter(leaveIsHalfDay);
  const full = dayLeaves.filter((l) => !leaveIsHalfDay(l));
  return (
    <div className={clsx(
      "border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 overflow-hidden",
      tall ? "min-h-[160px]" : "min-h-[88px]",
      !inMonth && "bg-gray-50/40",
      isWeekend && inMonth && "bg-slate-50/50",
      today && "bg-green-50/60",
    )}>
      <div className="flex justify-start">
        <span className={clsx(
          "inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 text-xs font-semibold rounded-full tabular-nums",
          today ? "bg-[#16a34a] text-white" :
          !inMonth ? "text-gray-300" :
          dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-700",
        )}>{date.getDate()}</span>
      </div>
      <div className="flex flex-col gap-1 min-h-0">
        {holidays.slice(0, 2).map((h) => {
          const company = isCompanyHoliday(h.type);
          return (
            <div key={h.id} className={clsx("rounded-md px-1.5 py-1 leading-tight", company ? "bg-purple-50" : "bg-green-50")}>
              <p className={clsx("text-[11px] font-semibold truncate", company ? "text-purple-700" : "text-green-700")}>{h.name}</p>
              <p className={clsx("text-[10px]", company ? "text-purple-500" : "text-green-500")}>{company ? "Company Holiday" : "Holiday"}</p>
            </div>
          );
        })}

        {full.length === 1 && (
          <Tooltip content={`${full[0].employee.firstName} ${full[0].employee.lastName} · ${full[0].leaveType.name}`}>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-1.5 py-1 w-full">
              <Avatar e={full[0].employee} size={16} />
              <span className="text-[11px] font-medium text-blue-800 truncate">{empShort(full[0].employee)}</span>
            </div>
          </Tooltip>
        )}
        {full.length > 1 && (
          <Tooltip content={full.map((l) => `${l.employee.firstName} ${l.employee.lastName}`).join(", ")}>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-1.5 py-1 w-full">
              <span className="flex -space-x-1.5">{full.slice(0, 2).map((l) => <Avatar key={l.id} e={l.employee} size={16} />)}</span>
              <span className="text-[11px] font-medium text-blue-800 truncate">{full.length} on leave</span>
            </div>
          </Tooltip>
        )}
        {half.map((l) => (
          <Tooltip key={l.id} content={`Half day · ${l.employee.firstName} ${l.employee.lastName}`}>
            <div className="rounded-md bg-amber-50 px-1.5 py-1 w-full">
              <p className="text-[11px] font-semibold text-amber-700 leading-tight">Half Day</p>
              <span className="inline-flex items-center gap-1"><Avatar e={l.employee} size={14} /><span className="text-[10px] text-amber-700 truncate">{empShort(l.employee)}</span></span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function DateChip({ date, tone }: { date: Date; tone: "green" | "purple" }) {
  return (
    <div className={clsx("w-11 shrink-0 text-center rounded-lg py-1", tone === "purple" ? "bg-purple-50" : "bg-green-50")}>
      <div className={clsx("text-sm font-bold tabular-nums leading-none", tone === "purple" ? "text-purple-700" : "text-green-700")}>{date.toLocaleDateString("en-IN", { day: "2-digit", timeZone: "UTC" })}</div>
      <div className={clsx("text-[10px] uppercase tracking-wide mt-0.5", tone === "purple" ? "text-purple-500" : "text-green-500")}>{date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</div>
    </div>
  );
}

function ListView({ holidaysByDay, leaves, year, month, durationBadge, dateRange }: {
  holidaysByDay: Map<string, Holiday[]>; leaves: Leave[]; year: number; month: number;
  durationBadge: (l: Leave) => string; dateRange: (l: Leave) => string;
}) {
  const monthHolidays = Array.from(holidaysByDay.entries())
    .filter(([k]) => { const d = new Date(k); return d.getFullYear() === year && d.getMonth() === month; })
    .flatMap(([, hs]) => hs)
    .sort((a, b) => a.date.localeCompare(b.date));
  const empty = monthHolidays.length === 0 && leaves.length === 0;
  return (
    <div className="p-4 space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Holidays</p>
        {monthHolidays.length === 0 ? <p className="text-xs text-gray-400">No holidays this month.</p> : (
          <div className="space-y-2">
            {monthHolidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-gray-500 tabular-nums">{new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}</span>
                <span className="font-medium text-gray-900">{h.name}</span>
                <span className={clsx("ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full", isCompanyHoliday(h.type) ? "bg-purple-50 text-purple-700" : "bg-green-50 text-green-700")}>{isCompanyHoliday(h.type) ? "Company" : "Holiday"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">On Leave</p>
        {leaves.length === 0 ? <p className="text-xs text-gray-400">Nobody on leave this month.</p> : (
          <div className="space-y-2">
            {leaves.map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-gray-500 tabular-nums">{dateRange(l)}</span>
                <span className="font-medium text-gray-900">{l.employee.firstName} {l.employee.lastName}</span>
                <span className="text-xs text-gray-500">· {l.leaveType.name}</span>
                <span className={clsx("ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full", leaveIsHalfDay(l) ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700")}>{durationBadge(l)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {empty && <p className="text-center text-xs text-gray-400 py-4">Nothing scheduled this month.</p>}
    </div>
  );
}
