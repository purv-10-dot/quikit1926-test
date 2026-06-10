"use client";

import { useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const NODE_TYPES = [
  { kind: "trigger_lead_created", label: "Trigger: Lead Created" },
  { kind: "trigger_lead_updated", label: "Trigger: Lead Updated" },
  { kind: "create_task", label: "Create Task" },
  { kind: "wait", label: "Wait" },
  { kind: "if_else", label: "If / Else" },
  { kind: "distribute_lead", label: "Distribute Lead" },
  { kind: "notify_user", label: "Notify User" },
  { kind: "send_email", label: "Send Email" },
];

interface BuilderProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave?: (graph: { nodes: Node[]; edges: Edge[] }) => Promise<void>;
}

export function WorkflowBuilder({ initialNodes = [], initialEdges = [], onSave }: BuilderProps) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [saving, setSaving] = useState(false);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), []);

  function addNode(kind: string, label: string) {
    const id = `${kind}-${Date.now()}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "default",
        position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
        data: { label, kind },
      },
    ]);
  }

  async function save() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({ nodes, edges });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[70vh] gap-4">
      <aside className="w-56 shrink-0 rounded-xl border border-crm-border bg-white p-3">
        <div className="mb-2 text-xs uppercase tracking-wider text-crm-muted">Add nodes</div>
        <div className="flex flex-col gap-1">
          {NODE_TYPES.map((t) => (
            <button
              key={t.kind}
              onClick={() => addNode(t.kind, t.label)}
              className="rounded-lg border border-crm-border bg-white px-3 py-1.5 text-left text-sm text-crm-text hover:bg-crm-panel"
            >
              {t.label}
            </button>
          ))}
        </div>
        {onSave && (
          <button onClick={save} disabled={saving} className="crm-btn-primary mt-4 w-full">
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </aside>
      <div className="flex-1 rounded-xl border border-crm-border bg-white">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
