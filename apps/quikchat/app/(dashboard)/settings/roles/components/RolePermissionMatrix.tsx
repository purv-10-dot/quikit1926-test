"use client";

/**
 * Permission matrix for a single QcAppRole (ported + flattened from QuikScale).
 *
 * Adaptations:
 *   - QuikChat's tree is FLAT (module → leaves, no submodules) → no recursive
 *     subtree walking; module-level tristates aggregate over `module.leaves`.
 *   - `useResourcePermissions` DROPPED — page is `requireAdmin`-gated, so the
 *     matrix is always editable (Save/Discard shown).
 *   - `accent-*` → neutral blue/gray.
 *
 * ⚠️ GRANT FIDELITY (must preserve): `grants`/`savedGrants` are seeded from the
 * role's FULL `permissions` set (the whole DB row), NOT from the filtered tree.
 * The module filter only affects RENDERING — leaf keys for disabled modules
 * stay in `grants` untouched, and `handleSave` PUTs the ENTIRE `grants` set. So
 * disabling a module then editing a role never wipes that module's grants; they
 * are preserved and restored when the module is re-enabled.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Save, Undo2, Shield, Pencil, Check, X, Users } from "lucide-react";
import {
  PERMISSION_TREE,
  ACTIONS,
  filterTreeByEnabledModules,
  type Action,
  type PermissionLeaf,
  type PermissionModule,
} from "@/lib/authz/permissionsRegistry";
import { useDisabledModules } from "@/lib/authz/useDisabledModules";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import { RoleMembersModal } from "./RoleMembersModal";

interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions: Array<{ resource: string; action: string }>;
}

function moduleActionStats(mod: PermissionModule, action: Action, grants: Set<string>) {
  let on = 0;
  let total = 0;
  for (const leaf of mod.leaves) {
    if ((leaf.actions as readonly Action[]).includes(action)) {
      total++;
      if (grants.has(`${leaf.resource}:${action}`)) on++;
    }
  }
  return { on, total };
}

function TristateCheckbox({
  on,
  total,
  onChange,
  title,
}: {
  on: number;
  total: number;
  onChange: (makeOn: boolean) => void;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const allOn = total > 0 && on === total;
  const some = on > 0 && on < total;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  if (total === 0) return <span className="text-gray-300">—</span>;
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allOn}
      onChange={() => onChange(!allOn)}
      title={title}
      className="h-4 w-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
    />
  );
}

export function RolePermissionMatrix({
  roleId,
  onRenamed,
}: {
  roleId: string;
  onRenamed?: () => void;
}) {
  const disabledModules = useDisabledModules();
  // Filter is RENDER-ONLY. Grants below carry the full DB set (see file header).
  const visibleTree = useMemo(
    () => filterTreeByEnabledModules(PERMISSION_TREE, disabledModules, isModuleEnabled),
    [disabledModules],
  );

  const [role, setRole] = useState<RoleDetail | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [savedGrants, setSavedGrants] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/org/roles/${roleId}`);
        const json = await res.json();
        if (!mounted) return;
        if (!json.success) {
          setError("Failed to load role");
          return;
        }
        const r = json.data as RoleDetail;
        setRole(r);
        // Seed from the FULL permission set (fidelity — see header).
        const gkeys = new Set(r.permissions.map((p) => `${p.resource}:${p.action}`));
        setGrants(gkeys);
        setSavedGrants(new Set(gkeys));
        setExpanded(new Set(PERMISSION_TREE.map((m) => m.key)));
      } catch {
        if (mounted) setError("Network error loading role");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [roleId]);

  const dirty = useMemo(() => {
    if (grants.size !== savedGrants.size) return true;
    for (const k of grants) if (!savedGrants.has(k)) return true;
    return false;
  }, [grants, savedGrants]);

  function toggleGrant(resource: string, action: Action) {
    setGrants((prev) => {
      const next = new Set(prev);
      const key = `${resource}:${action}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function bulkSetModuleAction(mod: PermissionModule, action: Action, makeOn: boolean) {
    setGrants((prev) => {
      const next = new Set(prev);
      for (const leaf of mod.leaves) {
        if (!(leaf.actions as readonly Action[]).includes(action)) continue;
        const key = `${leaf.resource}:${action}`;
        if (makeOn) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function toggleLeafRow(leaf: PermissionLeaf) {
    setGrants((prev) => {
      const next = new Set(prev);
      const keys = leaf.actions.map((a) => `${leaf.resource}:${a}`);
      const allOn = keys.every((k) => next.has(k));
      if (allOn) for (const k of keys) next.delete(k);
      else for (const k of keys) next.add(k);
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function discard() {
    setGrants(new Set(savedGrants));
  }

  async function commitRename() {
    if (!role) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setRenameError("Name is required");
      return;
    }
    setRenameSaving(true);
    setRenameError("");
    try {
      const res = await fetch(`/api/org/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!json.success) {
        setRenameError(json.error || "Rename failed");
        return;
      }
      setRole((r) => (r ? { ...r, name: trimmed } : r));
      setRenaming(false);
      setDraftName("");
      onRenamed?.();
    } catch {
      setRenameError("Network error renaming");
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      // PUT the ENTIRE grants set (incl. hidden-module keys) — fidelity.
      const res = await fetch(`/api/org/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: Array.from(grants).map((k) => {
            const [resource, action] = k.split(":");
            return { resource, action };
          }),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Failed to save");
        return;
      }
      setSavedGrants(new Set(grants));
    } catch {
      setError("Network error saving");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-16">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!role) {
    return <div className="p-6 text-sm text-red-600">{error || "Role not found"}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 flex-shrink-0 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0">Permissions —</span>
            {renaming && !role.isSystem ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button onClick={commitRename} disabled={renameSaving} className="text-green-600 hover:text-green-700">
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setRenaming(false);
                    setDraftName("");
                    setRenameError("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
                {renameError && <span className="text-[11px] text-red-600">{renameError}</span>}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 min-w-0">
                {role.isSystem && <Shield className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                <span className="truncate">{role.name}</span>
                {!role.isSystem && (
                  <button
                    onClick={() => {
                      setDraftName(role.name);
                      setRenameError("");
                      setRenaming(true);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    title="Rename role"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setMembersOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Users className="h-3.5 w-3.5" /> Manage members
            </button>
            {dirty && (
              <>
                <button
                  onClick={discard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                </button>
              </>
            )}
          </div>
        </div>
        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      </div>

      {/* Matrix */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left font-semibold py-2">Resource</th>
              {ACTIONS.map((a) => (
                <th key={a} className="w-20 text-center font-semibold py-2 capitalize">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTree.map((mod) => {
              const isOpen = expanded.has(mod.key);
              return (
                <Fragment key={mod.key}>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <td className="py-2">
                      <button
                        onClick={() => toggleExpanded(mod.key)}
                        className="inline-flex items-center gap-1 font-semibold text-gray-800"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {mod.label}
                      </button>
                    </td>
                    {ACTIONS.map((a) => {
                      const { on, total } = moduleActionStats(mod, a, grants);
                      return (
                        <td key={a} className="text-center py-2">
                          <TristateCheckbox
                            on={on}
                            total={total}
                            onChange={(makeOn) => bulkSetModuleAction(mod, a, makeOn)}
                            title={`${a} — all ${mod.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen &&
                    mod.leaves.map((leaf) => (
                      <tr key={leaf.resource} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 pl-7">
                          <button
                            onClick={() => toggleLeafRow(leaf)}
                            className="text-left text-gray-700 hover:text-gray-900"
                            title="Toggle all actions"
                          >
                            {leaf.label}
                          </button>
                        </td>
                        {ACTIONS.map((a) => {
                          const supported = (leaf.actions as readonly Action[]).includes(a);
                          if (!supported)
                            return (
                              <td key={a} className="text-center py-1.5 text-gray-300">
                                —
                              </td>
                            );
                          return (
                            <td key={a} className="text-center py-1.5">
                              <input
                                type="checkbox"
                                checked={grants.has(`${leaf.resource}:${a}`)}
                                onChange={() => toggleGrant(leaf.resource, a)}
                                className="h-4 w-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {membersOpen && (
        <RoleMembersModal roleId={roleId} roleName={role.name} onClose={() => setMembersOpen(false)} />
      )}
    </div>
  );
}
