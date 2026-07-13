"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { ModalShell, PrimaryButton, GhostButton } from "./shared";
import { PermissionMatrix, permKey } from "./permission-matrix";
import type { OrgUser, UserPermissionsData } from "./types";

interface Props {
  user: OrgUser;
  onClose: () => void;
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

/**
 * Per-user effective permissions + additive extras editor. Role grants are
 * shown locked (inherited); extras are the toggleable additions saved to
 * AstUserPermissionExtra via PUT /api/org/users/[id]/permissions.
 */
export function UserPermissionsModal({ user, onClose, showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleGrants, setRoleGrants] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/org/users/${user.userId}/permissions`);
        const json = await res.json();
        if (!active) return;
        const data: UserPermissionsData | undefined = json?.data;
        setRoleGrants(new Set((data?.roleGrants ?? []).map((p) => permKey(p.resource, p.action))));
        setExtras(new Set((data?.extras ?? []).map((p) => permKey(p.resource, p.action))));
      } catch {
        if (active) showToast("Could not load permissions", undefined, "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user.userId, showToast]);

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
      title="Permissions"
      subtitle={`${user.firstName} ${user.lastName} · role grants are locked; extras add on top`}
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
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm">Loading permissions…</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent-600" /> Granted by role (locked)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-gray-300" /> Extra grant (toggle)
            </span>
          </div>
          <PermissionMatrix value={extras} locked={roleGrants} onToggle={toggle} />
        </div>
      )}
    </ModalShell>
  );
}
