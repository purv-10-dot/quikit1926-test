/**
 * Adapters between the workflow EditorDraft and React Flow nodes/edges.
 *
 * The diagram shows:
 *  - a synthetic START node (id "__start__") wired to the INITIAL transition's target,
 *  - one status node per draft status (draggable, with connection handles),
 *  - one edge per transition. A transition can have multiple source statuses
 *    (NORMAL) so it fans out to one edge per source; GLOBAL transitions render a
 *    self-loop-style "Any → target" edge badge; the INITIAL transition is the
 *    START → target edge.
 *
 * Edge id encodes the transition + source so selecting any edge maps back to one
 * transition: `${transitionId}::${sourceStatusId|"__any__"|"__start__"}`.
 */
import type { Edge, Node } from "reactflow";
import type { EditorDraft, StatusMeta } from "../editor-types";

export const START_NODE_ID = "__start__";
export const ANY_SOURCE = "__any__";

export interface StatusNodeData {
  statusId: string;
  name: string;
  category: string;
  color: string;
  isInitial: boolean;
  isError: boolean;
}

export interface StartNodeData {
  label: "START";
}

export interface TransitionEdgeData {
  transitionId: string;
  name: string;
  type: "INITIAL" | "NORMAL" | "GLOBAL";
  ruleCount: number;
  showLabel: boolean;
}

/** Parse an edge id back into { transitionId, source }. */
export function parseEdgeId(edgeId: string): { transitionId: string; source: string } {
  const [transitionId, source] = edgeId.split("::");
  return { transitionId, source: source ?? ANY_SOURCE };
}

export function draftToNodes(
  draft: EditorDraft,
  statusMeta: Map<string, StatusMeta>,
  errorStatusIds: Set<string>,
): Node<StatusNodeData | StartNodeData>[] {
  const nodes: Node<StatusNodeData | StartNodeData>[] = [];

  // START node — placed to the upper-left of the initial status.
  const initial = draft.statuses.find((s) => s.isInitial) ?? draft.statuses[0];
  const startX = (initial?.x ?? 120) - 40;
  const startY = (initial?.y ?? 160) - 120;
  nodes.push({
    id: START_NODE_ID,
    type: "startNode",
    position: { x: startX, y: startY },
    data: { label: "START" },
    draggable: true,
    selectable: false,
  });

  for (const [i, s] of draft.statuses.entries()) {
    const meta = statusMeta.get(s.statusId);
    nodes.push({
      id: s.statusId,
      type: "statusNode",
      position: { x: s.x ?? 120 + i * 220, y: s.y ?? 160 },
      data: {
        statusId: s.statusId,
        name: meta?.name ?? s.statusId,
        category: meta?.category ?? "BACKLOG",
        color: meta?.color ?? "#94a3b8",
        isInitial: s.isInitial,
        isError: errorStatusIds.has(s.statusId),
      },
    });
  }
  return nodes;
}

export function draftToEdges(
  draft: EditorDraft,
  showLabels: boolean,
): Edge<TransitionEdgeData>[] {
  const edges: Edge<TransitionEdgeData>[] = [];
  for (const t of draft.transitions) {
    const ruleCount = t.rules.length;
    if (t.type === "INITIAL") {
      edges.push(mkEdge(START_NODE_ID, t.toStatusId, t, "__start__", ruleCount, showLabels));
      continue;
    }
    if (t.type === "GLOBAL") {
      // "Any status → target": render as an edge from the target back to itself
      // labelled with the ⚡Any badge (matches Jira's global-transition chrome).
      edges.push(mkEdge(t.toStatusId, t.toStatusId, t, ANY_SOURCE, ruleCount, showLabels, true));
      continue;
    }
    // NORMAL: one edge per source status.
    for (const src of t.fromStatusIds) {
      edges.push(mkEdge(src, t.toStatusId, t, src, ruleCount, showLabels));
    }
  }
  return edges;
}

function mkEdge(
  source: string,
  target: string,
  t: EditorDraft["transitions"][number],
  sourceKey: string,
  ruleCount: number,
  showLabel: boolean,
  isGlobal = false,
): Edge<TransitionEdgeData> {
  return {
    id: `${t.id}::${sourceKey}`,
    source,
    target,
    type: "transitionEdge",
    data: {
      transitionId: t.id,
      name: isGlobal ? "Any" : t.name,
      type: t.type,
      ruleCount,
      showLabel,
    },
  };
}
