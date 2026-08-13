"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "reactflow";
import { Zap } from "lucide-react";
import type { TransitionEdgeData } from "./flow-adapters";

/**
 * A transition edge: an orthogonal (smooth-step) connector with a dark label
 * badge riding the midpoint — "⚡Create" / "⚡Any" / "⚡<name>" — matching Jira's
 * transition chrome. A rule-count dot shows when the transition has rules.
 */
export const TransitionEdge = memo(function TransitionEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<TransitionEdgeData>) {
  const isSelfLoop = source === target;

  let path: string;
  let labelX: number;
  let labelY: number;

  if (isSelfLoop) {
    // GLOBAL "Any" transition: a small loop that rises above the node and comes
    // back down onto it (a plain top→top smooth-step would collapse to nothing).
    // labelOffset staggers multiple globals on the same node horizontally.
    const cx = sourceX + (data?.labelOffset ?? 0);
    const topY = sourceY - 60;
    path = `M ${sourceX} ${sourceY} C ${sourceX - 26} ${topY}, ${cx + 26} ${topY}, ${cx} ${sourceY}`;
    labelX = (sourceX + cx) / 2;
    labelY = topY - 4;
  } else {
    const [p, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 8,
    });
    path = p;
    // Keep the label ON its edge (its true midpoint) so the connecting line is
    // always visible through/under it. We don't offset it off the line.
    labelX = lx;
    labelY = ly;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#6366f1" : "#94a3b8",
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {data?.showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className={`nodrag nopan inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm ${
              selected ? "bg-accent-600 text-white" : "bg-gray-900 text-white"
            }`}
          >
            <Zap className="h-3 w-3" fill="currentColor" />
            {data.name}
            {data.ruleCount > 0 && (
              <span className="ml-0.5 rounded-full bg-white/25 px-1 text-[9px]">
                {data.ruleCount}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const flowEdgeTypes = {
  transitionEdge: TransitionEdge,
} as const;
