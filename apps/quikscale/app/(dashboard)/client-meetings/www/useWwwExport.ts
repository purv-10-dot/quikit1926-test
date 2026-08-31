"use client";

/**
 * Selection, inline gap-filling and the Export WWW call.
 *
 * Kept out of the report view so that component stays presentational: it
 * formats a stored document, and this owns the one interaction that writes.
 *
 * WHY DRAFTS LIVE HERE AND NOT IN THE REPORT
 * ------------------------------------------
 * An owner typed into a candidate row is not part of the report — the report
 * records what the meeting said, and the meeting did not say it. Holding the
 * draft in component state until Export means a regenerate cannot silently
 * bake a human's guess into the stored document.
 *
 * WHY EXPORT IS BLOCKED RATHER THAN AUTO-FILLED
 * ---------------------------------------------
 * A candidate with no owner or no date could be exported by defaulting them.
 * That is exactly what the requirement document forbids: an invented due date
 * looks identical to a real one afterwards. So the button stays disabled and
 * says which rows still need input.
 */

import { useCallback, useMemo, useState } from "react";

export interface ExportCandidate {
  factId?: string;
  whoRaw?: string | null;
  who?: { userId?: string | null; userName?: string | null; confidence?: string } | null;
  what?: string;
  whenText?: string | null;
  whenMissing?: boolean;
  missingFields?: ("who" | "what" | "when")[];
  linkedWwwItemId?: string | null;
  dismissedAt?: string | Date | null;
}

/** What a human supplied for a row the meeting left incomplete. */
export interface RowDraft {
  ownerId?: string;
  when?: string;
  dueDateTBD?: boolean;
}

export interface ExportResultSummary {
  created: number;
  alreadyCreated: number;
  duplicates: number;
  skipped: number;
  messages: string[];
}

const isLive = (c: ExportCandidate) => !c.linkedWwwItemId && !c.dismissedAt;

/** ISO date, or undefined. The API decides what is acceptable; this only trims. */
const cleanDate = (v?: string | null) => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function useWwwExport(candidates: ExportCandidate[], endpoint: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResultSummary | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, ExportCandidate>();
    for (const c of candidates) if (c.factId) m.set(c.factId, c);
    return m;
  }, [candidates]);

  /** The owner to use: the human's pick, else one the bridge fully resolved. */
  const ownerFor = useCallback(
    (c: ExportCandidate): string | undefined => {
      const draft = c.factId ? drafts[c.factId] : undefined;
      if (draft?.ownerId) return draft.ownerId;
      // A "needs confirmation" resolution is NOT good enough to create with —
      // the wrong person gets chased for work they never agreed to.
      if (c.who?.confidence === "RESOLVED" && c.who.userId) return c.who.userId;
      return undefined;
    },
    [drafts],
  );

  /** Which fields a row is still missing, after drafts are applied. */
  const gapsFor = useCallback(
    (c: ExportCandidate): ("who" | "when" | "what")[] => {
      const draft = c.factId ? drafts[c.factId] : undefined;
      const gaps: ("who" | "when" | "what")[] = [];
      if (!ownerFor(c)) gaps.push("who");
      if (!c.what?.trim()) gaps.push("what");
      const hasDate = Boolean(cleanDate(draft?.when) ?? cleanDate(c.whenText));
      if (!hasDate && !draft?.dueDateTBD) gaps.push("when");
      return gaps;
    },
    [drafts, ownerFor],
  );

  const selectedCandidates = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter((c): c is ExportCandidate => Boolean(c)),
    [selected, byId],
  );

  const blocking = useMemo(
    () => selectedCandidates.filter((c) => gapsFor(c).length > 0),
    [selectedCandidates, gapsFor],
  );

  const canExport = selected.size > 0 && blocking.length === 0 && !exporting;

  const setDraft = useCallback((factId: string, patch: RowDraft) => {
    setDrafts((prev) => ({ ...prev, [factId]: { ...prev[factId], ...patch } }));
  }, []);

  const selectAllReady = useCallback(() => {
    setSelected(
      new Set(
        candidates
          .filter((c) => c.factId && isLive(c) && gapsFor(c).length === 0)
          .map((c) => c.factId as string),
      ),
    );
  }, [candidates, gapsFor]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const exportSelected = useCallback(async (): Promise<ExportResultSummary | null> => {
    if (!canExport) return null;
    setExporting(true);
    setError(null);
    setResult(null);

    try {
      const items = selectedCandidates.map((c) => {
        const draft = c.factId ? drafts[c.factId] : undefined;
        const when = cleanDate(draft?.when) ?? cleanDate(c.whenText);
        const tbd = draft?.dueDateTBD && !when;
        return {
          factId: c.factId as string,
          who: ownerFor(c) as string,
          what: (c.what ?? "").trim(),
          ...(tbd ? { dueDateTBD: true } : { when }),
        };
      });

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            data?: {
              created: unknown[];
              alreadyCreated: unknown[];
              duplicates: { message: string }[];
              skipped: { reason: string; message?: string }[];
            };
          }
        | null;

      if (!res.ok || !payload?.success || !payload.data) {
        setError(payload?.error ?? "The selected items could not be exported.");
        return null;
      }

      const d = payload.data;
      const summary: ExportResultSummary = {
        created: d.created.length,
        alreadyCreated: d.alreadyCreated.length,
        duplicates: d.duplicates.length,
        skipped: d.skipped.length,
        // Surfaced rather than counted only: "3 skipped" without a reason is
        // not something a user can act on.
        messages: [
          ...d.duplicates.map((x) => x.message),
          ...d.skipped.map((x) => x.message ?? `Skipped: ${x.reason}`),
        ],
      };
      setResult(summary);

      // Rows that landed are no longer selectable; anything unresolved stays
      // ticked so the user can see what still needs attention.
      const done = new Set([
        ...d.created.map((x) => (x as { factId: string }).factId),
        ...d.alreadyCreated.map((x) => (x as { factId: string }).factId),
      ]);
      setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))));

      return summary;
    } catch {
      setError("The selected items could not be exported.");
      return null;
    } finally {
      setExporting(false);
    }
  }, [canExport, selectedCandidates, drafts, ownerFor, endpoint]);

  return {
    selected,
    setSelected,
    drafts,
    setDraft,
    gapsFor,
    ownerFor,
    blocking,
    canExport,
    exporting,
    error,
    result,
    selectAllReady,
    clear,
    exportSelected,
  };
}
