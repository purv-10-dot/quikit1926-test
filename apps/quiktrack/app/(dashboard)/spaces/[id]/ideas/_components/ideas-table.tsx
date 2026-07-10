"use client";

import { useState, useRef } from "react";
import {
  BarChart3,
  Target,
  Tag,
  TrendingUp,
  Workflow,
  Plus,
  Pencil,
  Maximize2,
  GripVertical,
  Link2,
  Check,
  X,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { EditableCell } from "./editable-cell";
import { K, type FieldDef, type IdeaRow, type IdeaFieldValue } from "./ideas-types";

export interface Column {
  key: string;
  label: string;
  field?: FieldDef; // undefined for built-in/special columns (summary/insights/delivery)
}

function columnIcon(col: Column): LucideIcon {
  if (col.key === "insights") return TrendingUp;
  if (col.key === "delivery") return Workflow;
  switch (col.key) {
    case K.theme: return Tag;
    case K.impact:
    case K.effort: return BarChart3;
    case K.roadmap: return Target;
    default: return Tag;
  }
}

function defaultWidth(key: string): number {
  if (key === "summary") return 240;
  if (key === "theme") return 220;
  if (key === "delivery") return 200;
  return 140;
}

/**
 * Display-only demo values for the five seeded sample ideas, so the "All ideas"
 * view matches the JPD reference. Insights counts / Delivery progress become
 * real features later; until then only the known sample titles populate.
 */
const DEMO_BY_TITLE: Record<string, { insights: number; delivery?: [number, number] }> = {
  "New rewards program": { insights: 2, delivery: [0.32, 0.24] },
  "Express checkout": { insights: 1, delivery: [0.3, 0.22] },
  "Improve waiting list experience": { insights: 0, delivery: [0.3, 0.24] },
  "Refactor user profile data": { insights: 0, delivery: [0.3, 0.26] },
  "Explore VR travel features": { insights: 0, delivery: [0.28, 0.2] },
};

function SummaryCell({ idea, onOpen, onEditTitle }: { idea: IdeaRow; onOpen: (i: IdeaRow) => void; onEditTitle: (id: string, t: string) => void }) {
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
    <div className="flex w-full items-center gap-1">
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

function InsightsCell({ idea }: { idea: IdeaRow }) {
  const count = DEMO_BY_TITLE[idea.title]?.insights ?? 0;
  if (count > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-gray-700">
        <TrendingUp className="h-4 w-4 text-gray-700" />{count}
      </span>
    );
  }
  // Empty: faint glyph by default; "Add" appears when hovering THIS cell (JPD).
  return (
    <span className="inline-flex items-center gap-1 text-gray-300 group-hover/cell:text-gray-500">
      <TrendingUp className="h-4 w-4" />
      <span className="hidden text-sm group-hover/cell:inline">Add</span>
    </span>
  );
}

function DeliveryCell({ idea }: { idea: IdeaRow }) {
  const d = DEMO_BY_TITLE[idea.title]?.delivery;
  // Popover anchor coords (viewport-fixed so the table's overflow can't clip it).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setPos(null), 120); };
  function onEnter(e: React.MouseEvent) {
    cancelClose();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 4 });
  }

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={scheduleClose}>
      {/* Progress bar is always visible (JPD); hover reveals the link popover. */}
      {d ? (
        <div className="flex h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-green-400" style={{ width: `${d[0] * 100}%` }} />
          <div className="h-full bg-blue-400" style={{ width: `${d[1] * 100}%` }} />
        </div>
      ) : (
        <div className="h-1.5 w-full max-w-40 rounded-full bg-gray-100" />
      )}

      {pos && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{ position: "fixed", left: pos.x, top: pos.y }}
          className="z-50 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
        >
          <div className="text-sm font-semibold text-gray-900">Link or create a Jira work item</div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Track delivery work items associated with this idea.
          </p>
          <button
            type="button"
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Link2 className="h-3.5 w-3.5" /> Link a Jira work item
          </button>
          <div className="my-1.5 text-center text-xs text-gray-400">or</div>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Create a work item
          </button>
          <a href="#" className="mt-3 block text-xs text-blue-600 hover:underline">
            Learn about delivery ↗
          </a>
        </div>
      )}
    </div>
  );
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
  footer,
}: {
  columns: Column[];
  ideas: IdeaRow[];
  activeId: string | null;
  onSetActive: (id: string) => void;
  onOpen: (idea: IdeaRow) => void;
  onEdit: (ideaId: string, fieldId: string, value: IdeaFieldValue) => void;
  onEditTitle: (id: string, title: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onCreate: (title: string) => void;
  creating: boolean;
  footer?: React.ReactNode;
}) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const widthOf = (key: string) => widths[key] ?? defaultWidth(key);

  // Row drag-and-drop reorder (via the grip handle). `dragId` is the row being
  // dragged; `overId` is the row currently hovered, for the drop indicator.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Inline "add ideas" row (opened by the + in the Summary header, JPD-style).
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState("");
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

  return (
    // JPD grid box: top + left + bottom borders (right stays open); the footer
    // lives inside so the bottom border sits below it.
    <div className="border-b border-l border-t border-gray-200">
      <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: 52 }} />
          {columns.map((c) => (
            <col key={c.key} style={{ width: widthOf(c.key) }} />
          ))}
          {/* Trailing spacer column — no fixed width, so it absorbs the
              remaining width and the rows/gridlines span the full table (JPD). */}
          <col />
        </colgroup>
        <thead>
          <tr className="bg-gray-50">
            <th className="border-b border-gray-200 px-3 py-2">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600" aria-label="Select all" />
            </th>
            {columns.map((col, idx) => {
              const Icon = columnIcon(col);
              return (
                <th key={col.key} className="relative border-b border-r border-gray-200 px-3 py-2 text-left font-medium text-gray-500">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {col.key === "summary" ? (
                      <span className="font-serif text-[13px] italic text-gray-400">Aa</span>
                    ) : (
                      <Icon className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    {col.label}
                    {idx === 0 && (
                      // JPD: the + on the Summary header opens the inline add-idea row.
                      <button
                        type="button"
                        aria-label="Add ideas"
                        onClick={() => setAdding(true)}
                        className="ml-auto rounded border border-gray-200 bg-white p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                  {/* Drag to resize (expand/collapse) this column. */}
                  <span
                    onMouseDown={(e) => startResize(col.key, e)}
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400"
                  />
                </th>
              );
            })}
            <th className="border-b border-gray-200 px-3 py-2">
              <Plus className="h-4 w-4 text-gray-400" />
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
          {ideas.map((idea) => (
            <tr
              key={idea.id}
              onClick={() => onSetActive(idea.id)}
              onDragOver={(e) => { if (dragId && dragId !== idea.id) { e.preventDefault(); setOverId(idea.id); } }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== idea.id) onReorder(dragId, idea.id);
                setDragId(null); setOverId(null);
              }}
              className={`group ${
                idea.id === dragId ? "opacity-40" : ""
              } ${
                idea.id === overId ? "[box-shadow:inset_0_2px_0_0_#3b82f6]" : ""
              } ${
                idea.id === activeId
                  ? "[box-shadow:inset_3px_0_0_0_#22c55e]"
                  : "hover:[box-shadow:inset_3px_0_0_0_#86efac]"
              }`}
            >
              <td className={`border-b border-gray-200 px-2 py-2 align-middle group-hover:bg-blue-50/40`}>
                <div className="flex items-center gap-0.5">
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
              {columns.map((col) => (
                <td key={col.key} className={`${cell} group/cell group-hover:bg-blue-50/40`}>
                  {col.key === "summary" ? (
                    <SummaryCell idea={idea} onOpen={onOpen} onEditTitle={onEditTitle} />
                  ) : col.key === "insights" ? (
                    <InsightsCell idea={idea} />
                  ) : col.key === "delivery" ? (
                    <DeliveryCell idea={idea} />
                  ) : col.field ? (
                    <EditableCell field={col.field} value={idea.values[col.field.id] ?? null} onSave={(fieldId, value) => onEdit(idea.id, fieldId, value)} />
                  ) : null}
                </td>
              ))}
              <td className="border-b border-gray-200 group-hover:bg-blue-50/40" />
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {footer}
    </div>
  );
}
