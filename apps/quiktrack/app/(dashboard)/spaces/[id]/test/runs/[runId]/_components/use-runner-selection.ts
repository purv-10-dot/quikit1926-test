"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Selection + bulk actions for the runner grid (QUIKTR-341) — Assign To, Add
 * Results (status), Add Label, Remove from run.
 *
 * Mirrors `test/_components/use-case-selection.ts`: selection is intersected
 * with the CURRENT rows so switching filter/sort never leaves stale ids ticked,
 * and every action reports `skipped` with a reason rather than silently doing
 * less than the count implied.
 */

interface BulkOutcome {
  affected: string[];
  skipped: Array<{ id: string; reason: string }>;
}

type Action =
  | { action: "assign"; assigneeId: string | null }
  | { action: "status"; statusId: string }
  | { action: "label"; tagId: string }
  | { action: "remove" };

export function useRunnerSelection({
  runId,
  visibleIds,
  onDone,
}: {
  runId: string;
  visibleIds: string[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const effective = useMemo(
    () => [...selected].filter((id) => visible.has(id)),
    [selected, visible],
  );

  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (on: boolean) => setSelected(on ? new Set(visibleIds) : new Set()),
    [visibleIds],
  );

  const clear = useCallback(() => {
    setSelected(new Set());
    setError(null);
    setNotice(null);
  }, []);

  const run = useCallback(
    async (body: Action, verb: string) => {
      if (effective.length === 0) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/test/runs/${runId}/tests/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, ids: effective }),
        });
        const json = (await res.json()) as {
          success: boolean;
          error?: string;
          data?: BulkOutcome;
        };
        if (!json.success || !json.data) {
          setError(json.error ?? `Could not ${verb}.`);
          return;
        }
        const { affected, skipped } = json.data;
        setNotice(
          skipped.length === 0
            ? `${verb} ${affected.length} test${affected.length === 1 ? "" : "s"}.`
            : `${verb} ${affected.length}, skipped ${skipped.length}: ${skipped[0].reason}` +
              (skipped.length > 1 ? ` (+${skipped.length - 1} more)` : ""),
        );
        setSelected(new Set());
        onDone();
      } catch {
        setError(`Could not ${verb}.`);
      } finally {
        setBusy(false);
      }
    },
    [effective, runId, onDone],
  );

  return {
    selectedIds: selected,
    count: effective.length,
    allSelected: visibleIds.length > 0 && effective.length === visibleIds.length,
    someSelected: effective.length > 0 && effective.length < visibleIds.length,
    busy,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    toggle,
    toggleAll,
    clear,
    assign: (assigneeId: string | null) => run({ action: "assign", assigneeId }, "Assigned"),
    setStatus: (statusId: string) => run({ action: "status", statusId }, "Updated"),
    addLabel: (tagId: string) => run({ action: "label", tagId }, "Labelled"),
    remove: () => run({ action: "remove" }, "Removed"),
  };
}
