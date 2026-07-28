"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { ProjectIssueType, WorkflowScheme } from "./types";

/**
 * Assign Issue Types dialog (the Jira checkbox table). Each issue type maps to a
 * workflow; unmapped types fall to the default workflow. Phase 2 keeps this a
 * single-workflow scheme, so every type currently resolves to the one default
 * workflow — the dialog lets an admin confirm/redirect the default.
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

  // Workflows available in this scheme (dedup by id).
  const workflows = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of scheme.items) map.set(item.workflow.id, item.workflow.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [scheme]);

  const currentDefault = scheme.items.find((i) => i.isDefault)?.workflow.id ?? workflows[0]?.id ?? "";
  const [defaultWorkflowId, setDefaultWorkflowId] = useState(currentDefault);

  // Per-type override → workflowId (empty string = use default).
  const initialOverrides = useMemo(() => {
    const o: Record<string, string> = {};
    for (const it of scheme.items) {
      if (!it.isDefault && it.issueTypeId) o[it.issueTypeId] = it.workflow.id;
    }
    return o;
  }, [scheme]);
  const [overrides, setOverrides] = useState<Record<string, string>>(initialOverrides);

  const save = useMutation({
    mutationFn: async () => {
      const items = Object.entries(overrides)
        .filter(([, wf]) => wf && wf !== defaultWorkflowId)
        .map(([issueTypeId, workflowId]) => ({ issueTypeId, workflowId }));
      const r = await fetch(`/api/projects/${projectId}/workflow-scheme/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultWorkflowId, items }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Save failed");
    },
    onSuccess: onSaved,
  });

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign Issue Types</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Default workflow (applies to all unmapped types)
            </label>
            <select
              value={defaultWorkflowId}
              onChange={(e) => setDefaultWorkflowId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 font-medium">Issue Type</th>
                <th className="py-2 font-medium">Assigned Workflow</th>
              </tr>
            </thead>
            <tbody>
              {issueTypes.map((it) => (
                <tr key={it.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 text-gray-900">{it.name}</td>
                  <td className="py-2.5">
                    <select
                      value={overrides[it.id] ?? ""}
                      onChange={(e) =>
                        setOverrides((o) => ({ ...o, [it.id]: e.target.value }))
                      }
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Default ({workflows.find((w) => w.id === defaultWorkflowId)?.name ?? "—"})</option>
                      {workflows.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          {save.error && (
            <span className="mr-auto text-sm text-red-600">{(save.error as Error).message}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Finish"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
