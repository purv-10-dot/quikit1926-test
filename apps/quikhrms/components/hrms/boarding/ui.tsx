"use client";

import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";

/**
 * Shared building blocks for the Pre-Onboarding / Onboarding / Offboarding
 * candidate-card views so all three stay visually identical.
 */

// Per-card accent theme, cycled by index for the multi-colour card look.
export const BOARDING_THEMES = [
  { dot: "bg-green-500",  avatar: "bg-green-100 text-green-700",   ring: "#22c55e", track: "#dcfce7", pill: "bg-green-50 text-green-700",   val: "text-green-600",  badge: "bg-green-50 text-green-700 ring-green-200" },
  { dot: "bg-blue-500",   avatar: "bg-blue-100 text-blue-700",     ring: "#3b82f6", track: "#dbeafe", pill: "bg-blue-50 text-blue-700",     val: "text-blue-600",   badge: "bg-blue-50 text-blue-700 ring-blue-200" },
  { dot: "bg-purple-500", avatar: "bg-purple-100 text-purple-700", ring: "#a855f7", track: "#f3e8ff", pill: "bg-purple-50 text-purple-700", val: "text-purple-600", badge: "bg-purple-50 text-purple-700 ring-purple-200" },
  { dot: "bg-orange-500", avatar: "bg-orange-100 text-orange-700", ring: "#f97316", track: "#ffedd5", pill: "bg-orange-50 text-orange-700", val: "text-orange-600", badge: "bg-orange-50 text-orange-700 ring-orange-200" },
  { dot: "bg-teal-500",   avatar: "bg-teal-100 text-teal-700",     ring: "#14b8a6", track: "#ccfbf1", pill: "bg-teal-50 text-teal-700",     val: "text-teal-600",   badge: "bg-teal-50 text-teal-700 ring-teal-200" },
  { dot: "bg-rose-500",   avatar: "bg-rose-100 text-rose-700",     ring: "#f43f5e", track: "#ffe4e6", pill: "bg-rose-50 text-rose-700",     val: "text-rose-600",   badge: "bg-rose-50 text-rose-700 ring-rose-200" },
];

export function spaceCase(s: string) { return (s ?? "").replace(/([a-z])([A-Z])/g, "$1 $2"); }

export function niceDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
}

export function ProgressRing({ pct, color, track }: { pct: number; color: string; track: string }) {
  const size = 38, stroke = 4, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-gray-700">{pct}%</span>
    </div>
  );
}

/** Small labelled dropdown chip used across the filter bar. */
export function FilterDropdown({
  id, label, icon: Icon, active, badge, openKey, setOpenKey, children,
}: {
  id: string; label: string; icon?: React.ElementType;
  active: boolean; badge?: number; openKey: string | null; setOpenKey: (k: string | null) => void;
  children: React.ReactNode;
}) {
  const open = openKey === id;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpenKey(open ? null : id)}
        className={clsx("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition",
          active ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}>
        {Icon && <Icon size={13} />} {label}
        {badge != null && <span className="px-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold">{badge}</span>}
        <ChevronDown size={12} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function RadioList({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-0.5">
      {options.map(([v, label]) => (
        <button key={v || "any"} type="button" onClick={() => onChange(v)}
          className={clsx("w-full text-left text-xs px-2 py-1.5 rounded transition",
            value === v ? "bg-green-50 text-green-700 font-medium" : "text-gray-700 hover:bg-gray-50")}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ActiveFilterRow({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-700 px-1">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-600 shrink-0">×</button>
    </div>
  );
}

export function CheckboxList({ options, selected, onToggle, empty }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void; empty?: string;
}) {
  if (options.length === 0) return <p className="text-[11px] text-gray-400 px-1 py-1">{empty ?? "No options"}</p>;
  return (
    <div className="space-y-1 max-h-52 overflow-y-auto">
      {options.map((d) => (
        <label key={d} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer px-1 py-1 rounded hover:bg-gray-50">
          <input type="checkbox" className="accent-green-600" checked={selected.includes(d)} onChange={() => onToggle(d)} />
          {d}
        </label>
      ))}
    </div>
  );
}
