"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDateTime } from "@quikit/ui";

/**
 * Row renderers for the "QuikTest: Results" panel.
 *
 * Split out of `quiktest-results-panel.tsx` to keep both files under the
 * 300-line ceiling. Purely presentational — the panel owns fetching and state.
 */

export interface PanelTestRow {
  id: string;
  refId: number;
  caseVersion: number;
  currentStatus: { key: string; label: string; color: string };
  case: { id: string; refId: number; title: string };
  config: { name: string } | null;
  run: {
    id: string;
    refId: number;
    name: string;
    state: string;
    projectId: string;
    project: { id: string; name: string } | null;
    milestone: { id: string; name: string } | null;
  };
  latestResult: {
    id: string;
    source: string;
    executedBy: string | null;
    executedAt: string;
    elapsedMs: number | null;
  } | null;
}

/** Status pill, uppercase like the reference UI's `UNTESTED` badge. */
export function StatusPill({ statusKey, label }: { statusKey: string; label: string }) {
  const cls =
    statusKey === "passed" || statusKey === "automation_passed"
      ? "bg-green-100 text-green-800"
      : statusKey === "failed" ||
          statusKey === "automation_failed" ||
          statusKey === "automation_error"
        ? "bg-rose-100 text-rose-800"
        : statusKey === "blocked"
          ? "bg-gray-200 text-gray-800"
          : statusKey === "skipped"
            ? "bg-yellow-100 text-yellow-800"
            : statusKey === "retest"
              ? "bg-blue-100 text-blue-800"
              : "bg-gray-100 text-gray-600";

  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

/**
 * One test row, collapsed to `T106 · title · STATUS`, expanding to the
 * Project / Milestone / Test Run breakdown from the reference screenshot.
 */
export function TestRow({
  row,
  expanded,
  onToggle,
  projectHref,
}: {
  row: PanelTestRow;
  expanded: boolean;
  onToggle: () => void;
  projectHref: string;
}) {
  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-gray-700">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-12 shrink-0 text-xs text-gray-500">T{row.refId}</span>
        <a
          href={`${projectHref}/test/runs/${row.run.id}`}
          className="min-w-0 flex-1 truncate text-sm text-blue-700 hover:underline dark:text-blue-400"
        >
          {row.case.title}
        </a>
        <StatusPill
          statusKey={row.currentStatus.key}
          label={row.currentStatus.label}
        />
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-3 pb-3 pl-[3.75rem] text-xs">
          <dl className="min-w-0 space-y-1">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-gray-500">Project:</dt>
              <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                {row.run.project?.name ?? "—"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-gray-500">Milestone:</dt>
              <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                {row.run.milestone?.name ?? "—"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-gray-500">Test Run:</dt>
              <dd className="min-w-0 truncate">
                <a
                  href={`${projectHref}/test/runs/${row.run.id}`}
                  className="text-blue-700 hover:underline dark:text-blue-400"
                >
                  R{row.run.refId} {row.run.name}
                </a>
              </dd>
            </div>
          </dl>

          <div className="shrink-0 text-right text-gray-500">
            {row.latestResult ? (
              <>
                <p>By {row.latestResult.executedBy ?? "—"}</p>
                <p>{formatDateTime(row.latestResult.executedAt)}</p>
                {row.latestResult.source === "automated" && (
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    automated
                  </p>
                )}
              </>
            ) : (
              <p>Not executed yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Generic row for the Cases / Runs / Plans / Milestones tabs. */
export function SimpleRow({
  left,
  title,
  href,
  meta,
  pill,
}: {
  left: string;
  title: string;
  href?: string;
  meta?: string | null;
  pill?: { statusKey: string; label: string };
}) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-700">
      <span className="w-12 shrink-0 text-xs text-gray-500">{left}</span>
      {href ? (
        <a
          href={href}
          className="min-w-0 flex-1 truncate text-sm text-blue-700 hover:underline dark:text-blue-400"
        >
          {title}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
          {title}
        </span>
      )}
      {meta && <span className="shrink-0 text-xs text-gray-400">{meta}</span>}
      {pill && <StatusPill statusKey={pill.statusKey} label={pill.label} />}
    </div>
  );
}
