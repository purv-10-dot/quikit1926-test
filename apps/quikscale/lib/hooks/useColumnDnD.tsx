"use client";

/**
 * useColumnDnD — pointer-based drag-to-reorder for table header columns.
 *
 * Deliberately dependency-free (mirrors the existing `useColumnResize` pointer
 * pattern) so it works inside the sticky/frozen table layout without a DnD
 * library. It hit-tests `th[data-col-key]` cells in the supplied header row to
 * find the drop target and side, then calls `onDrop(fromKey, toKey, side)`.
 *
 * The caller owns the commit: `onDrop` is where freeze-confirmation and
 * persistence happen (see `useColumnOrder` + `useConfirm`). This hook only
 * tracks the interaction and exposes visual state for a drop indicator.
 *
 * Usage:
 *   const dnd = useColumnDnD({ getHeaderRow: () => headerRowRef.current, onDrop });
 *   <th data-col-key={col} className={dnd.dropSide && dnd.overKey === col ? ... : ...}>
 *     <DragHandle onStart={(e) => dnd.startDrag(col, e)} />
 *   </th>
 */

import { useCallback, useEffect, useRef, useState } from "react";

// Minimum pointer travel (px) before a press becomes a drag — stops an
// accidental click on the grip from firing a reorder.
const DRAG_THRESHOLD = 4;

export interface UseColumnDnDOptions {
  /** Returns the header row (or any element) whose `th[data-col-key]` children
   *  are the drop targets. */
  getHeaderRow: () => HTMLElement | null;
  /** Commit callback. `side` is which edge of `toKey` the drop landed on. */
  onDrop: (fromKey: string, toKey: string, side: "before" | "after") => void;
  /** Return false for columns that can't be dragged or dropped onto (rail). */
  canReorder?: (colKey: string) => boolean;
}

interface DragState {
  fromKey: string;
  startX: number;
  active: boolean; // crossed the threshold
  overKey: string | null;
  overSide: "before" | "after" | null;
}

export interface ColumnDnDApi {
  draggingKey: string | null;
  overKey: string | null;
  dropSide: "before" | "after" | null;
  startDrag: (colKey: string, e: React.PointerEvent) => void;
}

export function useColumnDnD(options: UseColumnDnDOptions): ColumnDnDApi {
  const { getHeaderRow, onDrop, canReorder } = options;

  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<"before" | "after" | null>(null);

  const dragRef = useRef<DragState | null>(null);
  // Latest option callbacks, so the window listeners (attached once) never go
  // stale without re-subscribing on every render.
  const onDropRef = useRef(onDrop);
  const canReorderRef = useRef(canReorder);
  const getHeaderRowRef = useRef(getHeaderRow);
  onDropRef.current = onDrop;
  canReorderRef.current = canReorder;
  getHeaderRowRef.current = getHeaderRow;

  const cleanup = useCallback(() => {
    dragRef.current = null;
    setDraggingKey(null);
    setOverKey(null);
    setDropSide(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    function hitTest(clientX: number): { key: string; side: "before" | "after" } | null {
      const row = getHeaderRowRef.current?.();
      if (!row) return null;
      const cells = row.querySelectorAll<HTMLElement>("th[data-col-key]");
      for (const cell of cells) {
        const key = cell.dataset.colKey;
        if (!key) continue;
        if (canReorderRef.current && !canReorderRef.current(key)) continue;
        const rect = cell.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right) {
          const side = clientX < rect.left + rect.width / 2 ? "before" : "after";
          return { key, side };
        }
      }
      return null;
    }

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.active) {
        if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return;
        drag.active = true;
        setDraggingKey(drag.fromKey);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      const hit = hitTest(e.clientX);
      if (hit && hit.key !== drag.fromKey) {
        drag.overKey = hit.key;
        drag.overSide = hit.side;
        setOverKey(hit.key);
        setDropSide(hit.side);
      } else {
        drag.overKey = null;
        drag.overSide = null;
        setOverKey(null);
        setDropSide(null);
      }
    }

    function onUp() {
      const drag = dragRef.current;
      if (!drag) return;
      // Read the committed target from the ref (state updates from onMove may
      // not have flushed yet on pointerup).
      if (drag.active && drag.overKey && drag.overSide && drag.overKey !== drag.fromKey) {
        onDropRef.current(drag.fromKey, drag.overKey, drag.overSide);
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

  const startDrag = useCallback(
    (colKey: string, e: React.PointerEvent) => {
      if (canReorderRef.current && !canReorderRef.current(colKey)) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { fromKey: colKey, startX: e.clientX, active: false, overKey: null, overSide: null };
    },
    [],
  );

  return { draggingKey, overKey, dropSide, startDrag };
}

/**
 * Small drag grip rendered inside a header cell. Six-dot handle, revealed on
 * header hover (`group-hover`) like the ColMenu three-dot button.
 */
export function DragHandle({
  onStart,
  title = "Drag to reorder column",
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
      // Prevent the click that follows pointerup from bubbling to sort/menu.
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="p-0.5 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
    >
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
      </svg>
    </button>
  );
}
