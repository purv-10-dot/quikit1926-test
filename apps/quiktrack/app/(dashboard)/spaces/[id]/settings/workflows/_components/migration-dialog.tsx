"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

export interface MigrationItem {
  statusId: string;
  statusName: string;
  count: number;
}

interface StatusOption {
  id: string;
  name: string;
}

async function fetchStatuses(projectId: string): Promise<StatusOption[]> {
  // includeDraft=1: the draft's new statuses (e.g. classic Open/Resolved/…) must
  // be offered here as "Move to" migration targets even though they're hidden
  // from item dropdowns until publish.
  const r = await fetch(`/api/projects/${projectId}/statuses?includeDraft=1`);
  const j = await r.json();
  if (!r.ok || !j.success) return [];
  return (j.data as Array<{ id: string; name: string }>).map((s) => ({ id: s.id, name: s.name }));
}

/**
 * Status migration wizard (Jira "Publish Workflows" step 1). When publishing a
 * workflow that removes a status existing issues sit on, the admin maps each
 * old status → a new one before the migration proceeds.
 */
export function MigrationDialog({
  projectId,
  items,
  onCancel,
  onApply,
  applying,
  error,
}: {
  projectId: string;
  items: MigrationItem[];
  onCancel: () => void;
  onApply: (mapping: Record<string, string>) => void;
  applying: boolean;
  error?: string | null;
}) {
  const statuses = useQuery({
    queryKey: ["quiktrack", "statuses", projectId],
    queryFn: () => fetchStatuses(projectId),
  });
  const options = statuses.data ?? [];
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const allMapped = items.every((it) => mapping[it.statusId]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Migrate work items</h2>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          <p className="mb-4 text-sm text-gray-500">
            The new workflow removes {items.length} status
            {items.length === 1 ? "" : "es"} that work items are currently on.
            Choose where those items should move.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 font-medium">Current status</th>
                <th className="py-2 font-medium">Items</th>
                <th className="py-2 font-medium">Move to</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.statusId} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 text-gray-900">{it.statusName}</td>
                  <td className="py-2.5 text-gray-500">{it.count}</td>
                  <td className="py-2.5">
                    <select
                      value={mapping[it.statusId] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [it.statusId]: e.target.value }))
                      }
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Select…</option>
                      {options
                        .filter((o) => o.id !== it.statusId)
                        .map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          {error && <span className="mr-auto text-sm text-red-600">{error}</span>}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(mapping)}
            disabled={!allMapped || applying}
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {applying ? "Migrating…" : "Migrate and publish"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
