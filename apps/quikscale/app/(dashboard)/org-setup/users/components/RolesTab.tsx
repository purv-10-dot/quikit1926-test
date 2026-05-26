"use client";

/**
 * User Management tab — two-pane layout.
 *
 *   ┌─ Roles list (left, ~260px) ─┬─ Permission matrix (right, flex-1) ─┐
 *   │ Roles                  [+]  │  Permissions — <role>               │
 *   │ 🛡 admin                    │  [Entities] [Navigation]            │
 *   │  User      DEFAULT     🗑   │  Entity      │ C │ U │ D │ V         │
 *   │  Coach                 🗑   │  > KPI                                │
 *   │                             │     Individual KPI                  │
 *   │                             │     Team KPI                        │
 *   └─────────────────────────────┴─────────────────────────────────────┘
 *
 * Selecting a role on the left updates the right pane inline — no
 * navigation to a separate page.
 */

import { useEffect, useState } from "react";
import { Loader2, Shield, Plus, Trash2 } from "lucide-react";
import { RolePermissionMatrix } from "./RolePermissionMatrix";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  _count?: { members: number };
}

export function RolesTab() {
  // RBAC v2 — `+ Add Role` requires User:create, trash icons require
  // User:delete. The Permission matrix's edit affordances are gated inside
  // RolePermissionMatrix on User:update. The tab itself is already gated by
  // User:view at the page level (so this component only renders when the
  // user can at least view roles).
  const { canCreate, canDelete } = useResourcePermissions("User");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<RoleRow | null>(null);

  async function load(preferSelectedId?: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/org/roles");
      const json = await res.json();
      if (!json.success) {
        setError("Failed to load roles");
        return;
      }
      const list = json.data as RoleRow[];
      setRoles(list);
      // Preserve selection across refetches; default to first role when none.
      if (preferSelectedId && list.some((r) => r.id === preferSelectedId)) {
        setSelectedId(preferSelectedId);
      } else if (!selectedId || !list.some((r) => r.id === selectedId)) {
        setSelectedId(list[0]?.id ?? null);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const res = await fetch("/api/org/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to create role");
        return;
      }
      const created = json.data as RoleRow;
      setNewName("");
      setCreating(false);
      await load(created.id);
    } catch {
      setError("Network error creating role");
    }
  }

  async function handleDelete(role: RoleRow) {
    try {
      const res = await fetch(`/api/org/roles/${role.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to delete role");
        return;
      }
      setConfirmDeleteRole(null);
      // If the deleted role was selected, fall back to the first remaining.
      if (selectedId === role.id) setSelectedId(null);
      await load();
    } catch {
      setError("Network error deleting role");
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] bg-gray-50">
      {/* ── Left pane: roles list ── */}
      <aside className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Roles</h2>
          {canCreate && (
            <button
              onClick={() => setCreating(true)}
              className="h-7 w-7 rounded-full bg-accent-600 hover:bg-accent-700 text-white inline-flex items-center justify-center"
              title="Add role"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {creating && (
          <div className="px-3 py-3 bg-gray-50 border-b border-gray-200 space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              placeholder="Role name"
              className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50"
              >
                Add Role
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="px-2 py-1.5 text-[11px] text-gray-500 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mx-3 mt-2 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 px-4 py-3 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : roles.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">
              No roles yet. Click <strong>+</strong> to add one.
            </p>
          ) : (
            roles.map((role) => {
              const isSelected = selectedId === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedId(role.id)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 group transition-colors ${
                    isSelected
                      ? "bg-accent-50 border-l-2 border-accent-600"
                      : "border-l-2 border-transparent hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {role.isSystem && (
                      <Shield className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm truncate ${
                        isSelected ? "font-semibold text-accent-700" : "text-gray-800"
                      }`}
                    >
                      {role.name}
                    </span>
                    {role.isDefault && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-accent-100 text-accent-700 flex-shrink-0">
                        Default
                      </span>
                    )}
                  </div>
                  {!role.isSystem && canDelete && (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setConfirmDeleteRole(role);
                      }}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="Delete role"
                    >
                      <Trash2 className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Right pane: matrix ── */}
      <main className="flex-1 min-w-0 bg-white overflow-hidden">
        {selectedId ? (
          <RolePermissionMatrix
            key={selectedId}
            roleId={selectedId}
            onRenamed={() => load(selectedId)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            Select a role on the left to edit its permissions.
          </div>
        )}
      </main>

      {/* Delete confirm modal */}
      {confirmDeleteRole && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-full">
            <h3 className="text-sm font-bold text-gray-900 mb-2">
              Delete role &ldquo;{confirmDeleteRole.name}&rdquo;?
            </h3>
            <p className="text-xs text-gray-600 mb-5">
              {confirmDeleteRole._count && confirmDeleteRole._count.members > 0 ? (
                <>
                  <strong>{confirmDeleteRole._count.members}</strong> user
                  {confirmDeleteRole._count.members === 1 ? "" : "s"} currently have this role.
                  They will lose their role assignment.
                </>
              ) : (
                "This cannot be undone."
              )}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteRole(null)}
                className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteRole)}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
