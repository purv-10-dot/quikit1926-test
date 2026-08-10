"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { StartNodeData, StatusNodeData } from "./flow-adapters";

/** Category → node accent (matches board/Jira colour language). */
const CATEGORY_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  BACKLOG: { bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-700" },
  IN_PROGRESS: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800" },
  DONE: { bg: "bg-green-50", border: "border-green-300", text: "text-green-800" },
};

/**
 * A status node — a rounded pill with four connection handles (top/right/
 * bottom/left) so the user can drag an edge out of any side, exactly like Jira.
 */
export const StatusNode = memo(function StatusNode({
  data,
  selected,
}: NodeProps<StatusNodeData>) {
  const style = CATEGORY_STYLE[data.category] ?? CATEGORY_STYLE.BACKLOG;
  const ring = data.isError
    ? "border-red-400 ring-2 ring-red-200"
    : selected
      ? "border-accent-500 ring-2 ring-accent-200"
      : style.border;

  // Handles double as source AND target (id-less) so edges can start/end on any
  // side. React Flow lets a Handle be both when type is set per-connection; we
  // expose a source + target handle stacked at each side.
  const handleClass = "!h-2 !w-2 !bg-white !border !border-gray-400";
  const sides: Array<[Position, string]> = [
    [Position.Top, "top"],
    [Position.Right, "right"],
    [Position.Bottom, "bottom"],
    [Position.Left, "left"],
  ];

  return (
    <div
      className={`relative rounded-md border ${style.bg} ${ring} px-4 py-2 text-xs font-semibold uppercase tracking-wide ${style.text} shadow-sm`}
    >
      {sides.map(([pos, key]) => (
        <div key={key}>
          <Handle id={`${key}-t`} type="target" position={pos} className={handleClass} />
          <Handle id={`${key}-s`} type="source" position={pos} className={handleClass} />
        </div>
      ))}
      {data.name}
    </div>
  );
});

/** The synthetic START node — a black circle with a single source handle. */
export const StartNode = memo(function StartNode() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-[9px] font-bold tracking-wide text-white shadow">
      START
      <Handle id="start-s" type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-white !border !border-gray-500" />
    </div>
  );
});

export const flowNodeTypes = {
  statusNode: StatusNode,
  startNode: StartNode,
} as const;

/** Included so the file has a stable default export surface for typing. */
export type { StatusNodeData, StartNodeData };
