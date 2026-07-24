"use client";

import {
  COLUMN_DEFAULT_WIDTHS,
  COLUMN_DEFS,
  type ColumnDef,
} from "../../../spaces/[id]/list/_components/list-columns";
import type { ListIssue } from "../../../spaces/[id]/list/_components/list-types";

/**
 * Row shape returned by /api/filters/[id] — a ListIssue plus its project. The
 * `type` is widened to allow "IDEA" (discovery ideas are merged in but render
 * read-only), which the base ListIssue type does not include.
 */
export type FilterListIssue = Omit<ListIssue, "type"> & {
  type: ListIssue["type"] | "IDEA";
  project: { id: string; name: string; projectKey?: string } | null;
};

// A synthetic column for the cross-project Project name. It isn't in
// COLUMN_DEFS (which is shared/frozen), so we splice it in locally after "key".
export const PROJECT_COL: ColumnDef = {
  key: "project",
  label: "Project",
  sortKey: null,
  defaultWidth: 160,
  render: () => null, // rendered specially (needs FilterListIssue, not ListIssue)
};

export const COL_WIDTHS: Record<string, number> = {
  ...COLUMN_DEFAULT_WIDTHS,
  [PROJECT_COL.key]: PROJECT_COL.defaultWidth,
};

/** Insert the Project column right after the required "key" column. */
export function withProjectColumn(cols: ColumnDef[]): ColumnDef[] {
  const keyIdx = cols.findIndex((c) => c.key === "key");
  if (keyIdx === -1) return [PROJECT_COL, ...cols];
  const next = [...cols];
  next.splice(keyIdx + 1, 0, PROJECT_COL);
  return next;
}

export function cellStyle(w: number): React.CSSProperties {
  return { width: w, minWidth: w, maxWidth: w };
}

/**
 * The shared COLUMN_DEFS render fns take a ListIssue, whose `type` union omits
 * "IDEA". A FilterListIssue only differs by that widened `type`, used solely for
 * an icon lookup (`TYPE_META[type]`, tolerant of misses). Cast is safe.
 */
export function asListIssue(issue: FilterListIssue): ListIssue {
  return issue as unknown as ListIssue;
}

const INTERACTIVE_COLS = [
  "title",
  "assigneeId",
  "priority",
  "storyPoints",
  "eta",
  "statusId",
  "dueDate",
  "startDate",
];

/**
 * Minimal read-only rendering for non-editable (IDEA) rows. Reuses the shared
 * COLUMN_DEFS render for purely-presentational columns; for interactive columns
 * it falls back to plain text so no editor/checkbox appears.
 */
export function ReadOnlyCell({
  issue,
  colKey,
  onOpenIssue,
}: {
  issue: FilterListIssue;
  colKey: string;
  onOpenIssue: (id: string) => void;
}) {
  const def = COLUMN_DEFS.find((c) => c.key === colKey);
  // Non-interactive columns are safe to render via the shared def (they ignore
  // statuses/members/onPatchIssue). Interactive ones get a plain fallback.
  const interactive = INTERACTIVE_COLS.includes(colKey);
  if (!interactive && def) {
    return (
      <>
        {def.render(asListIssue(issue), {
          projectId: "",
          onOpenIssue,
          statuses: [],
          members: [],
          onPatchIssue: () => {},
        })}
      </>
    );
  }
  if (colKey === "title") {
    return <span className="text-gray-900">{issue.title}</span>;
  }
  if (colKey === "statusId") {
    return issue.status ? (
      <span
        className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
        style={{ backgroundColor: `${issue.status.color}20`, color: issue.status.color }}
      >
        {issue.status.name}
      </span>
    ) : (
      <span className="text-gray-400">—</span>
    );
  }
  if (colKey === "priority") {
    return (
      <span className="text-xs capitalize text-gray-600">
        {issue.priority?.toLowerCase() ?? "—"}
      </span>
    );
  }
  return <span className="text-gray-400">—</span>;
}
