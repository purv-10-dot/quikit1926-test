"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  ChevronDown,
  CalendarDays,
  User as UserIcon,
  CornerDownLeft,
  Info,
  X,
  CheckCircle2,
} from "lucide-react";

type CreatableType = "TASK" | "BUG" | "STORY" | "EPIC";

const TYPE_META: Record<CreatableType, { Icon: React.ElementType; color: string; label: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500", label: "Task" },
  BUG: { Icon: Bug, color: "text-red-500", label: "Bug" },
  STORY: { Icon: BookOpen, color: "text-green-500", label: "Story" },
  EPIC: { Icon: Zap, color: "text-purple-500", label: "Epic" },
};

export interface ColumnInlineCreateMember {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

function memberInitials(m: ColumnInlineCreateMember): string {
  const u = m.user;
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || "?";
  return (u.email?.charAt(0) ?? "?").toUpperCase();
}

function memberColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

interface CreatedIssueInfo {
  id: string;
  key: string;
}

/**
 * Inline "+ Create" affordance pinned to the bottom of a board column.
 *
 * Behaviour:
 *  - Hidden until the column is hovered (parent column adds `group` class).
 *  - Click reveals a Title input + type / date / assignee picker row.
 *  - On submit, posts to `/api/issues` with the column's status pre-selected
 *    but **no `sprintId`** — new tasks go to the backlog so the user can
 *    triage where they belong.
 *  - Because the task isn't in the active sprint, it won't appear on the
 *    board. We surface a Confluence/Jira-style notification with options to
 *    View it or move it into one of the open sprints (PATCH /api/issues/[id]).
 *  - Always fires `quiktrack:issue-created` so any backlog/board view that
 *    listens can refresh.
 */
export function ColumnInlineCreate({
  projectId,
  statusId,
  members,
  availableSprints,
  onOpenIssue,
}: {
  projectId: string;
  statusId: string;
  members: ColumnInlineCreateMember[];
  availableSprints: { id: string; name: string }[];
  onOpenIssue?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CreatableType>("TASK");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedIssueInfo | null>(null);
  const [moving, setMoving] = useState(false);

  const [typeOpen, setTypeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Outside-click closes the popovers (and the whole creator if title is empty
  // and no popover is open — matches the affordance's "click anywhere to
  // dismiss" expectation).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (typeOpen && typeRef.current && !typeRef.current.contains(t)) setTypeOpen(false);
      if (dateOpen && dateRef.current && !dateRef.current.contains(t)) setDateOpen(false);
      if (assigneeOpen && assigneeRef.current && !assigneeRef.current.contains(t))
        setAssigneeOpen(false);
      if (
        open &&
        containerRef.current &&
        !containerRef.current.contains(t) &&
        !title.trim()
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, typeOpen, dateOpen, assigneeOpen, title]);

  async function submit() {
    const t = title.trim();
    if (!t) {
      setOpen(false);
      return;
    }
    setSubmitting(true);
    try {
      // No sprintId on create — new tasks land in the backlog. The user
      // adds them to a sprint via the post-create notification below.
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: t,
          type,
          statusId,
          assigneeId: assigneeId ?? undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      }).then((r) => r.json());
      if (res?.success) {
        const id = res.data?.id;
        const key = res.data?.key;
        window.dispatchEvent(
          new CustomEvent("quiktrack:issue-created", { detail: { id, key } }),
        );
        setCreated({ id, key });
        setTitle("");
        setDueDate("");
        setAssigneeId(null);
        setOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function moveToSprint(targetSprintId: string) {
    if (!created || moving) return;
    setMoving(true);
    try {
      const res = await fetch(`/api/issues/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: targetSprintId }),
      }).then((r) => r.json());
      if (res?.success) {
        window.dispatchEvent(new CustomEvent("quiktrack:issue-updated"));
        setCreated(null);
      }
    } finally {
      setMoving(false);
    }
  }


  if (!open) {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
          Create
        </button>
        {created && (
          <CreatedNotification
            issueKey={created.key}
            sprints={availableSprints}
            moving={moving}
            onView={() => onOpenIssue?.(created.id)}
            onMoveTo={moveToSprint}
            onClose={() => setCreated(null)}
          />
        )}
      </div>
    );
  }

  const meta = TYPE_META[type];
  const selectedMember = assigneeId ? members.find((m) => m.userId === assigneeId) : null;

  return (
    <div
      ref={containerRef}
      className="mt-1 bg-white border border-blue-500 rounded-md shadow-sm p-2"
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
        disabled={submitting}
        placeholder="What needs to be done?"
        className="w-full text-xs text-gray-900 placeholder:text-gray-400 outline-none disabled:opacity-50 mb-2"
      />
      <div className="flex items-center gap-1">
        {/* Type picker */}
        <div className="relative" ref={typeRef}>
          <button
            type="button"
            onClick={() => setTypeOpen((v) => !v)}
            className="h-7 inline-flex items-center gap-0.5 px-1.5 rounded border border-gray-200 hover:bg-gray-50"
            aria-label="Change type"
          >
            <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {typeOpen && (
            <div className="absolute left-0 bottom-full mb-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
              {(Object.keys(TYPE_META) as CreatableType[]).map((k) => {
                const m = TYPE_META[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setType(k);
                      setTypeOpen(false);
                      inputRef.current?.focus();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Due date */}
        <div className="relative" ref={dateRef}>
          <button
            type="button"
            onClick={() => setDateOpen((v) => !v)}
            className={`h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 hover:bg-gray-50 ${
              dueDate ? "text-blue-600" : "text-gray-500"
            }`}
            aria-label="Set due date"
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
          {dateOpen && (
            <div className="absolute left-0 bottom-full mb-1 w-[240px] bg-white border border-gray-200 rounded-md shadow-lg z-30 p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Due date</div>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => {
                    setDueDate("");
                    setDateOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Assignee */}
        <div className="relative" ref={assigneeRef}>
          <button
            type="button"
            onClick={() => setAssigneeOpen((v) => !v)}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 hover:bg-gray-50 text-gray-500"
            aria-label="Assignee"
          >
            {selectedMember ? (
              <span
                className="h-5 w-5 rounded-full text-white text-[9px] font-semibold flex items-center justify-center"
                style={{ background: memberColor(selectedMember.userId) }}
              >
                {memberInitials(selectedMember)}
              </span>
            ) : (
              <UserIcon className="h-3.5 w-3.5" />
            )}
          </button>
          {assigneeOpen && (
            <div className="absolute left-0 bottom-full mb-1 w-[220px] bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setAssigneeId(null);
                  setAssigneeOpen(false);
                  inputRef.current?.focus();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
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
                      setAssigneeId(m.userId);
                      setAssigneeOpen(false);
                      inputRef.current?.focus();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <span
                      className="h-5 w-5 rounded-full text-white text-[9px] font-semibold flex items-center justify-center shrink-0"
                      style={{ background: memberColor(m.userId) }}
                    >
                      {memberInitials(m)}
                    </span>
                    <span className="truncate">
                      {m.user?.firstName || m.user?.email}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Submit */}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !title.trim()}
          className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Create"
          title="Create (Enter)"
        >
          <CornerDownLeft className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Post-create notification — explains the new task is in the backlog (not on
 * the board) and offers one-click "Add to <sprint>" actions for each open
 * sprint, plus a "View" link that opens the issue.
 */
function CreatedNotification({
  issueKey,
  sprints,
  moving,
  onView,
  onMoveTo,
  onClose,
}: {
  issueKey: string;
  sprints: { id: string; name: string }[];
  moving: boolean;
  onView: () => void;
  onMoveTo: (sprintId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 bg-white border border-gray-200 rounded-md shadow-md p-3 text-xs">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
          <Info className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-gray-900">
              Changes are saved, but work item isn&apos;t visible
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-gray-600 leading-snug">
            For work item{" "}
            <span className="font-medium text-gray-800">{issueKey}</span> to be
            visible, it must match your space and filters, and have a status
            that&apos;s assigned to the board.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={onView}
              className="text-blue-600 hover:underline"
            >
              View
            </button>
            {sprints.length > 0 && <span className="text-gray-300">·</span>}
            {sprints.map((sp, i) => (
              <span key={sp.id} className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onMoveTo(sp.id)}
                  disabled={moving}
                  className="text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  Add to {sp.name}
                </button>
                {i < sprints.length - 1 && <span className="text-gray-300">·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
