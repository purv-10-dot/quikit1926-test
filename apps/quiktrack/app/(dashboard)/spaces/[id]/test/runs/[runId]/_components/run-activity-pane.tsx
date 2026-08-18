"use client";

import { Bot, User } from "lucide-react";
import { formatEstimate } from "@/lib/test/estimate";
import { statusMeta, type TestStatusKey } from "@/lib/test/statuses";
import type { RunActivity } from "./run-activity-types";

/**
 * Activity tab (QUIKTR-339) — the run's result trail, newest first.
 *
 * This is a genuine audit log rather than a reconstruction: `QtTestResult` is
 * append-only by database trigger, so every row shown is a result that was
 * actually recorded, in the order it happened.
 */
export function RunActivityPane({
  data,
  loading,
}: {
  data: RunActivity | undefined;
  loading: boolean;
}) {
  if (loading) return <p className="p-4 text-sm text-gray-500">Loading activity…</p>;

  const events = data?.events ?? [];
  if (events.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        Nothing recorded yet. Results appear here as tests are executed.
      </p>
    );
  }

  return (
    <div className="overflow-auto p-4">
      {data?.truncated && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing the {events.length} most recent of {data.total} results.
        </p>
      )}

      <ol className="space-y-2.5">
        {events.map((e) => {
          const meta = e.status?.key
            ? safeMeta(e.status.key)
            : null;
          return (
            <li key={e.id} className="flex gap-2.5">
              <span
                className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                  meta?.dot ?? "bg-gray-300"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">
                  <span className="font-mono text-[11px] text-gray-400">
                    TC-{e.case.refId}
                  </span>{" "}
                  <span className="font-medium">
                    {e.status?.label ?? "Unknown status"}
                  </span>
                  <span className="text-gray-500"> · {e.case.title}</span>
                </p>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    {e.source === "manual" ? (
                      <User className="h-3 w-3" />
                    ) : (
                      <Bot className="h-3 w-3" />
                    )}
                    {/* An automated result has no human actor — say "CI" rather
                        than leaving the line blank or inventing a name. */}
                    {e.actor
                      ? `${e.actor.firstName} ${e.actor.lastName}`.trim()
                      : e.source === "manual"
                        ? "Unknown user"
                        : "CI"}
                  </span>
                  <span>{new Date(e.executedAt).toLocaleString()}</span>
                  {e.elapsedMs != null && e.elapsedMs > 0 && (
                    <span>{formatEstimate(e.elapsedMs) || `${e.elapsedMs}ms`}</span>
                  )}
                  {e.build && <span>build {e.build}</span>}
                  {e.defectIssueIds.length > 0 && (
                    <span className="text-rose-600">
                      {e.defectIssueIds.length} defect
                      {e.defectIssueIds.length === 1 ? "" : "s"}
                    </span>
                  )}
                </p>

                {e.comment && (
                  <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
                    {e.comment}
                  </p>
                )}
                {e.failureMessage && (
                  <p className="mt-1 whitespace-pre-wrap rounded bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-800">
                    {e.failureMessage}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * `statusMeta` throws on an unknown key, and statuses are org-editable rows — a
 * custom status must not blank the whole tab.
 */
function safeMeta(key: string) {
  try {
    return statusMeta(key as TestStatusKey);
  } catch {
    return null;
  }
}
