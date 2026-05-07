"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Plus, Trash2, X, Zap } from "lucide-react";
import { Skeleton, SkeletonAvatar, SkeletonBadge } from "@/components/skeleton";
import {
  TYPE_META,
  fmtMdy,
  userDisplayName,
  userInitials,
  type EpicLite,
  type IssueStatus,
  type SprintLite,
  type TaskIssue,
  type UserLite,
} from "./task-types";

export interface TaskRowContext {
  statuses: IssueStatus[];
  sprints: Map<string, SprintLite>;
  members: Map<string, UserLite>;
  epics: EpicLite[];
  onOpenIssue: (id: string) => void;
  onDelete: (id: string) => void;
  /** PATCH this issue with a partial diff (e.g. `{ epicId: 'abc' }`). */
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

// ── Inline epic linker ───────────────────────────────────────────────────────

function EpicLinker({
  issue,
  epics,
  onChange,
}: {
  issue: TaskIssue;
  epics: EpicLite[];
  onChange: (epicId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Filter out the issue itself (an issue can't be its own epic) and any
  // non-epic items if the array got contaminated.
  const candidates = epics.filter((e) => e.id !== issue.id);
  const filtered = search.trim()
    ? candidates.filter((e) => {
        const q = search.trim().toLowerCase();
        return e.key.toLowerCase().includes(q) || e.title.toLowerCase().includes(q);
      })
    : candidates;

  const linked = issue.epicId ? epics.find((e) => e.id === issue.epicId) ?? null : null;

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {linked ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex max-w-[160px] items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 hover:bg-purple-100"
          title={`Linked to epic ${linked.key} — ${linked.title}`}
        >
          <Zap className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">{linked.title}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 opacity-40 transition-opacity hover:border-purple-400 hover:text-purple-600 hover:opacity-100 group-hover:opacity-100"
        >
          <Plus className="h-2.5 w-2.5" />
          Epic
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded border border-gray-200 bg-white shadow-lg">
          <input
            autoFocus
            type="text"
            placeholder="Search epics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-t border-b border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {linked && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-red-600 hover:bg-red-50"
              >
                <X className="h-3 w-3" />
                Remove from epic
              </button>
            )}
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-xs text-gray-400">{search ? "No matches" : "No epics in this project"}</p>
            )}
            {filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { onChange(e.id); setOpen(false); }}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-gray-50"
              >
                <Zap className="h-3 w-3 flex-shrink-0 text-purple-500" />
                <span className="font-mono text-[10px] text-gray-500">{e.key}</span>
                <span className="truncate text-gray-700">{e.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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

function StatusPill({ status }: { status: IssueStatus | null }) {
  if (!status) return <span className="text-gray-300">—</span>;
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${status.color}20`, color: status.color }}
    >
      {status.name}
    </span>
  );
}

function AssigneeChip({ user }: { user: UserLite | null }) {
  if (!user) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-50 text-gray-400">·</span>
    );
  }
  return (
    <span className="flex items-center gap-2 min-w-0">
      {user.avatar ? (
        <img src={user.avatar} alt="" className="h-6 w-6 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-600 text-[10px] font-medium text-white">
          {userInitials(user)}
        </span>
      )}
      <span className="truncate text-xs text-gray-700">{userDisplayName(user)}</span>
    </span>
  );
}

export function TaskTableRow({ issue, depth, expanded, onToggleExpand, ctx }: RowProps) {
  const TypeIcon = TYPE_META[issue.type]?.Icon;
  const typeColor = TYPE_META[issue.type]?.color ?? "text-gray-500";
  const status = ctx.statuses.find((s) => s.id === issue.statusId) ?? null;
  const isDone = status?.category === "DONE";
  const sprint = issue.sprintId ? ctx.sprints.get(issue.sprintId) : null;
  const assignee = issue.assigneeId ? ctx.members.get(issue.assigneeId) ?? null : null;
  const canExpand = onToggleExpand !== undefined;

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
            <TypeIcon className={`h-4 w-4 flex-shrink-0 ${typeColor}`} />
          ) : null}
          {/* `min-w-0 flex-1` lets the button shrink so siblings stay in view —
              without it, the title expands to its text width and pushes badges
              off the right edge of the column. */}
          <button
            type="button"
            onClick={() => ctx.onOpenIssue(issue.id)}
            className={`min-w-0 flex-1 truncate text-left text-sm hover:underline ${isDone ? "text-gray-400 line-through" : "text-gray-900"}`}
          >
            {issue.title}
          </button>
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
        {sprint ? <span className="text-xs text-gray-700">{sprint.name}</span> : <span className="text-gray-300">—</span>}
      </td>
      <td className="w-44 px-3 py-2 align-middle"><AssigneeChip user={assignee} /></td>
      <td className="w-32 px-3 py-2 align-middle"><StatusPill status={status} /></td>
      <td className="w-28 px-3 py-2 align-middle text-xs text-gray-600">{fmtMdy(issue.startDate)}</td>
      <td className="w-28 px-3 py-2 align-middle text-xs text-gray-600">{fmtMdy(issue.dueDate)}</td>
      <td className="w-20 px-3 py-2 align-middle text-xs text-gray-700">
        {(() => {
          const ownEta = issue.eta ?? 0;
          const total = issue.rolledUpEta ?? ownEta;
          if (total === 0 && ownEta === 0) return "";
          // Parent broken down into children → rollup is the children's total;
          // the parent's own value is stale (entered before the breakdown) and
          // surfaced only as a tooltip/parenthetical so the user can spot it.
          const isRollup = total !== ownEta;
          if (!isRollup) return `${ownEta}h`;
          return (
            <span title={ownEta > 0 ? `Stale own estimate: ${ownEta}h. Total from children: ${total}h.` : `Total from children: ${total}h.`}>
              <span className="font-medium">{total}h</span>
              {ownEta > 0 && (
                <span className="ml-1 text-[10px] text-gray-400 line-through">{ownEta}h</span>
              )}
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
