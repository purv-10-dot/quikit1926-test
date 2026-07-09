"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { ModalShell, PrimaryButton, GhostButton } from "./shared";
import type { Role } from "./types";

interface Props {
  onClose: () => void;
  onCreated: (role: Role) => void;
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

export function AddRoleModal({ onClose, onCreated, showToast }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/org/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, isDefault }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not create role", json?.error ?? "Request failed", "error");
        return;
      }
      showToast("Role created", `“${name.trim()}” is ready to configure.`);
      onCreated(json.data as Role);
      onClose();
    } catch {
      showToast("Could not create role", "Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="New role"
      subtitle="Create a role, then grant it permissions from the matrix."
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleCreate} disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create role
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Asset Manager"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Description <span className="font-normal normal-case text-gray-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-[var(--color-accent-600)]"
          />
          Make this the default role for new users
        </label>
      </div>
    </ModalShell>
  );
}
