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
  onDeleteStatus,
  onDeleteTransition,
  onRerouteTransition,
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
  onDeleteStatus: (statusId: string) => void;
  onDeleteTransition: (transitionId: string) => void;
  onRerouteTransition: (transitionId: string, oldSource: string, newSource: string, newTarget: string) => void;
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
        // Positions are intentionally EXCLUDED from the structural signature: a
        // drag persists x/y via onNodeDragStop, and re-syncing draftToNodes here
        // on every position change would yank the node back mid-drag. React Flow
        // owns live positions; we only re-sync when statuses/transitions change.
        draft.statuses.map((s) => [s.statusId, s.isInitial]),
      ) +
      "|" +
      JSON.stringify(
        draft.transitions.map((t) => [t.id, t.type, t.toStatusId, t.fromStatusIds, t.rules?.length ?? 0]),
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

  const onNodesChange = onNodesChangeInternal;

  // Persist a node's new position to the draft when the user finishes dragging
  // it. This is what makes the layout stick (draftToNodes reads saved x/y) AND
  // marks the workflow dirty, so "Update workflow" enables to save/publish it.
  // Fires once on release (not every frame). START is synthetic — nothing to save.
  const handleNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === START_NODE_ID) return;
      onMoveNode(node.id, Math.round(node.position.x), Math.round(node.position.y));
    },
    [onMoveNode],
  );

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

  // Drag an edge endpoint to reroute the transition (change its from/to status).
  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge, conn: Connection) => {
      const tid = (oldEdge.data as { transitionId?: string } | undefined)?.transitionId;
      if (!tid || !conn.source || !conn.target) return;
      if (conn.source === START_NODE_ID || conn.source === conn.target) return;
      const oldSource = oldEdge.source;
      onRerouteTransition(tid, oldSource, conn.source, conn.target);
    },
    [onRerouteTransition],
  );

  // Delete/Backspace on the CURRENT selection (our own selection model — not
  // React Flow's, whose selected flag we override each render). Capture phase so
  // the pane can't swallow the key. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (selectedTransitionId) {
        e.preventDefault();
        onDeleteTransition(selectedTransitionId);
      } else if (selectedStatusId && selectedStatusId !== START_NODE_ID) {
        e.preventDefault();
        onDeleteStatus(selectedStatusId);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [selectedStatusId, selectedTransitionId, onDeleteStatus, onDeleteTransition]);

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={styledEdges}
      nodeTypes={flowNodeTypes}
      edgeTypes={flowEdgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={handleNodeDragStop}
      onConnect={onConnect}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={onClearSelection}
      onEdgeUpdate={handleEdgeUpdate}
      deleteKeyCode={null}
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
