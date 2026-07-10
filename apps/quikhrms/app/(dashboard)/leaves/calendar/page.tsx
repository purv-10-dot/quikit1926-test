"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ChevronLeft, ChevronRight, Calendar, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  employee: { id: string; firstName: string; lastName: string };
  leaveType: { name: string; color: string | null };
}

interface HolidayItem {
  id: string;
  name: string;
  date: string;
  type: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function LeaveCalendarPage() {
  const api = useApiClient();
  const { hasAnyPermission } = useDashboardConfig();
  // Only managers/HR (team- or org-wide leave read) get the people filter — a
  // self-only employee has nobody else to filter by.
  const canFilterPeople = hasAnyPermission(["hrms.leave.read", "hrms.leave.read_team"]);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [employeeFilter, setEmployeeFilter] = useState("");

  // Fit the calendar to the exact remaining viewport height (no page scroll).
  // Measured at runtime so it adapts to any laptop / top-bar height instead of
  // relying on a hard-coded offset.
  const rootRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top; // distance from viewport top (below the sticky bar)
      // Subtract the layout's 24px bottom padding (the `p-6` wrapper) + a small
      // buffer so the page ends above the viewport edge — no scroll.
      setFitHeight(Math.max(360, window.innerHeight - top - 30));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const { data: leavesData } = useQuery({
    queryKey: ["leave-calendar", month, year, employeeFilter],
    queryFn: () => {
      const start = new Date(year, month, 1).toISOString().split("T")[0];
      const end = new Date(year, month + 1, 0).toISOString().split("T")[0];
      const params = new URLSearchParams({ dateFrom: start, dateTo: end, status: "Approved", limit: "200" });
      if (employeeFilter) params.set("employeeId", employeeFilter);
      return api.get<LeaveRequest[]>(`/api/v1/hrms/leaves/requests?${params.toString()}`);
    },
  });

  const { data: holidaysData } = useQuery({
    queryKey: ["holidays-calendar", year],
    queryFn: () => api.get<HolidayItem[]>(`/api/v1/hrms/holidays?year=${year}&limit=100`),
  });

  const leaves = leavesData?.data ?? [];
  const holidays = holidaysData?.data ?? [];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month).toLocaleString("en", { month: "long" });

  const prev = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setMonth(now.getMonth()); setYear(now.getFullYear()); };

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayLeaves = leaves.filter((l) => {
      const start = l.startDate.split("T")[0];
      const end = l.endDate.split("T")[0];
      return dateStr >= start && dateStr <= end;
    });
    const dayHolidays = holidays.filter((h) => h.date.split("T")[0] === dateStr);
    return { dayLeaves, dayHolidays };
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const legend = useMemo(() => {
    const map = new Map<string, string>();
    leaves.forEach((l) => { if (l.leaveType.color) map.set(l.leaveType.name, l.leaveType.color); });
    return Array.from(map.entries());
  }, [leaves]);

  const monthlyTotal = leaves.length;
  const peopleOff = new Set(leaves.map((l) => l.employee.id)).size;

  return (
    <div
      ref={rootRef}
      className="w-full flex flex-col overflow-hidden"
      style={{ height: fitHeight ? `${fitHeight}px` : "calc(100dvh - 10rem)" }}
    >
      {/* Header */}
      <div className="surface-card p-4 mb-3 flex items-center justify-between flex-wrap gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#dcfce7] text-[#16a34a] flex items-center justify-center">
            <Calendar size={16} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">Leave &amp; Holiday Calendar</h1>
            <p className="text-xs text-gray-500">Approved leaves + holidays across the month</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canFilterPeople && (
            <EmployeeSelect
              value={employeeFilter}
              onChange={setEmployeeFilter}
              accessibleOnly
              clearable
              placeholder="All employees"
              className="w-full sm:w-60"
            />
          )}
          <div className="hidden md:flex items-center gap-3 text-xs">
            <Stat label="Approved this month" value={monthlyTotal} />
            <Stat label="People off" value={peopleOff} />
            <Stat label="Holidays" value={holidays.filter((h) => new Date(h.date).getUTCMonth() === month).length} />
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="surface-card p-0 overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 flex-wrap px-3 sm:px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-center gap-2 order-1">
            <button onClick={prev} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"><ChevronLeft size={13} /></button>
            <button onClick={goToday} className="text-xs font-medium text-[#16a34a] hover:underline px-2.5 py-1">Today</button>
            <button onClick={next} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"><ChevronRight size={13} /></button>
          </div>
          <h2 className="font-serif-display text-[13px] font-semibold text-gray-900 tabular-nums order-2">{monthName} {year}</h2>
          <div className="flex items-center gap-2 flex-wrap order-3 w-full sm:w-auto">
            {legend.length > 0 && legend.slice(0, 4).map(([name, color]) => (
              <span key={name} className="inline-flex items-center gap-1 text-xs text-gray-600">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />{name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full bg-purple-500" /> Holiday
            </span>
          </div>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-gray-100 shrink-0">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={clsx(
              "px-1.5 sm:px-3 py-2 text-xs font-bold uppercase tracking-wider truncate",
              (i === 0 || i === 6) ? "text-[#16a34a]" : "text-gray-500",
            )}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div
          className="grid grid-cols-7 flex-1 min-h-0 [&>*]:border-b [&>*]:border-r [&>*]:border-gray-100"
          style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(0, 1fr))` }}
        >
          {cells.map((day, i) => {
            if (!day) {
              return <div key={`empty-${i}`} className="bg-slate-50/40" />;
            }
            const { dayLeaves, dayHolidays } = getEventsForDay(day);
            const cellDate = new Date(year, month, day);
            const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
            const dow = cellDate.getDay();
            const isWeekend = dow === 0 || dow === 6;
            return (
              <div
                key={day}
                className={clsx(
                  "p-1.5 relative transition-colors flex flex-col overflow-hidden",
                  isWeekend && !isToday && "bg-slate-50/60",
                  isToday && "bg-green-50 ring-2 ring-[#16a34a] ring-inset",
                )}
              >
                <div className="flex items-center justify-between shrink-0">
                  <span className={clsx(
                    "inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs rounded-md font-bold tabular-nums",
                    isToday ? "bg-[#16a34a] text-white" :
                    dayHolidays.length > 0 ? "text-purple-700" :
                    isWeekend ? "text-[#16a34a]" : "text-gray-700",
                  )}>
                    {day}
                  </span>
                  {dayLeaves.length > 0 && (
                    <Tooltip content={`${dayLeaves.length} on leave`}>
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                        {dayLeaves.length}
                      </span>
                    </Tooltip>
                  )}
                </div>
                <div className="mt-1 space-y-1 flex-1 min-h-0 overflow-hidden">
                  {dayHolidays.map((h) => (
                    <Tooltip key={h.id} content={`Holiday: ${h.name}`}>
                      <div className="text-[10px] bg-purple-50 text-purple-700 rounded px-1.5 py-0.5 truncate inline-flex items-center gap-1 w-full">
                        <Sparkles size={9} /> {h.name}
                      </div>
                    </Tooltip>
                  ))}
                  {dayLeaves.slice(0, 3).map((l) => {
                    const c = l.leaveType.color ?? "#22c55e";
                    return (
                      <Tooltip key={l.id} content={`${l.employee.firstName} ${l.employee.lastName} · ${l.leaveType.name}`}>
                        <div
                          className="text-[10px] rounded px-1.5 py-0.5 truncate inline-flex items-center gap-1 w-full font-medium"
                          style={{ backgroundColor: `${c}1A`, color: c }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                          {l.employee.firstName} {l.employee.lastName[0]}.
                        </div>
                      </Tooltip>
                    );
                  })}
                  {dayLeaves.length > 3 && (
                    <div className="text-[10px] text-gray-500 font-medium">+{dayLeaves.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l-2 border-[#16a34a]/40 pl-3">
      <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{label}</div>
      <div className="text-sm font-bold text-gray-900 tabular-nums">{value}</div>
    </div>
  );
}
