"use client";

import type React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

export type Granularity = "day" | "week" | "month";

export type SortKey =
  | "name"
  | "status"
  | "expected"
  | "spent"
  | "estimated"
  | "overshot"
  | "utilization"
  | "overshotPct";
export type SortDir = "asc" | "desc";

export function SortableHeader({
  label,
  sortKey,
  current,
  dir,
  onChange,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onChange: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = current === sortKey;
  const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onChange(sortKey)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-gray-900" : "text-gray-500 hover:text-gray-800"}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
      </button>
    </th>
  );
}

export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeRange(granularity: Granularity, anchor: Date): { from: string; to: string } {
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (granularity === "day") return { from: toDateInput(a), to: toDateInput(a) };
  if (granularity === "week") {
    const day = a.getDay();
    const diffToMon = (day + 6) % 7;
    const from = new Date(a);
    from.setDate(a.getDate() - diffToMon);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toDateInput(from), to: toDateInput(to) };
  }
  const from = new Date(a.getFullYear(), a.getMonth(), 1);
  const to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  return { from: toDateInput(from), to: toDateInput(to) };
}

export function formatHhMm(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function formatPct(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0%";
  return `${Math.round(p)}%`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarTint(name: string): string {
  const palette = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
    "bg-indigo-100 text-indigo-700",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

type Tone = "blue" | "emerald" | "amber" | "rose" | "gray";

export function KpiCard({
  icon,
  tone,
  label,
  value,
  hint,
  progressPct,
}: {
  icon: React.ReactNode;
  tone: Tone;
  label: string;
  value: string;
  hint?: string;
  progressPct?: number;
}) {
  const iconClass = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    gray: "bg-gray-100 text-gray-500",
  }[tone];
  const barClass = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    gray: "bg-gray-400",
  }[tone];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-gray-400">{hint}</div>}
      {typeof progressPct === "number" && (
        <div className="mt-2 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full ${barClass} transition-all`}
            style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function StatusPill({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Filled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-600">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      Not filled
    </span>
  );
}

export function ResourceTableRow({
  row,
  index,
  onOpen,
}: {
  row: {
    userId: string;
    name: string;
    timesheetFilled: boolean;
    expectedHours: number;
    spentHours: number;
    estimatedHours: number;
    overshotHours: number;
    utilizationPct: number;
    overshotPct: number;
  };
  index: number;
  onOpen: (id: string, label: string) => void;
}) {
  return (
    <tr className="border-t border-gray-100 hover:bg-blue-50/30 transition-colors">
      <td className="px-4 py-2.5 text-gray-400 tabular-nums">{index + 1}</td>
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => onOpen(row.userId, row.name)}
          className="group inline-flex items-center gap-2.5 text-left"
        >
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${avatarTint(row.name)}`}
          >
            {initials(row.name)}
          </span>
          <span className="text-gray-900 font-medium group-hover:text-blue-700 group-hover:underline">
            {row.name}
          </span>
        </button>
      </td>
      <td className="px-4 py-2.5"><StatusPill filled={row.timesheetFilled} /></td>
      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{formatHhMm(row.expectedHours)}</td>
      <td className="px-4 py-2.5 text-right text-gray-900 font-medium tabular-nums">{formatHhMm(row.spentHours)}</td>
      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{formatHhMm(row.estimatedHours)}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.overshotHours > 0 ? "text-rose-600" : "text-gray-400"}`}>
        {formatHhMm(row.overshotHours)}
      </td>
      <td className="px-4 py-2.5"><UtilisationBar pct={row.utilizationPct} /></td>
      <td className={`px-4 py-2.5 text-right tabular-nums ${row.overshotPct > 0 ? "text-rose-600 font-medium" : "text-gray-400"}`}>
        {formatPct(row.overshotPct)}
      </td>
    </tr>
  );
}

export function UtilisationBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const tone = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct > 0 ? "bg-amber-500" : "bg-gray-200";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-600 w-10 text-right">{formatPct(pct)}</span>
    </div>
  );
}
