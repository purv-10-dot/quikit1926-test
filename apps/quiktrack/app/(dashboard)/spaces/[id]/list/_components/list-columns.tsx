"use client";

import {
  TYPE_META,
  type IssueStatus,
  type ListIssue,
  type Priority,
  type SortKey,
  type UserLite,
} from "./list-types";
import {
  AssigneeEditor,
  DateEditor,
  NumberEditor,
  PriorityEditor,
  StatusEditor,
  TextEditor,
} from "./inline-editors";

export type IssuePatch = Partial<{
  title: string;
  statusId: string;
  priority: Priority | null;
  assigneeId: string | null;
  storyPoints: number | null;
  eta: number | null;
  dueDate: string | null;
  startDate: string | null;
}>;

export interface RenderContext {
  projectId: string;
  onOpenIssue: (issueId: string) => void;
  statuses: IssueStatus[];
  members: { userId: string; user: UserLite | null }[];
  /** Inline-edit save. Optimistic update + PATCH /api/issues/:id; reverts on failure. */
  onPatchIssue: (issueId: string, patch: IssuePatch) => void;
}

export interface ColumnDef {
  key: string;
  label: string;
  sortKey: SortKey | null;
  defaultWidth: number;
  /** Always visible — can't be hidden via the column menu. */
  required?: boolean;
  render: (issue: ListIssue, ctx: RenderContext) => React.ReactNode;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ReadOnlyAssignee({ user }: { user: ListIssue["assignee"] }) {
  // Reporter stays read-only — clone the visuals from AssigneeEditor's button
  // surface but without the click handler.
  if (!user) {
    return (
      <span className="flex items-center gap-2 text-gray-400">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-50">·</span>
        <span>—</span>
      </span>
    );
  }
  const initials =
    (user.firstName?.[0] ?? user.email[0] ?? "?").toUpperCase() +
    (user.lastName?.[0] ?? "").toUpperCase();
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
  return (
    <span className="flex items-center gap-2 min-w-0">
      {user.avatar ? (
        <img src={user.avatar} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
      ) : (
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-600 text-[10px] font-medium text-white">
          {initials}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

export const COLUMN_DEFS: ColumnDef[] = [
  {
    key: "key",
    label: "Key",
    sortKey: "key",
    defaultWidth: 110,
    required: true,
    render: (issue, { onOpenIssue }) => (
      <button
        type="button"
        onClick={() => onOpenIssue(issue.id)}
        className="font-mono text-xs text-gray-900 hover:underline"
      >
        {issue.key}
      </button>
    ),
  },
  {
    key: "title",
    label: "Work",
    sortKey: "title",
    defaultWidth: 420,
    required: true,
    render: (issue, { onOpenIssue, onPatchIssue }) => {
      const TypeIcon = TYPE_META[issue.type]?.Icon;
      const typeColor = TYPE_META[issue.type]?.color ?? "text-gray-500";
      const isDone = issue.status?.category === "DONE";
      return (
        <span className="flex items-center gap-2 min-w-0">
          {TypeIcon ? (
            <button
              type="button"
              onClick={() => onOpenIssue(issue.id)}
              title="Open detail"
              className="flex-shrink-0"
            >
              <TypeIcon className={`h-4 w-4 ${typeColor}`} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <TextEditor
              value={issue.title}
              onChange={(next) => onPatchIssue(issue.id, { title: next })}
              className={isDone ? "text-gray-400 line-through" : "text-gray-900"}
            />
          </div>
        </span>
      );
    },
  },
  {
    key: "type",
    label: "Type",
    sortKey: "type",
    defaultWidth: 100,
    render: (issue) => {
      const meta = TYPE_META[issue.type];
      return <span className="text-xs text-gray-700">{meta?.label ?? issue.type}</span>;
    },
  },
  {
    key: "assigneeId",
    label: "Assignee",
    sortKey: "assigneeId",
    defaultWidth: 200,
    render: (issue, { members, onPatchIssue }) => (
      <AssigneeEditor
        value={issue.assignee}
        members={members}
        onChange={(userId) => onPatchIssue(issue.id, { assigneeId: userId })}
      />
    ),
  },
  {
    key: "reporterId",
    label: "Reporter",
    sortKey: null,
    defaultWidth: 200,
    render: (issue) => <ReadOnlyAssignee user={issue.reporter} />,
  },
  {
    key: "priority",
    label: "Priority",
    sortKey: "priority",
    defaultWidth: 110,
    render: (issue, { onPatchIssue }) => (
      <PriorityEditor
        value={issue.priority}
        onChange={(next) => onPatchIssue(issue.id, { priority: next })}
      />
    ),
  },
  {
    key: "storyPoints",
    label: "Story Points",
    sortKey: null,
    defaultWidth: 110,
    render: (issue, { onPatchIssue }) => (
      <NumberEditor
        value={issue.storyPoints}
        onChange={(next) => onPatchIssue(issue.id, { storyPoints: next })}
      />
    ),
  },
  {
    key: "eta",
    label: "ETA (h)",
    sortKey: null,
    defaultWidth: 90,
    render: (issue, { onPatchIssue }) => (
      <NumberEditor
        value={issue.eta}
        onChange={(next) => onPatchIssue(issue.id, { eta: next })}
        unit="h"
      />
    ),
  },
  {
    key: "statusId",
    label: "Status",
    sortKey: "statusId",
    defaultWidth: 130,
    render: (issue, { statuses, onPatchIssue }) => (
      <StatusEditor
        value={issue.status}
        statuses={statuses}
        onChange={(statusId) => onPatchIssue(issue.id, { statusId })}
      />
    ),
  },
  {
    key: "resolution",
    label: "Resolution",
    sortKey: null,
    defaultWidth: 120,
    render: (issue) => (
      <span className="text-xs text-gray-600">
        {issue.status?.category === "DONE" ? "Done" : "Unresolved"}
      </span>
    ),
  },
  {
    key: "dueDate",
    label: "Due",
    sortKey: "dueDate",
    defaultWidth: 120,
    render: (issue, { onPatchIssue }) => (
      <DateEditor
        value={issue.dueDate}
        onChange={(next) => onPatchIssue(issue.id, { dueDate: next })}
      />
    ),
  },
  {
    key: "startDate",
    label: "Start",
    sortKey: null,
    defaultWidth: 120,
    render: (issue, { onPatchIssue }) => (
      <DateEditor
        value={issue.startDate}
        onChange={(next) => onPatchIssue(issue.id, { startDate: next })}
      />
    ),
  },
  {
    key: "createdAt",
    label: "Created",
    sortKey: "createdAt",
    defaultWidth: 140,
    render: (issue) => <span className="text-xs text-gray-500">{fmtDate(issue.createdAt)}</span>,
  },
  {
    key: "updatedAt",
    label: "Updated",
    sortKey: "updatedAt",
    defaultWidth: 140,
    render: (issue) => <span className="text-xs text-gray-500">{fmtDate(issue.updatedAt)}</span>,
  },
];

export const COLUMN_DEFAULT_WIDTHS: Record<string, number> = Object.fromEntries(
  COLUMN_DEFS.map((c) => [c.key, c.defaultWidth]),
);

export const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
  COLUMN_DEFS.map((c) => [c.key, c.label]),
);


/**
 * Apply user prefs (order + hidden) to the canonical column list.
 * - Columns in `order` come first, in that order
 * - Columns NOT in `order` get appended in their canonical position
 * - Hidden columns are dropped (except `required` ones which are always shown)
 */
export function resolveColumns(orderPref: string[], hidden: Set<string>): ColumnDef[] {
  const byKey = new Map(COLUMN_DEFS.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const ordered: ColumnDef[] = [];
  for (const k of orderPref) {
    const c = byKey.get(k);
    if (c) { ordered.push(c); seen.add(k); }
  }
  for (const c of COLUMN_DEFS) {
    if (!seen.has(c.key)) ordered.push(c);
  }
  return ordered.filter((c) => c.required || !hidden.has(c.key));
}
