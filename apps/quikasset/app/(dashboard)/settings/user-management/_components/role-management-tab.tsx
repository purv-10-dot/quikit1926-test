"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Plus, Save, Shield, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddRoleModal } from "./add-role-modal";
import { PermissionMatrix, permKey } from "./permission-matrix";
import { PrimaryButton } from "./shared";
import type { PermissionPair, Role } from "./types";

interface Props {
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

export function RoleManagementTab({ showToast }: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [permsLoading, setPermsLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/org/roles");
      const json = await res.json();
      const list: Role[] = json?.data ?? [];
      setRoles(list);
      setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    } catch {
      showToast("Could not load roles", undefined, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const loadPerms = useCallback(
    async (roleId: string) => {
      setPermsLoading(true);
      setDirty(false);
      try {
        const res = await fetch(`/api/org/roles/${roleId}/permissions`);
        const json = await res.json();
        const perms: PermissionPair[] = json?.data?.permissions ?? [];
        setGrants(new Set(perms.map((p) => permKey(p.resource, p.action))));
      } catch {
        showToast("Could not load permissions", undefined, "error");
      } finally {
        setPermsLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (selectedId) void loadPerms(selectedId);
  }, [selectedId, loadPerms]);

  function toggle(key: string) {
    setGrants((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setDirty(true);
  }

  async function savePerms() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const permissions = Array.from(grants).map((k) => {
        const [resource, action] = k.split(":");
        return { resource, action };
      });
      const res = await fetch(`/api/org/roles/${selectedId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not save", json?.error ?? "Request failed", "error");
        return;
      }
      setDirty(false);
      showToast("Permissions saved", `${selected?.name} now has ${json.data.count} grant(s).`);
    } catch {
      showToast("Could not save", "Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: Role) {
    if (!confirm(`Delete role “${role.name}”? Members lose this role assignment.`)) return;
    try {
      const res = await fetch(`/api/org/roles/${role.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not delete", json?.error ?? "Request failed", "error");
        return;
      }
      showToast("Role deleted", json?.message ?? undefined);
      setSelectedId(null);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
    } catch {
      showToast("Could not delete", "Network error", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading roles…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[240px_1fr]">
      {/* Role list */}
      <div className="rounded-xl border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
          <span className="text-xs font-semibold text-gray-700">Roles</span>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-accent-600 hover:bg-accent-50"
          >
            <Plus className="h-3 w-3" /> New
          </button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-1.5">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                  selectedId === r.id ? "bg-accent-50 text-accent-700" : "text-gray-600 hover:bg-gray-50",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {r.isSystem ? (
                    <Shield className="h-3 w-3 flex-shrink-0 text-amber-500" />
                  ) : (
                    <span className="h-3 w-3 flex-shrink-0" />
                  )}
                  <span className="truncate font-medium capitalize">{r.name}</span>
                </span>
                <span className="flex flex-shrink-0 items-center gap-1 text-[10px] text-gray-400">
                  {r.isDefault && <span className="rounded bg-gray-100 px-1">default</span>}
                  {r._count?.members ?? 0}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Permission editor */}
      <div className="min-w-0 rounded-xl border border-gray-200">
        {!selected ? (
          <div className="px-6 py-16 text-center text-xs text-gray-400">Select a role to edit its permissions.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold capitalize text-gray-800">
                  {selected.name}
                  {selected.isSystem && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      <Lock className="h-2.5 w-2.5" /> system
                    </span>
                  )}
                </h3>
                {selected.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-400">{selected.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!selected.isSystem && (
                  <button
                    onClick={() => deleteRole(selected)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
                <PrimaryButton onClick={savePerms} disabled={!dirty || saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </PrimaryButton>
              </div>
            </div>
            <div className="p-4">
              {permsLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading permissions…
                </div>
              ) : (
                <PermissionMatrix value={grants} onToggle={toggle} />
              )}
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <AddRoleModal
          onClose={() => setShowAdd(false)}
          onCreated={(role) => {
            setRoles((prev) => [...prev, role]);
            setSelectedId(role.id);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
