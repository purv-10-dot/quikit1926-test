"use client";

import { CheckCircle2, Circle, Loader2, X } from "lucide-react";

/**
 * Per-repo backfill checklist modal — mirrors Jira's "statuses of each backfill
 * task within this repository" dialog (Branches / Commits / Pull Requests /
 * Builds / Deployments / Code Scanning / Secret Scanning / Dependabot / Issues).
 *
 * We currently backfill Branches, Commits, and Pull Requests. The remaining
 * rows are shown (to match Jira's layout) but marked "Not synced" rather than
 * faking a green tick — the data model is ready to enable them later.
 */

export interface RepoBackfillStatus {
  branches?: boolean;
  commits?: boolean;
  pullRequests?: boolean;
}

const SUPPORTED: { key: keyof RepoBackfillStatus; label: string }[] = [
  { key: "branches", label: "Branches" },
  { key: "commits", label: "Commits" },
  { key: "pullRequests", label: "Pull Requests" },
];

// Shown for parity with Jira; not synced yet.
const FUTURE = [
  "Builds",
  "Deployments",
  "Code Scanning Alerts",
  "Secret Scanning Alerts",
  "Dependabot Alerts",
  "Issues",
];

export function BackfillChecklist({
  repoFullName,
  status,
  running,
  onClose,
}: {
  repoFullName: string;
  status: RepoBackfillStatus | null;
  running: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
            {repoFullName}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-[12px] text-gray-500 dark:text-gray-400">
          Status of each backfill task within this repository.
        </p>

        <ul className="space-y-0.5">
          {SUPPORTED.map((t) => {
            const done = Boolean(status?.[t.key]);
            return (
              <Row
                key={t.key}
                label={t.label}
                state={running && !done ? "running" : done ? "done" : "pending"}
              />
            );
          })}
          {FUTURE.map((label) => (
            <Row key={label} label={label} state="unsupported" />
          ))}
        </ul>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  state,
}: {
  label: string;
  state: "done" | "running" | "pending" | "unsupported";
}) {
  return (
    <li className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-b-0 dark:border-gray-800">
      <span
        className={
          state === "unsupported"
            ? "text-gray-400 dark:text-gray-500"
            : "font-medium text-gray-900 dark:text-gray-100"
        }
      >
        {label}
      </span>
      {state === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
      {state === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
      {state === "pending" && <Circle className="h-4 w-4 text-gray-300" />}
      {state === "unsupported" && (
        <span className="text-[11px] text-gray-400">Not synced</span>
      )}
    </li>
  );
}
