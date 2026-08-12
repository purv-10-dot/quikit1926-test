"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WorkflowBuilder,
  TRIGGER_REGISTRY,
  ACTION_REGISTRY,
} from "@/components/automations/workflow-builder";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";
import { graphFromOrder, orderFromGraph } from "./flow-order";
import { NodeConfigPanel, type PanelUser, type SelectedNode } from "./node-config-panel";

/**
 * [P3.A2 + A4 + A3] Client wrapper that owns the builder graph, save/load, the
 * trigger + node pickers, and the node-config panel. The graph is held as an
 * ordered WorkflowNode[] in the engine's native shape (nodes[0] = trigger);
 * flow-order derives the engine edges on save. Save POSTs (new) / PATCHes
 * (existing, A1) and persists as Draft — the "0 defined" fix (SURVEY #4).
 */
interface Props {
  definitionId: string | null;
  initialName: string;
  initialTriggerType: string | null;
  initialStatus: string | null;
  initialNodes: WorkflowNode[];
  initialEdges: WorkflowEdge[];
}

/**
 * Structure is editable only in Draft (or a brand-new, never-saved build with no
 * status yet). Mirrors S1 lifecycle `canEditStructure()` — kept as a local pure
 * check because that service module imports prisma and can't cross into a client
 * component. Once published, only content (node config) may change.
 */
function canEditStructure(status: string | null): boolean {
  return status === null || status === "Draft";
}

function makeNodeId(kind: string): string {
  // Client-only; uniqueness within a single builder session is enough.
  return `${kind}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function BuilderClient({
  definitionId,
  initialName,
  initialTriggerType,
  initialStatus,
  initialNodes,
  initialEdges,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const initialOrder = useMemo(
    () => orderFromGraph(initialNodes, initialEdges, initialTriggerType),
    [initialNodes, initialEdges, initialTriggerType],
  );

  const [id, setId] = useState<string | null>(definitionId);
  const [defStatus, setDefStatus] = useState<string | null>(initialStatus);
  const [name, setName] = useState(initialName || "Untitled workflow");
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialOrder);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/users/picker")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: PanelUser[]; data?: { items?: PanelUser[] } }) => alive && setUsers(d.data?.items ?? d.items ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const pickTrigger = useCallback((kind: string) => {
    setNodes((ns) => {
      const trigger: WorkflowNode = { id: makeNodeId(kind), kind: kind as WorkflowNode["kind"], config: {} };
      return ns.length === 0 ? [trigger] : [{ ...ns[0]!, kind: kind as WorkflowNode["kind"] }, ...ns.slice(1)];
    });
    setTriggerPickerOpen(false);
  }, []);

  const insertAction = useCallback(
    (kind: string) => {
      const node: WorkflowNode = { id: makeNodeId(kind), kind: kind as WorkflowNode["kind"], config: {} };
      setNodes((ns) => {
        const at = insertIndex ?? ns.length;
        return [...ns.slice(0, at), node, ...ns.slice(at)];
      });
      setInsertIndex(null);
      setSelectedNodeId(node.id);
    },
    [insertIndex],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setSelectedNodeId((sel) => (sel === nodeId ? null : sel));
    },
    [],
  );

  const structureEditable = canEditStructure(defStatus);

  const selectedNode: SelectedNode | null = useMemo(() => {
    const n = nodes.find((x) => x.id === selectedNodeId);
    return n ? { id: n.id, kind: n.kind, config: n.config ?? {} } : null;
  }, [nodes, selectedNodeId]);

  const onChangeConfig = useCallback(
    (config: Record<string, unknown>) => {
      setNodes((ns) => ns.map((n) => (n.id === selectedNodeId ? { ...n, config } : n)));
    },
    [selectedNodeId],
  );

  async function save() {
    setError(null);
    setStatus(null);
    setSaving(true);
    const { graphNodes, graphEdges, triggerType } = graphFromOrder(nodes);
    const body = JSON.stringify({ name: name.trim() || "Untitled workflow", triggerType, graphNodes, graphEdges });
    try {
      const res = id
        ? await fetch(`/api/automations/workflows/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch(`/api/automations/workflows`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? `Save failed (${res.status})`);
        return;
      }
      const saved = (await res.json()) as { id: string; status?: string };
      if (!id) {
        setId(saved.id);
        router.replace(`/automations/workflows/builder?id=${saved.id}`);
      }
      if (saved.status) setDefStatus(saved.status);
      // [P3.F1b] The write always commits (we await res.json() above) — the bug
      // is a STALE READ. The list/detail are server components and this save is a
      // plain fetch (not a server action), so Next.js's client Router Cache keeps
      // serving the RSC payload it prefetched BEFORE the save; the edit only
      // "sometimes" shows depending on when that cache entry expires. Invalidate
      // it so any subsequent navigation reads committed server truth. Same pattern
      // the lead detail shell uses after every mutation.
      router.refresh();
      setStatus("Saved as draft.");
      // [P3.F2] Explicit success signal — the inline "Saved as draft." text is
      // easy to miss, so a toast confirms the save landed (and, with F1b, that
      // it's safe to navigate).
      toast.success("Workflow saved as draft");
    } catch {
      setError("Save failed — network error.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * [P3.F4] Reload the saved definition from the server and reset the canvas to
   * it — the escape hatch when an in-progress edit needs undoing (e.g. a rejected
   * structural change on a published rule, or just a messy Draft edit). Only
   * meaningful once the definition exists (there is a saved version to reload).
   */
  async function discard() {
    if (!id) return;
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/automations/workflows/${id}`);
      if (!res.ok) {
        setError("Could not reload the saved version.");
        return;
      }
      const def = (await res.json()) as {
        name?: string;
        triggerType?: string | null;
        status?: string | null;
        graphNodes?: WorkflowNode[];
        graphEdges?: WorkflowEdge[];
      };
      setName(def.name || "Untitled workflow");
      setNodes(orderFromGraph(def.graphNodes ?? [], def.graphEdges ?? [], def.triggerType ?? null));
      setDefStatus(def.status ?? null);
      setSelectedNodeId(null);
      toast.success("Reverted to the saved version");
    } catch {
      setError("Could not reload the saved version — network error.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-crm-muted" htmlFor="wf-name">
          Name
        </label>
        <input
          id="wf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-72 rounded-lg border border-crm-border bg-white px-3 py-1.5 text-sm text-crm-text"
          placeholder="Untitled workflow"
        />
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? "Saving…" : "Save"}
        </Button>
        {id && (
          <Button onClick={discard} disabled={saving} size="sm" variant="secondary">
            Discard changes
          </Button>
        )}
        {status && <span className="text-xs text-emerald-600">{status}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {!structureEditable && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This automation is published (status: {defStatus}). Its structure is
          locked — unpublish it to Draft to add, remove, or reconnect steps.
          Content edits (field values, conditions, wait duration) are still
          allowed.
        </div>
      )}

      <WorkflowBuilder
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onChangeTrigger={() => setTriggerPickerOpen(true)}
        onInsertAt={(index) => setInsertIndex(index)}
        onDeleteNode={deleteNode}
        structureLocked={!structureEditable}
      />

      <NodeConfigPanel
        node={selectedNode}
        users={users}
        onChangeConfig={onChangeConfig}
        onClose={() => setSelectedNodeId(null)}
      />

      {/* Trigger picker — the first step when building from scratch (SPEC §9). */}
      <Modal open={triggerPickerOpen} onClose={() => setTriggerPickerOpen(false)} title="Choose a trigger">
        <div className="space-y-2">
          {TRIGGER_REGISTRY.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => pickTrigger(t.kind)}
              className="w-full rounded-lg border border-crm-border p-3 text-left hover:border-accent-500 hover:bg-accent-50"
            >
              <div className="text-sm font-medium text-crm-text">{t.label}</div>
              <div className="text-xs text-crm-muted">{t.description}</div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Node picker — only engine-executable kinds; send_email/assign disabled
          until Track B lands them (§7). */}
      <Modal open={insertIndex !== null} onClose={() => setInsertIndex(null)} title="Add a step">
        <div className="space-y-2">
          {ACTION_REGISTRY.map((a) => (
            <button
              key={a.kind}
              type="button"
              disabled={a.disabled}
              onClick={() => insertAction(a.kind)}
              className={
                "w-full rounded-lg border p-3 text-left " +
                (a.disabled
                  ? "cursor-not-allowed border-crm-border bg-crm-panel opacity-60"
                  : "border-crm-border hover:border-accent-500 hover:bg-accent-50")
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-crm-text">{a.label}</span>
                {a.disabled && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                    Soon
                  </span>
                )}
              </div>
              <div className="text-xs text-crm-muted">{a.disabled ? a.disabledReason : a.description}</div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
