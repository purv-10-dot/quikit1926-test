"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { Button, EmptyState, TableSkeleton } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import {
  groupByLifecycle,
  LIFECYCLE_HINT,
  LIFECYCLE_LABEL,
  LIFECYCLE_ORDER,
} from "@/lib/test/runLifecycle";
import { EditRunPanel } from "./edit-run-panel";
import { NewRunPanel } from "./new-run-panel";
import { RunRow } from "./run-row";
import type { RunRow as RunRowData } from "./run-types";

/**
 * Runs list, grouped by lifecycle (QUIKTR-338).
 *
 * Open · Completion Pending · Completed. Only the last is stored; "Completion
 * Pending" is derived (`state=open` AND nothing untested) — see
 * `lib/test/runLifecycle.ts`. It is the section that earns its keep: those runs
 * are the ones waiting to be signed off, and in the old flat table they were
 * indistinguishable from runs still in progress.
 *
 * Rates come from the same helpers the runner and the work-item panel use, so a
 * number never differs between screens.
 */
export function RunListView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const perms = useMyProjectPermissions(projectId);
  const canCreate = perms.loading || perms.has("TestRun", "create");
  const canClose = perms.loading || perms.has("TestRun", "update");

  const [panelOpen, setPanelOpen] = useState(false);
  /** The run being edited; null closes the edit panel. */
  const [editingRun, setEditingRun] = useState<RunRowData | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** "Deleted" view — how restore is reached. */
  const [showDeleted, setShowDeleted] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // showDeleted is part of the key: the two lists are different data.
  const runsKey = [
    "quiktrack",
    "test-runs",
    projectId,
    showDeleted ? "deleted" : "live",
  ] as const;
  const { data, isLoading } = useApiData<{ items: RunRowData[]; total: number }>(
    runsKey,
    `/api/test/runs?projectId=${projectId}&deleted=${showDeleted ? "true" : "false"}`,
    { staleTime: 0 },
  );

  /**
   * Soft-delete a run. Results are KEPT — stated in the confirmation with the real
   * count, because "delete" reads as destroying the execution history and here it
   * does not.
   */
  const mutateRun = async (
    action: "delete" | "restore",
    ids: string[],
    confirmText?: string,
  ) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setPendingId(ids[0] ?? null);
    setError(null);
    try {
      const res = await fetch("/api/test/runs/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action, ids }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? `Could not ${action} the run.`);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["quiktrack", "test-runs"] });
    } catch {
      setError(`Could not ${action} the run.`);
    } finally {
      setPendingId(null);
    }
  };

  // Memoised off `data` rather than a fresh `?? []` literal: the fallback array
  // has a new identity every render, so the grouping would re-run each time.
  const runs = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => groupByLifecycle(runs), [runs]);

  const closeRun = async (runId: string) => {
    setClosingId(runId);
    setError(null);
    try {
      const res = await fetch(`/api/test/runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Could not close the run.");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: runsKey });
    } catch {
      setError("Could not close the run.");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <Link
            href={`/spaces/${projectId}/test`}
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-3 w-3" />
            Test cases
          </Link>
          <h1 className="text-base font-semibold text-gray-900">Test runs</h1>
          <p className="text-xs text-gray-500">
            Each run is an immutable record of one execution pass.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Only for users who can delete: nobody else has anything to restore. */}
          {canClose && (
            <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setShowDeleted(v)}
                  className={`rounded px-2 py-1 text-[11px] ${
                    showDeleted === v
                      ? "bg-accent-50 font-medium text-accent-800"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {v ? "Deleted" : "Active"}
                </button>
              ))}
            </div>
          )}
          {canCreate && !showDeleted && (
            <Button
              size="sm"
              className="bg-accent-600 text-white hover:bg-accent-700"
              onClick={() => setPanelOpen(true)}
            >
              <Plus className="mr-1 h-4 w-4" />
              New run
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={5} />
          </div>
        ) : runs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={ClipboardList}
              title="No test runs yet"
              message="Create a run from a suite or a selection of cases, then record results against it."
              action={
                canCreate
                  ? { label: "New run", onClick: () => setPanelOpen(true) }
                  : undefined
              }
            />
          </div>
        ) : (
          LIFECYCLE_ORDER.map((phase) => {
            const list = groups[phase];
            // Empty sections are hidden rather than shown with a 0: three
            // headings over one run is noise, and "Completion Pending (0)" is not
            // information a QA lead needs.
            if (list.length === 0) return null;

            return (
              <section key={phase}>
                <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-gray-200 bg-accent-50 px-4 py-1.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                    {LIFECYCLE_LABEL[phase]}
                  </h2>
                  <span className="text-[11px] text-gray-500">{list.length}</span>
                  <span className="truncate text-[11px] text-gray-400">
                    {LIFECYCLE_HINT[phase]}
                  </span>
                </div>
                {list.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    projectId={projectId}
                    canClose={canClose}
                    onClose={closeRun}
                    onEdit={setEditingRun}
                    onDelete={(r) =>
                      void mutateRun(
                        "delete",
                        [r.id],
                        `Delete "${r.name}"?\n\nIt will be hidden from the runs list. ` +
                          `Its ${r.testCount} test${r.testCount === 1 ? "" : "s"} and any recorded ` +
                          `results are KEPT — the execution history stays intact, and you can restore the run later.`,
                      )
                    }
                    onRestore={(id) => void mutateRun("restore", [id])}
                    closing={closingId === run.id}
                    busy={pendingId === run.id}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>

      <NewRunPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        projectId={projectId}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: runsKey });
        }}
      />

      <EditRunPanel
        open={editingRun !== null}
        run={editingRun}
        projectId={projectId}
        onClose={() => setEditingRun(null)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: runsKey });
        }}
      />
    </div>
  );
}
