"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { WorkTypeIcon } from "./work-type-icon";
import type { ProjectIssueType, WorkflowScheme } from "./types";

/**
 * "Assign Issue Types to <workflow>" dialog — matches Jira's step-2 layout: a
 * per-type checkbox table with a "Currently Assigned Workflow" column and
 * Back / Finish / Cancel. We are single-workflow-per-scheme, so every type
 * resolves to the one default workflow; ticking types + Finish re-saves the
 * default mapping (a no-op today, but the flow + look match Jira).
 */
export function AssignTypesDialog({
  projectId,
  scheme,
  issueTypes,
  onClose,
  onSaved,
}: {
  projectId: string;
  scheme: WorkflowScheme;
  issueTypes: ProjectIssueType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const defaultItem = scheme.items.find((i) => i.isDefault) ?? scheme.items[0];
  const workflowName = defaultItem?.workflow.name ?? "workflow";
  const defaultWorkflowId = defaultItem?.workflow.id ?? "";

  // Per-type selection (checkboxes). All checked by default (all → this workflow).
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(issueTypes.map((it) => [it.id, true])),
  );
  const allChecked = issueTypes.length > 0 && issueTypes.every((it) => checked[it.id]);
  const toggleAll = () =>
    setChecked(Object.fromEntries(issueTypes.map((it) => [it.id, !allChecked])));

  const save = useMutation({
    mutationFn: async () => {
      // Single-workflow scheme: keep every type on the default workflow.
      const r = await fetch(`/api/projects/${projectId}/workflow-scheme/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultWorkflowId, items: [] }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Save failed");
    },
    onSuccess: onSaved,
  });

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <div className="px-6 pb-2 pt-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Assign Issue Types to &ldquo;{workflowName}&rdquo;
          </h2>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="w-10 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-accent-600"
                    aria-label="Select all issue types"
                  />
                </th>
                <th className="py-2 font-medium">Issue Type</th>
                <th className="py-2 font-medium">Currently Assigned Workflow</th>
              </tr>
            </thead>
            <tbody>
              {issueTypes.map((it) => (
                <tr key={it.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3">
                    <input
                      type="checkbox"
                      checked={!!checked[it.id]}
                      onChange={() => setChecked((c) => ({ ...c, [it.id]: !c[it.id] }))}
                      className="rounded border-gray-300 text-accent-600"
                      aria-label={it.name}
                    />
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-2 text-gray-900">
                      <WorkTypeIcon name={it.name} />
                      {it.name}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{workflowName}</td>
                </tr>
              ))}
              {issueTypes.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-gray-500">
                    No issue types in this project.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4">
          {save.error && (
            <span className="mr-auto text-sm text-red-600">{(save.error as Error).message}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Finish"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-accent-700 hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
