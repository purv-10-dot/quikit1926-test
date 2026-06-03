"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CheckSquare,
  Columns,
  Folder,
  ListChecks,
  Search,
  X,
  Zap,
} from "lucide-react";

interface ActivityRow {
  id: string;
  projectId: string;
  kind: string;
  ref: string;
  title: string;
  meta: string | null;
  href: string;
  icon: string | null;
  color: string | null;
  viewedAt: string;
}

interface Response { success: boolean; data: ActivityRow[]; }

const KIND_ICONS: Record<string, { Icon: React.ComponentType<{ className?: string }>; color: string }> = {
  project: { Icon: Folder, color: "text-blue-500" },
  board: { Icon: Columns, color: "text-blue-600" },
  list: { Icon: ListChecks, color: "text-blue-500" },
  task: { Icon: CheckSquare, color: "text-blue-500" },
  epic: { Icon: Zap, color: "text-purple-500" },
  dashboard: { Icon: BarChart3, color: "text-emerald-600" },
};

function relativeBucket(now: Date, ts: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tsDay = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
  const diffDays = Math.floor((today.getTime() - tsDay.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Earlier this week";
  if (diffDays < 30) return "Earlier this month";
  return "Older";
}

function relativeAgo(ts: Date): string {
  const now = Date.now();
  const diffMs = now - ts.getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return ts.toLocaleDateString();
}

interface Props {
  /** Anchor element (the sidebar Recent row). The popover positions itself relative to this. */
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
}

export function RecentPopover({ anchorRef, open, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/activity?limit=30")
      .then((r) => r.json() as Promise<Response>)
      .then((res) => { if (res.success) setItems(res.data ?? []); })
      .catch(() => { /* best-effort */ })
      .finally(() => setLoading(false));
  }, [open]);

  // Position right of the anchor row, vertically aligned to its top.
  useEffect(() => {
    if (!open) return;
    function place() {
      const a = anchorRef.current;
      if (!a) return;
      const rect = a.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.right + 6 });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  // Outside-click + Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !pos) return null;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => i.title.toLowerCase().includes(q) || (i.meta ?? "").toLowerCase().includes(q))
    : items;

  // Group by relative time bucket while preserving the original (most-recent-first) ordering.
  const now = new Date();
  const groups: { label: string; rows: ActivityRow[] }[] = [];
  for (const row of filtered) {
    const bucket = relativeBucket(now, new Date(row.viewedAt));
    const last = groups[groups.length - 1];
    if (last && last.label === bucket) last.rows.push(row);
    else groups.push({ label: bucket, rows: [row] });
  }

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left }}
      className="z-[1000] w-80 rounded-lg border border-gray-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-900">Recent</span>
        <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            autoFocus
            placeholder="Search recent items"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-7 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto pb-1">
        {loading && items.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-400">Loading…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            {search ? "No matches" : "Nothing here yet"}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="pt-2">
            <p className="px-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{g.label}</p>
            {g.rows.map((row) => {
              const meta = KIND_ICONS[row.kind] ?? KIND_ICONS.project;
              const Icon = meta.Icon;
              return (
                <Link
                  key={row.id}
                  href={row.href}
                  onClick={onClose}
                  className="flex items-start gap-3 px-4 py-2 hover:bg-gray-50"
                >
                  <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-gray-100">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">{row.title}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {row.meta ? `${row.meta} · ` : ""}{relativeAgo(new Date(row.viewedAt))}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ListChecks className="h-3.5 w-3.5 text-gray-500" />
          View all recent items
        </Link>
      </div>
    </div>
  );
}
