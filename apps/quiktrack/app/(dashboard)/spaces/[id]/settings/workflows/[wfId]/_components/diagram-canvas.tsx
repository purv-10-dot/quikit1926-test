"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { EditorDraft, PublishError, StatusMeta } from "./editor-types";

const NODE_W = 150;
const NODE_H = 44;

/**
 * Draggable node + edge diagram for the workflow editor. Nodes are absolutely
 * positioned status cards; edges are SVG paths between node centers. Dragging a
 * node updates its x/y (persisted via onMoveNode). Clicking a node in
 * connect-mode picks source→target and opens the add-transition flow.
 */
export function DiagramCanvas({
  draft,
  statusMeta,
  errorStatusIds,
  onMoveNode,
  onNodeClick,
  selectedStatusId,
}: {
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  errorStatusIds: Set<string>;
  onMoveNode: (statusId: string, x: number, y: number) => void;
  onNodeClick: (statusId: string) => void;
  selectedStatusId: string | null;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ statusId: string; dx: number; dy: number } | null>(null);
  const [, force] = useState(0);

  const nodeById = useMemo(
    () => new Map(draft.statuses.map((s) => [s.statusId, s])),
    [draft.statuses],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent, statusId: string) => {
      const node = nodeById.get(statusId);
      if (!node) return;
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      drag.current = {
        statusId,
        dx: e.clientX - rect.left - (node.x ?? 0),
        dy: e.clientY - rect.top - (node.y ?? 0),
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [nodeById],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, e.clientX - rect.left - drag.current.dx);
      const y = Math.max(0, e.clientY - rect.top - drag.current.dy);
      const node = nodeById.get(drag.current.statusId);
      if (node) {
        node.x = x;
        node.y = y;
        force((n) => n + 1);
      }
    },
    [nodeById],
  );

  const onPointerUp = useCallback(() => {
    if (drag.current) {
      const node = nodeById.get(drag.current.statusId);
      if (node) onMoveNode(drag.current.statusId, node.x ?? 0, node.y ?? 0);
      drag.current = null;
    }
  }, [nodeById, onMoveNode]);

  const center = (statusId: string) => {
    const n = nodeById.get(statusId);
    return { cx: (n?.x ?? 0) + NODE_W / 2, cy: (n?.y ?? 0) + NODE_H / 2 };
  };

  return (
    <div
      ref={surfaceRef}
      className="relative h-full w-full overflow-auto bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ minHeight: 600, minWidth: 1000 }}>
        <defs>
          <marker id="wf-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" className="fill-gray-400" />
          </marker>
        </defs>
        {draft.transitions.flatMap((t) => {
          if (t.type === "INITIAL" || t.type === "GLOBAL") return [];
          return t.fromStatusIds.map((from) => {
            const a = center(from);
            const b = center(t.toStatusId);
            return (
              <line
                key={`${t.id}-${from}`}
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                className="stroke-gray-400"
                strokeWidth={1.5}
                markerEnd="url(#wf-arrow)"
              />
            );
          });
        })}
      </svg>

      {draft.statuses.map((s) => {
        const meta = statusMeta.get(s.statusId);
        const hasError = errorStatusIds.has(s.statusId);
        const selected = selectedStatusId === s.statusId;
        return (
          <div
            key={s.statusId}
            onPointerDown={(e) => onPointerDown(e, s.statusId)}
            onClick={() => onNodeClick(s.statusId)}
            style={{ left: s.x ?? 0, top: s.y ?? 0, width: NODE_W, height: NODE_H }}
            className={`absolute flex cursor-grab select-none items-center gap-2 rounded border px-3 text-sm shadow-sm active:cursor-grabbing ${
              hasError
                ? "border-red-400 bg-red-50"
                : selected
                  ? "border-accent-500 bg-accent-50"
                  : "border-gray-300 bg-white"
            }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: meta?.color ?? "#94a3b8" }}
            />
            <span className="truncate font-medium text-gray-800">
              {meta?.name ?? s.statusId}
            </span>
            {s.isInitial && (
              <span className="ml-auto rounded bg-gray-800 px-1 py-0.5 text-[9px] font-semibold text-white">
                START
              </span>
            )}
          </div>
        );
      })}

      {draft.statuses.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          Add a status to start building the workflow.
        </div>
      )}
    </div>
  );
}

/** Collect the status ids referenced by publish errors (for red highlight). */
export function errorStatusIdSet(errors: PublishError[]): Set<string> {
  return new Set(errors.map((e) => e.statusId).filter((id): id is string => Boolean(id)));
}
