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
  /** Vertical pixel offset for the label so sibling edges don't overlap. */
  labelOffset: number;
}

/** Parse an edge id back into { transitionId, source }. */
export function parseEdgeId(edgeId: string): { transitionId: string; source: string } {
  const [transitionId, source] = edgeId.split("::");
  return { transitionId, source: source ?? ANY_SOURCE };
}

/** Row layout constants (Jira classic = a single left→right row). */
const ROW_Y = 240;
const COL_GAP = 280;
const FIRST_X = 220;
const CATEGORY_ORDER: Record<string, number> = { BACKLOG: 0, IN_PROGRESS: 1, DONE: 2 };

/**
 * Order statuses the way the classic Jira workflow reads: by category
 * (To Do → In Progress → Done), preserving the draft order within a category.
 */
function orderedStatuses(draft: EditorDraft, statusMeta: Map<string, StatusMeta>) {
  return draft.statuses
    .map((s, i) => ({ s, i, cat: CATEGORY_ORDER[statusMeta.get(s.statusId)?.category ?? "BACKLOG"] ?? 0 }))
    .sort((a, b) => (a.cat - b.cat) || (a.i - b.i));
}

export function draftToNodes(
  draft: EditorDraft,
  statusMeta: Map<string, StatusMeta>,
  errorStatusIds: Set<string>,
): Node<StatusNodeData | StartNodeData>[] {
  const nodes: Node<StatusNodeData | StartNodeData>[] = [];
  const ordered = orderedStatuses(draft, statusMeta);

  // Column index per status for the horizontal row.
  const colOf = new Map<string, number>();
  ordered.forEach((o, col) => colOf.set(o.s.statusId, col));

  // START node — left of the first status, on the row.
  nodes.push({
    id: START_NODE_ID,
    type: "startNode",
    position: { x: FIRST_X - 130, y: ROW_Y },
    data: { label: "START" },
    draggable: true,
    selectable: false,
  });

  for (const { s } of ordered) {
    const meta = statusMeta.get(s.statusId);
    const col = colOf.get(s.statusId) ?? 0;
    // Classic layout: statuses always sit on one left→right row (Jira ignores
    // saved scatter positions in this view). Drag still pans a node within the
    // session via React Flow's own store.
    nodes.push({
      id: s.statusId,
      type: "statusNode",
      position: { x: FIRST_X + col * COL_GAP, y: ROW_Y },
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
  // GLOBAL self-loops on the same node fan out horizontally; NORMAL labels sit
  // on their edge midpoint (no vertical offset — that detaches the label from
  // its line). perBand only counts globals-per-node for the horizontal fan.
  const perBand = new Map<string, number>();

  for (const t of draft.transitions) {
    // `rules` is optional on a draft transition (a freshly-seeded workflow has
    // none) — treat a missing array as zero rules.
    const ruleCount = t.rules?.length ?? 0;
    if (t.type === "INITIAL") {
      edges.push(mkEdge(START_NODE_ID, t.toStatusId, t, "__start__", ruleCount, showLabels, false, 0));
      continue;
    }
    if (t.type === "GLOBAL") {
      // "Any status → target": a small self-loop above the target node. Multiple
      // globals on the same node fan out horizontally so their loops don't overlap.
      const key = `global:${t.toStatusId}`;
      const n = perBand.get(key) ?? 0;
      perBand.set(key, n + 1);
      edges.push(mkEdge(t.toStatusId, t.toStatusId, t, ANY_SOURCE, ruleCount, showLabels, true, 60 + n * 70));
      continue;
    }
    // NORMAL: one edge per source status; label sits on the edge midpoint.
    for (const src of t.fromStatusIds) {
      edges.push(mkEdge(src, t.toStatusId, t, src, ruleCount, showLabels, false, 0));
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
  labelOffset = 0,
): Edge<TransitionEdgeData> {
  return {
    id: `${t.id}::${sourceKey}`,
    source,
    target,
    // Route horizontally: leave from the right handle, enter at the left handle
    // (self-loops use top handles for a tidy arc).
    sourceHandle: isGlobal ? "top-s" : "right-s",
    targetHandle: isGlobal ? "top-t" : "left-t",
    type: "transitionEdge",
    data: {
      transitionId: t.id,
      name: isGlobal ? "Any" : t.name,
      type: t.type,
      labelOffset,
      ruleCount,
      showLabel,
    },
  };
}
