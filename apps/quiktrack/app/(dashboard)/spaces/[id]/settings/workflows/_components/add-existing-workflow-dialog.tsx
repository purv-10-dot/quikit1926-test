"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import { X, Loader2 } from "lucide-react";
import { flowNodeTypes } from "../[wfId]/_components/flow/flow-nodes";
import { flowEdgeTypes } from "../[wfId]/_components/flow/flow-edges";
import { draftToNodes, draftToEdges } from "../[wfId]/_components/flow/flow-adapters";
import type { EditorDraft, StatusMeta } from "../[wfId]/_components/editor-types";

interface TemplateStatus { name: string; category: string; color?: string; isInitial: boolean }
interface TemplateTransition { name: string; type: "INITIAL" | "NORMAL" | "GLOBAL"; toName: string; fromNames: string[] }
interface TemplateGraph { description: string | null; statuses: TemplateStatus[]; transitions: TemplateTransition[] }
interface OrgWorkflow {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  template: TemplateGraph | null;
}

async function fetchTemplates(): Promise<OrgWorkflow[]> {
  const r = await fetch("/api/workflows");
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load workflows");
  return j.data as OrgWorkflow[];
}

/** Localized "Last modified", or "Built-in" for the built-in template's epoch
 *  placeholder date (which isn't a real timestamp). */
function formatModified(iso: string): string {
  const t = Date.parse(iso);
  // The built-in classic template ships with the Unix epoch as a placeholder.
  if (Number.isNaN(t) || t <= 0) return "Built-in";
  return new Date(t).toLocaleString();
}

/**
 * Build read-only React Flow nodes/edges from a name-based template graph by
 * synthesising a pseudo-draft whose status ids ARE the status names. Reuses the
 * editor's node/edge renderers so the preview matches the real diagram.
 */
function templateToFlow(t: TemplateGraph): { nodes: Node[]; edges: Edge[]; statusMeta: Map<string, StatusMeta> } {
  const statusMeta = new Map<string, StatusMeta>();
  for (const s of t.statuses) {
    statusMeta.set(s.name, { id: s.name, name: s.name, color: s.color ?? "#94a3b8", category: s.category });
  }
  const draft: EditorDraft = {
    workflowId: "__preview__",
    name: "preview",
    description: t.description,
    // Templates carry no saved node positions, so lay the statuses out in a
    // horizontal row (initial status first) — fitView then centres it.
    statuses: [...t.statuses]
      .sort((a, b) => Number(b.isInitial) - Number(a.isInitial))
      .map((s, i) => ({ statusId: s.name, isInitial: s.isInitial, x: 80 + i * 200, y: 160 })),
    transitions: t.transitions.map((tr, i) => ({
      id: `${tr.name}-${i}`,
      name: tr.name,
      type: tr.type,
      toStatusId: tr.toName,
      fromStatusIds: tr.fromNames,
      rules: [],
      triggers: [],
    })),
  };
  return {
    nodes: draftToNodes(draft, statusMeta, new Set()),
    edges: draftToEdges(draft, true),
    statusMeta,
  };
}

/**
 * "Add Existing Workflow" picker — Jira-style: a list of the org's reusable
 * workflow templates on the left, a read-only diagram preview + description +
 * last-modified on the right, and Next to import the selected one into this
 * project (materialized by status name, left as a draft to publish).
 */
export function AddExistingWorkflowDialog({
  projectId,
  onClose,
  onAdded,
}: {
  projectId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["quiktrack", "workflow-templates"],
    queryFn: fetchTemplates,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => data ?? [], [data]);
  const selected = useMemo(() => list.find((w) => w.id === selectedId) ?? null, [list, selectedId]);
  const flow = useMemo(
    () => (selected?.template ? templateToFlow(selected.template) : null),
    [selected],
  );

  const add = useMutation({
    mutationFn: async (workflowId: string) => {
      const r = await fetch(`/api/projects/${projectId}/workflow-scheme/add-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to add workflow");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quiktrack", "workflow-scheme", projectId] });
      onAdded();
      onClose();
    },
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-white dark:bg-gray-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Existing Workflow</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* List */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-gray-200 dark:border-gray-700">
            {isLoading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-red-600">{(error as Error).message}</p>
            ) : list.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">
                No saved workflows yet. Use “Save as new workflow” in the workflow editor to create one.
              </p>
            ) : (
              list.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedId(w.id)}
                  className={`block w-full border-b border-gray-100 dark:border-gray-800 px-4 py-3 text-left text-sm ${
                    w.id === selectedId ? "bg-accent-50 dark:bg-gray-700 font-medium text-accent-800 dark:text-gray-100" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {w.name}
                </button>
              ))
            )}
          </div>

          {/* Preview */}
          <div className="flex min-w-0 flex-1 flex-col p-6">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                Select a workflow to preview it.
              </div>
            ) : (
              <>
                <h4 className="mb-3 text-center text-base font-semibold text-gray-900 dark:text-gray-100">{selected.name}</h4>
                <div className="h-80 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  {flow ? (
                    <ReactFlow
                      key={selected.id}
                      nodes={flow.nodes}
                      edges={flow.edges}
                      nodeTypes={flowNodeTypes}
                      edgeTypes={flowEdgeTypes}
                      fitView
                      fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
                      minZoom={0.2}
                      nodesDraggable={false}
                      nodesConnectable={false}
                      elementsSelectable={false}
                      panOnDrag
                      zoomOnScroll={false}
                      proOptions={{ hideAttribution: true }}
                      onInit={(inst) => {
                        // Re-fit once the instance + container have their real
                        // size. The modal mounts with 0 height, so the initial
                        // fitView fits to nothing (tiny diagram in the corner).
                        requestAnimationFrame(() =>
                          inst.fitView({ padding: 0.18, maxZoom: 1 }),
                        );
                      }}
                    >
                      <Background gap={16} />
                      {/* Zoom controls in the top-left so they don't overlap the
                          centered diagram; no fit/interactive buttons. */}
                      <Controls
                        position="top-left"
                        showFitView={false}
                        showInteractive={false}
                      />
                    </ReactFlow>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      No preview available.
                    </div>
                  )}
                </div>
                <dl className="mt-4 space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-gray-500">Description</dt>
                    <dd className="text-gray-800 dark:text-gray-200">{selected.description || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-gray-500">Last modified</dt>
                    <dd className="text-gray-800 dark:text-gray-200">{formatModified(selected.updatedAt)}</dd>
                  </div>
                </dl>
                {add.error && <p className="mt-2 text-sm text-red-600">{(add.error as Error).message}</p>}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 px-6 py-3">
          <button type="button" onClick={onClose} className="text-sm font-medium text-accent-700 hover:text-accent-800">
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || add.isPending}
            onClick={() => selected && add.mutate(selected.id)}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {add.isPending ? "Adding…" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
