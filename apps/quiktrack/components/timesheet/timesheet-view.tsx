"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Menu,
  MoreHorizontal,
  CheckSquare,
} from "lucide-react";
import {
  type Period,
  dateKey,
  formatHours,
  getPeriodRange,
  isToday,
  isWeekend,
  shiftAnchor,
} from "@/lib/utils/timesheetPeriod";
import { LogTimeModal } from "./log-time-modal";
import { WorklogPopover, type EntryDetail } from "./worklog-popover";
import { DeleteWorklogConfirm } from "./delete-worklog-confirm";
import { SplitWorklogModal } from "./split-worklog-modal";
import { TimesheetCell } from "./timesheet-cell";

type GroupBy = "user" | "project" | "issue" | "user-issue";

interface RowMeta {
  id: string;
  label: string;
  secondary?: string | null;
  parentId?: string | null;
  kind?: "user" | "issue" | "project";
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
  issue: "Work item",
  "user-issue": "User / Work item",
};

const GROUP_BY_LABEL: Record<GroupBy, string> = {
  user: "User",
  project: "Project",
  issue: "Work item",
  "user-issue": "User → Work item",
};

function formatDecimal(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const fixed = hours.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
}

function formatDayHeader(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function TimesheetView({
  projectId,
  groupBy: defaultGroupBy,
}: {
  projectId?: string;
  groupBy: GroupBy;
}) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const [groupBy, setGroupBy] = useState<GroupBy>(defaultGroupBy);
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [grid, setGrid] = useState<GridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState<Date | undefined>(undefined);
  const [logIssueId, setLogIssueId] = useState<string | undefined>(undefined);
  const [logIssueLabel, setLogIssueLabel] = useState<string | undefined>(undefined);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);

  const [popover, setPopover] = useState<{
    entryIds: string[];
    date: Date;
    issueId: string;
    issueLabel: string;
    anchor?: { top: number; left: number; width: number; height: number };
  } | null>(null);
  const [deleteState, setDeleteState] = useState<EntryDetail | null>(null);
  const [splitState, setSplitState] = useState<EntryDetail | null>(null);

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

  // Totals — in user-issue mode, skip child rows so parent + child don't double-count.
  const totalsByDate = useMemo(() => {
    const t: Record<string, number> = {};
    if (!grid) return t;
    for (const rowId of Object.keys(grid.cells)) {
      if (groupBy === "user-issue" && rowId.includes("::")) continue;
      for (const k of Object.keys(grid.cells[rowId]!)) {
        t[k] = (t[k] ?? 0) + (grid.cells[rowId]![k]!.hours ?? 0);
      }
    }
    return t;
  }, [grid, groupBy]);

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

  const grandTotal = useMemo(() => {
    if (!grid) return 0;
    let s = 0;
    for (const rowId of Object.keys(totalsByRow)) {
      if (groupBy === "user-issue" && rowId.includes("::")) continue;
      s += totalsByRow[rowId] ?? 0;
    }
    return s;
  }, [grid, totalsByRow, groupBy]);

  const capacity = useMemo(
    () => range.days.filter((d) => !isWeekend(d)).length * 8,
    [range.days],
  );

  const openLogFor = useCallback(
    (opts?: { date?: Date; issueId?: string; issueLabel?: string }) => {
      setLogDate(opts?.date);
      setLogIssueId(opts?.issueId);
      setLogIssueLabel(opts?.issueLabel);
      setEditEntryId(null);
      setLogOpen(true);
    },
    [],
  );

  function openPopover(opts: {
    entryIds: string[];
    date: Date;
    issueId: string;
    issueLabel: string;
    anchor?: { top: number; left: number; width: number; height: number };
  }) {
    setPopover(opts);
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ============================== Export helpers ==============================

  function exportRows(): string[][] {
    if (!grid) return [];
    const header = [
      "User",
      "Work Item",
      "Key",
      "Logged",
      ...range.days.map((d) => formatDayHeader(d)),
    ];
    const out: string[][] = [header];
    const userById = new Map<string, string>();
    for (const r of grid.rows) {
      if (groupBy === "user-issue" && !r.parentId) userById.set(r.id, r.label);
    }
    for (const row of grid.rows) {
      const isChild = Boolean(row.parentId);
      const rowData = grid.cells[row.id] ?? {};
      const user =
        groupBy === "user-issue"
          ? isChild
            ? userById.get(row.parentId ?? "") ?? ""
            : row.label
          : row.kind === "user"
          ? row.label
          : "";
      const workItem = isChild
        ? row.label
        : groupBy === "issue"
        ? row.label
        : groupBy === "user-issue"
        ? ""
        : row.label;
      const key = row.secondary ?? "";
      const logged = formatDecimal(totalsByRow[row.id] ?? 0);
      const dayCols = range.days.map((d) => {
        const c = rowData[dateKey(d)];
        return c ? formatDecimal(c.hours) : "";
      });
      out.push([user, workItem, key, logged, ...dayCols]);
    }
    const totalRow = [
      "Total",
      "",
      "",
      formatDecimal(grandTotal),
      ...range.days.map((d) => formatDecimal(totalsByDate[dateKey(d)] ?? 0)),
    ];
    out.push(totalRow);
    return out;
  }

  function downloadCsv() {
    const rows = exportRows();
    const lines = rows.map((r) => r.map(escapeCsv).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${range.from.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadXls() {
    const rows = exportRows();
    const html = `<table border="1">${rows
      .map(
        (r, i) =>
          `<tr>${r
            .map((c) =>
              i === 0
                ? `<th>${escapeHtml(c)}</th>`
                : `<td>${escapeHtml(c)}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("")}</table>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${range.from.toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
    const rows = exportRows();
    const win = window.open("", "_blank");
    if (!win) return;
    const html = `<!doctype html><html><head><title>Timesheet</title><style>
      body { font-family: -apple-system, sans-serif; padding: 16px; font-size: 12px; }
      h1 { font-size: 16px; margin: 0 0 12px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; }
      th { background: #f3f4f6; }
      tr:last-child td { font-weight: 600; background: #f9fafb; }
    </style></head><body>
      <h1>Timesheet — ${escapeHtml(range.label)}</h1>
      <table>${rows
        .map(
          (r, i) =>
            `<tr>${r
              .map((c) =>
                i === 0
                  ? `<th>${escapeHtml(c)}</th>`
                  : `<td>${escapeHtml(c)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("")}</table>
      <script>window.onload = () => window.print();</script>
    </body></html>`;
    win.document.write(html);
    win.document.close();
  }

  function printableView() {
    window.print();
  }

  async function downloadRawData() {
    const params = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    if (projectId) params.set("projectId", projectId);
    const res = await fetch(`/api/timesheets?${params.toString()}`).then((r) => r.json());
    if (!res?.success) return;
    type Raw = {
      id: string;
      entryDate: string;
      hours: number;
      description: string | null;
      project?: { name: string } | null;
      issue?: { key: string; title: string } | null;
    };
    const items: Raw[] = res.data ?? [];
    const header = ["Date", "Project", "Work Item", "Hours", "Description"];
    const lines = [header.join(",")];
    for (const e of items) {
      lines.push(
        [
          new Date(e.entryDate).toISOString().slice(0, 10),
          escapeCsv(e.project?.name ?? ""),
          escapeCsv(e.issue ? `${e.issue.key} ${e.issue.title}` : ""),
          String(e.hours),
          escapeCsv(e.description ?? ""),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-raw-${range.from.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================== Render ==============================

  const visibleRows = useMemo(
    () =>
      grid?.rows.filter((r) => !(r.parentId && collapsed.has(r.parentId))) ?? [],
    [grid, collapsed],
  );

  const showKeyColumn = groupBy === "issue" || groupBy === "user-issue";
  const fixedColumnCount = showKeyColumn ? 3 : 2;

  return (
    <div className="px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 border border-gray-300 rounded h-9 px-1">
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-2 inline-flex items-center text-sm font-medium text-gray-800 select-none">
              <span className="mr-1.5 text-gray-400">📅</span>
              {range.label}
            </div>
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <GroupByPills value={groupBy} onChange={setGroupBy} />
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-[11px] text-gray-500 px-1">
            Total{" "}
            <span className="font-semibold text-gray-800">{formatHours(grandTotal)}</span> of{" "}
            <span className="font-semibold text-gray-800">{capacity}h</span>
          </span>
          {/* <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded"
            aria-label="View options"
          >
            <Menu className="h-4 w-4" />
          </button> */}
          <PeriodSwitcher value={period} onChange={setPeriod} />
          <MoreMenu
            onCsv={downloadCsv}
            onXls={downloadXls}
            onPdf={downloadPdf}
            onPrintable={printableView}
            onRaw={() => void downloadRawData()}
          />
          <button
            type="button"
            onClick={() => openLogFor()}
            className="inline-flex items-center h-9 px-4 text-sm font-semibold text-white bg-blue-700 rounded hover:bg-blue-800"
          >
            Log Time
          </button>
        </div>
      </div>

      <div className="qt-timesheet-scroll overflow-x-scroll overflow-y-hidden border border-gray-200 rounded bg-white">
        <table className="min-w-full text-[11px]">
          <thead className="bg-white border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 sticky left-0 bg-white z-10 min-w-[260px]">
                {ROW_HEADER[groupBy]}
              </th>
              {showKeyColumn && (
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
                    {Array.from({ length: range.days.length + fixedColumnCount }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <span className="qt-shimmer block h-3 rounded" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {grid && grid.rows.length === 0 && (
              <tr>
                <td
                  colSpan={range.days.length + fixedColumnCount}
                  className="px-3 py-6 text-center text-gray-400"
                >
                  No time logged in this period.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => {
              const isChild = Boolean(row.parentId);
              const isParent =
                !isChild && (groupBy === "user-issue" || groupBy === "user");
              const issueIdForRow =
                groupBy === "user-issue" && isChild
                  ? row.id.split("::")[1] ?? row.id
                  : row.id;
              const editable =
                (groupBy === "user" && row.id === currentUserId) ||
                (groupBy === "user-issue" &&
                  isChild &&
                  row.parentId === currentUserId);
              const issueClickable =
                groupBy === "issue" || (groupBy === "user-issue" && isChild);
              const issueLabel = row.secondary
                ? `${row.secondary} · ${row.label}`
                : row.label;
              const isParentCollapsed = isParent && collapsed.has(row.id);

              return (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/70">
                  <td
                    className={`px-3 py-2 text-gray-900 sticky left-0 bg-white z-10 truncate max-w-[360px] ${
                      isChild ? "pl-10" : ""
                    }`}
                  >
                    {isParent && groupBy === "user-issue" ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapse(row.id)}
                        className="inline-flex items-center gap-2 text-left hover:text-blue-700"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            isParentCollapsed ? "-rotate-90" : ""
                          }`}
                        />
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
                          {(row.label || "U").trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="font-medium text-sm">{row.label}</span>
                      </button>
                    ) : isChild ? (
                      <span className="inline-flex items-center gap-2">
                        <CheckSquare className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="text-gray-800 text-sm truncate">{row.label}</span>
                      </span>
                    ) : (
                      <span>{row.label}</span>
                    )}
                  </td>
                  {showKeyColumn && (
                    <td className="px-3 py-1.5 text-blue-600 sticky bg-white z-10 font-medium">
                      {isChild ? row.secondary : !isParent ? row.secondary : ""}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-900 sticky bg-white z-10">
                    {formatDecimal(totalsByRow[row.id] ?? 0)}
                  </td>
                  {range.days.map((d) => {
                    const k = dateKey(d);
                    const cell = grid?.cells[row.id]?.[k];
                    const onOpenLog = (
                      anchor?: { top: number; left: number; width: number; height: number },
                    ) => {
                      if (cell && cell.entryIds.length > 0 && issueClickable) {
                        openPopover({
                          entryIds: cell.entryIds,
                          date: d,
                          issueId: issueIdForRow,
                          issueLabel,
                          anchor,
                        });
                      } else if (issueClickable) {
                        openLogFor({
                          date: d,
                          issueId: issueIdForRow,
                          issueLabel,
                        });
                      } else {
                        openLogFor({ date: d });
                      }
                    };
                    return (
                      <TimesheetCell
                        key={k}
                        cell={cell}
                        editable={editable}
                        date={d}
                        onChanged={refresh}
                        onOpenLog={onOpenLog}
                      />
                    );
                  })}
                </tr>
              );
            })}
            {grid && grid.rows.length > 0 && (
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td
                  colSpan={showKeyColumn ? 2 : 1}
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
          lockedIssueId={editEntryId ? undefined : logIssueId}
          lockedIssueLabel={editEntryId ? undefined : logIssueLabel}
          editEntryId={editEntryId ?? undefined}
          onClose={() => {
            setLogOpen(false);
            setEditEntryId(null);
          }}
          onLogged={() => {
            setLogOpen(false);
            setEditEntryId(null);
            void refresh();
          }}
        />
      )}
      {popover && (
        <WorklogPopover
          entryIds={popover.entryIds}
          date={popover.date}
          issueLabel={popover.issueLabel}
          anchor={popover.anchor}
          onChanged={() => void refresh()}
          onClose={() => setPopover(null)}
          onLog={() => {
            const opts = {
              date: popover.date,
              issueId: popover.issueId,
              issueLabel: popover.issueLabel,
            };
            setPopover(null);
            openLogFor(opts);
          }}
          onEdit={(entryId) => {
            setPopover(null);
            setEditEntryId(entryId);
            setLogIssueId(undefined);
            setLogIssueLabel(undefined);
            setLogDate(undefined);
            setLogOpen(true);
          }}
          onDelete={(entry) => {
            setPopover(null);
            setDeleteState(entry);
          }}
          onSplit={(entry) => {
            setPopover(null);
            setSplitState(entry);
          }}
        />
      )}
      {deleteState && (
        <DeleteWorklogConfirm
          entry={deleteState}
          onClose={() => setDeleteState(null)}
          onDeleted={() => {
            setDeleteState(null);
            void refresh();
          }}
        />
      )}
      {splitState && (
        <SplitWorklogModal
          entry={splitState}
          lockedProjectId={projectId}
          onClose={() => setSplitState(null)}
          onSplit={() => {
            setSplitState(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function GroupByPills({
  value,
  onChange,
}: {
  value: GroupBy;
  onChange: (g: GroupBy) => void;
}) {
  // Two pills act as the two levels of grouping; tapping pill 1 swaps to
  // single-level mode and pill 2 toggles into hierarchical user→issue.
  const primary: "user" | "project" | "issue" =
    value === "user-issue" ? "user" : (value as "user" | "project" | "issue");
  const isHierarchical = value === "user-issue";

  const [open1, setOpen1] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Group By</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen1((v) => !v)}
          className="inline-flex items-center gap-1 h-9 px-3 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          <span className="text-gray-400">1.</span> {primary === "user" ? "User" : primary === "project" ? "Project" : "Work Item"}
          <ChevronDown className="h-3 w-3 text-gray-500" />
        </button>
        {open1 && (
          <div className="absolute left-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
            {(["user", "issue"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  onChange(g === "user" && isHierarchical ? "user-issue" : g);
                  setOpen1(false);
                }}
                className={`w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 ${
                  g === primary ? "text-blue-700 bg-blue-50 font-medium" : "text-gray-700"
                }`}
              >
                {g === "user" ? "User" : "Work Item"}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange(isHierarchical ? primary : primary === "user" ? "user-issue" : "user-issue")
        }
        className={`inline-flex items-center gap-1 h-9 px-3 text-xs font-medium border rounded ${
          isHierarchical
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span className="text-gray-400">2.</span> Work Item
      </button>
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
  const LABEL: Record<Period, string> = { week: "Week", month: "Days", quarter: "Quarter" };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-9 px-3 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
      >
        {LABEL[value]}
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
              {LABEL[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MoreMenu({
  onCsv,
  onXls,
  onPdf,
  onPrintable,
  onRaw,
}: {
  onCsv: () => void;
  onXls: () => void;
  onPdf: () => void;
  onPrintable: () => void;
  onRaw: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded"
        aria-label="More"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
          <ExportRow
            badge="PDF"
            badgeClass="bg-red-100 text-red-700"
            label="PDF Summary"
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
          />
          <ExportRow
            badge="XLS"
            badgeClass="bg-emerald-100 text-emerald-700"
            label="XLS Report Data"
            onClick={() => {
              setOpen(false);
              onXls();
            }}
          />
          <ExportRow
            badge="CSV"
            badgeClass="bg-blue-100 text-blue-700"
            label="CSV Report Data"
            onClick={() => {
              setOpen(false);
              onCsv();
            }}
          />
          <ExportRow
            badge="PRT"
            badgeClass="bg-gray-200 text-gray-700"
            label="Printable View"
            onClick={() => {
              setOpen(false);
              onPrintable();
            }}
          />
          <ExportRow
            badge="RAW"
            badgeClass="bg-purple-100 text-purple-700"
            label="Download Raw Data"
            onClick={() => {
              setOpen(false);
              onRaw();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ExportRow({
  badge,
  badgeClass,
  label,
  onClick,
}: {
  badge: string;
  badgeClass: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50"
    >
      <span
        className={`inline-flex items-center justify-center text-[9px] font-bold w-8 h-4 rounded ${badgeClass}`}
      >
        {badge}
      </span>
      <span className="text-gray-700">{label}</span>
    </button>
  );
}
