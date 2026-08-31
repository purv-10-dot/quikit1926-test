"use client";

import { useState } from "react";
import { Button } from "@quikit/ui";
import { Check, Info } from "lucide-react";
import { SpaceDialog } from "./space-dialog";

interface TemplateSummary {
  issueTypes: number;
  statuses: number;
  boardColumns: number;
  customFields: number;
  projectRoles: number;
  sprintsEnabled: boolean;
}

/** What the snapshot captures — shown up-front so the scope is never a surprise. */
const CAPTURED = [
  "Work item types and their order",
  "Statuses, categories and board columns",
  "Workflow and sprint settings",
  "Custom fields and their options",
  "Project roles and their permissions",
  "Tab layout, icon, colour and background",
];

/**
 * "Save as template" — snapshot this space's configuration into a reusable,
 * org-scoped template (project header "..." menu).
 *
 * Configuration only: no work items, sprints, comments, attachments or members
 * are copied, and the snapshot does not stay linked to this space.
 */
export function SaveAsTemplateDialog({
  projectId,
  spaceName,
  onClose,
}: {
  projectId: string;
  spaceName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(`${spaceName} template`);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<TemplateSummary | null>(null);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the template a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description: description.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Failed to save template");
      }
      setSaved(json.data.summary as TemplateSummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <SpaceDialog
        open
        title="Template saved"
        description={`"${name.trim()}" is now in your organisation's template library.`}
        onClose={onClose}
        footer={
          <Button variant="primary" size="md" onClick={onClose}>
            Done
          </Button>
        }
      >
        <ul className="space-y-1.5 text-sm text-gray-700">
          <SummaryRow label="Work item types" value={saved.issueTypes} />
          <SummaryRow label="Statuses" value={saved.statuses} />
          <SummaryRow label="Board columns" value={saved.boardColumns} />
          <SummaryRow label="Custom fields" value={saved.customFields} />
          <SummaryRow label="Project roles" value={saved.projectRoles} />
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
            Sprints {saved.sprintsEnabled ? "enabled" : "disabled"}
          </li>
        </ul>
      </SpaceDialog>
    );
  }

  return (
    <SpaceDialog
      open
      title="Save as template"
      description="Capture this space's setup in your organisation's template library."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={() => void submit()} loading={busy}>
            Save template
          </Button>
        </>
      }
    >
      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <label className="block text-sm font-medium text-gray-700" htmlFor="tpl-name">
        Template name
      </label>
      <input
        id="tpl-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        disabled={busy}
        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50"
      />

      <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="tpl-desc">
        Description <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <textarea
        id="tpl-desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={2000}
        disabled={busy}
        placeholder="When should someone reach for this template?"
        className="mt-1 w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50"
      />

      <div className="mt-4 rounded border border-gray-200 bg-gray-50 px-3 py-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
          <Info className="h-3.5 w-3.5" />
          What gets saved
        </p>
        <ul className="mt-2 space-y-1">
          {CAPTURED.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-xs leading-snug text-gray-500">
          Work items, sprints, comments, attachments and members are not copied. The template
          is a snapshot — later changes to this space won&apos;t update it.
        </p>
      </div>
    </SpaceDialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
      {value} {label.toLowerCase()}
    </li>
  );
}
