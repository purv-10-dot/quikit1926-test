"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Menu,
  MoreHorizontal,
  CheckSquare,
  Filter,
  Search,
  X,
  CalendarClock,
  Plus,
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
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { showToast } from "@/lib/ui/toast";
import { CopyWeekModal, type CopyWeekPreview } from "./copy-week-modal";

type GroupBy = "user" | "project" | "issue" | "user-issue" | "epic-issue";

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
  // True only for app admins / the project's Space Admin — they may see every
  // member's data. Everyone else is scoped to their own entries server-side.
  canSeeAll?: boolean;
}

interface FilterOption {
  id: string;
  label: string;
}

const ROW_HEADER: Record<GroupBy, string> = {
  user: "User",
  project: "Project",
  issue: "Work item",
  "user-issue": "User / Work item",
  "epic-issue": "Epic / Work item",
};

const GROUP_BY_LABEL: Record<GroupBy, string> = {
  user: "User",
  project: "Project",
  issue: "Work item",
  "user-issue": "User → Work item",
  "epic-issue": "Epic → Work item",
};

// Two-level hierarchy modes: a parent dimension over a Work-item leaf. Several
// render/total branches treat these identically (parent header + child rows).
function isHierarchyMode(g: GroupBy): boolean {
  return g === "user-issue" || g === "epic-issue";
}

// Fixed pixel widths for the frozen left-rail columns. They must be exact (not
// min/max) so the cumulative `left` offsets line up the sticky columns.
const FZ_NAME_W = 260;
const FZ_KEY_W = 90;
const FZ_LOGGED_W = 80;
// Soft edge shadow on the rightmost frozen column so scrolling content reads as
// sliding underneath the pinned rail.
const FZ_SHADOW = "shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]";

// Raw decimal — used by CSV/XLS/PDF exports so spreadsheet formulas can still sum.
function formatDecimal(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const fixed = hours.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
}

// On-screen display — "Xh Ym", matching the header total. Empty when zero.
function formatDisplay(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  return formatHours(hours);
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

  // Logging time creates a Timesheet entry, so gate every "log" affordance on
  // Timesheet:create. A read-only Viewer keeps Timesheet:view (sees the grid)
  // but loses the Log Time button and click-to-log. Edit/delete of entries are
  // owner-only and the server enforces both, so this is purely the UI gate.
  // In the space-scoped view `projectId` is set; the global view is admin-only,
  // where useMyProjectPermissions reports isAdmin → all granted.
  const perms = useMyProjectPermissions(projectId);
  const canLogTime = perms.loading || perms.has("Timesheet", "create");

  const [groupBy, setGroupBy] = useState<GroupBy>(defaultGroupBy);
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [grid, setGrid] = useState<GridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Filters — applied server-side so the grid totals stay consistent.
  const [userFilter, setUserFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<FilterOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<FilterOption[]>([]);

  const [logOpen, setLogOpen] = useState(false);
  const [copyingWeek, setCopyingWeek] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyPreview, setCopyPreview] = useState<CopyWeekPreview | null>(null);
  const [logDate, setLogDate] = useState<Date | undefined>(undefined);
  const [logIssueId, setLogIssueId] = useState<string | undefined>(undefined);
  const [logIssueLabel, setLogIssueLabel] = useState<string | undefined>(undefined);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  // Issue edit drawer opened by clicking a work-item key. Only wired in the
  // space-scoped view (projectId set) — EditIssueModal needs a project to load
  // its statuses/members/sprints.
  const [editIssueId, setEditIssueId] = useState<string | null>(null);

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
  // "Copy last week" only makes sense on the week you're actually in — hide it
  // when navigating to other weeks (and outside the weekly view).
  const viewingCurrentWeek = useMemo(() => {
    const now = Date.now();
    return period === "week" && range.from.getTime() <= now && now <= range.to.getTime();
  }, [period, range]);
  // ISO-ish week number of the viewed range start (for the "WK NN" badge).
  const weekNumber = useMemo(() => {
    const d = range.from;
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(
      (((d.getTime() - startOfYear.getTime()) / 86_400_000) + startOfYear.getDay() + 1) / 7,
    );
  }, [range]);

  // Only app admins / a project's Space Admin may pick other users — everyone
  // else is scoped to their own data server-side, so the per-user filter would
  // do nothing. `isAdmin` is known immediately; Space Admin comes back on the grid.
  const canSeeAllUsers = perms.isAdmin || Boolean(grid?.canSeeAll);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        groupBy,
      });
      if (projectId) params.set("projectId", projectId);
      if (userFilter.length > 0) params.set("userIds", userFilter.join(","));
      if (!projectId && projectFilter.length > 0)
        params.set("projectIds", projectFilter.join(","));
      const res = await fetch(`/api/timesheets/grid?${params.toString()}`).then((r) => r.json());
      if (res?.success) setGrid(res.data);
      else setGrid({ rows: [], cells: {} });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, groupBy, projectId, userFilter, projectFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Load filter option lists once. Projects are skipped in the space-scoped
  // view (it's already locked to a single project).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [users, projects] = await Promise.all([
        fetch("/api/org/users").then((r) => r.json()).catch(() => null),
        projectId
          ? Promise.resolve(null)
          : fetch("/api/projects").then((r) => r.json()).catch(() => null),
      ]);
      if (cancelled) return;
      if (users?.success && Array.isArray(users.data)) {
        setUserOptions(
          users.data.map((u: { userId: string; firstName?: string; lastName?: string; email: string }) => ({
            id: u.userId,
            label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
          })),
        );
      }
      if (projects?.success && Array.isArray(projects.data)) {
        setProjectOptions(
          projects.data.map((p: { id: string; name: string }) => ({ id: p.id, label: p.name })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Totals — in a hierarchy mode, skip child rows so parent + child don't double-count.
  const totalsByDate = useMemo(() => {
    const t: Record<string, number> = {};
    if (!grid) return t;
    for (const rowId of Object.keys(grid.cells)) {
      if (isHierarchyMode(groupBy) && rowId.includes("::")) continue;
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
      if (isHierarchyMode(groupBy) && rowId.includes("::")) continue;
      s += totalsByRow[rowId] ?? 0;
    }
    return s;
  }, [grid, totalsByRow, groupBy]);

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

  const copyBody = () => ({
    weekStart: range.from.toISOString(),
    weekEnd: range.to.toISOString(),
    projectId: projectId ?? null,
  });

  // Open the confirm dialog with a dry-run preview (what will copy / be kept /
  // wait) — no writes yet.
  async function openCopyModal() {
    setCopyOpen(true);
    setCopyLoading(true);
    setCopyPreview(null);
    try {
      const res = await fetch("/api/timesheets/copy-previous-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...copyBody(), preview: true }),
      }).then((r) => r.json());
      if (res?.success) setCopyPreview(res.data as CopyWeekPreview);
      else {
        showToast(res?.error ?? "Couldn't check last week.", "error");
        setCopyOpen(false);
      }
    } catch {
      showToast("Couldn't check last week.", "error");
      setCopyOpen(false);
    } finally {
      setCopyLoading(false);
    }
  }

  // Confirmed → actually copy.
  async function doCopyWeek() {
    if (copyingWeek) return;
    setCopyingWeek(true);
    try {
      const res = await fetch("/api/timesheets/copy-previous-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copyBody()),
      }).then((r) => r.json());
      if (!res?.success) {
        showToast(res?.error ?? "Couldn't copy last week.", "error");
        return;
      }
      const created: number = res.data?.created ?? 0;
      setCopyOpen(false);
      if (created > 0) {
        showToast(`Copied ${created} ${created === 1 ? "entry" : "entries"} from last week.`, "success");
        await refresh();
      } else {
        showToast("Nothing to copy up to today.", "info");
      }
    } catch {
      showToast("Couldn't copy last week.", "error");
    } finally {
      setCopyingWeek(false);
    }
  }

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
      "Work item",
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

  // ============================== Render ==============================

  const visibleRows = useMemo(
    () =>
      grid?.rows.filter((r) => !(r.parentId && collapsed.has(r.parentId))) ?? [],
    [grid, collapsed],
  );

  const showKeyColumn = groupBy === "issue" || isHierarchyMode(groupBy);
  const fixedColumnCount = showKeyColumn ? 3 : 2;
  // Cascade-freeze: the left rail (User/Work item, Key, Logged) is pinned with
  // fixed widths + cumulative left offsets so day columns scroll underneath.
  const loggedLeft = FZ_NAME_W + (showKeyColumn ? FZ_KEY_W : 0);
  const railWidth = loggedLeft; // width of the merged "Total" label cell

  return (
    <div className="px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        {/* Left — week navigation */}
        <div className="inline-flex items-center gap-1 border border-gray-300 rounded h-9 px-1">
          <button
            type="button"
            onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="px-2 inline-flex items-center gap-2 text-sm font-medium text-gray-800 select-none">
            {period === "week" && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                WK {weekNumber}
              </span>
            )}
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

        {/* Right — view controls + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <GroupByDropdown
            value={groupBy}
            onChange={setGroupBy}
            hideProject={Boolean(projectId)}
          />
          {canSeeAllUsers && (
            <MultiSelectFilter
              icon={<Filter className="h-3.5 w-3.5 text-gray-500" />}
              label="User"
              options={userOptions}
              selected={userFilter}
              onChange={setUserFilter}
              emptyHint="No users available"
            />
          )}
          {!projectId && (
            <MultiSelectFilter
              label="Project"
              options={projectOptions}
              selected={projectFilter}
              onChange={setProjectFilter}
              emptyHint="No projects available"
            />
          )}
          {(userFilter.length > 0 || projectFilter.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setUserFilter([]);
                setProjectFilter([]);
              }}
              className="inline-flex items-center gap-1 h-9 px-2 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}

          <span className="h-6 w-px bg-gray-200" aria-hidden />

          {canLogTime && viewingCurrentWeek && (
            <button
              type="button"
              onClick={openCopyModal}
              title="Copy last week's entries into this week, up to today"
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              <CalendarClock className="h-4 w-4 text-gray-500" />
              Copy last week
            </button>
          )}
          {canLogTime && (
            <button
              type="button"
              onClick={() => openLogFor()}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white bg-blue-700 rounded hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              Log time
            </button>
          )}
          <MoreMenu
            onCsv={downloadCsv}
            onXls={downloadXls}
            onPdf={downloadPdf}
            period={period}
            onPeriodChange={setPeriod}
          />
        </div>
      </div>

      <div className="qt-timesheet-scroll overflow-x-scroll overflow-y-hidden border border-gray-200 rounded bg-white">
        <table className="min-w-full text-[11px]">
          <thead className="bg-white border-b border-gray-200">
            <tr>
              <th
                className="px-3 py-2 text-left font-medium text-gray-600 sticky left-0 bg-white z-30"
                style={{ width: FZ_NAME_W, minWidth: FZ_NAME_W }}
              >
                {ROW_HEADER[groupBy]}
              </th>
              {showKeyColumn && (
                <th
                  className="px-3 py-2 text-left font-medium text-gray-600 sticky bg-white z-30"
                  style={{ left: FZ_NAME_W, width: FZ_KEY_W, minWidth: FZ_KEY_W }}
                >
                  Key
                </th>
              )}
              <th
                className={`px-3 py-2 text-right font-medium text-gray-600 sticky bg-white z-30 ${FZ_SHADOW}`}
                style={{ left: loggedLeft, width: FZ_LOGGED_W, minWidth: FZ_LOGGED_W }}
              >
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
                !isChild && (isHierarchyMode(groupBy) || groupBy === "user");
              const issueIdForRow =
                isHierarchyMode(groupBy) && isChild
                  ? row.id.split("::")[1] ?? row.id
                  : row.id;
              const editable =
                (groupBy === "user" && row.id === currentUserId) ||
                (groupBy === "user-issue" &&
                  isChild &&
                  row.parentId === currentUserId);
              const issueClickable =
                groupBy === "issue" || (isHierarchyMode(groupBy) && isChild);
              // Parent (aggregate) rows in a hierarchy view are just collapsible
              // headers — their cells shouldn't open the log modal.
              const aggregateRow = isHierarchyMode(groupBy) && isParent;
              const issueLabel = row.secondary
                ? `${row.secondary} · ${row.label}`
                : row.label;
              const isParentCollapsed = isParent && collapsed.has(row.id);

              return (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/70">
                  <td
                    className={`px-3 py-2 text-gray-900 sticky left-0 bg-white z-20 truncate ${
                      isChild ? "pl-10" : ""
                    }`}
                    style={{ width: FZ_NAME_W, minWidth: FZ_NAME_W, maxWidth: FZ_NAME_W }}
                  >
                    {isParent && isHierarchyMode(groupBy) ? (
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
                        {groupBy === "user-issue" && (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
                            {(row.label || "U").trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                        <ClippedLabel text={row.label} className="font-medium text-sm" />
                      </button>
                    ) : isChild ? (
                      <span className="flex items-center gap-2 min-w-0">
                        <CheckSquare className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <ClippedLabel text={row.label} className="text-gray-800 text-sm" />
                      </span>
                    ) : (
                      <ClippedLabel text={row.label} />
                    )}
                  </td>
                  {showKeyColumn && (
                    <td
                      className="px-3 py-1.5 text-blue-600 sticky bg-white z-20 font-medium truncate"
                      style={{ left: FZ_NAME_W, width: FZ_KEY_W, minWidth: FZ_KEY_W, maxWidth: FZ_KEY_W }}
                    >
                      {(() => {
                        const keyText = isChild
                          ? row.secondary
                          : !isParent
                            ? row.secondary
                            : "";
                        if (!keyText) return "";
                        // Clicking the key opens the issue edit drawer. Needs a
                        // project context, so it's a link only in the
                        // space-scoped timesheet.
                        if (projectId && issueIdForRow) {
                          return (
                            <button
                              type="button"
                              onClick={() => setEditIssueId(issueIdForRow)}
                              className="hover:underline"
                              title="Open issue"
                            >
                              {keyText}
                            </button>
                          );
                        }
                        return keyText;
                      })()}
                    </td>
                  )}
                  <td
                    className={`px-3 py-1.5 text-right font-semibold text-gray-900 sticky bg-white z-20 ${FZ_SHADOW}`}
                    style={{ left: loggedLeft, width: FZ_LOGGED_W, minWidth: FZ_LOGGED_W }}
                  >
                    {formatDisplay(totalsByRow[row.id] ?? 0)}
                  </td>
                  {range.days.map((d) => {
                    const k = dateKey(d);
                    const cell = grid?.cells[row.id]?.[k];
                    // Existing entries are always viewable; the create paths are
                    // gated on canLogTime so a read-only Viewer can browse but
                    // not log.
                    const hasViewableEntries = Boolean(
                      cell && cell.entryIds.length > 0 && issueClickable,
                    );
                    const onOpenLog = (
                      anchor?: { top: number; left: number; width: number; height: number },
                    ) => {
                      if (hasViewableEntries) {
                        openPopover({
                          entryIds: cell!.entryIds,
                          date: d,
                          issueId: issueIdForRow,
                          issueLabel,
                          anchor,
                        });
                      } else if (!canLogTime) {
                        // Read-only: nothing to view, can't create.
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
                    // Drop the click affordance entirely when there's nothing to
                    // view and the user can't log — otherwise the cell looks
                    // clickable but does nothing.
                    const cellInteractive =
                      !aggregateRow && (hasViewableEntries || canLogTime);
                    return (
                      <TimesheetCell
                        key={k}
                        cell={cell}
                        editable={editable && canLogTime}
                        date={d}
                        onChanged={refresh}
                        onOpenLog={cellInteractive ? onOpenLog : undefined}
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
                  className="px-3 py-2 sticky left-0 bg-gray-50 z-20 font-semibold text-gray-700 text-[11px]"
                  style={{ width: railWidth, minWidth: railWidth }}
                >
                  Total
                </td>
                <td
                  className={`px-3 py-2 text-right font-bold text-gray-900 sticky bg-gray-50 z-20 ${FZ_SHADOW}`}
                  style={{ left: loggedLeft, width: FZ_LOGGED_W, minWidth: FZ_LOGGED_W }}
                >
                  {formatDisplay(grandTotal)}
                </td>
                {range.days.map((d) => (
                  <td
                    key={dateKey(d)}
                    className={`px-1.5 py-2 text-center font-semibold border-l border-gray-100 ${
                      isToday(d) ? "bg-rose-50 text-rose-700" : "text-gray-800"
                    } ${isWeekend(d) ? "bg-gray-100/60 text-gray-500" : ""}`}
                  >
                    {formatDisplay(totalsByDate[dateKey(d)] ?? 0)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CopyWeekModal
        open={copyOpen}
        loading={copyLoading}
        preview={copyPreview}
        busy={copyingWeek}
        onCancel={() => setCopyOpen(false)}
        onConfirm={doCopyWeek}
      />

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
      {projectId && (
        <EditIssueModal
          open={editIssueId !== null}
          issueId={editIssueId}
          projectId={projectId}
          onClose={() => setEditIssueId(null)}
          onSaved={() => void refresh()}
        />
      )}
      {popover && (
        <WorklogPopover
          entryIds={popover.entryIds}
          date={popover.date}
          issueLabel={popover.issueLabel}
          anchor={popover.anchor}
          canLog={canLogTime}
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

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  icon,
  emptyHint,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  icon?: ReactNode;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const count = selected.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium border rounded ${
          count > 0
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        {icon}
        {label}
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
            {count}
          </span>
        )}
        <ChevronDown className="h-3 w-3 text-gray-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
            <div className="px-2 pb-1.5 pt-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  className="w-full h-7 pl-7 pr-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">
                  {options.length === 0 ? emptyHint ?? "No options" : "No matches"}
                </div>
              ) : (
                filtered.map((o) => {
                  const checked = selected.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50"
                    >
                      <span
                        className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded border ${
                          checked ? "bg-blue-600 border-blue-600" : "border-gray-300"
                        }`}
                      >
                        {checked && <CheckSquare className="h-3 w-3 text-white" />}
                      </span>
                      <span className="text-gray-700 truncate">{o.label}</span>
                    </button>
                  );
                })
              )}
            </div>
            {count > 0 && (
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="w-full px-3 py-1.5 text-xs text-left text-gray-500 hover:bg-gray-50"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Grouping dimensions offered in the dropdown. Work item is the always-on leaf;
// User or Epic can sit above it as a two-level hierarchy. Project is exclusive
// (single-dimension) and only offered in the global timesheet.
const GROUP_DIMENSIONS: { key: "user" | "epic" | "issue" | "project"; label: string }[] = [
  { key: "user", label: "User" },
  { key: "epic", label: "Epic" },
  { key: "issue", label: "Work item" },
  { key: "project", label: "Project" },
];

function groupByToKeys(value: GroupBy): Set<string> {
  if (value === "user-issue") return new Set(["user", "issue"]);
  if (value === "epic-issue") return new Set(["epic", "issue"]);
  return new Set([value]);
}

function GroupByDropdown({
  value,
  onChange,
  hideProject = false,
}: {
  value: GroupBy;
  onChange: (g: GroupBy) => void;
  /** Space-scoped view: grouping by Project inside one project is meaningless. */
  hideProject?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = groupByToKeys(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Work item is always the leaf. User / Epic are mutually-exclusive parents
  // over it; Project is its own exclusive grouping.
  function toggle(key: "user" | "epic" | "issue" | "project") {
    if (key === "project") return onChange("project");
    if (key === "issue") return onChange("issue"); // collapse to work-item-only
    if (key === "user") return onChange(value === "user-issue" ? "issue" : "user-issue");
    if (key === "epic") return onChange(value === "epic-issue" ? "issue" : "epic-issue");
  }

  // Work item is the implicit always-on leaf — no need to show it as a row.
  const dims = GROUP_DIMENSIONS.filter(
    (d) => d.key !== "issue" && !(hideProject && d.key === "project"),
  );

  return (
    <div ref={ref} className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">Group</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium border rounded ${
            open
              ? "border-blue-500 text-gray-800"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {GROUP_BY_LABEL[value]}
          <ChevronDown className="h-3 w-3 text-gray-500" />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
            {dims.map((d) => {
              const checked = selected.has(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggle(d.key)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50"
                >
                  <span
                    className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded border ${
                      checked ? "bg-blue-600 border-blue-600" : "border-gray-300"
                    }`}
                  >
                    {checked && <CheckSquare className="h-3 w-3 text-white" />}
                  </span>
                  <span className={checked ? "text-gray-900 font-medium" : "text-gray-700"}>
                    {d.label}
                  </span>
                </button>
              );
            })}
            <div className="border-t border-gray-100 mt-1 pt-1 px-3 py-1.5 text-[10px] text-gray-400 leading-snug">
              Task is always shown. Add User or Epic for a hierarchy.
              {!hideProject && " Project groups on its own."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MoreMenu({
  onCsv,
  onXls,
  onPdf,
  period,
  onPeriodChange,
}: {
  onCsv: () => void;
  onXls: () => void;
  onPdf: () => void;
  period: Period;
  onPeriodChange: (p: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  const PERIODS: Period[] = ["week", "month", "quarter"];
  const PLABEL: Record<Period, string> = { week: "Week", month: "Month", quarter: "Quarter" };
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
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            View
          </div>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onPeriodChange(p);
                setOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 ${
                p === period ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700"
              }`}
            >
              {PLABEL[p]}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Export
          </div>
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

/**
 * Truncated label with a dark tooltip that appears only when the text is
 * actually clipped — same pattern as the backlog work-item title. Clip state is
 * recomputed on each hover so it tracks resize/zoom.
 */
function ClippedLabel({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Tooltip is portaled to <body> with fixed coords so it isn't clipped by the
  // cell's `overflow:hidden` or painted under the next sticky row.
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  function onEnter() {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth) {
      const r = el.getBoundingClientRect();
      setTip({ top: r.bottom + 4, left: r.left });
    }
  }

  return (
    <span
      className="block min-w-0 flex-1"
      onMouseEnter={onEnter}
      onMouseLeave={() => setTip(null)}
    >
      <span ref={ref} className={`block truncate ${className}`}>
        {text}
      </span>
      {tip &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{ position: "fixed", top: tip.top, left: tip.left, zIndex: 1100 }}
            className="pointer-events-none max-w-md whitespace-normal break-words rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-normal normal-case text-white shadow-lg"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
