"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Target,
  Tag,
  TrendingUp,
  Workflow,
  MessageSquare,
  MessageSquarePlus,
  CheckSquare,
  AtSign,
  Clock,
  CalendarDays,
  Lightbulb,
  KeyRound,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Link2 as LinkIcon,
  Plus,
  Pencil,
  Maximize2,
  GripVertical,
  Check,
  X,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { EditableCell } from "./editable-cell";
import { AssigneeCell, MemberChip, type MemberLite } from "./assignee-cell";
import { ColumnHeaderTooltip } from "./column-header-tooltip";
import { K, type FieldDef, type IdeaRow, type IdeaFieldValue } from "./ideas-types";

export interface Column {
  key: string;
  label: string;
  field?: FieldDef; // undefined for built-in/special columns (summary/insights/delivery)
}

/** Freeze boundary on the frozen (sticky) Summary column. Uses a box-shadow (not
 *  a border) for BOTH the divider line and the soft depth shadow: box-shadow is
 *  painted by the sticky cell itself, so — unlike a collapsed table border — it
 *  stays pinned at the freeze boundary and never scrolls away with the content
 *  (JPD / Timesheet pattern). First inset = the crisp 1px divider line; second =
 *  the soft shadow that signals content scrolls beneath. */
const FZ_SHADOW = "shadow-[inset_-1px_0_0_0_#d1d5db,2px_0_4px_-2px_rgba(0,0,0,0.15)]";

/** Read-only built-in columns rendered by key. */
const SYSTEM_COL_KEYS = new Set(["key", "type", "assignee", "creator", "status", "created", "updated"]);

function columnIcon(col: Column): LucideIcon {
  if (col.key === "insights") return TrendingUp;
  if (col.key === "comments") return MessageSquare;
  if (col.key === "delivery") return Workflow;
  if (col.key === "assignee" || col.key === "creator") return AtSign;
  if (col.key === "created" || col.key === "updated") return Clock;
  if (col.key === "key") return KeyRound;
  if (col.key === "type") return Lightbulb;
  if (col.field?.type === "CHECKBOX") return CheckSquare;
  if (col.field?.type === "URL") return LinkIcon;
  if (col.field?.type === "DATE") return CalendarDays;
  if (col.field?.type === "NUMBER") return BarChart3;
  switch (col.key) {
    case K.theme: return Tag;
    case K.impact:
    case K.effort: return BarChart3;
    case K.roadmap: return Target;
    default: return Tag;
  }
}

function defaultWidth(col: Column | string): number {
  const key = typeof col === "string" ? col : col.key;
  if (key === "summary") return 280;
  if (key === "theme") return 240;
  if (key === "customer_segments") return 260;
  if (key === "idea_short_description") return 280;
  if (key === "documents") return 220;
  if (key === "delivery") return 220;
  if (key === "assignee" || key === "creator") return 180;
  // Free-text fields need more room than a rating/pill column.
  if (typeof col !== "string" && (col.field?.type === "SHORT_TEXT" || col.field?.type === "LONG_TEXT")) return 260;
  return 170;
}


function SummaryCell({ idea, onOpen, onEditTitle, showKey = true, showType = true }: { idea: IdeaRow; onOpen: (i: IdeaRow) => void; onEditTitle: (id: string, t: string) => void; showKey?: boolean; showType?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(idea.title);
  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== idea.title) onEditTitle(idea.id, t);
  }
  function cancel() { setEditing(false); setDraft(idea.title); }
  if (editing) {
    // Inline edit like JPD: bordered input with floating ✓ / ✕ actions.
    return (
      <div className="relative flex items-center" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          className="w-full rounded border border-blue-400 px-1.5 py-1 text-sm font-medium shadow-sm outline-none"
        />
        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded border border-gray-200 bg-white shadow-sm">
          <button type="button" aria-label="Save" onMouseDown={(e) => { e.preventDefault(); commit(); }} className="rounded-l p-1 text-gray-500 hover:bg-gray-100 hover:text-green-600">
            <Check className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Cancel" onMouseDown={(e) => { e.preventDefault(); cancel(); }} className="rounded-r border-l border-gray-200 p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex w-full items-center gap-1.5">
      {/* Idea type icon (lightbulb) + key inline before the title (JPD). Each is
          toggled from the Fields panel; they don't render as separate columns. */}
      {showType && <Lightbulb className="h-4 w-4 shrink-0 fill-yellow-300 text-yellow-500" />}
      {showKey && <span className="shrink-0 text-xs font-medium tabular-nums text-gray-400">{idea.key}</span>}
      <button
        type="button"
        onClick={() => onOpen(idea)}
        onDoubleClick={() => setEditing(true)}
        title={idea.title}
        className="min-w-0 flex-1 truncate text-left font-medium text-gray-900 group-hover:underline"
      >
        {idea.title}
      </button>
      {/* Hover affordances, like JPD: inline-edit + open. Scoped to this cell. */}
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/cell:opacity-100">
        <button type="button" aria-label="Rename" onClick={() => setEditing(true)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Open idea" onClick={() => onOpen(idea)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

function InsightsCell({ idea, onOpenInsights }: { idea: IdeaRow; onOpenInsights: () => void }) {
  const count = idea.insightCount ?? 0;
  // Clicking opens the idea drawer on the Insights tab (JPD).
  if (count > 0) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onOpenInsights(); }} className="inline-flex items-center gap-1 font-medium text-gray-700 hover:text-blue-600">
        <TrendingUp className="h-4 w-4" />{count}
      </button>
    );
  }
  // Empty: faint glyph by default; "Add" appears when hovering THIS cell (JPD).
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpenInsights(); }} className="inline-flex items-center gap-1 text-gray-300 group-hover/cell:text-gray-500">
      <TrendingUp className="h-4 w-4" />
      <span className="hidden text-sm group-hover/cell:inline">Add</span>
    </button>
  );
}

function CommentsCell({ idea, onOpenComments }: { idea: IdeaRow; onOpenComments: () => void }) {
  const count = idea.commentCount ?? 0;
  // Clicking opens the idea drawer on the Comments tab (JPD).
  if (count > 0) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onOpenComments(); }} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700">
        <MessageSquare className="h-4 w-4" />{count}
      </button>
    );
  }
  // Empty: faint "add comment" glyph in a rounded box (JPD).
  return (
    <button
      type="button"
      aria-label="Add comment"
      onClick={(e) => { e.stopPropagation(); onOpenComments(); }}
      className="inline-flex items-center justify-center rounded border border-gray-200 p-1 text-gray-300 hover:border-gray-300 hover:text-gray-500"
    >
      <MessageSquarePlus className="h-4 w-4" />
    </button>
  );
}

function DeliveryCell({ idea, onOpenDelivery }: { idea: IdeaRow; onOpenDelivery: () => void }) {
  const linked = idea.deliveryCount ?? 0;
  // Clicking opens the idea drawer on the Delivery tab (JPD). The bar reflects
  // whether the idea has linked delivery work items (real data).
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpenDelivery(); }} className="block w-full text-left">
      <div className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-gray-100">
        {linked > 0 && <div className="h-full bg-blue-400" style={{ width: "40%" }} />}
      </div>
    </button>
  );
}

/** JPD "Delivery status": a computed rollup of the idea's linked work items by
 *  status category (To Do / In Progress / Done). NOT a manual field — the counts
 *  come from the real linked QtIssues. Hover shows the JPD breakdown popover;
 *  click (or the popover actions) opens the Delivery drawer. */
function DeliveryStatusCell({ idea, onOpenDelivery }: { idea: IdeaRow; onOpenDelivery: () => void }) {
  const c = idea.deliveryCounts ?? { total: 0, todo: 0, inProgress: 0, done: 0 };
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const progress = c.total ? Math.round((c.done / c.total) * 100) : 0;

  if (c.total === 0) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onOpenDelivery(); }} className="text-gray-300 hover:text-gray-500">
        —
      </button>
    );
  }
  // Grey = To Do, blue = In Progress, green = Done.
  const pills: { n: number; cls: string }[] = [
    { n: c.todo, cls: "bg-gray-200 text-gray-700" },
    { n: c.inProgress, cls: "bg-blue-500 text-white" },
    { n: c.done, cls: "bg-green-600 text-white" },
  ];

  const POPOVER_W = 320;
  function showPopover(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Open to the LEFT: align the popover's right edge to the pills' right edge,
    // clamped to the viewport so it never runs off-screen.
    const left = Math.max(8, Math.min(r.right - POPOVER_W, window.innerWidth - POPOVER_W - 8));
    setPos({ x: left, y: r.bottom + 6 });
  }

  return (
    <div className="relative inline-block" onMouseEnter={showPopover} onMouseLeave={() => setPos(null)}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenDelivery(); }}
        className="inline-flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-gray-100"
      >
        {pills.map((p, i) => (
          <span key={i} className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${p.cls}`}>
            {p.n}
          </span>
        ))}
      </button>

      {/* Hover breakdown popover (JPD) — fixed so the table overflow can't clip it. */}
      {pos && (
        <div
          style={{ position: "fixed", left: pos.x, top: pos.y, width: POPOVER_W }}
          className="z-50 rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-[15px] font-semibold text-gray-900">Delivery</p>
          <p className="mb-2 flex items-center gap-2 text-sm text-gray-600">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-semibold text-gray-700">{c.total}</span>
            work {c.total === 1 ? "item" : "items"}
          </p>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-gray-500">{progress}% Done</span>
          </div>
          <div className="space-y-1.5">
            {c.todo > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-semibold text-gray-700">{c.todo}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">TO DO</span>
              </div>
            )}
            {c.inProgress > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-semibold text-gray-700">{c.inProgress}</span>
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">IN PROGRESS</span>
              </div>
            )}
            {c.done > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-semibold text-gray-700">{c.done}</span>
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">DONE</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPos(null); onOpenDelivery(); }}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Workflow className="h-3.5 w-3.5" /> Link work item
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPos(null); onOpenDelivery(); }}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <Plus className="h-3.5 w-3.5" /> Create new
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Read-only Creator column — the member who created the idea (JPD). */
function CreatorCell({ userId, members }: { userId: string | null; members?: MemberLite[] }) {
  const user = members?.find((m) => m.id === userId) ?? null;
  return <MemberChip user={user} />;
}

/** Read-only built-in columns (Assignee / Status / Created / Updated). */
function SystemCell({ colKey, idea, statuses }: { colKey: string; idea: IdeaRow; statuses?: { id: string; name: string }[] }) {
  if (colKey === "assignee") {
    return (
      <span className="inline-flex items-center gap-1.5 text-gray-400">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-[10px]">?</span>
        Unassigned
      </span>
    );
  }
  if (colKey === "status") {
    const name = statuses?.find((s) => s.id === idea.statusId)?.name;
    return name ? (
      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{name.toUpperCase()}</span>
    ) : <span className="text-gray-300">—</span>;
  }
  if (colKey === "created" || colKey === "updated") {
    const iso = colKey === "created" ? idea.createdAt : idea.updatedAt;
    return <span className="text-gray-600">{new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>;
  }
  return null;
}

export function IdeasTable({
  columns,
  ideas,
  activeId,
  onSetActive,
  onOpen,
  onEdit,
  onEditTitle,
  onReorder,
  onCreate,
  creating,
  openAddRef,
  statuses,
  members,
  onAssign,
  headerExtra,
  onRemoveColumn,
  onReorderColumns,
  sortByKey,
  groups,
  showKey = true,
  showType = true,
  rowNumbers,
  rowColor,
  footer,
}: {
  columns: Column[];
  ideas: IdeaRow[];
  activeId: string | null;
  onSetActive: (id: string) => void;
  onOpen: (idea: IdeaRow, tab?: "Overview" | "Comments" | "Insights" | "Delivery") => void;
  onEdit: (ideaId: string, fieldId: string, value: IdeaFieldValue) => void;
  onEditTitle: (id: string, title: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onCreate: (title: string) => void;
  creating: boolean;
  openAddRef?: React.MutableRefObject<(() => void) | null>;
  statuses?: { id: string; name: string }[];
  members?: MemberLite[];
  onAssign?: (ideaId: string, userId: string | null) => void;
  headerExtra?: React.ReactNode;
  onRemoveColumn?: (key: string) => void;
  /** Reorder columns by dragging a column header (fromKey dropped before toKey). */
  onReorderColumns?: (fromKey: string, toKey: string) => void;
  /** Active sort direction per column key, to highlight sorted headers. */
  sortByKey?: Record<string, "asc" | "desc">;
  /** When set, render collapsible group swimlanes instead of a flat list. */
  groups?: { id: string; label: React.ReactNode; ideas: IdeaRow[] }[];
  /** Toggle the inline key prefix / type lightbulb in the Summary column. */
  showKey?: boolean;
  showType?: boolean;
  /** Show a leading row-number column (Display settings). */
  rowNumbers?: boolean;
  /** Row-coloring: returns a hex color for an idea (or null). Style decides how. */
  rowColor?: { of: (idea: IdeaRow) => string | null; style: "background" | "highlight" };
  footer?: (openAdd: () => void) => React.ReactNode;
}) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const colByKey = new Map(columns.map((c) => [c.key, c]));
  // Prefer the Column (so type-based defaults apply) but accept a bare key.
  const widthOf = (key: string) => widths[key] ?? defaultWidth(colByKey.get(key) ?? key);

  // Known labels per LABELS field (fieldId → all label strings used anywhere) so
  // the label picker can suggest existing ones for reuse.
  const knownLabelsByField = new Map<string, string[]>();
  for (const col of columns) {
    if (col.field?.type !== "LABELS") continue;
    const set = new Set<string>();
    for (const idea of ideas) {
      const v = idea.values[col.field.id];
      if (Array.isArray(v)) for (const l of v) if (typeof l === "string") set.add(l);
    }
    knownLabelsByField.set(col.field.id, [...set]);
  }

  // Row drag-and-drop reorder (via the grip handle). `dragId` is the row being
  // dragged; `overId` is the row currently hovered, for the drop indicator.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Column drag-reorder (drag a column header). Summary stays pinned.
  const [colDragKey, setColDragKey] = useState<string | null>(null);
  const [colOverKey, setColOverKey] = useState<string | null>(null);

  // Collapsed group ids (grouped mode).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Inline "add ideas" row (opened by the + in the Summary header, JPD-style).
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState("");
  // Let external triggers (toolbar/footer Create) open the inline add-row.
  useEffect(() => {
    if (openAddRef) openAddRef.current = () => setAdding(true);
  }, [openAddRef]);
  const totalCols = columns.length + 2; // checkbox + columns + trailing spacer
  function submitAdd() {
    const t = addDraft.trim();
    if (!t) return;
    onCreate(t);
    setAddDraft("");
  }

  function startResize(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(key);
    function onMove(ev: MouseEvent) {
      setWidths((w) => ({ ...w, [key]: Math.max(72, startW + (ev.clientX - startX)) }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const cell = "border-b border-r border-gray-200 px-3 py-2 align-middle";

  // The columns keep FIXED pixel widths (they never shrink to fit). The table's
  // own width is exactly that total, so whenever it exceeds the container the box
  // overflows and the horizontal scrollbar appears (JPD / Timesheet pattern). The
  // trailing add-column cell gets a fixed 160px so the last real column isn't
  // flush to the edge.
  const columnsWidth = columns.reduce((sum, c) => sum + widthOf(c.key), 0);
  const TRAILING = 160;
  const tableWidth = 52 + columnsWidth + TRAILING;

  return (
    // JPD grid box: full border on all four sides. The box is the horizontal-
    // scroll container so the table AND footer scroll together under a single
    // bottom scrollbar, and the right border stays pinned to the container edge
    // while the inner content scrolls beneath it. Height is natural (just the
    // rows) — it does NOT stretch to fill the view.
    <div className="qt-timesheet-scroll overflow-x-scroll border border-gray-200">
      {/* Shell: at least the container width (so the grid fills the view when the
          columns fit), and at least the total column width (so it overflows →
          scrolls when they don't). The trailing <col> absorbs any slack. The
          always-visible scrollbar (qt-timesheet-scroll + overflow-x-scroll, same
          as the Timesheet) means users can drag to pan even on trackpads. */}
      <div style={{ minWidth: tableWidth }}>
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: tableWidth }}>
        <colgroup>
          <col style={{ width: 52 }} />
          {columns.map((c) => (
            <col key={c.key} style={{ width: widthOf(c.key) }} />
          ))}
          {/* Trailing add-column column — flexible (no width) so it absorbs any
              slack when the view is wider than the columns, and shrinks to its
              min when they overflow. This keeps every real column at a FIXED
              width (they never squeeze), which is what makes the grid overflow
              and scroll horizontally (JPD). */}
          <col />
        </colgroup>
        <thead>
          <tr className="bg-gray-50">
            <th className="sticky left-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600" aria-label="Select all" />
            </th>
            {columns.map((col, idx) => {
              const Icon = columnIcon(col);
              const isSummary = col.key === "summary";
              const canDragCol = !isSummary && !!onReorderColumns;
              return (
                <th
                  key={col.key}
                  draggable={canDragCol}
                  onDragStart={canDragCol ? (e) => { setColDragKey(col.key); e.dataTransfer.effectAllowed = "move"; } : undefined}
                  onDragEnd={canDragCol ? () => { setColDragKey(null); setColOverKey(null); } : undefined}
                  onDragOver={canDragCol ? (e) => { if (colDragKey && colDragKey !== col.key) { e.preventDefault(); setColOverKey(col.key); } } : undefined}
                  onDragLeave={canDragCol ? () => { if (colOverKey === col.key) setColOverKey(null); } : undefined}
                  onDrop={canDragCol ? (e) => { e.preventDefault(); if (colDragKey && colDragKey !== col.key) onReorderColumns!(colDragKey, col.key); setColDragKey(null); setColOverKey(null); } : undefined}
                  className={`group/col relative border-b border-r border-gray-200 px-3 py-2 text-left font-medium text-gray-500 ${
                    isSummary ? `qt-ideas-freeze sticky left-[52px] z-20 bg-gray-50 ${FZ_SHADOW}` : "cursor-grab active:cursor-grabbing"
                  } ${colDragKey === col.key ? "opacity-40" : ""} ${colOverKey === col.key ? "border-l-2 border-l-blue-500" : ""}`}
                >
                  <span className={`flex items-center gap-1.5 whitespace-nowrap ${sortByKey?.[col.key] ? "text-blue-600" : ""}`}>
                    <ColumnHeaderTooltip
                      colKey={col.key}
                      fieldKey={col.field?.key}
                      label={col.label}
                      Icon={Icon}
                      iconNode={
                        isSummary ? (
                          <span className="font-serif text-[13px] italic text-gray-500">Aa</span>
                        ) : col.field?.key === "score" ? (
                          <span className="font-serif text-[13px] italic text-gray-600">fx</span>
                        ) : undefined
                      }
                    >
                      {isSummary ? (
                        <span className={`font-serif text-[13px] italic ${sortByKey?.[col.key] ? "text-blue-500" : "text-gray-400"}`}>Aa</span>
                      ) : col.field?.key === "score" ? (
                        <span className={`font-serif text-[13px] italic ${sortByKey?.[col.key] ? "text-blue-500" : "text-gray-500"}`}>fx</span>
                      ) : (
                        <Icon className={`h-3.5 w-3.5 ${sortByKey?.[col.key] ? "text-blue-500" : "text-gray-400"}`} />
                      )}
                      <span className="truncate">{col.label}</span>
                    </ColumnHeaderTooltip>
                    {sortByKey?.[col.key] && (
                      sortByKey[col.key] === "asc"
                        ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                        : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                    )}
                    {idx === 0 ? (
                      // JPD: the + sits right after the "Summary" label (hugging
                      // the column divider) and opens the inline add-idea row.
                      <button
                        type="button"
                        aria-label="Add ideas"
                        onClick={() => setAdding(true)}
                        className="rounded border border-gray-200 bg-white p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    ) : onRemoveColumn ? (
                      // Hover a non-summary header → remove-from-view button, right
                      // after the label (JPD). Not pushed to the edge so it can't
                      // collide with the resize handle / column boundary.
                      <button
                        type="button"
                        aria-label={`Hide ${col.label}`}
                        onClick={() => onRemoveColumn(col.key)}
                        className="rounded p-0.5 text-gray-300 opacity-0 hover:bg-gray-200 hover:text-gray-600 group-hover/col:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </span>
                  {/* Drag to resize (expand/collapse) this column. */}
                  <span
                    onMouseDown={(e) => startResize(col.key, e)}
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400"
                  />
                </th>
              );
            })}
            <th className="border-b border-gray-200 px-3 py-2 text-left">
              <span className="inline-flex">{headerExtra ?? <Plus className="h-4 w-4 text-gray-400" />}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Inline add-idea row (JPD): full-width summary-only input; Enter
              creates. Stays open so you can paste multiple ideas in a row. */}
          {adding && (
            <tr>
              <td colSpan={totalCols} className="border-b border-gray-200 p-0">
                <input
                  autoFocus
                  value={addDraft}
                  onChange={(e) => setAddDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitAdd();
                    if (e.key === "Escape") { setAdding(false); setAddDraft(""); }
                  }}
                  onBlur={() => { if (!addDraft.trim()) setAdding(false); }}
                  placeholder="Type or paste multiple ideas and press enter"
                  className="w-full rounded-sm border border-blue-500 px-3 py-2.5 text-sm outline-none placeholder:text-gray-400"
                />
              </td>
            </tr>
          )}
          {/* Inline loader while an idea is being created (JPD). */}
          {creating && (
            <tr>
              <td colSpan={totalCols} className="border-b border-gray-200 px-3 py-3">
                <span className="inline-flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating idea…
                </span>
              </td>
            </tr>
          )}
          {(() => {
          const renderRow = (idea: IdeaRow, rowIndex: number) => {
          const color = rowColor?.of(idea) ?? null;
          const isBg = !!color && rowColor?.style === "background";
          const isBar = !!color && rowColor?.style === "highlight";
          // Background: a subtle uniform tint. Non-sticky cells can be transparent
          // (the tint sits on the row). STICKY cells (checkbox + Summary) must stay
          // OPAQUE or scrolling content shows through — so we paint them white with
          // the tint layered on top via a gradient overlay (composites to a solid
          // light color). Highlight = a thin left bar on the frozen checkbox cell.
          const TINT = "18"; // ~9% alpha — soft, like JPD
          const tint = isBg && color ? `${color}${TINT}` : undefined;
          const stickyTintBg = isBg && color
            ? `linear-gradient(${color}${TINT}, ${color}${TINT}), #ffffff`
            : undefined;
          return (
            <tr
              key={idea.id}
              onClick={() => onSetActive(idea.id)}
              onDragOver={(e) => { if (dragId && dragId !== idea.id) { e.preventDefault(); setOverId(idea.id); } }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== idea.id) onReorder(dragId, idea.id);
                setDragId(null); setOverId(null);
              }}
              className={`group qt-ideas-row ${
                idea.id === dragId ? "opacity-40" : ""
              } ${
                idea.id === overId ? "[box-shadow:inset_0_2px_0_0_#3b82f6]" : ""
              } ${
                idea.id === activeId
                  ? "[box-shadow:inset_3px_0_0_0_#22c55e]"
                  : "hover:[box-shadow:inset_3px_0_0_0_#86efac]"
              }`}
            >
              <td
                style={{ background: stickyTintBg, boxShadow: isBar && color ? `inset 3px 0 0 0 ${color}` : undefined }}
                className={`qt-ideas-sticky sticky left-0 z-10 bg-white border-b border-gray-200 px-2 py-2 align-middle group-hover:bg-blue-50`}
              >
                <div className="flex items-center gap-0.5">
                  {rowNumbers && <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-gray-400">{rowIndex + 1}</span>}
                  <span
                    draggable
                    onDragStart={(e) => { setDragId(idea.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Drag to reorder"
                    className="inline-flex cursor-grab text-gray-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600" aria-label={`Select ${idea.title}`} />
                </div>
              </td>
              {columns.map((col) => {
                const isSummary = col.key === "summary";
                return (
                  <td
                    key={col.key}
                    style={isSummary ? { background: stickyTintBg } : { backgroundColor: tint }}
                    className={`${cell} group/cell ${
                      isSummary ? `qt-ideas-sticky qt-ideas-freeze sticky left-[52px] z-10 bg-white ${FZ_SHADOW} group-hover:bg-blue-50` : "group-hover:bg-blue-50/40"
                    }`}
                  >
                    {isSummary ? (
                      <SummaryCell idea={idea} onOpen={onOpen} onEditTitle={onEditTitle} showKey={showKey} showType={showType} />
                    ) : col.key === "insights" ? (
                      <InsightsCell idea={idea} onOpenInsights={() => onOpen(idea, "Insights")} />
                    ) : col.key === "comments" ? (
                      <CommentsCell idea={idea} onOpenComments={() => onOpen(idea, "Comments")} />
                    ) : col.key === "delivery" ? (
                      <DeliveryCell idea={idea} onOpenDelivery={() => onOpen(idea, "Delivery")} />
                    ) : col.field?.key === "delivery_status" ? (
                      // Computed rollup of linked work items (JPD) — not the manual dropdown.
                      <DeliveryStatusCell idea={idea} onOpenDelivery={() => onOpen(idea, "Delivery")} />
                    ) : col.key === "assignee" && members && onAssign ? (
                      <AssigneeCell assigneeId={idea.assigneeId} members={members} onAssign={(uid) => onAssign(idea.id, uid)} />
                    ) : col.key === "creator" ? (
                      <CreatorCell userId={idea.createdBy ?? idea.reporterId} members={members} />
                    ) : SYSTEM_COL_KEYS.has(col.key) ? (
                      <SystemCell colKey={col.key} idea={idea} statuses={statuses} />
                    ) : col.field ? (
                      <EditableCell field={col.field} value={idea.values[col.field.id] ?? null} knownLabels={knownLabelsByField.get(col.field.id)} onSave={(fieldId, value) => onEdit(idea.id, fieldId, value)} />
                    ) : null}
                  </td>
                );
              })}
              <td style={{ backgroundColor: tint }} className="border-b border-gray-200 group-hover:bg-blue-50/40" />
            </tr>
          );
          };

          // Grouped mode: a collapsible header row per group, then its rows.
          if (groups) {
            let n = 0;
            return groups.map((g) => {
              const isCollapsed = collapsed.has(g.id);
              return (
                <React.Fragment key={g.id}>
                  <tr className="bg-gray-50/70">
                    <td className="sticky left-0 z-10 bg-gray-50/70 border-b border-t border-gray-200 px-2 py-1.5">
                      <button type="button" onClick={() => toggleGroup(g.id)} aria-label="Toggle group" className="rounded p-0.5 text-gray-500 hover:bg-gray-200">
                        <ChevronDown className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                      </button>
                    </td>
                    <td colSpan={totalCols - 1} className="border-b border-t border-gray-200 px-3 py-1.5">
                      <span className="inline-flex items-center gap-2">
                        {g.label}
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">{g.ideas.length}</span>
                      </span>
                    </td>
                  </tr>
                  {!isCollapsed && g.ideas.map((idea) => renderRow(idea, n++))}
                </React.Fragment>
              );
            });
          }
          // Flat mode.
          return ideas.map((idea, i) => renderRow(idea, i));
          })()}
        </tbody>
      </table>
      {footer?.(() => setAdding(true))}
      </div>
    </div>
  );
}
