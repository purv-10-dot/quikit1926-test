"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Tag, X } from "lucide-react";
import { Input } from "@quikit/ui";
import type { RunnerCaseLabel } from "./runner-types";

/**
 * Labels cell for the runner grid (QUIKTR-341) — a compact version of
 * `LabelPicker` (test/_components/label-picker.tsx) sized for a table cell.
 *
 * A second file rather than reusing LabelPicker directly: that component is built
 * for a detail panel (its own heading, "Add label" spelled out, generous padding)
 * and would not fit a table row. The attach/detach calls and the project's tag
 * vocabulary are the same `/api/test/cases/{id}/tags` and `/api/test/tags`
 * endpoints — only the chrome differs.
 *
 * Labels live on the CASE (`QtTestCaseTag`), not the run-test — editing here
 * changes the label on the case everywhere, in every run, matching how Priority
 * already behaves in this same grid.
 */

const FALLBACK = "#64748b";

function chipStyle(color: string | null) {
  const c = color ?? FALLBACK;
  return { backgroundColor: `${c}20`, color: c };
}

export function RunnerLabelCell({
  caseId,
  projectId,
  labels,
  disabled,
  onChanged,
}: {
  caseId: string;
  projectId: string;
  labels: RunnerCaseLabel[];
  disabled?: boolean;
  /** Called after a successful attach/detach so the caller can refetch the row. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<RunnerCaseLabel[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/test/tags?projectId=${projectId}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: RunnerCaseLabel[] }) => {
        if (j.success && j.data) setAvailable(j.data);
      })
      .catch(() => undefined);
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const attach = async (body: { tagId: string } | { name: string }) => {
    setBusy(true);
    try {
      await fetch(`/api/test/cases/${caseId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setQuery("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const detach = async (tagId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/test/cases/${caseId}/tags?tagId=${encodeURIComponent(tagId)}`, {
        method: "DELETE",
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const on = new Set(labels.map((l) => l.id));
  const term = query.trim().toLowerCase();
  const matches = available.filter(
    (a) => !on.has(a.id) && (!term || a.name.toLowerCase().includes(term)),
  );
  const canCreate =
    term.length > 0 &&
    !available.some((a) => a.name.toLowerCase() === term) &&
    !labels.some((l) => l.name.toLowerCase() === term);

  if (disabled) {
    return (
      <span className="flex flex-wrap gap-1">
        {labels.length === 0 ? (
          <span className="text-gray-300">—</span>
        ) : (
          labels.map((l) => (
            <span
              key={l.id}
              className="rounded px-1.5 py-0.5 text-[11px]"
              style={chipStyle(l.color)}
            >
              {l.name}
            </span>
          ))
        )}
      </span>
    );
  }

  return (
    <div ref={boxRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-[26px] flex-wrap items-center gap-1 rounded px-1 py-0.5 hover:bg-white hover:ring-1 hover:ring-gray-200 ${
          busy ? "opacity-50" : ""
        }`}
      >
        {labels.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
            <Plus className="h-3 w-3" />
            Add label
          </span>
        ) : (
          labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
              style={chipStyle(l.color)}
            >
              <Tag className="h-2.5 w-2.5" />
              {l.name}
            </span>
          ))
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {labels.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1 border-b border-gray-100 pb-1.5">
              {labels.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                  style={chipStyle(l.color)}
                >
                  {l.name}
                  <button
                    type="button"
                    onClick={() => void detach(l.id)}
                    disabled={busy}
                    aria-label={`Remove label ${l.name}`}
                    className="rounded hover:bg-black/10 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

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
            }}
          />

          <div className="mt-1.5 max-h-32 overflow-y-auto">
            {matches.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => void attach({ tagId: a.id })}
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
                onClick={() => void attach({ name: query.trim() })}
                className="w-full rounded px-1.5 py-1 text-left text-xs text-accent-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Create “{query.trim()}”
              </button>
            )}
            {matches.length === 0 && !canCreate && (
              <p className="px-1.5 py-1 text-xs text-gray-400">
                {available.length === 0
                  ? "No labels in this project yet."
                  : "No more labels to add."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
