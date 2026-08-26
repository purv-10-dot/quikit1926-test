"use client";

import { useCallback, useState } from "react";
import type { InlinePatch } from "./inline-cell-types";

/**
 * Applies a grid (inline) edit to one case.
 *
 * Optimistic by design: the cell shows the new value immediately and reverts if the
 * request fails, because waiting for a round-trip per cell makes a grid feel broken.
 * The caller refetches on success so the row reflects server truth (updatedAt, and any
 * field the server normalised).
 */
export function useInlineEdit({
  onSaved,
}: {
  /** Called after a successful patch so the caller can invalidate its query. */
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (caseId: string, patch: InlinePatch): Promise<boolean> => {
      setError(null);
      try {
        const res = await fetch(`/api/test/cases/${caseId}/inline`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = (await res.json()) as { success: boolean; error?: string };
        if (!json.success) {
          // Surfaced rather than swallowed: an inline edit that silently fails leaves
          // the user believing a value was saved when it was not.
          setError(json.error ?? "Could not save that change.");
          return false;
        }
        onSaved();
        return true;
      } catch {
        setError("Could not save that change.");
        return false;
      }
    },
    [onSaved],
  );

  return { save, error, dismissError: () => setError(null) };
}
