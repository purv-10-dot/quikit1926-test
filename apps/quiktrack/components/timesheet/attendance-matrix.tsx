"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import {
  dateKey,
  formatHours,
  getPeriodRange,
  isToday,
  isWeekend,
  shiftAnchor,
  type Period,
} from "@/lib/utils/timesheetPeriod";
import { UserTimeDrawer } from "./user-time-drawer";

type Status = "present" | "halfday" | "absent" | "future" | "weekend";

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface GridRow {
  id: string;
  label: string;
  secondary?: string | null;
}

interface GridCell {
  hours: number;
  entryIds: string[];
}

interface GridResponse {
  rows: GridRow[];
  cells: Record<string, Record<string, GridCell>>;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

const STATUS_STYLES: Record<Status, { bg: string; text: string; border: string; dot: string }> = {
  present:  { bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200",  dot: "bg-emerald-500"  },
  halfday:  { bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200",    dot: "bg-amber-500"    },
  absent:   { bg: "bg-red-50",      text: "text-red-700",      border: "border-red-200",      dot: "bg-red-500"      },
  future:   { bg: "bg-gray-50",     text: "text-gray-300",     border: "border-gray-100",     dot: "bg-gray-300"     },
  weekend:  { bg: "bg-gray-50/60",  text: "text-gray-300",     border: "border-transparent",  dot: "bg-gray-300"     },
};

const FULL_DAY_HOURS = 8;
const HALF_DAY_HOURS = 4;

function classify(hours: number, day: Date): Status {
  if (isWeekend(day)) return "weekend";
  const now = new Date();
  const isFuture = day.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (hours >= FULL_DAY_HOURS) return "present";
  if (hours >= HALF_DAY_HOURS) return "halfday";
  if (hours > 0) return "absent";
  return isFuture ? "future" : "absent";
}

export function AttendanceMatrix() {
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const range = useMemo(() => getPeriodRange(period, anchor), [period, anchor]);
  const BATCH = 15;
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  // Reset visible window when period changes (different days/totals matter).
  useEffect(() => { setVisibleCount(BATCH); }, [period, anchor]);
  const [drawerUser, setDrawerUser] = useState<{ id: string; label: string } | null>(null);

  const gridQ = useQuery({
    queryKey: ["quiktrack", "attendance-grid", dateKey(range.from), dateKey(range.to)],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: dateKey(range.from),
        to: dateKey(range.to),
        groupBy: "user",
      });
      const r = await fetch(`/api/timesheets/grid?${params.toString()}`);
      const j = await r.json();
      return (j.data as GridResponse) ?? { rows: [], cells: {} };
    },
  });

  const usersQ = useQuery({
    queryKey: ["quiktrack", "org-users-flat"],
    queryFn: async () => {
      const r = await fetch("/api/org/users");
      const j = await r.json();
      return (j.data as OrgUser[]) ?? [];
    },
  });

  const allUsers = useMemo(() => {
    const list = (usersQ.data ?? []).map((u) => ({
      id: u.userId,
      label: `${u.firstName} ${u.lastName}`.trim() || u.email,
      email: u.email,
    }));
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [usersQ.data]);

  // Aggregate per-row status totals across the period.
  const rowTotals = useMemo(() => {
    const map: Record<string, { present: number; halfday: number; absent: number }> = {};
    const cells = gridQ.data?.cells ?? {};
    for (const u of allUsers) {
      const row = cells[u.id] ?? {};
      let present = 0,
        halfday = 0,
        absent = 0;
      for (const day of range.days) {
        if (isWeekend(day)) continue;
        const k = dateKey(day);
        const hours = row[k]?.hours ?? 0;
        const status = classify(hours, day);
        if (status === "present") present += 1;
        else if (status === "halfday") halfday += 1;
        else if (status === "absent") absent += 1;
      }
      map[u.id] = { present, halfday, absent };
    }
    return map;
  }, [allUsers, gridQ.data, range.days]);

  const loading = gridQ.isLoading || usersQ.isLoading;
  const pageUsers = allUsers.slice(0, visibleCount);
  const hasMore = visibleCount < allUsers.length;

  // Bump visible window as the sentinel row comes into the scroll container's
  // viewport. Re-attached whenever `hasMore` flips so we stop observing once
  // the full set is rendered.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisibleCount((n) => Math.min(allUsers.length, n + BATCH));
          }
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, allUsers.length]);

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`h-7 px-3 text-xs font-medium rounded ${
                  period === p.value ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1 text-sm text-gray-700">
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 bg-white hover:bg-gray-50"
              aria-label="Previous"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-medium tabular-nums">{range.label}</span>
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 bg-white hover:bg-gray-50"
              aria-label="Next"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(new Date())}
              className="ml-1 h-7 px-2 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50"
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-gray-600 flex-wrap">
          <LegendDot color="bg-emerald-500" label="Present (≥ 8h)" />
          <LegendDot color="bg-amber-500"   label="Halfday (≥ 4h)" />
          <LegendDot color="bg-red-500"     label="Absent (< 4h)" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="overflow-auto max-h-[calc(100vh-280px)] qt-board-scroll">
          <table className="text-xs border-collapse w-full">
            <thead className="sticky top-0 z-30 bg-gray-50">
              <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="sticky left-0 z-40 bg-gray-50 px-3 py-2 text-left w-14 border-b border-gray-200">S. No.</th>
                <th className="sticky left-14 z-40 bg-gray-50 px-3 py-2 text-left min-w-[180px] border-b border-gray-200">Member</th>
                <th className="px-3 py-2 text-left min-w-[150px] border-b border-gray-200 bg-gray-50">Period totals</th>
                {range.days.map((d) => (
                  <th
                    key={d.toISOString()}
                    className={`px-2 py-2 text-center whitespace-nowrap font-medium min-w-[80px] border-b border-gray-200 bg-gray-50 ${
                      isToday(d) ? "text-blue-700" : ""
                    }`}
                  >
                    <div>{d.toLocaleDateString(undefined, { month: "short", day: "2-digit" })}</div>
                    <div className="text-[9px] text-gray-400 font-normal">
                      ({d.toLocaleDateString(undefined, { weekday: "short" })})
                    </div>
                  </th>
                ))}
                <th className="sticky right-0 z-40 bg-gray-50 px-3 py-2 text-center w-12 border-b border-gray-200">Mail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3 + range.days.length + 1} className="px-3 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && allUsers.length === 0 && (
                <tr>
                  <td colSpan={3 + range.days.length + 1} className="px-3 py-10 text-center text-gray-400">
                    No members.
                  </td>
                </tr>
              )}
              {!loading && pageUsers.map((u, idx) => {
              const cells = gridQ.data?.cells?.[u.id] ?? {};
              const t = rowTotals[u.id] ?? { present: 0, halfday: 0, absent: 0 };
              return (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-gray-600 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="sticky left-14 z-10 bg-white px-3 py-2 text-gray-900 font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setDrawerUser({ id: u.id, label: u.label })}
                      className="text-blue-700 hover:underline focus:outline-none"
                      title="View time summary"
                    >
                      {u.label}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex items-center gap-1">
                      <CountPill color="emerald" value={t.present} />
                      <CountPill color="amber"   value={t.halfday} />
                      <CountPill color="red"     value={t.absent}  />
                    </div>
                  </td>
                  {range.days.map((d) => {
                    const k = dateKey(d);
                    const hours = cells[k]?.hours ?? 0;
                    const status = classify(hours, d);
                    const s = STATUS_STYLES[status];
                    const label =
                      status === "weekend"
                        ? ""
                        : status === "future"
                          ? "—"
                          : hours > 0
                            ? formatHours(hours)
                            : "0";
                    return (
                      <td key={k} className="px-1 py-1 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[58px] h-6 px-2 text-[11px] rounded-full border whitespace-nowrap ${s.bg} ${s.text} ${s.border}`}
                        >
                          {label}
                        </span>
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-white px-3 py-2 text-center">
                    <a
                      href={`mailto:${u.email}?subject=${encodeURIComponent(
                        `Timesheet — ${range.label}`,
                      )}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-blue-600 hover:bg-blue-50"
                      aria-label={`Email ${u.label}`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              );
            })}
            {hasMore && (
              <tr ref={sentinelRef}>
                <td colSpan={3 + range.days.length + 1} className="px-3 py-3 text-center text-[11px] text-gray-400">
                  Loading more…
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        {!loading && allUsers.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 text-[11px] text-gray-500 text-right tabular-nums">
            Showing {pageUsers.length} of {allUsers.length}
          </div>
        )}
      </div>

      {drawerUser && (
        <UserTimeDrawer
          userId={drawerUser.id}
          userLabel={drawerUser.label}
          from={range.from}
          to={range.to}
          rangeLabel={range.label}
          onClose={() => setDrawerUser(null)}
        />
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </span>
  );
}

function CountPill({ color, value }: { color: "emerald" | "amber" | "red"; value: number }) {
  const cls =
    color === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : color === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full border text-[11px] tabular-nums ${cls}`}>
      {value}
    </span>
  );
}
