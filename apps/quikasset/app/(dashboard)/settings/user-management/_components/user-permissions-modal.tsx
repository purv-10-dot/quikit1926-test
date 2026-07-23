"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Lock, Info } from "lucide-react";
import { ModalShell, PrimaryButton, GhostButton } from "./shared";
import { PermissionMatrix, permKey } from "./permission-matrix";
import { allValidPairsGranted } from "./permissions-helpers";
import type { OrgUser, Role, UserPermissionsData } from "./types";

interface Props {
  user: OrgUser;
  roles: Role[];
  onClose: () => void;
  /** Called after the app role changes so the parent list can refresh. */
  onChanged?: () => void;
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

/**
 * Per-user effective permissions + additive extras editor. Role grants are
 * shown locked (inherited); extras are the toggleable additions saved to
 * AstUserPermissionExtra via PUT /api/org/users/[id]/permissions.
 */
export function UserPermissionsModal({ user, roles, onClose, onChanged, showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleGrants, setRoleGrants] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [appRoleId, setAppRoleId] = useState<string>(user.appRoleId ?? "");
  const [roleBusy, setRoleBusy] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/org/users/${user.userId}/permissions`);
      const json = await res.json();
      const data: UserPermissionsData | undefined = json?.data;
      setRoleGrants(new Set((data?.roleGrants ?? []).map((p) => permKey(p.resource, p.action))));
      setExtras(new Set((data?.extras ?? []).map((p) => permKey(p.resource, p.action))));
    } catch {
      showToast("Could not load permissions", undefined, "error");
    }
  }, [user.userId, showToast]);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadPermissions();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadPermissions]);

  // Quick role / custom-role assignment. Applies immediately, then reloads the
  // permission matrix so the (newly) role-granted rows re-lock.
  async function changeRole(roleId: string) {
    if (!roleId || roleId === appRoleId) return;
    setRoleBusy(true);
    try {
      const res = await fetch(`/api/org/users/${user.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not change role", json?.error ?? "Request failed", "error");
        return;
      }
      setAppRoleId(roleId);
      showToast(
        "Role updated",
        `${user.firstName}'s role is now ${roles.find((r) => r.id === roleId)?.name ?? "updated"}.`,
      );
      onChanged?.();
      await loadPermissions();
    } catch {
      showToast("Could not change role", "Network error", "error");
    } finally {
      setRoleBusy(false);
    }
  }

  function toggle(key: string) {
    // Never let an extra shadow a role grant — role grants are locked in the UI.
    if (roleGrants.has(key)) return;
    setExtras((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = Array.from(extras).map((k) => {
        const [resource, action] = k.split(":");
        return { resource, action };
      });
      const res = await fetch(`/api/org/users/${user.userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not save", json?.error ?? "Request failed", "error");
        return;
      }
      showToast("Permissions saved", `${user.firstName}'s extra grants were updated.`);
      onClose();
    } catch {
      showToast("Could not save", "Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Role & permissions"
      subtitle={`${user.firstName} ${user.lastName} · assign a role, then add extra grants on top`}
      wide
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSave} disabled={loading || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save extras
          </PrimaryButton>
        </>
      }
    >
      {/* Quick role / custom-role assignment — applies immediately. */}
      <div className="mb-4 border-b border-gray-100 pb-4">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Role
        </label>
        <div className="flex items-center gap-2">
          <select
            value={appRoleId}
            onChange={(e) => changeRole(e.target.value)}
            disabled={roleBusy}
            className="w-full max-w-xs rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs capitalize focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:opacity-60"
          >
            {!appRoleId && (
              <option value="" disabled>
                Select role…
              </option>
            )}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {roleBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm">Loading permissions…</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-accent-600" /> Granted by role (locked)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-gray-300" /> Extra grant (toggle)
            </span>
          </div>
          {allValidPairsGranted(roleGrants) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                All permissions are inherited from the{" "}
                <strong>{roles.find((r) => r.id === appRoleId)?.name ?? "current"}</strong> role — change
                their role to adjust these. There are no extra grants to add.
              </span>
            </div>
          )}
          <PermissionMatrix value={extras} locked={roleGrants} onToggle={toggle} />
        </div>
      )}
    </ModalShell>
  );
}
