"use client";

import { useEffect, useState } from "react";

interface Summary {
  relatedWorkCount: number;
  workItemCount: number;
  counts: { done: number; inProgress: number; todo: number };
}

export function ProgressPanel({ releaseId, refreshKey }: { releaseId: string; refreshKey: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/releases/${releaseId}/summary`)
      .then((r) => r.json())
      .then((res) => {
        if (alive && res?.success) setSummary(res.data as Summary);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [releaseId, refreshKey]);

  const total = Math.max(1, summary?.workItemCount ?? 0);
  const donePct = summary ? (summary.counts.done / total) * 100 : 0;
  const inProgPct = summary ? (summary.counts.inProgress / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Progress</h3>

      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Related work</span>
          <span>{summary ? (summary.relatedWorkCount > 0 ? summary.relatedWorkCount : "None added") : "—"}</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-200" />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Work items</span>
          <span>{summary ? (summary.workItemCount > 0 ? summary.workItemCount : "No work items added") : "—"}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-green-500" style={{ width: `${donePct}%` }} />
          <div className="h-full bg-blue-500" style={{ width: `${inProgPct}%` }} />
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Done: {summary?.counts.done ?? 0} work items
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          In progress: {summary?.counts.inProgress ?? 0} work items
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          To do: {summary?.counts.todo ?? 0} work items
        </div>
      </div>
    </div>
  );
}
