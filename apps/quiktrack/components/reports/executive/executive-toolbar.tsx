"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, User as UserIcon, Save, RotateCcw, Calendar, ChevronDown, Check, Users, Layers } from "lucide-react";
import { FilterDropdown } from "../filter-dropdown";
import {
  DEFAULT_FILTERS,
  PRESET_GROUPS,
  type ExecutiveFilters,
  type ProjectMeta,
  type RangePreset,
} from "./types";

interface Props {
  filters: ExecutiveFilters;
  onChange: (next: ExecutiveFilters) => void;
  projectOptions: ProjectMeta[];
  teamOptions: { id: string; label: string }[];
  sprintOptions: { id: string; label: string }[];
  onSaveClick: () => void;
  filtersDirty: boolean;
  rangeLabel?: string;
}

interface MemberOption {
  id: string;
  label: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function ExecutiveToolbar({
  filters,
  onChange,
  projectOptions,
  teamOptions,
  sprintOptions,
  onSaveClick,
  filtersDirty,
  rangeLabel,
}: Props) {
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/search?limit=50")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const rows: Array<{ id: string; firstName: string | null; lastName: string | null; email: string }> =
          Array.isArray(j.data) ? j.data : [];
        setMemberOptions(
          rows.map((u) => ({
            id: u.id,
            label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(p: Partial<ExecutiveFilters>) {
    onChange({ ...filters, ...p });
  }

  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <RangePicker filters={filters} onChange={patch} rangeLabel={rangeLabel} />

          <span className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

          <FilterDropdown
            label="All Departments"
            icon={Users}
            value={filters.teamIds[0] ?? ""}
            onChange={(id) => patch({ teamIds: id ? [id] : [] })}
            options={teamOptions.map((t) => ({ value: t.id, label: t.label }))}
            minWidth={160}
          />

          <FilterDropdown
            label="All Projects"
            icon={Folder}
            value={filters.projectIds[0] ?? ""}
            onChange={(id) => patch({ projectIds: id ? [id] : [] })}
            options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
            minWidth={140}
          />

          <FilterDropdown
            label="All Sprints"
            icon={Layers}
            value={filters.sprintIds[0] ?? ""}
            onChange={(id) => patch({ sprintIds: id ? [id] : [] })}
            options={sprintOptions.map((s) => ({ value: s.id, label: s.label }))}
            minWidth={140}
          />

          <FilterDropdown
            label="All Employees"
            icon={UserIcon}
            value={filters.assigneeIds[0] ?? ""}
            onChange={(id) => patch({ assigneeIds: id ? [id] : [] })}
            options={memberOptions.map((m) => ({ value: m.id, label: m.label }))}
            minWidth={140}
          />

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange(DEFAULT_FILTERS)}
              disabled={!filtersDirty}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <button
              type="button"
              onClick={onSaveClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-600 text-white rounded-md hover:bg-accent-700"
            >
              <Save className="h-3.5 w-3.5" />
              Save view
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RangePicker({
  filters,
  onChange,
  rangeLabel,
}: {
  filters: ExecutiveFilters;
  onChange: (p: Partial<ExecutiveFilters>) => void;
  rangeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(preset: RangePreset) {
    const now = new Date();
    onChange({
      rangePreset: preset,
      year: preset.startsWith("specific-") ? now.getFullYear() : undefined,
      quarter: preset === "specific-quarter" ? currentQuarter(now) : undefined,
      month: preset === "specific-month" ? now.getMonth() + 1 : undefined,
      customFrom: preset === "custom" ? filters.customFrom ?? defaultCustomFrom() : undefined,
      customTo: preset === "custom" ? filters.customTo ?? isoDate(now) : undefined,
    });
    if (preset !== "specific-quarter" && preset !== "specific-month" && preset !== "specific-year" && preset !== "custom") {
      setOpen(false);
    }
  }

  const display = rangeLabel ?? presetLabel(filters);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium border rounded-md bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors ${
          open
            ? "border-accent-300 ring-2 ring-accent-100 dark:ring-accent-500/30"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        <Calendar className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
        <span className="truncate max-w-[260px]">{display}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 dark:text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-[440px] max-w-[92vw] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/5 overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto">
            {PRESET_GROUPS.map((group) => (
              <div key={group.heading} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                  {group.heading}
                </div>
                {group.items.map((item) => {
                  const active = filters.rangePreset === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => pick(item.value)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left transition-colors ${
                        active
                          ? "font-semibold text-accent-700 bg-accent-50 dark:!text-white dark:!bg-accent-600 hover:bg-accent-100 dark:hover:!bg-accent-500"
                          : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span>{item.label}</span>
                      {active && (
                        <Check className="h-3.5 w-3.5 text-accent-600 dark:!text-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <ConfigPanel filters={filters} onChange={onChange} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function ConfigPanel({
  filters,
  onChange,
  onDone,
}: {
  filters: ExecutiveFilters;
  onChange: (p: Partial<ExecutiveFilters>) => void;
  onDone: () => void;
}) {
  const preset = filters.rangePreset;
  const year = filters.year ?? new Date().getFullYear();

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = current + 1; y >= current - 6; y--) arr.push(y);
    return arr;
  }, []);

  if (preset === "specific-quarter") {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Pick a quarter
        </div>
        <div className="flex items-center gap-2">
          <YearSelect value={year} years={years} onChange={(y) => onChange({ year: y })} />
          <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
            {[1, 2, 3, 4].map((q) => {
              const active = filters.quarter === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => onChange({ quarter: q })}
                  className={`px-3 py-1.5 text-xs font-medium border-r border-gray-200 dark:border-gray-700 last:border-r-0 ${
                    active
                      ? "bg-accent-600 text-white"
                      : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  Q{q}
                </button>
              );
            })}
          </div>
          <DonePill onClick={onDone} />
        </div>
      </div>
    );
  }

  if (preset === "specific-month") {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pick a month</div>
        <div className="flex items-center gap-2 flex-wrap">
          <YearSelect value={year} years={years} onChange={(y) => onChange({ year: y })} />
          <select
            value={filters.month ?? new Date().getMonth() + 1}
            onChange={(e) => onChange({ month: Number(e.target.value) })}
            className="h-8 px-2 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <DonePill onClick={onDone} />
        </div>
      </div>
    );
  }

  if (preset === "specific-year") {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pick a year</div>
        <div className="flex items-center gap-2">
          <YearSelect value={year} years={years} onChange={(y) => onChange({ year: y })} />
          <DonePill onClick={onDone} />
        </div>
      </div>
    );
  }

  if (preset === "custom") {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Custom date range</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={filters.customFrom ?? ""}
            max={filters.customTo}
            onChange={(e) => onChange({ customFrom: e.target.value })}
            className="h-8 px-2 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={filters.customTo ?? ""}
            min={filters.customFrom}
            onChange={(e) => onChange({ customTo: e.target.value })}
            className="h-8 px-2 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
          />
          <DonePill onClick={onDone} disabled={!filters.customFrom || !filters.customTo} />
        </div>
      </div>
    );
  }

  return null;
}

function YearSelect({ value, years, onChange }: { value: number; years: number[]; onChange: (y: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 px-2 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

function DonePill({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ml-auto inline-flex items-center px-3 py-1 text-xs font-medium bg-accent-600 text-white rounded-md hover:bg-accent-700 disabled:opacity-40"
    >
      Done
    </button>
  );
}

function presetLabel(filters: ExecutiveFilters): string {
  switch (filters.rangePreset) {
    case "this-week": return "This week";
    case "last-week": return "Last week";
    case "this-month": return "This month";
    case "last-month": return "Last month";
    case "this-quarter": return "This quarter";
    case "last-quarter": return "Last quarter";
    case "this-year": return "This year";
    case "last-year": return "Last year";
    case "ytd": return "Year to date";
    case "last-30": return "Last 30 days";
    case "last-90": return "Last 90 days";
    case "last-180": return "Last 180 days";
    case "last-365": return "Last 12 months";
    case "specific-quarter": return `Q${filters.quarter ?? 1} ${filters.year ?? new Date().getFullYear()}`;
    case "specific-month": {
      const name = MONTH_NAMES[(filters.month ?? 1) - 1];
      return `${name} ${filters.year ?? new Date().getFullYear()}`;
    }
    case "specific-year": return String(filters.year ?? new Date().getFullYear());
    case "custom":
      if (filters.customFrom && filters.customTo) return `${filters.customFrom} → ${filters.customTo}`;
      return "Custom range";
  }
}

function currentQuarter(now: Date): 1 | 2 | 3 | 4 {
  const m = now.getMonth();
  if (m < 3) return 1;
  if (m < 6) return 2;
  if (m < 9) return 3;
  return 4;
}

function defaultCustomFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return isoDate(d);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
