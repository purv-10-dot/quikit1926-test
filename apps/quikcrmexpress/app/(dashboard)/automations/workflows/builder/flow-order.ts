/**
 * [P3.A3] Vertical-flow model helpers. The builder is a top-down LINEAR sequence
 * (SPEC §9, Option R): `nodes[0]` is the trigger, each node flows into the next.
 * The engine's canonical graph (`@/types/workflow`) is derived from that order —
 * an if_else node's outgoing edge carries `branch: "true"`, so a false condition
 * has no edge and the run stops (gate/filter semantics the engine already runs
 * via pickNext). This replaces the ReactFlow free-drag canvas (§3 decision R).
 */
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

/** Reconstruct the ordered node list from a stored engine graph by walking edges
 *  from the trigger. Any nodes not reachable in the linear walk are appended so
 *  nothing is silently dropped. */
export function orderFromGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  triggerType: string | null,
): WorkflowNode[] {
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start =
    (triggerType && nodes.find((n) => n.kind === triggerType)) ||
    nodes.find((n) => n.kind.startsWith("trigger_")) ||
    nodes[0];

  const ordered: WorkflowNode[] = [];
  const seen = new Set<string>();
  let cur: WorkflowNode | undefined = start;
  while (cur && !seen.has(cur.id)) {
    ordered.push(cur);
    seen.add(cur.id);
    const edge = edges.find((e) => e.from === cur!.id && (e.branch === undefined || e.branch === "true"));
    cur = edge ? byId.get(edge.to) : undefined;
  }
  // Preserve any orphaned nodes (non-linear leftovers) at the end.
  for (const n of nodes) if (!seen.has(n.id)) ordered.push(n);
  return ordered;
}

/** Derive the engine graph from the ordered node list. Consecutive nodes are
 *  connected; edges leaving an if_else node are tagged branch:"true". */
export function graphFromOrder(ordered: WorkflowNode[]): {
  graphNodes: WorkflowNode[];
  graphEdges: WorkflowEdge[];
  triggerType: string | null;
} {
  const graphEdges: WorkflowEdge[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i]!;
    const edge: WorkflowEdge = { from: from.id, to: ordered[i + 1]!.id };
    if (from.kind === "if_else") edge.branch = "true";
    graphEdges.push(edge);
  }
  const first = ordered[0];
  const triggerType = first && first.kind.startsWith("trigger_") ? first.kind : null;
  return { graphNodes: ordered, graphEdges, triggerType };
}
