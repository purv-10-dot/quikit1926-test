"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { List, CalendarDays, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { clsx } from "clsx";
import { EmptyState } from "@/components/hrms/empty-state";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface HolidayItem {
  id: string;
  name: string;
  date: string;
  type: string;
  isOptional: boolean;
  isFloater: boolean;
  description?: string | null;
}

// CompanyHoliday types.
const typeColors: Record<string, string> = {
  National: "bg-red-100 text-red-700",
  Regional: "bg-amber-100 text-amber-700",
  Company: "bg-green-100 text-green-700",
  Optional: "bg-yellow-100 text-yellow-700",
};

export default function HolidaysPage() {
  const api = useApiClient();
  const { hasPermission } = useDashboardConfig();
  // Only users who can actually manage holidays (backend requires
  // hrms.settings.write) see the management entry point.
  const canManageHolidays = hasPermission("hrms.settings.write");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth());
  const [view, setView] = useState<"calendar" | "list">("calendar");

  const { data: holsData, isLoading } = useQuery({
    queryKey: ["holidays", year],
    queryFn: () => api.get<HolidayItem[]>(`/api/v1/hrms/holidays?year=${year}&limit=200`),
  });

  const holidays = holsData?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-page-title text-gray-900">Holiday Calendar</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex items-center rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => setView("calendar")}
              title="Calendar view"
              className={clsx("inline-flex items-center gap-1 px-2.5 py-2 text-sm", view === "calendar" ? "bg-[#dcfce7] text-[#16a34a]" : "text-gray-500 hover:bg-gray-50")}
            >
              <CalendarDays size={14} /> Calendar
            </button>
            <button
              onClick={() => setView("list")}
              title="List view"
              className={clsx("inline-flex items-center gap-1 px-2.5 py-2 text-sm border-l border-[var(--border)]", view === "list" ? "bg-[#dcfce7] text-[#16a34a]" : "text-gray-500 hover:bg-gray-50")}
            >
              <List size={14} /> List
            </button>
          </div>
          <Select
            value={String(year)}
            onChange={(v) => setYear(parseInt(v))}
            options={[2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }))}
            className="w-28"
          />
          {canManageHolidays && (
            <a href="/settings/holiday-calendar"
              title="Add or edit holidays"
              className="flex items-center gap-2 border border-[var(--border)] text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
              <Settings size={14} /> Manage Holidays
            </a>
          )}
        </div>
      </div>

      {/* Holidays — calendar or list */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2"><SkeletonTable rows={6} cols={4} /></div>
      ) : holidays.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <EmptyState
            variant="calendar"
            title={`No holidays for ${year}`}
            description="Add holidays from Settings → Holiday Calendar to see them here."
            className="border-0 shadow-none"
          />
        </div>
      ) : view === "calendar" ? (
        <MonthHolidayCalendar holidays={holidays} year={year} month={month} setMonth={setMonth} />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-table-head font-semibold text-gray-500 uppercase tracking-[0.03em]">Holiday</th>
                <th className="text-left px-4 py-3 text-table-head font-semibold text-gray-500 uppercase tracking-[0.03em]">Date</th>
                <th className="text-left px-4 py-3 text-table-head font-semibold text-gray-500 uppercase tracking-[0.03em]">Day</th>
                <th className="text-left px-4 py-3 text-table-head font-semibold text-gray-500 uppercase tracking-[0.03em]">Type</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h, i) => {
                const d = new Date(h.date);
                return (
                  <tr key={h.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {h.name}
                      {h.isOptional && <span className="ml-1 text-xs text-[#22c55e]">(Optional)</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {d.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", typeColors[h.type] ?? "bg-gray-100 text-gray-700")}>
                        {h.type}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Single-month calendar view ─────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthHolidayCalendar({ holidays, year, month, setMonth }: {
  holidays: HolidayItem[]; year: number; month: number; setMonth: (m: number) => void;
}) {
  const byDay = new Map<number, HolidayItem[]>();
  for (const h of holidays) {
    // Holiday dates are stored at UTC midnight — bucket by UTC parts so a
    // client behind UTC doesn't land the holiday on the previous day.
    const d = new Date(h.date);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
      const arr = byDay.get(d.getUTCDate()) ?? [];
      arr.push(h);
      byDay.set(d.getUTCDate(), arr);
    }
  }

  const first = new Date(year, month, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const today = new Date();
  const isToday = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
  const monthLabel = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const monthShort = first.toLocaleDateString("en-IN", { month: "short" });
  const list = Array.from(byDay.entries()).flatMap(([day, hs]) => hs.map((h) => ({ day, h }))).sort((a, b) => a.day - b.day);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-bold text-gray-900">{monthLabel}</div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMonth(Math.max(0, month - 1))} disabled={month === 0} title="Previous month" className="inline-grid place-items-center w-8 h-8 rounded-lg border border-[var(--border)] text-gray-600 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={15} /></button>
          <button onClick={() => setMonth(Math.min(11, month + 1))} disabled={month === 11} title="Next month" className="inline-grid place-items-center w-8 h-8 rounded-lg border border-[var(--border)] text-gray-600 hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Calendar grid */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50/70 border-b border-gray-100">
            {WEEKDAYS.map((w) => <div key={w} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} className="min-h-[96px] border-b border-r border-gray-100 bg-gray-50/30" />;
              const hs = byDay.get(day) ?? [];
              const td = isToday(day);
              return (
                <div key={idx} className={clsx("min-h-[96px] border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 transition-colors", td ? "bg-green-50/50" : "hover:bg-gray-50/60")}>
                  <div className="flex justify-end">
                    <span className={clsx("inline-grid place-items-center text-[11px] w-6 h-6 rounded-full", td ? "bg-[#16a34a] text-white font-bold shadow-sm" : "text-gray-500")}>{day}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {hs.slice(0, 3).map((h, i) => (
                      <span key={i} title={`${h.name} · ${h.type}`} className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight truncate", typeColors[h.type] ?? "bg-gray-100 text-gray-700")}>
                        {h.name}
                      </span>
                    ))}
                    {hs.length > 3 && <span className="text-[10px] font-medium text-gray-400 pl-0.5">+{hs.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Month list */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm font-bold text-gray-900 mb-3">Holidays · {list.length}</p>
          {list.length === 0 ? (
            <p className="text-sm text-gray-400">No holidays in {monthLabel}.</p>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
              {list.map(({ day, h }, i) => (
                <div key={`${h.id}-${i}`} className="flex items-center gap-2.5">
                  <div className="w-9 text-center shrink-0">
                    <div className="text-sm font-bold text-gray-900 tabular-nums leading-none">{String(day).padStart(2, "0")}</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">{monthShort}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {h.name}{h.isOptional && <span className="ml-1 text-[10px] text-[#22c55e]">(Optional)</span>}
                    </div>
                    <span className={clsx("inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium", typeColors[h.type] ?? "bg-gray-100 text-gray-700")}>{h.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
