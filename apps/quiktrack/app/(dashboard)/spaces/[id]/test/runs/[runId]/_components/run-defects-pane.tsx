"use client";

import Link from "next/link";
import { Bug } from "lucide-react";
import type { RunActivity } from "./run-activity-types";

/**
 * Defects tab (QUIKTR-339) — the work items raised from this run's failures.
 *
 * One row per ISSUE, listing the cases that hit it. A bug found by three cases is
 * one defect with three failing cases, not three defects — counting it the other
 * way would inflate a release's bug count.
 */
export function RunDefectsPane({
  data,
  loading,
  projectId,
}: {
  data: RunActivity | undefined;
  loading: boolean;
  projectId: string;
}) {
  if (loading) return <p className="p-4 text-sm text-gray-500">Loading defects…</p>;

  const defects = data?.defects ?? [];
  if (defects.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500">
          No defects linked to this run.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Link a work item when recording a failure, and it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-auto p-4">
      <ul className="space-y-2">
        {defects.map((d) => (
          <li
            key={d.issueId}
            className="rounded border border-gray-200 px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <Bug className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                {d.issue ? (
                  // /work/[issueId] resolves by ID, not key (see
                  // /api/issues/[id]/full) — linking by key 404s. Key is the
                  // label; id is the href.
                  <Link
                    href={`/spaces/${projectId}/work/${d.issue.id}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {d.issue.key} · {d.issue.title}
                  </Link>
                ) : (
                  // issueId carries no FK by design (deleting a Bug must never
                  // cascade into test history), so a linked issue can be gone.
                  // Show the dangling reference rather than dropping the row.
                  <p className="text-sm text-gray-500">
                    Linked work item no longer exists
                    <span className="ml-1 font-mono text-[11px] text-gray-400">
                      {d.issueId}
                    </span>
                  </p>
                )}

                <p className="mt-0.5 text-[11px] text-gray-500">
                  Hit by {d.cases.length} case{d.cases.length === 1 ? "" : "s"}:{" "}
                  {d.cases.map((c) => `TC-${c.refId}`).join(", ")}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
