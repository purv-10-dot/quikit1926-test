"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Selection + bulk delete/restore for the case list.
 *
 * Extracted from `repository-view.tsx`, which is already near the 300-line ceiling
 * in apps/quiktrack/CLAUDE.md.
 *
 * Selection is keyed by case id and intersected with the CURRENT rows: switching
 * folder or toggling the deleted view must not leave ids selected that are no longer
 * on screen, or "Delete 3" would act on rows the user can no longer see.
 */

export interface BulkOutcome {
  affected: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export function useCaseSelection({
  projectId,
  visibleIds,
  onDone,
}: {
  projectId: string;
  /** Ids currently rendered — selection is intersected with these. */
  visibleIds: string[];
  /** Called after a successful mutation so the caller can refetch. */
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);

  // Only ids still on screen count. Derived rather than stored, so a folder change
  // cannot leave a stale selection behind.
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
    async (action: "delete" | "restore") => {
      if (effective.length === 0) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/test/cases/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, action, ids: effective }),
        });
        const json = (await res.json()) as {
          success: boolean;
          error?: string;
          data?: BulkOutcome;
        };
        if (!json.success || !json.data) {
          setError(json.error ?? `Could not ${action} the selected cases.`);
          return;
        }

        const { affected, skipped } = json.data;
        const verb = action === "delete" ? "Deleted" : "Restored";
        // Skipped rows are always reported. A bulk action that silently drops part
        // of the selection is how a user ends up believing something is gone when
        // it is not.
        setNotice(
          skipped.length === 0
            ? `${verb} ${affected.length} case${affected.length === 1 ? "" : "s"}.`
            : `${verb} ${affected.length}, skipped ${skipped.length}: ${skipped[0].reason}` +
              (skipped.length > 1 ? ` (+${skipped.length - 1} more)` : ""),
        );
        setSelected(new Set());
        onDone();
      } catch {
        setError(`Could not ${action} the selected cases.`);
      } finally {
        setBusy(false);
      }
    },
    [effective, projectId, onDone],
  );

  const api = {
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
    deleteSelected: () => run("delete"),
    restoreSelected: () => run("restore"),
  };

  return {
    ...api,
    /**
     * The exact shape `CaseTable` wants, so the caller does not restate twelve
     * fields inline. `enabled` is the permission gate: pass false and the table
     * renders no checkboxes at all rather than controls that fail on click.
     */
    tableProps: (opts: { enabled: boolean; mode: "live" | "deleted" }) =>
      opts.enabled
        ? {
            selectedIds: api.selectedIds,
            count: api.count,
            allSelected: api.allSelected,
            someSelected: api.someSelected,
            busy: api.busy,
            mode: opts.mode,
            onToggle: api.toggle,
            onToggleAll: api.toggleAll,
            onDelete: api.deleteSelected,
            onRestore: api.restoreSelected,
            onClear: api.clear,
          }
        : undefined,
  };
}
