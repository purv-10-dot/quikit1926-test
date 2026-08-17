"use client";

import Link from "next/link";
import { Bot, CheckCircle2, ClipboardList, Lock } from "lucide-react";
import { runLifecycle, type RunLifecycle } from "@/lib/test/runLifecycle";
import { executedTests, passRate, totalTests } from "@/lib/test/statuses";
import { RunCountChips, RunProgressBar } from "./run-progress-bar";
import type { RunRow as RunRowData } from "./run-types";

/**
 * One run in the grouped list (QUIKTR-338): icon, title, created by/date, full
 * result counts, segmented progress bar, and the close action.
 */

const ICON: Record<RunLifecycle, typeof ClipboardList> = {
  open: ClipboardList,
  completion_pending: CheckCircle2,
  completed: Lock,
};

const ICON_CLASS: Record<RunLifecycle, string> = {
  open: "text-blue-500",
  completion_pending: "text-amber-500",
  completed: "text-gray-400",
};

export function RunRow({
  run,
  projectId,
  canClose,
  onClose,
  closing,
}: {
  run: RunRowData;
  projectId: string;
  canClose: boolean;
  onClose: (runId: string) => void;
  closing: boolean;
}) {
  const phase = runLifecycle(run);
  const Icon = ICON[phase];
  const total = totalTests(run.counts);
  const executed = executedTests(run.counts);

  const creator = run.createdByUser
    ? `${run.createdByUser.firstName} ${run.createdByUser.lastName}`.trim()
    : null;

  return (
    <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 hover:bg-blue-50">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_CLASS[phase]}`} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <Link
            href={`/spaces/${projectId}/test/runs/${run.id}`}
            className="truncate font-medium text-gray-900 hover:underline"
          >
            {run.name}
          </Link>
          <span className="text-[11px] text-gray-400">R{run.refId}</span>
          {run.source !== "manual" && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              <Bot className="h-2.5 w-2.5" />
              {run.source}
            </span>
          )}
          {run.build && (
            <span className="text-[11px] text-gray-400">build {run.build}</span>
          )}
        </div>

        <p className="mt-0.5 text-[11px] text-gray-500">
          {creator ? `${creator} · ` : ""}
          {new Date(run.createdAt).toLocaleDateString()}
          {run.closedAt && ` · closed ${new Date(run.closedAt).toLocaleDateString()}`}
        </p>

        <div className="mt-1.5 max-w-xl">
          <RunProgressBar counts={run.counts} />
          <div className="mt-1">
            <RunCountChips counts={run.counts} />
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-gray-800">
          {/* An all-untested run shows a dash, not "0%" — nothing has been run, so
              a rate would imply everything failed. */}
          {executed === 0 ? "—" : `${passRate(run.counts)}%`}
        </p>
        <p className="text-[11px] text-gray-400">
          {executed} / {total} run
        </p>
        {canClose && run.state !== "closed" && (
          <button
            type="button"
            onClick={() => onClose(run.id)}
            disabled={closing}
            className="mt-1 text-[11px] text-gray-500 hover:text-gray-800 hover:underline disabled:opacity-50"
          >
            {closing ? "Closing…" : "Close run"}
          </button>
        )}
      </div>
    </div>
  );
}
