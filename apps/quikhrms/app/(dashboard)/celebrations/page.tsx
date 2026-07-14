"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Cake, Gift, ChevronLeft, ChevronRight, User as UserIcon } from "lucide-react";
import { clsx } from "clsx";
import { withBasePath } from "@/lib/utils/base-path";
import { SkeletonCards } from "@/components/hrms/skeleton";

interface Person {
  id: string;
  name: string;
  profilePhoto: string | null;
  jobTitle: string | null;
  dateOfBirth: string | null;
  dateOfJoining: string | null;
}

type Filter = "all" | "birthdays" | "anniversaries";
type Event = { type: "birthday" | "anniversary"; person: Person; years?: number };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function CelebrationsPage() {
  return (
    <Suspense fallback={null}>
      <CelebrationsInner />
    </Suspense>
  );
}

function CelebrationsInner() {
  const api = useApiClient();
  const params = useSearchParams();
  const initial = (params?.get("tab") as Filter) || "all";
  const [filter, setFilter] = useState<Filter>(["all", "birthdays", "anniversaries"].includes(initial) ? initial : "all");

  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const { data, isLoading } = useQuery({
    queryKey: ["celebrations"],
    queryFn: () => api.get<Person[]>("/api/v1/hrms/employees/celebrations"),
  });
  const people = data?.data ?? [];

  // Index events for the visible month by day-of-month.
  const byDay = useMemo(() => {
    const map = new Map<number, Event[]>();
    const add = (day: number, ev: Event) => {
      const arr = map.get(day) ?? [];
      arr.push(ev);
      map.set(day, arr);
    };
    for (const p of people) {
      if ((filter === "all" || filter === "birthdays") && p.dateOfBirth) {
        const d = new Date(p.dateOfBirth);
        if (d.getMonth() === cursor.m) add(d.getDate(), { type: "birthday", person: p });
      }
      if ((filter === "all" || filter === "anniversaries") && p.dateOfJoining) {
        const d = new Date(p.dateOfJoining);
        const years = cursor.y - d.getFullYear();
        if (d.getMonth() === cursor.m && years > 0) add(d.getDate(), { type: "anniversary", person: p, years });
      }
    }
    return map;
  }, [people, filter, cursor]);

  const monthEvents = useMemo(() => {
    const out: { day: number; ev: Event }[] = [];
    for (const [day, evs] of byDay) for (const ev of evs) out.push({ day, ev });
    return out.sort((a, b) => a.day - b.day);
  }, [byDay]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const startWd = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const step = (dir: number) => setCursor((c) => {
    const m = c.m + dir;
    if (m < 0) return { y: c.y - 1, m: 11 };
    if (m > 11) return { y: c.y + 1, m: 0 };
    return { y: c.y, m };
  });

  const isToday = (day: number) => cursor.y === today.getFullYear() && cursor.m === today.getMonth() && day === today.getDate();

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Cake className="text-[#22c55e]" />
          <h1 className="text-page-title text-gray-900">Celebrations</h1>
        </div>
        <div className="inline-flex items-center rounded-lg border border-[var(--border)] overflow-hidden">
          {([["all", "All"], ["birthdays", "Birthdays"], ["anniversaries", "Anniversaries"]] as const).map(([k, label], i) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={clsx("px-3 py-2 text-sm", i > 0 && "border-l border-[var(--border)]", filter === k ? "bg-[#dcfce7] text-[#16a34a] font-semibold" : "text-gray-600 hover:bg-gray-50")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xl font-bold text-gray-900">{monthLabel}</div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })} className="px-3 h-9 rounded-lg border border-[var(--border)] text-sm font-medium text-gray-700 hover:bg-gray-50">Today</button>
          <button onClick={() => step(-1)} title="Previous month" className="inline-grid place-items-center w-9 h-9 rounded-lg border border-[var(--border)] text-gray-600 hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <button onClick={() => step(1)} title="Next month" className="inline-grid place-items-center w-9 h-9 rounded-lg border border-[var(--border)] text-gray-600 hover:bg-gray-50"><ChevronRight size={16} /></button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Calendar grid */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Weekday header */}
            <div className="grid grid-cols-7 bg-gray-50/70 border-b border-gray-100">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
                <div key={w} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">{w}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (day === null) return <div key={idx} className="min-h-[96px] border-b border-r border-gray-100 bg-gray-50/30" />;
                const evs = byDay.get(day) ?? [];
                const td = isToday(day);
                return (
                  <div key={idx} className={clsx("min-h-[96px] border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 transition-colors", td ? "bg-green-50/50" : "hover:bg-gray-50/60")}>
                    <div className="flex justify-end">
                      <span className={clsx("inline-grid place-items-center text-[11px] w-6 h-6 rounded-full", td ? "bg-[#16a34a] text-white font-bold shadow-sm" : "text-gray-500")}>{day}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {evs.slice(0, 2).map((e, i) => (
                        <span
                          key={i}
                          title={`${e.person.name}${e.years ? ` · ${e.years}-yr anniversary` : ""}`}
                          className={clsx(
                            "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                            e.type === "birthday" ? "bg-pink-50 text-pink-700 ring-1 ring-pink-100" : "bg-purple-50 text-purple-700 ring-1 ring-purple-100",
                          )}
                        >
                          {e.type === "birthday" ? <Cake size={10} className="shrink-0" /> : <Gift size={10} className="shrink-0" />}
                          <span className="truncate">{e.person.name.split(" ")[0]}{e.years ? ` ·${e.years}y` : ""}</span>
                        </span>
                      ))}
                      {evs.length > 2 && <span className="text-[10px] font-medium text-gray-400 pl-0.5">+{evs.length - 2} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 px-3 py-2.5 text-[11px] text-gray-500 border-t border-gray-100">
              <span className="inline-flex items-center gap-1.5"><Cake size={12} className="text-pink-500" /> Birthday</span>
              <span className="inline-flex items-center gap-1.5"><Gift size={12} className="text-purple-500" /> Work anniversary</span>
            </div>
          </div>

          {/* Month list */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <p className="text-sm font-bold text-gray-900 mb-3">This month · {monthEvents.length}</p>
            {monthEvents.length === 0 ? (
              <p className="text-sm text-gray-400">No celebrations this month.</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {monthEvents.map(({ day, ev }, i) => (
                  <Link key={i} href={`/employees/${ev.person.id}`} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-gray-50">
                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 grid place-items-center text-slate-400">
                      {ev.person.profilePhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={withBasePath(ev.person.profilePhoto)} alt="" className="w-full h-full object-cover" />
                      ) : <UserIcon size={15} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{ev.person.name}</p>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1">
                        {ev.type === "birthday"
                          ? <><Cake size={10} className="text-pink-500" /> Birthday</>
                          : <><Gift size={10} className="text-purple-500" /> {ev.years}-year anniversary</>}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-gray-400 tabular-nums shrink-0">{String(day).padStart(2, "0")} {new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-IN", { month: "short" })}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
