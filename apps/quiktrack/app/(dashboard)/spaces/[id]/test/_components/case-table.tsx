"use client";

import { useMemo } from "react";
import { EmptyState, TableSkeleton } from "@quikit/ui";
import { FileText } from "lucide-react";
import { forecastMs, formatEstimate } from "@/lib/test/estimate";
import {
  CASE_COLUMNS,
  caseRef,
  type CaseColumnKey,
  type TestCaseRow,
} from "./case-meta";
import { BulkActionsBar } from "./bulk-actions-bar";
import { CaseTableHeader } from "./case-table-header";
import { CaseTableLoadMore } from "./case-table-load-more";
import { CaseCell } from "./case-row-cells";
import { CaseTitleCell } from "./case-title-cell";
import type { InlinePatch } from "./inline-cell-types";
import { TriCheckbox } from "../runs/_components/tri-checkbox";

/**
 * Right pane: the case list for the selected folder.
 *
 * Table chrome follows the repo's locked convention — `bg-accent-50` headers,
 * neutral row ids, `hover:bg-blue-50` rows — so it reads like every other table
 * in the app rather than a bespoke surface.
 *
 * Which optional columns show is a per-person, per-project preference owned by
 * `ColumnsMenu` (QUIKTR-335). ID and Title are structural and always rendered.
 */

interface CaseTableProps {
  rows: TestCaseRow[];
  loading: boolean;
  total: number;
  /** True while more pages exist beyond what `rows` currently holds. */
  hasMore?: boolean;
  /** True while the NEXT page is in flight (distinct from `loading`, which is
   *  only the first page). */
  loadingMore?: boolean;
  /** Fetches the next page — called on scroll-near-bottom and by the
   *  fallback "Load more" button. Omit to disable pagination (e.g. every row
   *  already fits in one page and there's nothing more to load). */
  onLoadMore?: () => void;
  onOpen: (caseId: string) => void;
  onCreate: () => void;
  canCreate: boolean;
  /** True on the "Deleted" tab — swaps the empty state's copy/CTA so an empty
   *  trash reads as "nothing deleted" rather than "no cases exist yet". */
  showDeleted?: boolean;
  /** Null when viewing the whole suite. */
  sectionName: string | null;
  projectId: string;
  columns: CaseColumnKey[];
  onColumns: (next: CaseColumnKey[]) => void;
  /**
   * Inline (grid) editing. Omit to render read-only cells — a viewer gets no edit
   * affordances at all rather than controls that fail on click.
   *
   * These edits deliberately do NOT bump the case version: see
   * `lib/services/testCaseInline.ts`.
   */
  onInlineEdit?: (caseId: string, patch: InlinePatch) => Promise<boolean>;
  /**
   * Bulk selection. Omit to render no checkboxes at all — the column only appears
   * for users who can actually delete, so a read-only viewer gets no dead controls.
   */
  selection?: {
    selectedIds: Set<string>;
    count: number;
    allSelected: boolean;
    someSelected: boolean;
    busy: boolean;
    mode: "live" | "deleted";
    onToggle: (id: string, on: boolean) => void;
    onToggleAll: (on: boolean) => void;
    onDelete: () => void;
    onRestore: () => void;
    onClear: () => void;
  };
}

export function CaseTable({
  rows,
  loading,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  onCreate,
  canCreate,
  showDeleted,
  sectionName,
  projectId,
  columns,
  onColumns,
  onInlineEdit,
  selection,
}: CaseTableProps) {
  // Forecast over the rows on screen. Stated as such in the footer: it covers
  // this page, not the whole suite, and saying "suite forecast" over a paginated
  // list would be a plain lie.
  const forecast = useMemo(
    () => forecastMs(rows.map((r) => r.estimateMs)),
    [rows],
  );
  const meanMs =
    forecast.knownCount > 0
      ? rows.reduce((s, r) => s + (r.estimateMs && r.estimateMs > 0 ? r.estimateMs : 0), 0) /
        forecast.knownCount
      : null;

  const shown = CASE_COLUMNS.filter((c) => columns.includes(c.key));

  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (rows.length === 0) {
    // Header stays put so the pane reads as "this folder is empty" rather than
    // "the page failed to load", and so the location is still visible.
    return (
      <div className="flex h-full flex-col">
        <CaseTableHeader
          sectionName={sectionName}
          total={0}
          projectId={projectId}
          columns={columns}
          onColumns={onColumns}
        />
        <div className="flex flex-1 items-start justify-center px-6 py-12">
          <div className="max-w-sm text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-3 text-sm font-semibold text-gray-800">
              {showDeleted
                ? sectionName
                  ? `Nothing deleted in “${sectionName}”`
                  : "Nothing deleted in this suite"
                : sectionName
                  ? `Nothing in “${sectionName}” yet`
                  : "This suite has no test cases yet"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {showDeleted
                ? "Deleted test cases show up here and can be restored at any time."
                : "A test case describes one thing to check — the steps to follow and what should happen. Once cases exist, you group them into a test run to execute them."}
            </p>
            {canCreate && !showDeleted && (
              <button
                type="button"
                onClick={onCreate}
                className="mt-4 rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white hover:bg-accent-700"
              >
                Create the first test case
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <CaseTableHeader
        sectionName={sectionName}
        total={total}
        projectId={projectId}
        columns={columns}
        onColumns={onColumns}
      />

      {selection && (
        <BulkActionsBar
          count={selection.count}
          mode={selection.mode}
          busy={selection.busy}
          onDelete={selection.onDelete}
          onRestore={selection.onRestore}
          onClear={selection.onClear}
        />
      )}

      <div
        className="flex-1 overflow-auto"
        onScroll={(e) => {
          if (!onLoadMore || !hasMore || loadingMore) return;
          const el = e.currentTarget;
          // Fire a little before the true bottom so the next page is already
          // loading by the time the user actually reaches it.
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
            onLoadMore();
          }
        }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left">
              {selection && (
                <th className="w-9 bg-accent-50 px-3 py-2">
                  <TriCheckbox
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    disabled={selection.busy}
                    onChange={selection.onToggleAll}
                    ariaLabel="Select all cases on this page"
                  />
                </th>
              )}
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">ID</th>
              <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Title</th>
              {shown.map((c) => (
                <th
                  key={c.key}
                  className="bg-accent-50 px-4 py-2 font-medium text-gray-700"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-gray-100 hover:bg-blue-50"
                onClick={() => onOpen(row.id)}
              >
                {selection && (
                  // stopPropagation: the row opens the case on click, and ticking a
                  // checkbox must not also open it.
                  <td
                    className="w-9 px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TriCheckbox
                      checked={selection.selectedIds.has(row.id)}
                      disabled={selection.busy}
                      onChange={(on) => selection.onToggle(row.id, on)}
                      ariaLabel={`Select ${caseRef(row.refId)}`}
                    />
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2 text-gray-900">
                  {caseRef(row.refId)}
                </td>
                <td className="px-4 py-2">
                  <CaseTitleCell
                    caseId={row.id}
                    title={row.title}
                    currentVersion={row.currentVersion}
                    onInlineEdit={onInlineEdit}
                  />
                </td>
                {shown.map((c) => (
                  <CaseCell
                    key={c.key}
                    column={c.key}
                    row={row}
                    meanMs={meanMs}
                    onInlineEdit={onInlineEdit}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {hasMore && (
          <CaseTableLoadMore
            shown={rows.length}
            total={total}
            loading={Boolean(loadingMore)}
            onLoadMore={onLoadMore}
          />
        )}
      </div>

      {columns.includes("forecast") && (
        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          {forecast.estimated ? (
            <>
              Forecast for these {rows.length}{" "}
              {rows.length === 1 ? "case" : "cases"}:{" "}
              <span className="font-medium text-gray-700">
                {formatEstimate(forecast.totalMs)}
              </span>
              {forecast.extrapolated && (
                <>
                  {" "}
                  — {forecast.unknownCount} without an estimate, filled in from
                  the average of the {forecast.knownCount} that have one.
                </>
              )}
            </>
          ) : (
            <>No case here has an estimate, so there is nothing to forecast from.</>
          )}
        </div>
      )}
    </div>
  );
}
