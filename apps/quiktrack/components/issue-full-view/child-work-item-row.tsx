"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CheckSquare,
  Bug,
  BookOpen,
  ListTree,
  X,
  Check,
  ChevronsUp,
  ChevronUp,
  Equal,
  ChevronDown as ChevronDownArrow,
  ChevronsDown,
  User as UserIcon,
} from "lucide-react";
import { WorkflowStatusControl } from "@/components/workflow-status-control";
import type { Priority } from "./types";

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-600" },
  SUBTASK: { Icon: ListTree, color: "text-blue-500" },
};

const PRIORITY_META: Record<Priority, { label: string; color: string; Icon: React.ElementType }> = {
  HIGHEST: { label: "Highest", color: "text-red-600", Icon: ChevronsUp },
  HIGH: { label: "High", color: "text-red-500", Icon: ChevronUp },
  MEDIUM: { label: "Medium", color: "text-amber-500", Icon: Equal },
  LOW: { label: "Low", color: "text-blue-500", Icon: ChevronDownArrow },
  LOWEST: { label: "Lowest", color: "text-blue-400", Icon: ChevronsDown },
};

export interface Member {
  userId: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
}

export interface ChildIssue {
  id: string;
  key: string;
  title: string;
  type: string;
  priority?: Priority | null;
  storyPoints?: number | null;
  assigneeId?: string | null;
  statusId?: string | null;
  status?: { id: string; name: string; category: string } | null;
}

function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}
function userInitials(u: Member["user"]) {
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  return ((f[0] ?? "") + (l[0] ?? "")).toUpperCase() || (u.email[0] ?? "?").toUpperCase();
}
function memberName(u: Member["user"]) {
  if (!u) return "";
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
}

/**
 * Portaled popover anchored under a trigger button. Rendered to <body> with
 * fixed positioning so the grid's horizontal-scroll container can't clip it.
 * Closes on outside click, Escape, or any scroll outside itself.
 */
function Popover({
  anchor,
  onClose,
  width,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  width: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    // Keep the panel on-screen: clamp its right edge to the viewport.
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left) });
  }, [anchor, width]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, width, zIndex: 100 }}
      className="bg-white border border-gray-200 rounded-md shadow-lg py-1 max-h-60 overflow-y-auto"
    >
      {children}
    </div>,
    document.body,
  );
}

// Column template — kept in sync with the grid header in child-work-items.tsx.
// Full-width columns; the grid sits in a horizontal-scroll container so the
// narrow issue drawer can scroll to every column at full width (no truncated
// names). The row popovers are portaled, so the scroll container never clips them.
export const CHILD_GRID_COLS =
  "grid-cols-[minmax(220px,2fr)_minmax(110px,1fr)_minmax(90px,0.7fr)_minmax(150px,1.1fr)_minmax(120px,1fr)_28px]";

/**
 * One row in the epic's "Child work items" grid. Columns mirror Jira:
 * Work / Priority / Story points / Assignee / Status, plus a hover ✕ that
 * detaches the child from the epic (clears its `epicId`, doesn't delete it).
 * Priority/assignee are inline-editable portaled popovers; status uses the
 * workflow control. All mutations bubble up via `onPatch`.
 */
export function ChildWorkItemRow({
  child: c,
  projectId,
  members,
  statuses,
  onPatch,
  onStatus,
  onDetach,
}: {
  child: ChildIssue;
  projectId: string;
  members: Member[];
  statuses: { id: string; name: string; category: string }[];
  onPatch: (data: Record<string, unknown>) => void | Promise<void>;
  onStatus: (statusId: string) => void | Promise<void>;
  onDetach: () => void | Promise<void>;
}) {
  const [priorityAnchor, setPriorityAnchor] = useState<HTMLElement | null>(null);
  const [assigneeAnchor, setAssigneeAnchor] = useState<HTMLElement | null>(null);

  const T = TYPE_ICON[c.type] ?? TYPE_ICON.TASK!;
  const P = c.priority ? (PRIORITY_META[c.priority] ?? null) : null;
  const member = members.find((m) => m.userId === c.assigneeId);

  return (
    <div
      className={`group grid ${CHILD_GRID_COLS} border-b border-gray-100 last:border-b-0 text-sm hover:bg-gray-50/60`}
    >
      <Link
        href={`/browse/${c.key}`}
        className="flex items-center gap-1.5 px-3 py-2 min-w-0"
      >
        <T.Icon className={`h-3.5 w-3.5 shrink-0 ${T.color}`} />
        <span className="font-medium text-blue-600 hover:underline shrink-0">{c.key}</span>
        <span className="text-gray-800 truncate" title={c.title}>
          {c.title}
        </span>
      </Link>

      {/* Priority */}
      <div className="px-3 py-2 min-w-0">
        <button
          type="button"
          onClick={(e) => setPriorityAnchor(priorityAnchor ? null : e.currentTarget)}
          className="inline-flex max-w-full items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100"
        >
          {P ? (
            <>
              <P.Icon className={`h-3.5 w-3.5 shrink-0 ${P.color}`} />
              <span className="text-gray-700 truncate">{P.label}</span>
            </>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </button>
        {priorityAnchor && (
          <Popover anchor={priorityAnchor} width={128} onClose={() => setPriorityAnchor(null)}>
            {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
              const m = PRIORITY_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    void onPatch({ priority: p });
                    setPriorityAnchor(null);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                    p === c.priority ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                >
                  <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                  {m.label}
                  {p === c.priority && <Check className="h-3 w-3 ml-auto" />}
                </button>
              );
            })}
          </Popover>
        )}
      </div>

      {/* Story points */}
      <div className="px-3 py-2 flex items-center min-w-0">
        <span className={`truncate ${c.storyPoints != null ? "text-gray-700" : "text-gray-400"}`}>
          {c.storyPoints != null ? c.storyPoints : "None"}
        </span>
      </div>

      {/* Assignee */}
      <div className="px-3 py-2 min-w-0">
        <button
          type="button"
          onClick={(e) => setAssigneeAnchor(assigneeAnchor ? null : e.currentTarget)}
          className="inline-flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-gray-100 max-w-full"
        >
          {member?.user ? (
            <>
              <span
                className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ background: avatarColor(member.userId) }}
              >
                {userInitials(member.user)}
              </span>
              <span className="text-gray-700 truncate">{memberName(member.user)}</span>
            </>
          ) : (
            <>
              <UserIcon className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="text-gray-400">Unassigned</span>
            </>
          )}
        </button>
        {assigneeAnchor && (
          <Popover anchor={assigneeAnchor} width={208} onClose={() => setAssigneeAnchor(null)}>
            <button
              type="button"
              onClick={() => {
                void onPatch({ assigneeId: null });
                setAssigneeAnchor(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
            >
              <span className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center">
                <UserIcon className="h-3 w-3 text-gray-500" />
              </span>
              Unassigned
            </button>
            {members
              .filter((m) => m.user)
              .map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    void onPatch({ assigneeId: m.userId });
                    setAssigneeAnchor(null);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                    m.userId === c.assigneeId ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                    style={{ background: avatarColor(m.userId) }}
                  >
                    {userInitials(m.user)}
                  </span>
                  <span className="truncate">{memberName(m.user)}</span>
                </button>
              ))}
          </Popover>
        )}
      </div>

      {/* Status */}
      <div className="px-3 py-2 min-w-0">
        <WorkflowStatusControl
          issueId={c.id}
          projectId={projectId}
          currentStatusId={c.statusId ?? c.status?.id ?? ""}
          currentStatusName={c.status?.name ?? "TO DO"}
          currentStatusCategory={c.status?.category}
          statuses={statuses}
          onChange={(statusId) => onStatus(statusId)}
          size="sm"
        />
      </div>

      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onDetach}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 text-gray-500"
          aria-label="Remove from epic"
          title="Remove from epic"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
