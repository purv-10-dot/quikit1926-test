"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Columns, GitBranch, Zap, Bot, MoreHorizontal, HelpCircle, ChevronDown } from "lucide-react";
import { DiagramHelpDialog } from "./diagram-help-dialog";
import { useWorkflowEditor } from "./use-workflow-editor";
import { errorStatusIdSet } from "./diagram-canvas";
import { TextView } from "./text-view";
import { AddStatusDialog, AddTransitionDialog, SaveAsNewWorkflowDialog } from "./editor-dialogs";
import { FlowCanvas } from "./flow/flow-canvas";
import { StatusPanel } from "./flow/status-panel";
import { TransitionPanel } from "./flow/transition-panel";
import { MigrationDialog } from "../../_components/migration-dialog";
import {
  draftFromReadModel,
  type StatusMeta,
  type WorkflowReadModel,
} from "./editor-types";

async function fetchResolutions(projectId: string): Promise<{ id: string; name: string }[]> {
  const r = await fetch(`/api/projects/${projectId}/resolutions`);
  const j = await r.json();
  if (!r.ok || !j.success) return [];
  return j.data as { id: string; name: string }[];
}

async function fetchReadModel(wfId: string): Promise<WorkflowReadModel> {
  const r = await fetch(`/api/workflows/${wfId}`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as WorkflowReadModel;
}

async function fetchStatuses(projectId: string): Promise<StatusMeta[]> {
  // The editor renders the workflow diagram, which includes draft statuses —
  // include them so the nodes have names/colours.
  const r = await fetch(`/api/projects/${projectId}/statuses?includeDraft=1`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load statuses");
  return (j.data as Array<{ id: string; name: string; color: string; category: string }>).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
  }));
}

export function WorkflowEditor({ projectId, wfId }: { projectId: string; wfId: string }) {
  const router = useRouter();
  const rm = useQuery({ queryKey: ["quiktrack", "workflow", wfId], queryFn: () => fetchReadModel(wfId) });
  const pool = useQuery({ queryKey: ["quiktrack", "statuses", projectId], queryFn: () => fetchStatuses(projectId) });

  if (rm.isLoading || pool.isLoading) {
    return (
      <div className="flex items-center gap-2 px-8 py-8 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading editor…
      </div>
    );
  }
  if (rm.error || pool.error) {
    return <div className="px-8 py-8 text-sm text-red-600">{((rm.error ?? pool.error) as Error).message}</div>;
  }

  return (
    <EditorBody
      projectId={projectId}
      wfId={wfId}
      initialDraft={draftFromReadModel(rm.data!)}
      isActive={rm.data!.workflow.isActive}
      hasPendingDraft={rm.data!.draft !== null}
      pool={pool.data!}
      onClose={() => router.push(`/spaces/${projectId}/settings/workflows`)}
    />
  );
}

type Selection =
  | { kind: "status"; statusId: string }
  | { kind: "transition"; transitionId: string }
  | null;

function EditorBody({
  projectId,
  wfId,
  initialDraft,
  isActive,
  hasPendingDraft,
  pool,
  onClose,
}: {
  projectId: string;
  wfId: string;
  initialDraft: ReturnType<typeof draftFromReadModel>;
  isActive: boolean;
  hasPendingDraft: boolean;
  pool: StatusMeta[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ed = useWorkflowEditor(wfId, initialDraft, hasPendingDraft);
  const [tab, setTab] = useState<"diagram" | "text">("diagram");
  const [showLabels, setShowLabels] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [addStatusOpen, setAddStatusOpen] = useState(false);
  const [addTransitionOpen, setAddTransitionOpen] = useState(false);
  // When the Add-transition dialog is opened by drawing an edge on the diagram,
  // pre-fill its From/To with the connected statuses.
  const [transitionPrefill, setTransitionPrefill] = useState<{ from: string; to: string } | null>(null);
  // "Update workflow ▾" split-button menu + the "Save as new workflow" dialog.
  const [updateMenuOpen, setUpdateMenuOpen] = useState(false);
  const [saveAsNewOpen, setSaveAsNewOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);

  const resolutions = useQuery({
    queryKey: ["quiktrack", "resolutions", projectId],
    queryFn: () => fetchResolutions(projectId),
  });


  const statusMeta = useMemo(() => new Map(pool.map((s) => [s.id, s])), [pool]);
  const errorStatusIds = errorStatusIdSet(ed.publishErrors);

  const selectedTransition =
    selection?.kind === "transition"
      ? ed.draft.transitions.find((t) => t.id === selection.transitionId) ?? null
      : null;
  const selectedStatusId = selection?.kind === "status" ? selection.statusId : null;

  // Drawing an edge between two statuses opens the "Create transition" dialog
  // pre-filled with those statuses (Jira behaviour) — the user names/confirms it
  // rather than a bare transition being created silently.
  const createTransition = (sourceStatusId: string, targetStatusId: string) => {
    setTransitionPrefill({ from: sourceStatusId, to: targetStatusId });
    setAddTransitionOpen(true);
  };

  // Persist a status name/category edit to the project status, then refresh the pool.
  const patchStatus = async (statusId: string, body: { name?: string; category?: string }) => {
    await fetch(`/api/projects/${projectId}/statuses/${statusId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    qc.invalidateQueries({ queryKey: ["quiktrack", "statuses", projectId] });
  };

  const ToolButton = ({
    icon: Icon,
    label,
    onClick,
    disabled,
  }: {
    icon: typeof GitBranch;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-0.5 rounded px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-100 disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    // Pin to the viewport (minus the top nav) so the diagram body is bounded and
    // fully on-screen — otherwise React Flow's 100%-height pane overflows below
    // the fold and fitView centres content off-screen.
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* Toolbar (Jira-style) */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">{ed.draft.name}</div>
          <div className="text-[11px] text-gray-400">
            {isActive ? "Active workflow" : "Inactive workflow"}
            {ed.draft.transitions.length > 0 && " · Used in 1 space"}
          </div>
        </div>

        <div className="mx-auto flex items-center gap-1">
          <ToolButton icon={Columns} label="Add status" onClick={() => setAddStatusOpen(true)} />
          <ToolButton
            icon={GitBranch}
            label="Add Transition"
            onClick={() => {
              setTransitionPrefill(null); // toolbar open → empty dialog
              setAddTransitionOpen(true);
            }}
            disabled={ed.draft.statuses.length < 1}
          />
          <ToolButton
            icon={Zap}
            label="Add Rule"
            onClick={() => {
              // "Add Rule" selects the first transition so its rule accordions open.
              const first = ed.draft.transitions[0];
              if (first) setSelection({ kind: "transition", transitionId: first.id });
            }}
            disabled={ed.draft.transitions.length < 1}
          />
          <ToolButton icon={Bot} label="Add agent" disabled />
        </div>

        <div className="flex items-center gap-2">
          {ed.saving && <span className="text-xs text-gray-400">Saving…</span>}
          {ed.published ? (
            // Published, no unpublished changes → a single Close button.
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
            >
              Close
            </button>
          ) : (
            <>
              {/* Split button: "Update workflow" + ▾ "Save as new workflow". */}
              <div className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => ed.publish.mutate(undefined)}
                  disabled={ed.publish.isPending}
                  className="rounded-l bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
                >
                  {ed.publish.isPending ? "Publishing…" : "Update workflow"}
                </button>
                <button
                  type="button"
                  onClick={() => setUpdateMenuOpen((v) => !v)}
                  aria-label="More update options"
                  className="rounded-r border-l border-accent-700/40 bg-accent-600 px-1.5 py-1.5 text-white hover:bg-accent-700"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                {updateMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUpdateMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setUpdateMenuOpen(false);
                          setSaveAsNewOpen(true);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Save as new workflow
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                Discard changes
              </button>
            </>
          )}
          <button
            type="button"
            disabled
            className="rounded border border-gray-300 p-1.5 text-gray-400"
            title="More (coming soon)"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sub-toolbar: Diagram/Text + Show transition labels */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-1.5">
        <div className="flex rounded border border-gray-300 text-sm">
          <button
            type="button"
            onClick={() => setTab("diagram")}
            className={`px-3 py-1 ${tab === "diagram" ? "bg-accent-50 text-accent-700" : "text-gray-600"}`}
          >
            Diagram
          </button>
          <button
            type="button"
            onClick={() => setTab("text")}
            className={`border-l border-gray-300 px-3 py-1 ${tab === "text" ? "bg-accent-50 text-accent-700" : "text-gray-600"}`}
          >
            Text
          </button>
        </div>
        {tab === "diagram" && (
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="rounded-full border border-gray-300 p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="How to use the workflow diagram"
              aria-label="Help"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded border-gray-300 text-accent-600"
              />
              Show transition labels
            </label>
          </div>
        )}
      </div>

      {helpOpen && <DiagramHelpDialog onClose={() => setHelpOpen(false)} />}

      {/* Banners */}
      {ed.publish.isSuccess && (
        <div className="border-b border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Workflow published.
        </div>
      )}
      {ed.publishErrors.length > 0 && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <div className="font-medium">Can&apos;t publish — fix these:</div>
          <ul className="mt-1 list-disc pl-5">
            {ed.publishErrors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {ed.saveError && ed.saveError.message !== "NEEDS_MIGRATION" && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {ed.saveError.message}
        </div>
      )}

      {ed.migration && (
        <MigrationDialog
          projectId={projectId}
          items={ed.migration}
          applying={ed.publish.isPending}
          error={null}
          onCancel={ed.clearMigration}
          onApply={(mapping) => ed.publish.mutate(mapping)}
        />
      )}

      {/* Body + contextual right panel */}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          {tab === "diagram" ? (
            <FlowCanvas
              draft={ed.draft}
              statusMeta={statusMeta}
              errorStatusIds={errorStatusIds}
              showLabels={showLabels}
              selectedStatusId={selectedStatusId}
              selectedTransitionId={selectedTransition?.id ?? null}
              onMoveNode={ed.moveNode}
              onCreateTransition={createTransition}
              onSelectStatus={(statusId) => setSelection({ kind: "status", statusId })}
              onSelectTransition={(transitionId) => setSelection({ kind: "transition", transitionId })}
              onClearSelection={() => setSelection(null)}
              onDeleteStatus={(statusId) => {
                ed.removeStatus(statusId);
                setSelection(null);
              }}
              onDeleteTransition={(transitionId) => {
                ed.removeTransition(transitionId);
                setSelection(null);
              }}
              onRerouteTransition={(transitionId, oldSource, newSource, newTarget) => {
                const t = ed.draft.transitions.find((x) => x.id === transitionId);
                if (!t) return;
                // Swap the dragged source for the new one; retarget if changed.
                const fromStatusIds = t.fromStatusIds.map((s) => (s === oldSource ? newSource : s));
                ed.updateTransition(transitionId, {
                  fromStatusIds: Array.from(new Set(fromStatusIds)),
                  toStatusId: newTarget,
                });
              }}
            />
          ) : (
            <TextView
              draft={ed.draft}
              statusMeta={statusMeta}
              onRemoveStatus={ed.removeStatus}
              onSetInitial={ed.setInitial}
              onRemoveTransition={ed.removeTransition}
            />
          )}
        </div>

        {tab === "diagram" && selectedStatusId && (
          <StatusPanel
            statusId={selectedStatusId}
            meta={statusMeta.get(selectedStatusId)}
            draft={ed.draft}
            onRenamed={(name) => patchStatus(selectedStatusId, { name })}
            onRecategorised={(category) => patchStatus(selectedStatusId, { category })}
            onSelectTransition={(transitionId) => setSelection({ kind: "transition", transitionId })}
            onRemove={() => {
              ed.removeStatus(selectedStatusId);
              setSelection(null);
            }}
          />
        )}
        {tab === "diagram" && selectedTransition && (
          <TransitionPanel
            transition={selectedTransition}
            statusMeta={statusMeta}
            resolutions={resolutions.data ?? []}
            onRename={(name) => ed.updateTransition(selectedTransition.id, { name })}
            onAddRule={(rule) => ed.addRule(selectedTransition.id, rule)}
            onRemoveRule={(i) => ed.removeRule(selectedTransition.id, i)}
            onDelete={() => {
              ed.removeTransition(selectedTransition.id);
              setSelection(null);
            }}
          />
        )}
        {tab === "diagram" && !selection && <EmptyStatePanel />}
      </div>

      {addStatusOpen && (
        <AddStatusDialog
          poolStatuses={pool}
          draft={ed.draft}
          onAdd={ed.addStatus}
          onClose={() => setAddStatusOpen(false)}
        />
      )}
      {addTransitionOpen && (
        <AddTransitionDialog
          draft={ed.draft}
          statusMeta={statusMeta}
          onAdd={ed.addTransition}
          prefillFrom={transitionPrefill?.from}
          prefillTo={transitionPrefill?.to}
          onClose={() => {
            setAddTransitionOpen(false);
            setTransitionPrefill(null);
          }}
        />
      )}
      {saveAsNewOpen && (
        <SaveAsNewWorkflowDialog
          sourceWorkflowId={wfId}
          defaultName={ed.draft.name}
          onSaved={() => {
            // Refresh the org template list so the new one appears in pickers.
            void qc.invalidateQueries({ queryKey: ["quiktrack", "workflow-templates"] });
          }}
          onClose={() => setSaveAsNewOpen(false)}
        />
      )}
    </div>
  );
}

/** Jira's default right-hand panel shown when nothing is selected. */
function EmptyStatePanel() {
  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col items-center justify-center border-l border-gray-200 bg-gray-50 px-8 text-center">
      <svg width="120" height="90" viewBox="0 0 120 90" className="mb-6" aria-hidden>
        <g stroke="#cbd5e1" strokeWidth="1.5">
          <line x1="30" y1="20" x2="70" y2="16" />
          <line x1="70" y1="16" x2="96" y2="34" />
          <line x1="30" y1="20" x2="40" y2="55" />
          <line x1="40" y1="55" x2="70" y2="16" />
          <line x1="40" y1="55" x2="80" y2="66" />
          <line x1="80" y1="66" x2="96" y2="34" />
        </g>
        <circle cx="30" cy="20" r="9" fill="#3b82f6" />
        <circle cx="70" cy="16" r="6" fill="#1e293b" />
        <circle cx="96" cy="34" r="11" fill="#3b82f6" />
        <circle cx="40" cy="55" r="6" fill="#7c3aed" />
        <circle cx="80" cy="66" r="8" fill="#7c3aed" />
        <circle cx="62" cy="44" r="4" fill="#1e293b" />
      </svg>
      <h3 className="text-base font-semibold text-gray-900">Make work flow your way</h3>
      <p className="mt-2 text-sm text-gray-500">
        Workflows represent your team&apos;s process and control how people progress your project&apos;s work.
      </p>
      <p className="mt-3 text-sm text-gray-500">
        Here, you can add statuses (drop zones on your board), create transitions between them, and
        automate repetitive actions with rules.
      </p>
      <p className="mt-3 text-sm text-gray-500">Select a status or transition to reveal more details.</p>
    </aside>
  );
}
