"use client";

/**
 * QuikInfra — /settings/roles
 *
 * v2 Dynamic RBAC matrix UI. Admin-only (gated by middleware
 * SETTINGS_ADMIN_ROLES + server-side requireAdmin on every API call).
 *
 * Left pane: role list (system + default badges, create + delete)
 * Right pane: RolePermissionMatrix for the selected role
 *
 * Replaces the static read-only roles page that pre-dated v2 RBAC.
 */

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, Star, Trash2 } from "lucide-react";
import { RolePermissionMatrix } from "@/components/rbac/RolePermissionMatrix";
import type { Action } from "@/lib/rbac/permissionsRegistry";

interface RoleListItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  memberCount: number;
  permissionCount: number;
  createdAt: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success || body.data === undefined) {
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return body.data;
}

export default function RolesPage() {
  // The Add User role dropdown caches /api/org/roles via useRoles()
  // (staleTime: Infinity). Invalidate that cache here whenever the catalog
  // changes so a newly created / deleted role shows up without a reload.
  const qc = useQueryClient();
  const [roles, setRoles] = useState<RoleListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grants, setGrants] = useState<ReadonlySet<string> | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => roles?.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  useEffect(() => {
    fetchJson<RoleListItem[]>("/api/org/roles")
      .then((list) => {
        setRoles(list);
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load roles"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setGrants(null);
      return;
    }
    fetchJson<{ permissions: Array<{ resource: string; action: string }> }>(
      `/api/org/roles/${selectedId}/permissions`,
    )
      .then((data) => {
        setGrants(new Set(data.permissions.map((p) => `${p.resource}::${p.action}`)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load permissions"));
  }, [selectedId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await fetchJson<RoleListItem>("/api/org/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setRoles((prev) => [...(prev ?? []), created]);
      setSelectedId(created.id);
      setNewName("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["org-roles"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create role");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this role? Users assigned to it will lose its grants.")) return;
    try {
      const res = await fetch(`/api/org/roles/${id}`, { method: "DELETE", credentials: "include" });
      const body = (await res.json()) as ApiEnvelope<unknown>;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Delete failed");
      setRoles((prev) => prev?.filter((r) => r.id !== id) ?? null);
      if (selectedId === id) setSelectedId(roles?.[0]?.id ?? null);
      qc.invalidateQueries({ queryKey: ["org-roles"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete role");
    }
  };

  const handleSavePermissions = async (next: Array<{ resource: string; action: Action }>) => {
    if (!selectedId) return;
    try {
      await fetchJson(`/api/org/roles/${selectedId}/permissions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissions: next }),
      });
      setGrants(new Set(next.map((p) => `${p.resource}::${p.action}`)));
      const fresh = await fetchJson<RoleListItem[]>("/api/org/roles");
      setRoles(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  if (error) {
    return (
      <div className="m-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        {error}
        <button onClick={() => setError(null)} className="ml-3 underline">Dismiss</button>
      </div>
    );
  }

  if (!roles) {
    return <div className="p-6 text-slate-500">Loading roles…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left pane — role list */}
      <div className="w-72 shrink-0 border-r bg-slate-50">
        <div className="flex items-center justify-between border-b bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Roles</h2>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded p-1 text-slate-600 hover:bg-slate-100"
            aria-label="Create role"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {creating ? (
          <div className="border-b bg-white p-3">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              placeholder="Role name…"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
        ) : null}

        <ul className="overflow-y-auto">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`group flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-white ${
                  selectedId === r.id ? "bg-white font-medium text-blue-700" : "text-slate-800"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {r.isSystem ? <Shield className="h-3.5 w-3.5 text-amber-600" aria-label="System role" /> : null}
                  {r.isDefault ? <Star className="h-3.5 w-3.5 text-blue-600" aria-label="Default role" /> : null}
                  {r.name}
                  <span className="ml-1 text-xs text-slate-400">({r.memberCount})</span>
                </span>
                {!r.isSystem ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(r.id);
                    }}
                    className="invisible rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:visible"
                    aria-label={`Delete ${r.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Right pane — permission matrix */}
      <div className="flex-1">
        {selectedRole && grants ? (
          <RolePermissionMatrix
            roleId={selectedRole.id}
            roleName={selectedRole.name}
            isSystem={selectedRole.isSystem}
            initialGrants={grants}
            onSave={handleSavePermissions}
          />
        ) : (
          <div className="p-8 text-slate-500">Select a role to edit its permissions.</div>
        )}
      </div>
    </div>
  );
}
