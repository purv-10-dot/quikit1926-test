"use client";

import { useEffect, useState } from "react";
import { Plus, Tag, X } from "lucide-react";
import { Input } from "@quikit/ui";
import type { CaseLabel } from "./case-meta";

/**
 * Labels on a test case — the spec's "Add Labels" field (QUIKTR-333/335).
 *
 * `QtTestTag` shipped in the first migration but nothing could author a label, so
 * the Labels column was empty for every case. This is the authoring surface:
 * pick an existing label, or type a new name and press Enter.
 *
 * Attach/detach write immediately rather than on Save, matching CoverageLinks —
 * both are relationship rows, not case columns, so they are not part of the
 * case's version snapshot and batching them into the save would imply they were.
 */

/** Deterministic chip colour when a label has none, so it is stable per label. */
const FALLBACK = "#64748b";

function chipStyle(color: string | null) {
  const c = color ?? FALLBACK;
  // 20 = ~12% alpha. Keeps text legible on the tint at any hue.
  return { backgroundColor: `${c}20`, color: c };
}

export function LabelPicker({
  caseId,
  projectId,
  disabled,
  onChanged,
}: {
  /** Null in create mode — labels can only attach to a saved case. */
  caseId: string | null;
  projectId: string;
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const [labels, setLabels] = useState<CaseLabel[]>([]);
  const [available, setAvailable] = useState<CaseLabel[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!caseId) return;
    fetch(`/api/test/cases/${caseId}/tags`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: CaseLabel[] }) => {
        if (j.success && j.data) setLabels(j.data);
      })
      .catch(() => undefined);
  };

  useEffect(load, [caseId]);

  // The project's label vocabulary, loaded when the picker opens.
  useEffect(() => {
    if (!adding) return;
    fetch(`/api/test/tags?projectId=${projectId}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: CaseLabel[] }) => {
        if (j.success && j.data) setAvailable(j.data);
      })
      .catch(() => undefined);
  }, [adding, projectId]);

  const attach = async (body: { tagId: string } | { name: string }) => {
    if (!caseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/test/cases/${caseId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Could not add that label.");
        return;
      }
      setQuery("");
      setAdding(false);
      load();
      onChanged?.();
    } catch {
      setError("Could not add that label.");
    } finally {
      setBusy(false);
    }
  };

  const detach = async (tagId: string) => {
    if (!caseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/test/cases/${caseId}/tags?tagId=${encodeURIComponent(tagId)}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Could not remove that label.");
        return;
      }
      load();
      onChanged?.();
    } catch {
      setError("Could not remove that label.");
    } finally {
      setBusy(false);
    }
  };

  if (!caseId) {
    return (
      <p className="text-xs text-gray-500">
        Save the case first, then labels can be added.
      </p>
    );
  }

  const on = new Set(labels.map((l) => l.id));
  const term = query.trim().toLowerCase();
  const matches = available.filter(
    (a) => !on.has(a.id) && (!term || a.name.toLowerCase().includes(term)),
  );
  // Offer creation only when the typed name isn't already an existing label —
  // otherwise "Create" and the suggestion above it would do the same thing.
  const canCreate =
    term.length > 0 &&
    !available.some((a) => a.name.toLowerCase() === term) &&
    !labels.some((l) => l.name.toLowerCase() === term);

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
            style={chipStyle(l.color)}
          >
            <Tag className="h-3 w-3" />
            {l.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => detach(l.id)}
                disabled={busy}
                aria-label={`Remove label ${l.name}`}
                className="rounded hover:bg-black/10 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {labels.length === 0 && (
          <span className="text-xs text-gray-400">No labels yet.</span>
        )}

        {!disabled && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            <Plus className="h-3 w-3" />
            Add label
          </button>
        )}
      </div>

      {adding && !disabled && (
        <div className="rounded border border-gray-200 p-2">
          <Input
            autoFocus
            value={query}
            placeholder="Find or create a label…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate && !busy) {
                e.preventDefault();
                void attach({ name: query.trim() });
              }
              if (e.key === "Escape") {
                setAdding(false);
                setQuery("");
              }
            }}
          />

          <div className="mt-1.5 max-h-40 overflow-y-auto">
            {matches.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => attach({ tagId: a.id })}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: a.color ?? FALLBACK }}
                />
                {a.name}
              </button>
            ))}

            {canCreate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => attach({ name: query.trim() })}
                className="w-full rounded px-1.5 py-1 text-left text-xs text-accent-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Create “{query.trim()}”
              </button>
            )}

            {matches.length === 0 && !canCreate && (
              <p className="px-1.5 py-1 text-xs text-gray-400">
                {available.length === 0
                  ? "No labels in this project yet — type a name to create one."
                  : "Every matching label is already on this case."}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setQuery("");
            }}
            className="mt-1 text-xs text-gray-500 hover:underline"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
