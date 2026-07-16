"use client";

/**
 * useRowDnD — pointer-based, dependency-free drag-to-reorder for table ROWS,
 * tuned for a Jira-like feel: grab anywhere on the row, the row lifts (a
 * floating labelled card follows the cursor), a smooth accent line marks the
 * drop slot, and the viewport auto-scrolls near the edges.
 *
 * Deliberately avoids CSS `transform` on `<tr>` (which breaks `position: sticky`
 * frozen columns) — the "lift" is a separate portal ghost, not a moved row.
 *
 * The caller owns the commit: it maps (fromId, toId, side) → before/after
 * neighbour ids via `rowNeighbors()` (lib/utils/rowOrder) and POSTs to the
 * module's /reorder route. This hook tracks the interaction, renders the ghost,
 * and exposes state for the drop indicator.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DRAG_THRESHOLD = 4; // px before a press becomes a drag
const EDGE = 56;          // px from a scroll edge that triggers auto-scroll
const SCROLL_SPEED = 14;  // px per tick

// Elements that must keep their own click/press behaviour (never start a drag).
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [contenteditable], [data-no-drag]';

export interface UseRowDnDOptions {
  /** Element whose `tr[data-row-id]` children are the drop targets (tbody/table). */
  getRowsContainer: () => HTMLElement | null;
  /** Commit callback: move `fromId` to `side` of `toId`. */
  onDrop: (fromId: string, toId: string, side: "before" | "after") => void;
  /** Gate — return false to disable dragging (e.g. a column sort is active). */
  canDrag?: () => boolean;
  /** Optional scroll container for edge auto-scroll. Falls back to the window. */
  getScrollContainer?: () => HTMLElement | null;
}

interface DragState {
  fromId: string;
  startX: number;
  startY: number;
  active: boolean;
  overId: string | null;
  overSide: "before" | "after" | null;
  clientX: number;
  clientY: number;
}

export interface RowDnDApi {
  draggingId: string | null;
  overId: string | null;
  dropSide: "before" | "after" | null;
  startDrag: (rowId: string, e: React.PointerEvent) => void;
  /** Floating "lifted" card that follows the cursor while dragging. Render once
   *  per grid (e.g. `{rowDnd.dragGhost}`). Null when not dragging. */
  dragGhost: React.ReactNode;
}

/** Portal card that follows the cursor. Owns its own pointer listener so moving
 *  it never re-renders the grid. */
function DragGhost({ label, startX, startY }: { label: string; startX: number; startY: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function place(x: number, y: number) {
      const el = ref.current;
      if (el) el.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    }
    place(startX, startY);
    function onMove(e: PointerEvent) { place(e.clientX, e.clientY); }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [startX, startY]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className="fixed left-0 top-0 z-[100] pointer-events-none flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xl max-w-xs"
    >
      <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
      </svg>
      <span className="truncate">{label}</span>
    </div>,
    document.body,
  );
}

export function useRowDnD(options: UseRowDnDOptions): RowDnDApi {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<"before" | "after" | null>(null);
  const [ghost, setGhost] = useState<{ label: string; x: number; y: number } | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
    setOverId(null);
    setDropSide(null);
    setGhost(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    stopAutoScroll();
  }, [stopAutoScroll]);

  useEffect(() => {
    function hitTest(clientY: number): { id: string; side: "before" | "after" } | null {
      const container = optsRef.current.getRowsContainer();
      if (!container) return null;
      const rows = container.querySelectorAll<HTMLElement>("tr[data-row-id]");
      for (const row of rows) {
        const id = row.dataset.rowId;
        if (!id) continue;
        const rect = row.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          const side = clientY < rect.top + rect.height / 2 ? "before" : "after";
          return { id, side };
        }
      }
      return null;
    }

    function tickAutoScroll() {
      const drag = dragRef.current;
      if (!drag || !drag.active) { rafRef.current = null; return; }
      const el = optsRef.current.getScrollContainer?.();
      if (el) {
        const rect = el.getBoundingClientRect();
        if (drag.clientY < rect.top + EDGE) el.scrollTop -= SCROLL_SPEED;
        else if (drag.clientY > rect.bottom - EDGE) el.scrollTop += SCROLL_SPEED;
      } else {
        // Window fallback for long/paginated module pages.
        const vh = window.innerHeight;
        if (drag.clientY < EDGE) window.scrollBy(0, -SCROLL_SPEED);
        else if (drag.clientY > vh - EDGE) window.scrollBy(0, SCROLL_SPEED);
      }
      rafRef.current = requestAnimationFrame(tickAutoScroll);
    }

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      drag.clientX = e.clientX;
      drag.clientY = e.clientY;
      if (!drag.active) {
        if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.active = true;
        setDraggingId(drag.fromId);
        // Read the row label for the floating ghost.
        const row = optsRef.current.getRowsContainer()?.querySelector<HTMLElement>(`tr[data-row-id="${drag.fromId}"]`);
        setGhost({ label: row?.dataset.rowLabel || "Moving row…", x: e.clientX, y: e.clientY });
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(tickAutoScroll);
      }
      const hit = hitTest(e.clientY);
      if (hit && hit.id !== drag.fromId) {
        drag.overId = hit.id;
        drag.overSide = hit.side;
        setOverId(hit.id);
        setDropSide(hit.side);
      } else {
        drag.overId = null;
        drag.overSide = null;
        setOverId(null);
        setDropSide(null);
      }
    }

    function onUp() {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.active && drag.overId && drag.overSide && drag.overId !== drag.fromId) {
        optsRef.current.onDrop(drag.fromId, drag.overId, drag.overSide);
      }
      cleanup();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dragRef.current) cleanup();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [cleanup]);

  const startDrag = useCallback((rowId: string, e: React.PointerEvent) => {
    if (optsRef.current.canDrag && !optsRef.current.canDrag()) return;
    if (e.button != null && e.button !== 0) return; // left button / primary only
    // Don't hijack clicks on interactive cell controls (checkbox, edit button,
    // inline pickers, links) — full-row drag only starts from "chrome".
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(INTERACTIVE)) return;
    dragRef.current = {
      fromId: rowId, startX: e.clientX, startY: e.clientY, active: false,
      overId: null, overSide: null, clientX: e.clientX, clientY: e.clientY,
    };
  }, []);

  return {
    draggingId,
    overId,
    dropSide,
    startDrag,
    dragGhost: ghost ? <DragGhost label={ghost.label} startX={ghost.x} startY={ghost.y} /> : null,
  };
}

/**
 * Small vertical drag grip for a leading row cell — still exported for grids
 * that prefer an explicit handle over full-row drag. Revealed on row hover.
 */
export function RowDragHandle({
  onStart,
  title = "Drag to reorder row",
}: {
  onStart: (e: React.PointerEvent) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={onStart}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="p-0.5 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
    >
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
      </svg>
    </button>
  );
}
