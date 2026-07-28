"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, GitBranch, X } from "lucide-react";
import { useWorkflowEditor } from "./use-workflow-editor";
import { DiagramCanvas, errorStatusIdSet } from "./diagram-canvas";
import { TextView } from "./text-view";
import { AddStatusDialog, AddTransitionDialog } from "./editor-dialogs";
import { RulePanel } from "./rule-panel";
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
  const r = await fetch(`/api/projects/${projectId}/statuses`);
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
      pool={pool.data!}
      onClose={() => router.push(`/spaces/${projectId}/settings/workflows`)}
    />
  );
}

function EditorBody({
  projectId,
  wfId,
  initialDraft,
  pool,
  onClose,
}: {
  projectId: string;
  wfId: string;
  initialDraft: ReturnType<typeof draftFromReadModel>;
  pool: StatusMeta[];
  onClose: () => void;
}) {
  const ed = useWorkflowEditor(wfId, initialDraft);
  const [tab, setTab] = useState<"diagram" | "text">("diagram");
  const [addStatusOpen, setAddStatusOpen] = useState(false);
  const [addTransitionOpen, setAddTransitionOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [ruleTransitionId, setRuleTransitionId] = useState<string | null>(null);

  const resolutions = useQuery({
    queryKey: ["quiktrack", "resolutions", projectId],
    queryFn: () => fetchResolutions(projectId),
  });

  const statusMeta = useMemo(() => new Map(pool.map((s) => [s.id, s])), [pool]);
  const errorStatusIds = errorStatusIdSet(ed.publishErrors);
  const ruleTransition = ed.draft.transitions.find((t) => t.id === ruleTransitionId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
        <div className="text-sm font-semibold text-gray-900">{ed.draft.name}</div>
        <div className="ml-4 flex rounded border border-gray-300 text-sm">
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

        <button
          type="button"
          onClick={() => setAddStatusOpen(true)}
          className="ml-4 inline-flex items-center gap-1.5 rounded border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Plus className="h-3.5 w-3.5" /> Add status
        </button>
        <button
          type="button"
          onClick={() => setAddTransitionOpen(true)}
          disabled={ed.draft.statuses.length < 1}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          <GitBranch className="h-3.5 w-3.5" /> Add transition
        </button>

        {/* Rules: pick a transition to edit its conditions/validators/post-functions. */}
        <select
          value={ruleTransitionId ?? ""}
          onChange={(e) => setRuleTransitionId(e.target.value || null)}
          className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700"
          title="Edit rules on a transition"
        >
          <option value="">Add rule…</option>
          {ed.draft.transitions.map((t) => (
            <option key={t.id} value={t.id}>Rules: {t.name}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {ed.saving && <span className="text-xs text-gray-400">Saving…</span>}
          <button
            type="button"
            onClick={() => ed.publish.mutate()}
            disabled={ed.publish.isPending}
            className="rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {ed.publish.isPending ? "Publishing…" : "Update workflow"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            <X className="h-3.5 w-3.5" /> Close
          </button>
        </div>
      </div>

      {/* Error / success banners */}
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
      {ed.saveError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {ed.saveError.message}
        </div>
      )}

      {/* Body + optional rule panel */}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          {tab === "diagram" ? (
            <DiagramCanvas
              draft={ed.draft}
              statusMeta={statusMeta}
              errorStatusIds={errorStatusIds}
              onMoveNode={ed.moveNode}
              onNodeClick={setSelected}
              selectedStatusId={selected}
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
        {ruleTransition && (
          <RulePanel
            transition={ruleTransition}
            resolutions={resolutions.data ?? []}
            onAddRule={(rule) => ed.addRule(ruleTransition.id, rule)}
            onRemoveRule={(i) => ed.removeRule(ruleTransition.id, i)}
            onClose={() => setRuleTransitionId(null)}
          />
        )}
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
          onClose={() => setAddTransitionOpen(false)}
        />
      )}
    </div>
  );
}
