"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { flowNodeTypes } from "./flow-nodes";
import { flowEdgeTypes } from "./flow-edges";
import {
  START_NODE_ID,
  draftToEdges,
  draftToNodes,
} from "./flow-adapters";
import type { EditorDraft, StatusMeta } from "../editor-types";

/**
 * The Jira-style workflow diagram (React Flow).
 *
 * IMPORTANT — avoid the render loop: React Flow must own its node/edge state
 * (useNodesState/useEdgesState). We seed that state from the draft and re-sync
 * ONLY when the draft's structural signature (positions, statuses, transitions,
 * rules) or the label/error/selection inputs actually change — never by handing
 * React Flow a freshly-built array on every render (that makes its internal
 * zustand store churn → "Maximum update depth exceeded").
 */
export function FlowCanvas({
  draft,
  statusMeta,
  errorStatusIds,
  showLabels,
  selectedStatusId,
  selectedTransitionId,
  onMoveNode,
  onCreateTransition,
  onSelectStatus,
  onSelectTransition,
  onClearSelection,
}: {
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  errorStatusIds: Set<string>;
  showLabels: boolean;
  selectedStatusId: string | null;
  selectedTransitionId: string | null;
  onMoveNode: (statusId: string, x: number, y: number) => void;
  onCreateTransition: (sourceStatusId: string, targetStatusId: string) => void;
  onSelectStatus: (statusId: string) => void;
  onSelectTransition: (transitionId: string) => void;
  onClearSelection: () => void;
}) {
  const buildEdges = useCallback(
    () =>
      draftToEdges(draft, showLabels).map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#94a3b8" },
      })),
    [draft, showLabels],
  );

  // Seed React Flow's state SYNCHRONOUSLY on first render (lazy initializers) so
  // nodes exist before fitView runs — an empty initial array left the canvas blank.
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(
    draftToNodes(draft, statusMeta, errorStatusIds),
  );
  const [edges, setEdges] = useEdgesState(buildEdges());

  // A structural signature — re-sync ONLY when the diagram's content changes
  // (not on every render, which would churn React Flow's store → render loop).
  const structureKey = useMemo(
    () =>
      JSON.stringify(
        // Positions are auto-computed (classic row), so they don't affect the
        // structural signature — only which statuses exist and the initial one.
        draft.statuses.map((s) => [s.statusId, s.isInitial]),
      ) +
      "|" +
      JSON.stringify(
        draft.transitions.map((t) => [t.id, t.type, t.toStatusId, t.fromStatusIds, t.rules.length]),
      ) +
      "|labels:" + String(showLabels) +
      "|err:" + Array.from(errorStatusIds).sort().join(",") +
      "|meta:" + draft.statuses.map((s) => statusMeta.get(s.statusId)?.name ?? "").join(","),
    [draft, showLabels, errorStatusIds, statusMeta],
  );
  const lastStructure = useRef<string>(structureKey); // seeded already → skip first run

  useEffect(() => {
    if (lastStructure.current === structureKey) return;
    lastStructure.current = structureKey;
    setNodes(draftToNodes(draft, statusMeta, errorStatusIds));
    setEdges(buildEdges());
    // structureKey is the intended trigger; the rest are read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  // Reflect the parent's selection into the node/edge `selected` flags without
  // rebuilding the arrays (cheap map, no store churn).
  const styledNodes = useMemo<Node[]>(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedStatusId })),
    [nodes, selectedStatusId],
  );
  const styledEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const selected = (e.data?.transitionId ?? null) === selectedTransitionId;
        return { ...e, selected };
      }),
    [edges, selectedTransitionId],
  );

  // Classic layout is auto-arranged, so drags are visual-only (React Flow's own
  // store) — we don't persist positions back to the draft. onMoveNode is kept in
  // the props for callers but intentionally unused here.
  void onMoveNode;
  const onNodesChange = onNodesChangeInternal;

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.source === START_NODE_ID) return;
      if (conn.source === conn.target) return;
      onCreateTransition(conn.source, conn.target);
    },
    [onCreateTransition],
  );

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === START_NODE_ID) return;
      onSelectStatus(node.id);
    },
    [onSelectStatus],
  );

  const handleEdgeClick = useCallback(
    (_: unknown, edge: Edge) => {
      const transitionId = (edge.data as { transitionId?: string } | undefined)?.transitionId;
      if (transitionId) onSelectTransition(transitionId);
    },
    [onSelectTransition],
  );

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={styledEdges}
      nodeTypes={flowNodeTypes}
      edgeTypes={flowEdgeTypes}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={onClearSelection}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: "transitionEdge" }}
    >
      <Background gap={16} color="#eef2f6" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(148,163,184,0.12)"
        nodeColor={(n) => nodeMiniColor(n)}
        nodeStrokeColor="#cbd5e1"
        nodeBorderRadius={4}
        style={{ width: 168, height: 108 }}
      />
    </ReactFlow>
  );
}

/** Minimap node fill by status category (matches the node colours). */
function nodeMiniColor(n: { data?: unknown; id?: string }): string {
  if (n.id === START_NODE_ID) return "#111827";
  const cat = (n.data as { category?: string } | undefined)?.category;
  if (cat === "DONE") return "#86efac";
  if (cat === "IN_PROGRESS") return "#93c5fd";
  return "#e5e7eb";
}
