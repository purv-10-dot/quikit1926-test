"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { LoadingState, EmptyState } from "@/components/ui/page-states";
import { RoleEditor } from "@/components/settings/roles/role-editor";

interface AppRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  _count: { permissions: number; members: number };
}

/**
 * "Roles & Permissions" settings tab — the QuikFlow equivalent of QuikScale's
 * Org Setup → Users → Roles tab / QuikTrack's /org-setup/roles page,
 * embedded here since QuikFlow's Settings page is a single tabbed surface
 * rather than a separate org-setup route group.
 */
export function RolesPanel() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["quikflow", "org-roles"],
    queryFn: () => apiGet<AppRole[]>("/api/org/roles"),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiSend(`/api/org/roles/${id}`, "DELETE"),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["quikflow", "org-roles"] });
      if (selectedRoleId === id) setSelectedRoleId(null);
    },
  });

  const roles = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{roles.length} role{roles.length === 1 ? "" : "s"}</p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
        >
          <Plus className="h-4 w-4" />
          New Role
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        {q.isLoading ? (
          <LoadingState />
        ) : roles.length === 0 ? (
          <EmptyState title="No roles yet" hint="Create your first role to get started." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-left">
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Grants</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRoleId(r.id)}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {r.name}
                      </button>
                      {r.isSystem ? (
                        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700">
                          System
                        </span>
                      ) : null}
                      {r.isDefault ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Default
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.description ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r._count.permissions}</td>
                  <td className="px-4 py-3 text-gray-600">{r._count.members}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedRoleId(r.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50"
                    >
                      Edit
                    </button>
                    {!r.isSystem && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete role "${r.name}"? Members will lose this role.`)) {
                            del.mutate(r.id);
                          }
                        }}
                        className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedRoleId ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-4 w-4 text-accent-600" />
              {roles.find((r) => r.id === selectedRoleId)?.name ?? "Role"}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedRoleId(null)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <RoleEditor roleId={selectedRoleId} />
        </div>
      ) : null}

      {createOpen && <CreateRoleModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function CreateRoleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => apiSend("/api/org/roles", "POST", { name, description, isDefault }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quikflow", "org-roles"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">New Role</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-400"
        />

        <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-400"
        />

        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Use as default role for new invitees
        </label>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || name.trim().length === 0}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {mut.isPending ? "Creating…" : "Create Role"}
          </button>
        </div>
      </div>
    </div>
  );
}
