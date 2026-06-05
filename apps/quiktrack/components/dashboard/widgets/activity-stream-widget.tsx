"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { List, AlignJustify, Rss, RotateCcw } from "lucide-react";
import { fetchActivity, type HistoryEntry } from "@/lib/utils/history";
import { SkeletonList } from "@/components/skeleton";

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86_400_000;
  const diff = Math.floor((startToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / dayMs);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return `${dayLabel(ts)} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function ActivityStreamWidget({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    void fetchActivity(20).then((r) => setRows(r));
  }, [refreshKey]);

  const groups = useMemo(() => {
    if (!rows) return [] as { day: string; items: HistoryEntry[] }[];
    const m = new Map<string, HistoryEntry[]>();
    for (const r of rows) {
      const key = dayLabel(r.ts);
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return Array.from(m.entries()).map(([day, items]) => ({ day, items }));
  }, [rows]);

  if (rows === null) {
    return (
      <div className="p-4">
        <SkeletonList rows={5} withAvatar />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <h4 className="text-base font-semibold text-gray-900">Your Company QuikTrack</h4>
        {/* <div className="flex items-center gap-1 text-blue-600">
          <button
            type="button"
            className="p-1 rounded bg-blue-50 hover:bg-blue-100"
            aria-label="Card view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-blue-50"
            aria-label="List view"
          >
            <AlignJustify className="h-4 w-4 text-gray-500" />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-orange-50"
            aria-label="RSS feed"
          >
            <Rss className="h-4 w-4 text-orange-500" />
          </button>
        </div> */}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 pb-5 text-sm text-gray-400 text-center">
          No activity yet.
        </div>
      ) : (
        <div className="border-t border-gray-100">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-700 border-b border-gray-100">
                {g.day}
              </div>
              <ul>
                {g.items.map((r) => (
                  <li key={r.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <span
                        className="h-8 w-8 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shrink-0"
                        style={{ background: r.color ?? "#2563eb" }}
                      >
                        {(r.title.charAt(0) || "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-800">
                          <Link
                            href={r.href}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {r.title}
                          </Link>
                          {r.meta && <span className="text-gray-700"> {r.meta}</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-3 w-3 rounded-sm bg-blue-500" />
                            {timeLabel(r.ts)}
                          </span>
                          <Link href={r.href} className="text-blue-600 hover:underline">
                            Comment
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="px-4 py-3 border-t border-gray-100">
            <button
              type="button"
              className="w-full h-8 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Show more...
            </button>
          </div>
        </div>
      )}
      <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500 inline-flex items-center gap-1">
        <RotateCcw className="h-3 w-3" />
        Last refreshed just now
      </div>
    </div>
  );
}
