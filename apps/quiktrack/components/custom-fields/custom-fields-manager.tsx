"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Archive, RotateCcw, Globe } from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import { fieldConfig } from "@/lib/customFields/registry";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import { FieldFormDrawer } from "./field-form-drawer";

interface Props {
  scope: "global" | "space";
  /** Required for scope="space". */
  projectId?: string;
}

export function CustomFieldsManager({ scope, projectId }: Props) {
  const apiBase = scope === "global" ? "/api/settings/custom-fields" : `/api/projects/${projectId}/custom-fields`;
  const queryKey = useMemo(
    () => ["quiktrack", "custom-fields", scope, projectId ?? "global"] as const,
    [scope, projectId],
  );
  const qc = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [drawer, setDrawer] = useState<{ open: boolean; field: CustomFieldDTO | null }>({ open: false, field: null });
  const [confirm, setConfirm] = useState<{ field: CustomFieldDTO; issueCount: number } | null>(null);

  const { data: fields = [], isLoading } = useApiData<CustomFieldDTO[]>(
    [...queryKey, showArchived],
    `${apiBase}?includeArchived=${showArchived}`,
  );

  const removeMutation = useMutation({
    mutationFn: async ({ field, confirmArchive }: { field: CustomFieldDTO; confirmArchive?: boolean }) => {
      const res = await fetch(`${apiBase}/${field.id}${confirmArchive ? "?confirmArchive=true" : ""}`, {
        method: "DELETE",
      }).then((r) => r.json());
      if (!res?.success) {
        if (res?.needsArchive) {
          setConfirm({ field, issueCount: res.issueCount ?? 0 });
          return null;
        }
        throw new Error(res?.error ?? "Failed");
      }
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        setConfirm(null);
        void qc.invalidateQueries({ queryKey });
      }
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ field, status }: { field: CustomFieldDTO; status: "active" | "archived" }) => {
      const res = await fetch(`${apiBase}/${field.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json());
      if (!res?.success) throw new Error(res?.error ?? "Failed");
      return res.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  return (
    <div className="px-8 py-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {scope === "global" ? "Global fields" : "Fields"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {scope === "global"
              ? "Custom fields that appear on issues across every space."
              : "Custom fields for this space. Global fields are managed at the org level and shown read-only here."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawer({ open: true, field: null })}
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white bg-blue-700 rounded hover:bg-blue-800 shrink-0"
        >
          <Plus className="h-4 w-4" />
          {scope === "global" ? "Create global field" : "Create field"}
        </button>
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-gray-600 mt-3 mb-3">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Show archived
      </label>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5 w-32">Type</th>
              <th className="text-left font-medium px-4 py-2.5 w-44">Key</th>
              <th className="text-center font-medium px-4 py-2.5 w-24">Required</th>
              <th className="px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            ) : fields.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No custom fields yet. Create one to get started.
                </td>
              </tr>
            ) : (
              fields.map((f) => (
                <tr key={f.id} className={`border-b border-gray-100 last:border-0 ${f.status === "archived" ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{f.name}</span>
                      {f.scope === "global" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                          <Globe className="h-3 w-3" /> Global
                        </span>
                      )}
                      {f.status === "archived" && (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">Archived</span>
                      )}
                    </div>
                    {f.description && <div className="text-xs text-gray-400 mt-0.5">{f.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{fieldConfig(f.type).label}</td>
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{f.key}</td>
                  <td className="px-4 py-2.5 text-center">{f.isRequired ? "Yes" : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {f.status === "archived" ? (
                        <button
                          type="button"
                          title="Restore"
                          onClick={() => setStatusMutation.mutate({ field: f, status: "active" })}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => setDrawer({ open: true, field: f })}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete or archive"
                            onClick={() => removeMutation.mutate({ field: f })}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FieldFormDrawer
        open={drawer.open}
        field={drawer.field}
        apiBase={apiBase}
        queryKey={queryKey}
        onClose={() => setDrawer({ open: false, field: null })}
      />

      {/* Archive confirmation (field has stored values — FRD §5.5 / UC-05). */}
      {confirm && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
            <div className="flex items-center gap-2 mb-2">
              <Archive className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-semibold text-gray-900">Archive instead of delete?</h3>
            </div>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{confirm.field.name}</span> has values on{" "}
              <span className="font-medium">{confirm.issueCount}</span>{" "}
              {confirm.issueCount === 1 ? "issue" : "issues"}. It can&apos;t be permanently deleted. Archiving removes it
              from all forms while keeping historical data intact.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="h-9 px-3 text-sm text-gray-700 rounded hover:bg-gray-100">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeMutation.mutate({ field: confirm.field, confirmArchive: true })}
                disabled={removeMutation.isPending}
                className="h-9 px-4 text-sm font-semibold text-white bg-amber-600 rounded hover:bg-amber-700 disabled:bg-gray-300"
              >
                Archive field
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
