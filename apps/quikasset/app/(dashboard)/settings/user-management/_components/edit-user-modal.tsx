"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { ModalShell, PrimaryButton, GhostButton } from "./shared";
import type { OrgUser } from "./types";

interface Props {
  user: OrgUser;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

export function EditUserModal({ user, onClose, onSaved, showToast }: Props) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(user.status);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { firstName, lastName, status };
      if (password.trim()) body.password = password.trim();
      const res = await fetch(`/api/org/users/${user.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not save", json?.error ?? "Request failed", "error");
        return;
      }
      showToast("User updated", `${firstName} ${lastName}'s details were saved.`);
      onSaved();
      onClose();
    } catch {
      showToast("Could not save", "Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  const valid = firstName.trim() && lastName.trim() && (!password || password.length >= 8);

  return (
    <ModalShell
      title="Edit user"
      subtitle={user.email}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSave} disabled={!valid || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              First name
            </label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Last name
            </label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Reset password <span className="font-normal normal-case text-gray-400">(optional, ≥ 8 chars)</span>
          </label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    </ModalShell>
  );
}
