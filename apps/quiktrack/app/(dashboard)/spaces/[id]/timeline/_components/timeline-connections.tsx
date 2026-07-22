"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Col } from "./timeline-meta";

export interface DepEdge {
  sourceIssueId: string;
  targetIssueId: string;
}

interface Point {
  left: number;
  right: number;
  midY: number;
}

interface DrawnEdge {
  key: string;
  d: string;
  kind: "dependency" | "hierarchy";
}

/** Curve from a source bar's finish to a target bar's start (finish-to-start). */
function dependencyPath(s: Point, t: Point): string {
  const sx = s.right;
  const sy = s.midY;
  const tx = t.left;
  const ty = t.midY;
  const dx = Math.max(16, Math.min(48, Math.abs(tx - sx) / 2));
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

/** Softer curve from a parent bar's start down into each child bar's start. */
function hierarchyPath(parent: Point, child: Point): string {
  const sx = parent.left + 8;
  const sy = parent.midY;
  const tx = child.left;
  const ty = child.midY;
  const midY = (sy + ty) / 2;
  return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
}

/**
 * SVG overlay drawn over the timeline strip. Connects work-item bars with:
 *   • hierarchy connectors (parent → child), thin/grey, no arrowhead
 *   • dependency connectors (RELATES_TO links), blue with an arrowhead
 * Only draws between bars currently rendered in the DOM — collapsed / not-yet-
 * loaded rows have no bar to anchor to, so their edges are simply skipped.
 *
 * Positions are read from the DOM (each bar carries data-timeline-bar +
 * data-issue-id + data-parent-id) relative to the scrolling content, so the
 * overlay stays correct through lazy expansion, zoom changes, and scrolling.
 */
export function TimelineConnections({
  contentRef,
  depEdges,
  columns,
  leftWidth,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  depEdges: DepEdge[];
  columns: Col[];
  leftWidth: number;
}) {
  const [edges, setEdges] = useState<DrawnEdge[]>([]);
  const rafRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const base = content.getBoundingClientRect();
    const bars = content.querySelectorAll<HTMLElement>("[data-timeline-bar]");
    const map = new Map<string, Point>();
    const parentOf = new Map<string, string>();
    bars.forEach((el) => {
      const id = el.dataset.issueId;
      if (!id) return;
      const r = el.getBoundingClientRect();
      map.set(id, {
        left: r.left - base.left,
        right: r.right - base.left,
        midY: r.top - base.top + r.height / 2,
      });
      const parent = el.dataset.parentId;
      if (parent) parentOf.set(id, parent);
    });

    const drawn: DrawnEdge[] = [];
    // Hierarchy: parent → child, when both bars are rendered.
    for (const [childId, parentId] of parentOf) {
      const child = map.get(childId);
      const parent = map.get(parentId);
      if (child && parent) {
        drawn.push({
          key: `h:${parentId}:${childId}`,
          d: hierarchyPath(parent, child),
          kind: "hierarchy",
        });
      }
    }
    // Dependencies: source → target, when both bars are rendered.
    for (const e of depEdges) {
      const s = map.get(e.sourceIssueId);
      const t = map.get(e.targetIssueId);
      if (s && t) {
        drawn.push({
          key: `d:${e.sourceIssueId}:${e.targetIssueId}`,
          d: dependencyPath(s, t),
          kind: "dependency",
        });
      }
    }
    setEdges(drawn);
  }, [contentRef, depEdges]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  // Re-measure whenever the columns (zoom) or edge set changes.
  useLayoutEffect(() => {
    scheduleMeasure();
  }, [scheduleMeasure, columns, leftWidth]);

  // Re-measure when the content resizes — covers lazy expand/collapse/load.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(content);
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [contentRef, scheduleMeasure]);

  if (edges.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1]"
      style={{ overflow: "visible" }}
      aria-hidden
    >
      <defs>
        <marker
          id="tl-dep-arrow"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L8 4 L0 8 z" fill="#2563eb" />
        </marker>
      </defs>
      {edges.map((e) =>
        e.kind === "dependency" ? (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke="#2563eb"
            strokeWidth={1.5}
            strokeOpacity={0.9}
            markerEnd="url(#tl-dep-arrow)"
          />
        ) : (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1.25}
            strokeOpacity={0.85}
            strokeDasharray="3 3"
          />
        ),
      )}
    </svg>
  );
}
