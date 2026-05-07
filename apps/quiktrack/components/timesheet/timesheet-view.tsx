"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Plus,
} from "lucide-react";
import {
  type Period,
  dateKey,
  formatHours,
  getPeriodRange,
  isToday,
  isWeekend,
  parseDurationToHours,
  shiftAnchor,
} from "@/lib/utils/timesheetPeriod";
import { LogTimeModal } from "./log-time-modal";

type GroupBy = "user" | "project" | "issue";

interface RowMeta {
  id: string;
  label: string;
  secondary?: string | null;
  meta?: { color?: string | null; icon?: string | null; type?: string | null };
}
interface Cell {
  hours: number;
  entryIds: string[];
}
interface GridResponse {
  rows: RowMeta[];
  cells: Record<string, Record<string, Cell>>;
}

const ROW_HEADER: Record<GroupBy, string> = {
  user: "User",
  project: "Project",
  issue: "Issue",
};

/** Tempo-style decimal display: 1.5, 0.33, 8 — empty cells render as blank. */
function formatDecimal(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  // Two-decimal cap, but trim trailing zeros so "1.50" → "1.5", "8.00" → "8".
  const fixed = hours.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
}

/**
 * Shared timesheet grid. Used both inside a project (`groupBy="user"`,
 * rows = project members) and at the global level (`groupBy="project"`,
 * rows = projects in the tenant).
 *
 * Supports inline edit on cells the current user owns — typing a duration
 * (e.g. "2h 30m") and pressing Enter merges any existing entries for that
 * day/issue into one and stores the new total. Other users' rows are
 * read-only.
 */
export function TimesheetView({
  projectId,
  groupBy: defaultGroupBy,
}: {
  projectId?: string;
  groupBy: GroupBy;
}) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  // Group-by is locked to "issue" everywhere for now — the API + UI still
  // accept "user" and "project" if we surface a switcher again later.
  const [groupBy] = useState<GroupBy>(defaultGroupBy);
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [grid, setGrid] = useState<GridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState<Date | undefined>(undefined);

  const range = useMemo(() => getPeriodRange(period, anchor), [period, anchor]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        groupBy,
      });
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`/api/timesheets/grid?${params.toString()}`).then((r) => r.json());
      if (res?.success) setGrid(res.data);
      else setGrid({ rows: [], cells: {} });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, groupBy, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalsByDate = useMemo(() => {
    const t: Record<string, number> = {};
    if (!grid) return t;
    for (const rowId of Object.keys(grid.cells)) {
      for (const k of Object.keys(grid.cells[rowId]!)) {
        t[k] = (t[k] ?? 0) + (grid.cells[rowId]![k]!.hours ?? 0);
      }
    }
    return t;
  }, [grid]);

  const totalsByRow = useMemo(() => {
    const t: Record<string, number> = {};
    if (!grid) return t;
    for (const rowId of Object.keys(grid.cells)) {
      let s = 0;
      for (const k of Object.keys(grid.cells[rowId]!)) s += grid.cells[rowId]![k]!.hours ?? 0;
      t[rowId] = s;
    }
    return t;
  }, [grid]);

  const grandTotal = useMemo(
    () => Object.values(totalsByRow).reduce((s, h) => s + h, 0),
    [totalsByRow],
  );

  // Working-day capacity for the period — 8h × non-weekend days. Used for
  // the "Total X of Y" indicator in the toolbar (Tempo-style).
  const capacity = useMemo(
    () => range.days.filter((d) => !isWeekend(d)).length * 8,
    [range.days],
  );

  function exportCsv() {
    if (!grid) return;
    const lines: string[] = [];
    const header = ["Row", ...range.days.map((d) => dateKey(d)), "Total"];
    lines.push(header.join(","));
    for (const row of grid.rows) {
      const rowData = grid.cells[row.id] ?? {};
      const cols = range.days.map((d) => {
        const c = rowData[dateKey(d)];
        return c ? String(c.hours) : "";
      });
      lines.push([escapeCsv(row.label), ...cols, String(totalsByRow[row.id] ?? 0)].join(","));
    }
    const totalRow = ["TOTAL", ...range.days.map((d) => String(totalsByDate[dateKey(d)] ?? 0)), String(grandTotal)];
    lines.push(totalRow.join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-6 py-4">
      {/* Toolbar — Tempo-style: range navigator on the left, Group By in the
          middle, period + total + Log time on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
            className="h-7 w-7 inline-flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
            aria-label="Previous"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="px-2 h-7 inline-flex items-center text-xs font-medium text-gray-800 border border-gray-300 rounded">
            {range.label}
          </div>
          <button
            type="button"
            onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))}
            className="h-7 w-7 inline-flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"
            aria-label="Next"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="h-7 px-2.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Today
          </button>
        </div>


        <div className="flex items-center gap-2">
          <PeriodSwitcher value={period} onChange={setPeriod} />
          <span className="text-[11px] text-gray-500 px-2">
            Total Hours{" "}
            <span className="font-semibold text-gray-800">
              {formatHours(grandTotal)}
            </span>{" "}
            of <span className="font-semibold text-gray-800">{capacity}h</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setLogDate(undefined);
              setLogOpen(true);
            }}
            className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            <Plus className="h-3 w-3" />
            Log time
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
        </div>
      </div>

      {/* Grid — Tempo style: row identity (Issue / User / Project) + Key (when
          grouping by issue) + per-row Logged total + per-day cells. Sticky
          left rail keeps the row label visible while scrolling the days. */}
      <div className="overflow-x-auto border border-gray-200 rounded bg-white">
        <table className="min-w-full text-[11px]">
          <thead className="bg-white border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 sticky left-0 bg-white z-10 min-w-[220px]">
                {ROW_HEADER[groupBy]}
              </th>
              {groupBy === "issue" && (
                <th className="px-3 py-2 text-left font-medium text-gray-600 sticky bg-white z-10 min-w-[80px]">
                  Key
                </th>
              )}
              <th className="px-3 py-2 text-right font-medium text-gray-600 sticky bg-white z-10 min-w-[70px]">
                Logged
              </th>
              {range.days.map((d) => (
                <th
                  key={dateKey(d)}
                  className={`px-1.5 py-1.5 text-center font-medium border-l border-gray-100 min-w-[44px] ${
                    isWeekend(d) ? "text-gray-400 bg-gray-50/60" : "text-gray-600"
                  } ${isToday(d) ? "bg-rose-50 text-rose-700" : ""}`}
                >
                  <div className="text-[11px] font-semibold">
                    {String(d.getDate()).padStart(2, "0")}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider opacity-80">
                    {d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !grid && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-gray-100">
                    {Array.from({ length: range.days.length + (groupBy === "issue" ? 3 : 2) }).map(
                      (_, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <span className="qt-shimmer block h-3 rounded" />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </>
            )}
            {grid && grid.rows.length === 0 && (
              <tr>
                <td
                  colSpan={range.days.length + (groupBy === "issue" ? 3 : 2)}
                  className="px-3 py-6 text-center text-gray-400"
                >
                  No time logged in this period.
                </td>
              </tr>
            )}
            {grid?.rows.map((row) => {
              const editable = groupBy === "user" && row.id === currentUserId;
              return (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 hover:bg-gray-50/70"
                >
                  <td className="px-3 py-1.5 text-gray-900 sticky left-0 bg-white z-10 truncate max-w-[260px]">
                    {row.label}
                  </td>
                  {groupBy === "issue" && (
                    <td className="px-3 py-1.5 text-blue-600 sticky bg-white z-10 font-medium">
                      {row.secondary}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-900 sticky bg-white z-10">
                    {formatDecimal(totalsByRow[row.id] ?? 0)}
                  </td>
                  {range.days.map((d) => {
                    const k = dateKey(d);
                    const cell = grid.cells[row.id]?.[k];
                    return (
                      <Cell
                        key={k}
                        cell={cell}
                        editable={editable}
                        date={d}
                        rowId={row.id}
                        projectScope={projectId}
                        onChanged={refresh}
                      />
                    );
                  })}
                </tr>
              );
            })}
            {grid && grid.rows.length > 0 && (
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td
                  colSpan={groupBy === "issue" ? 2 : 1}
                  className="px-3 py-2 sticky left-0 bg-gray-50 z-10 font-semibold text-gray-700 text-[11px]"
                >
                  Total
                </td>
                <td className="px-3 py-2 text-right font-bold text-gray-900 sticky bg-gray-50 z-10">
                  {formatDecimal(grandTotal)}
                </td>
                {range.days.map((d) => (
                  <td
                    key={dateKey(d)}
                    className={`px-1.5 py-2 text-center font-semibold border-l border-gray-100 ${
                      isToday(d) ? "bg-rose-50 text-rose-700" : "text-gray-800"
                    } ${isWeekend(d) ? "bg-gray-100/60 text-gray-500" : ""}`}
                  >
                    {formatDecimal(totalsByDate[dateKey(d)] ?? 0)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {logOpen && (
        <LogTimeModal
          lockedProjectId={projectId}
          lockedDate={logDate}
          onClose={() => setLogOpen(false)}
          onLogged={() => {
            setLogOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function PeriodSwitcher({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-8 px-3 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
      >
        Display by: {value.charAt(0).toUpperCase() + value.slice(1)}
        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
          {(["week", "month", "quarter"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 ${
                p === value ? "text-blue-700 bg-blue-50 font-medium" : "text-gray-700"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({
  cell,
  editable,
  date,
  rowId: _rowId,
  projectScope: _projectScope,
  onChanged,
}: {
  cell: Cell | undefined;
  editable: boolean;
  date: Date;
  rowId: string;
  projectScope?: string;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const weekend = isWeekend(date);
  const today = isToday(date);

  async function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed) {
      // Empty input on a cell with entries → wipe them.
      if (cell && cell.entryIds.length > 0) {
        await Promise.all(
          cell.entryIds.map((id) =>
            fetch(`/api/timesheets/${id}`, { method: "DELETE" }).then((r) => r.json()),
          ),
        );
        await onChanged();
      }
      return;
    }
    const hours = parseDurationToHours(trimmed);
    if (hours === null || hours <= 0) return;
    if (cell && cell.entryIds.length === 1) {
      // Fast path: PATCH the single existing entry to the new total.
      await fetch(`/api/timesheets/${cell.entryIds[0]}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      }).then((r) => r.json());
      await onChanged();
      return;
    }
    // Multi-entry cells aren't safe to inline-edit (we'd lose the per-issue
    // breakdown), so we open the log-time modal instead.
    if (cell && cell.entryIds.length > 1) {
      window.alert("This day has multiple entries. Use Log time to add another.");
      return;
    }
    // No entries — open Log time pre-targeted to this date so the user can
    // pick the issue.
    window.dispatchEvent(
      new CustomEvent("qt-timesheet:log", { detail: { date: date.toISOString() } }),
    );
  }

  if (!editable) {
    return (
      <td
        className={`px-1.5 py-1.5 text-center text-gray-700 border-l border-gray-100 ${
          weekend ? "bg-gray-50/60" : ""
        } ${today ? "bg-rose-50/40" : ""}`}
      >
        {cell ? formatDecimal(cell.hours) : ""}
      </td>
    );
  }

  return (
    <td
      onClick={() => {
        if (editing) return;
        setDraft(cell ? formatDecimal(cell.hours) : "");
        setEditing(true);
      }}
      className={`px-1.5 py-1.5 text-center cursor-text hover:bg-blue-50 border-l border-gray-100 ${
        weekend ? "bg-gray-50/60" : ""
      } ${today ? "bg-rose-50/40" : ""}`}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft("");
              setEditing(false);
            }
          }}
          placeholder="0"
          className="w-full max-w-[44px] mx-auto h-6 px-1 text-[11px] text-center border border-blue-500 rounded focus:outline-none"
        />
      ) : cell ? (
        <span className="text-gray-900">{formatDecimal(cell.hours)}</span>
      ) : (
        <span className="text-gray-300"></span>
      )}
    </td>
  );
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
