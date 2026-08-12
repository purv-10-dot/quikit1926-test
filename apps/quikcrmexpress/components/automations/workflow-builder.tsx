"use client";

import type { WorkflowNode } from "@/types/workflow";

/**
 * [P3.A3] Vertical-flow builder shell (SPEC §9, §3 Option R — REBUILD).
 * ReactFlow is removed from this view: the canvas is a top-down list of node
 * cards with insert-on-line "+" buttons between them. State is owned by the
 * parent (builder-client), which also renders the trigger picker, the node
 * picker, and the A4 config panel.
 *
 * The node REGISTRY lives here (Track A owns the builder-side registry, §7).
 * Only node kinds the ENGINE can execute are offered — no SMS, no deferred
 * actions. send_email and distribute_lead (assign) execute only partially until
 * Track B lands B1–B3, so per the §7 integration order they ship DISABLED here;
 * flipping `disabled` to false is the one-line step once B1–B3 are confirmed.
 */

export interface TriggerDef {
  kind: string;
  label: string;
  description: string;
}
export interface ActionDef {
  kind: string;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
}

export const TRIGGER_REGISTRY: TriggerDef[] = [
  { kind: "trigger_lead_created", label: "Lead Created", description: "Runs when a new lead is created." },
  { kind: "trigger_lead_updated", label: "Lead Updated", description: "Runs when a lead is updated." },
];

export const ACTION_REGISTRY: ActionDef[] = [
  { kind: "if_else", label: "If / Else", description: "Continue only when conditions match." },
  { kind: "update_lead_field", label: "Update Lead Field", description: "Set a stage, status, or other field." },
  { kind: "wait", label: "Wait", description: "Pause for a duration before the next step." },
  { kind: "create_task", label: "Create Task", description: "Create a follow-up task." },
  { kind: "notify_user", label: "Notify User", description: "Send an in-app notification." },
  {
    kind: "send_email",
    label: "Send Email",
    description: "Email the lead with merge fields.",
    disabled: true,
    disabledReason: "Available once the engine email action ships (Track B).",
  },
  {
    kind: "distribute_lead",
    label: "Assign Lead",
    description: "Assign / round-robin to a user.",
    disabled: true,
    disabledReason: "Available once the engine assign action ships (Track B).",
  },
];

const KIND_LABEL: Record<string, string> = {
  ...Object.fromEntries(TRIGGER_REGISTRY.map((t) => [t.kind, `Trigger: ${t.label}`])),
  ...Object.fromEntries(ACTION_REGISTRY.map((a) => [a.kind, a.label])),
};

export function nodeLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

interface Props {
  nodes: WorkflowNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onChangeTrigger: () => void;
  onInsertAt: (index: number) => void;
  onDeleteNode: (id: string) => void;
  /**
   * [P3.F3] When true (automation is published — not Draft), STRUCTURAL controls
   * are hidden: the insert-on-line "+", per-node Remove, and trigger-change (the
   * trigger kind is part of the structure). Node selection stays enabled so
   * content edits still work. Mirrors S1 `canEditStructure()` in the UI instead
   * of only surfacing the rejection server-side at save time.
   */
  structureLocked?: boolean;
}

function InsertLine({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="h-4 w-px bg-crm-border" />
      <button
        type="button"
        onClick={onClick}
        aria-label="Insert step"
        className="mx-2 flex h-6 w-6 items-center justify-center rounded-full border border-crm-border bg-white text-crm-muted hover:border-accent-500 hover:text-accent-600"
      >
        +
      </button>
      <div className="h-4 w-px bg-crm-border" />
    </div>
  );
}

export function WorkflowBuilder({
  nodes,
  selectedNodeId,
  onSelectNode,
  onChangeTrigger,
  onInsertAt,
  onDeleteNode,
  structureLocked = false,
}: Props) {
  const trigger = nodes[0] ?? null;
  const actionNodes = nodes.slice(1);

  return (
    <div className="mx-auto max-w-xl">
      {trigger ? (
        structureLocked ? (
          <div className="w-full rounded-xl border border-accent-300 bg-accent-50 p-4 text-left">
            <div className="text-xs uppercase tracking-wider text-accent-700">Trigger</div>
            <div className="text-sm font-medium text-crm-text">{nodeLabel(trigger.kind)}</div>
            <div className="mt-0.5 text-xs text-crm-muted">Locked — the trigger can only change while in Draft.</div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onChangeTrigger}
            className="w-full rounded-xl border border-accent-300 bg-accent-50 p-4 text-left hover:border-accent-500"
          >
            <div className="text-xs uppercase tracking-wider text-accent-700">Trigger</div>
            <div className="text-sm font-medium text-crm-text">{nodeLabel(trigger.kind)}</div>
            <div className="mt-0.5 text-xs text-crm-muted">Click to change the trigger.</div>
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={onChangeTrigger}
          className="w-full rounded-xl border border-dashed border-crm-border p-6 text-center text-sm text-crm-muted hover:border-accent-500 hover:text-accent-600"
        >
          + Choose a trigger to start
        </button>
      )}

      {trigger && (
        <>
          {actionNodes.map((node, i) => (
            <div key={node.id}>
              {structureLocked ? <div className="h-4" /> : <InsertLine onClick={() => onInsertAt(i + 1)} />}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectNode(node.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelectNode(node.id)}
                className={
                  "flex items-center gap-3 rounded-xl border bg-white p-4 text-left transition " +
                  (node.id === selectedNodeId ? "border-accent-500 ring-1 ring-accent-500" : "border-crm-border hover:border-accent-300")
                }
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-crm-text">{nodeLabel(node.kind)}</div>
                  <div className="text-xs text-crm-muted">Click to configure.</div>
                </div>
                {!structureLocked && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(node.id);
                    }}
                    aria-label="Remove step"
                    className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {structureLocked ? <div className="h-4" /> : <InsertLine onClick={() => onInsertAt(nodes.length)} />}
        </>
      )}
    </div>
  );
}
