"use client";

import { ChevronDown, ChevronRight, GitBranch, Trash2 } from "lucide-react";
import { Skeleton, SkeletonAvatar, SkeletonBadge } from "@/components/skeleton";
import {
  TYPE_META,
  type EpicLite,
  type IssueStatus,
  type SprintLite,
  type TaskIssue,
  type UserLite,
} from "./task-types";
import { EpicLinker, SprintEditor } from "./task-table-editors";
// Inline cell editors reused from the List view (structurally compatible types).
// TODO(integration): hoist inline-editors to components/ so both views share it
// without crossing route folders.
import {
  AssigneeEditor,
  DateEditor,
  NumberEditor,
  StatusEditor,
  TextEditor,
} from "../../list/_components/inline-editors";

export interface TaskRowContext {
  statuses: IssueStatus[];
  sprints: Map<string, SprintLite>;
  members: Map<string, UserLite>;
  /** Array form of members + sprints, needed by the inline editors' pickers. */
  memberList: { userId: string; user: UserLite | null }[];
  sprintList: SprintLite[];
  epics: EpicLite[];
  onOpenIssue: (id: string) => void;
  onDelete: (id: string) => void;
  /** PATCH this issue with a partial diff (e.g. `{ statusId: 'abc' }`). */
  onPatchIssue: (id: string, patch: Record<string, unknown>) => void;
}

// ── Subtask count badge ──────────────────────────────────────────────────────

function SubtaskBadge({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600"
      title={`${count} subtask${count === 1 ? "" : "s"}`}
    >
      <GitBranch className="h-2.5 w-2.5" />
      {count}
    </span>
  );
}

interface RowProps {
  issue: TaskIssue;
  depth: number;
  /** undefined = no expand affordance; null = expandable but currently collapsed; true/false = open state */
  expanded?: boolean;
  onToggleExpand?: () => void;
  ctx: TaskRowContext;
}

const INDENT_PX = 24;

export function TaskTableRow({ issue, depth, expanded, onToggleExpand, ctx }: RowProps) {
  const TypeIcon = TYPE_META[issue.type]?.Icon;
  const typeColor = TYPE_META[issue.type]?.color ?? "text-gray-500";
  const status = ctx.statuses.find((s) => s.id === issue.statusId) ?? null;
  const isDone = status?.category === "DONE";
  const sprint = issue.sprintId ? ctx.sprints.get(issue.sprintId) ?? null : null;
  const assignee = issue.assigneeId ? ctx.members.get(issue.assigneeId) ?? null : null;
  const canExpand = onToggleExpand !== undefined;

  // ETA: a parent whose children carry estimates shows a read-only rollup (its
  // own value is stale). A leaf (rollup === own) is inline-editable.
  const ownEta = issue.eta ?? 0;
  const totalEta = issue.rolledUpEta ?? ownEta;
  const isEtaRollup = totalEta !== ownEta;

  return (
    <tr className="group border-b border-gray-100 hover:bg-blue-50/30">
      <td className="w-8 px-2 py-2 align-middle">
        {canExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </td>
      <td className="w-28 px-3 py-2 align-middle">
        <button
          type="button"
          onClick={() => ctx.onOpenIssue(issue.id)}
          className="font-mono text-[11px] text-gray-700 hover:underline"
        >
          {issue.key}
        </button>
      </td>
      <td className="px-3 py-2 align-middle" style={{ paddingLeft: 12 + depth * INDENT_PX }}>
        <span className="flex items-center gap-2">
          {issue.type === "SUBTASK" ? (
            <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">SUB</span>
          ) : TypeIcon ? (
            <button
              type="button"
              onClick={() => ctx.onOpenIssue(issue.id)}
              title="Open detail"
              className="flex-shrink-0"
            >
              <TypeIcon className={`h-4 w-4 ${typeColor}`} />
            </button>
          ) : null}
          {/* `min-w-0 flex-1` lets the title editor shrink so siblings stay in
              view instead of being pushed off the right edge. */}
          <div className="min-w-0 flex-1">
            <TextEditor
              value={issue.title}
              onChange={(next) => ctx.onPatchIssue(issue.id, { title: next })}
              className={isDone ? "text-gray-400 line-through" : "text-gray-900"}
            />
          </div>
          {issue.subtaskCount > 0 && <SubtaskBadge count={issue.subtaskCount} />}
          {/* Epic linker hidden for epics themselves and subtasks. Subtasks
              link to their parent task (parentId), not directly to an epic. */}
          {issue.type !== "EPIC" && issue.type !== "SUBTASK" && (
            <span className="flex-shrink-0">
              <EpicLinker
                issue={issue}
                epics={ctx.epics}
                onChange={(epicId) => ctx.onPatchIssue(issue.id, { epicId })}
              />
            </span>
          )}
        </span>
      </td>
      <td className="w-44 px-3 py-2 align-middle">
        {/* Epics aren't sprint items — their detail form has no Sprint field, so
            keep the table consistent and don't offer sprint editing here. */}
        {issue.type === "EPIC" ? (
          <span className="text-gray-300">—</span>
        ) : (
          <SprintEditor
            value={sprint}
            sprints={ctx.sprintList}
            onChange={(sprintId) => ctx.onPatchIssue(issue.id, { sprintId })}
          />
        )}
      </td>
      <td className="w-44 px-3 py-2 align-middle">
        <AssigneeEditor
          value={assignee}
          members={ctx.memberList}
          onChange={(assigneeId) => ctx.onPatchIssue(issue.id, { assigneeId })}
        />
      </td>
      <td className="w-32 px-3 py-2 align-middle">
        <StatusEditor
          value={status}
          statuses={ctx.statuses}
          onChange={(statusId) => ctx.onPatchIssue(issue.id, { statusId })}
        />
      </td>
      <td className="w-28 px-3 py-2 align-middle">
        <DateEditor
          value={issue.startDate}
          onChange={(startDate) => ctx.onPatchIssue(issue.id, { startDate })}
        />
      </td>
      <td className="w-28 px-3 py-2 align-middle">
        <DateEditor
          value={issue.dueDate}
          onChange={(dueDate) => ctx.onPatchIssue(issue.id, { dueDate })}
        />
      </td>
      <td className="w-20 px-3 py-2 align-middle text-xs text-gray-700">
        {(() => {
          // ETA is read-only for epics (their form has no/disabled estimate) and
          // for any parent whose children carry the estimate (rollup). A leaf is
          // inline-editable.
          const readOnly = issue.type === "EPIC" || isEtaRollup;
          if (!readOnly) {
            return (
              <NumberEditor
                value={issue.eta}
                onChange={(eta) => ctx.onPatchIssue(issue.id, { eta })}
                unit="h"
              />
            );
          }
          if (totalEta === 0 && ownEta === 0) return <span className="text-gray-300">—</span>;
          if (!isEtaRollup) return <span>{totalEta}h</span>;
          // Rollup: own value is stale — show the children total + struck-through own.
          return (
            <span
              title={
                ownEta > 0
                  ? `Stale own estimate: ${ownEta}h. Total from children: ${totalEta}h.`
                  : `Total from children: ${totalEta}h.`
              }
            >
              <span className="font-medium">{totalEta}h</span>
              {ownEta > 0 && <span className="ml-1 text-[10px] text-gray-400 line-through">{ownEta}h</span>}
            </span>
          );
        })()}
      </td>
      <td className="w-16 px-3 py-2 align-middle">
        <button
          type="button"
          onClick={() => ctx.onDelete(issue.id)}
          title="Delete"
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

export function TaskTableSkeletonRow({ depth = 0 }: { depth?: number }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="w-8 px-2 py-2.5"><Skeleton className="h-3 w-3" /></td>
      <td className="w-28 px-3 py-2.5"><Skeleton className="h-3 w-14" /></td>
      <td className="px-3 py-2.5" style={{ paddingLeft: 12 + depth * INDENT_PX }}>
        <Skeleton className="h-3 w-full max-w-[260px]" />
      </td>
      <td className="w-44 px-3 py-2.5"><Skeleton className="h-3 w-20" /></td>
      <td className="w-44 px-3 py-2.5">
        <span className="flex items-center gap-2"><SkeletonAvatar /><Skeleton className="h-3 w-20" /></span>
      </td>
      <td className="w-32 px-3 py-2.5"><SkeletonBadge /></td>
      <td className="w-28 px-3 py-2.5"><Skeleton className="h-3 w-16" /></td>
      <td className="w-28 px-3 py-2.5"><Skeleton className="h-3 w-16" /></td>
      <td className="w-20 px-3 py-2.5"><Skeleton className="h-3 w-8" /></td>
      <td className="w-16 px-3 py-2.5" />
    </tr>
  );
}

export function GroupHeaderRow({
  label,
  count,
  expanded,
  onToggle,
  Icon,
  iconClass,
}: {
  label: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  Icon?: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}) {
  return (
    <tr className="bg-gray-50">
      <td className="w-8 px-2 py-2 align-middle">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-200"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </td>
      <td colSpan={9} className="px-3 py-2">
        <span className="flex items-center gap-2">
          {Icon ? <Icon className={`h-4 w-4 ${iconClass ?? "text-gray-500"}`} /> : null}
          <span className="text-sm font-medium text-gray-900">{label}</span>
          {count != null && <span className="text-xs text-gray-500">({count})</span>}
        </span>
      </td>
    </tr>
  );
}

export function EmptyChildrenRow({ message, depth = 1 }: { message: string; depth?: number }) {
  return (
    <tr className="border-b border-gray-100">
      <td colSpan={10} className="px-3 py-2 text-xs text-gray-400" style={{ paddingLeft: 48 + depth * INDENT_PX }}>
        {message}
      </td>
    </tr>
  );
}
