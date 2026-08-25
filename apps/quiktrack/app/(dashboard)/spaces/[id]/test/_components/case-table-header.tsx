"use client";

import { ColumnsMenu } from "./columns-menu";
import type { CaseColumnKey } from "./case-meta";

/**
 * Shared header for both the populated and empty case-table states.
 * Split from `case-table.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once real pagination replaced the single-page
 * fetch that silently truncated large suites.
 *
 * Rendered in the empty case too, so an empty folder reads as "this folder is
 * empty" rather than "the page failed to load" — and so you can still see WHERE
 * you are while it is empty.
 */
export function CaseTableHeader({
  sectionName,
  total,
  projectId,
  columns,
  onColumns,
}: {
  sectionName: string | null;
  total: number;
  projectId: string;
  columns: CaseColumnKey[];
  onColumns: (next: CaseColumnKey[]) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
      <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900">
        {/* "All cases in this suite" spelled out: the old label said "All cases in
            suite" while a FOLDER was named "All test cases", and the two read as
            the same thing. */}
        {sectionName ?? "All cases in this suite"}
        <span className="ml-2 font-normal tabular-nums text-gray-400">
          {total} {total === 1 ? "case" : "cases"}
        </span>
      </h2>
      <ColumnsMenu projectId={projectId} visible={columns} onChange={onColumns} />
    </div>
  );
}
