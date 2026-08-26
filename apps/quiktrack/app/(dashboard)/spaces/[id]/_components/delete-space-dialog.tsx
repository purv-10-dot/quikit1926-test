"use client";

import { useState } from "react";
import { Button } from "@quikit/ui";
import { AlertTriangle } from "lucide-react";
import { SpaceDialog } from "./space-dialog";

/**
 * "Delete space" — name-verified confirmation before removing a space
 * (project header "..." menu).
 *
 * Wording matches what the route actually does. `DELETE /api/projects/:id` is a
 * SOFT delete: the space leaves every list immediately, an admin can restore it
 * from Trash, and the purge cron removes it permanently after 60 days. Calling
 * it "permanently delete" here would be a lie that costs someone a restore.
 */
export function DeleteSpaceDialog({
  projectId,
  spaceName,
  onClose,
  onDeleted,
}: {
  projectId: string;
  spaceName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exact match (after trimming stray whitespace from a paste) — the whole point
  // of the gate is that you had to read the name.
  const confirmed = typed.trim() === spaceName;

  async function submit() {
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Failed to delete space");
      }
      onDeleted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete space");
      setBusy(false);
    }
  }

  return (
    <SpaceDialog
      open
      title="Delete space"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={() => void submit()}
            loading={busy}
            disabled={!confirmed || busy}
          >
            Delete space
          </Button>
        </>
      }
    >
      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-start gap-3 rounded border border-red-200 bg-red-50 px-3 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
        <p className="text-sm leading-snug text-red-800">
          <strong className="font-semibold">{spaceName}</strong> and everything in it — work
          items, sprints, docs, test runs and reports — will be removed from QuikTrack for
          everyone. An admin can restore it from Trash for <strong>60 days</strong>, after
          which it is permanently deleted.
        </p>
      </div>

      <label className="mt-4 block text-sm text-gray-700" htmlFor="delete-space-confirm">
        Type <strong className="font-semibold text-gray-900">{spaceName}</strong> to confirm.
      </label>
      <input
        id="delete-space-confirm"
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={busy}
        autoComplete="off"
        placeholder={spaceName}
        className="mt-1.5 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:bg-gray-50"
      />
    </SpaceDialog>
  );
}
