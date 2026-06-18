"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { showToast } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMembersChanged } from "@/lib/hooks/useMembersChanged";
import { useBacklogViewSettings } from "@/lib/hooks/useBacklogViewSettings";
import { EpicPanel } from "./epic-panel";
import {
  ViewSettingsPopover,
  DEFAULT_VIEW_SETTINGS,
  type BacklogViewSettings,
} from "./view-settings-popover";
import {
  FilterSelect,
  type FilterSelectOption,
} from "../../grouped-kanban/_components/toolbar/filter-select";
import { FilterMultiSelect } from "../../grouped-kanban/_components/toolbar/filter-multi-select";
import { PopoverPanel } from "../../grouped-kanban/_components/cells/popover-panel";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  CalendarDays,
  User as UserIcon,
  SlidersHorizontal,
  BarChart3,
  Bug,
  CheckSquare,
  BookOpen,
  Zap,
  ListTree,
  Pencil,
  Check,
  X,
  GitBranch,
  AlertCircle,
  AlertTriangle,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";

type IssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";

interface Status {
  id: string;
  name: string;
  category: "TODO" | "IN_PROGRESS" | "DONE" | "BACKLOG";
}

interface Issue {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  statusId: string;
  status?: Status;
  assigneeId: string | null;
  storyPoints: number | null;
  sprintId: string | null;
  epicId: string | null;
  dueDate: string | null;
  subtaskCount?: number;
}

interface EpicLite {
  id: string;
  key: string;
  title: string;
}

interface Member {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatar?: string | null;
  } | null;
}

interface Sprint {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  counts?: { todo: number; inProgress: number; done: number };
}

const SPRINT_PAGE = 5;
const ISSUE_PAGE = 20;

const TYPE_META: Record<IssueType, { Icon: React.ElementType; color: string; label: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500", label: "Task" },
  BUG: { Icon: Bug, color: "text-red-500", label: "Bug" },
  STORY: { Icon: BookOpen, color: "text-green-500", label: "Story" },
  EPIC: { Icon: Zap, color: "text-purple-500", label: "Epic" },
  SUBTASK: { Icon: ListTree, color: "text-gray-500", label: "Subtask" },
};

function StatusBadge({ status }: { status?: Status }) {
  if (!status) return null;
  const cls =
    status.category === "DONE"
      ? "bg-green-100 text-green-700"
      : status.category === "IN_PROGRESS"
        ? "bg-blue-100 text-blue-700"
        : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide ${cls}`}>
      {status.name}
    </span>
  );
}

function CountBadges({ counts }: { counts?: Sprint["counts"] }) {
  // No counts → render nothing. The status breakdown is only meaningful for the
  // unfiltered sprint set; callers pass `undefined` when a filter is active (the
  // header already shows the filtered total) or when no breakdown exists.
  if (!counts) return null;
  const c = counts;
  return (
    <div className="flex items-center gap-1">
      <span className="h-5 min-w-[22px] inline-flex items-center justify-center px-1.5 text-[11px] rounded bg-gray-200 text-gray-700 font-medium">
        {c.todo}
      </span>
      <span className="h-5 min-w-[22px] inline-flex items-center justify-center px-1.5 text-[11px] rounded bg-blue-100 text-blue-700 font-medium">
        {c.inProgress}
      </span>
      <span className="h-5 min-w-[22px] inline-flex items-center justify-center px-1.5 text-[11px] rounded bg-green-100 text-green-700 font-medium">
        {c.done}
      </span>
    </div>
  );
}

function memberInitials(m: Member): string {
  const u = m.user;
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "?";
  return (u.email[0] ?? "?").toUpperCase();
}
function memberName(m: Member): string {
  const u = m.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}
function memberColor(seed: string): string {
  const colors = ["#2563eb", "#16a34a", "#dc2626", "#ea580c", "#9333ea", "#0891b2"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return colors[h % colors.length]!;
}

function formatSprintDateRange(start: string | null, end: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `${fmt(start)} – ?`;
  if (end) return `? – ${fmt(end)}`;
  return "Add dates";
}

function InlineCreator(props: {
  projectId: string;
  defaultStatusId?: string;
  sprintId: string | null;
  members: Member[];
  currentUserId: string | null;
  onCreated: () => void;
}) {
  const perms = useMyProjectPermissions(props.projectId);
  // Hide the composer entirely for users without create permission. Server
  // would 403 the POST anyway, but the input bar is misleading UX.
  if (!perms.loading && !perms.has("Issue", "create")) return null;
  return <InlineCreatorInner {...props} />;
}

function InlineCreatorInner({
  projectId,
  defaultStatusId,
  sprintId,
  members,
  currentUserId,
  onCreated,
}: {
  projectId: string;
  defaultStatusId?: string;
  sprintId: string | null;
  members: Member[];
  currentUserId: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IssueType>("TASK");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (typeMenuOpen && typeMenuRef.current && !typeMenuRef.current.contains(t))
        setTypeMenuOpen(false);
      if (datePopoverOpen && dateRef.current && !dateRef.current.contains(t))
        setDatePopoverOpen(false);
      if (assigneePopoverOpen && assigneeRef.current && !assigneeRef.current.contains(t))
        setAssigneePopoverOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [typeMenuOpen, datePopoverOpen, assigneePopoverOpen]);

  async function submit() {
    const t = title.trim();
    if (!t) {
      setOpen(false);
      return;
    }
    if (t.length > 255) {
      setError(`Summary must be 255 characters or less (currently ${t.length}).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: t,
          type,
          statusId: defaultStatusId,
          sprintId: sprintId ?? undefined,
          assigneeId: assigneeId ?? undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      }).then((r) => r.json());
      // Surface the API error and keep the composer open so the user can fix
      // their input (e.g. a summary over the 255-char limit) instead of having
      // the row silently reset.
      if (!res?.success) {
        setError(res?.error || "Failed to create work item");
        return;
      }
      window.dispatchEvent(
        new CustomEvent("quiktrack:issue-created", {
          detail: { id: res.data?.id, key: res.data?.key },
        }),
      );
      setTitle("");
      setDueDate("");
      setAssigneeId(null);
      setError(null);
      setOpen(false);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 hover:text-gray-900"
      >
        <Plus className="h-3.5 w-3.5" />
        Create
      </button>
    );
  }

  const meta = TYPE_META[type];
  const selectedMember = assigneeId ? members.find((m) => m.userId === assigneeId) : null;

  return (
    <div className="mx-3 my-2">
    <div className={`flex items-center h-9 px-1.5 border rounded-md bg-white ${error ? "border-red-500" : "border-blue-500"}`}>
      <div className="relative" ref={typeMenuRef}>
        <button
          type="button"
          onClick={() => setTypeMenuOpen((v) => !v)}
          className="h-7 w-12 inline-flex items-center justify-center gap-0.5 rounded hover:bg-gray-100"
          aria-label="Change type"
        >
          <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
          <ChevronDown className="h-3 w-3 text-gray-500" />
        </button>
        {typeMenuOpen && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
            {(["BUG", "STORY", "TASK"] as IssueType[]).map((k) => {
              const m = TYPE_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setType(k);
                    setTypeMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setTitle("");
            setError(null);
            setOpen(false);
          }
        }}
        disabled={submitting}
        placeholder="Describe what needs to be done."
        className="flex-1 ml-2 text-xs text-gray-900 placeholder:text-gray-400 outline-none disabled:opacity-50"
      />
      <div className="relative" ref={dateRef}>
        <button
          type="button"
          onClick={() => setDatePopoverOpen((v) => !v)}
          className={`p-1 rounded hover:bg-gray-100 ${dueDate ? "text-blue-600" : "text-gray-500"}`}
          aria-label="Set date"
        >
          <CalendarDays className="h-3.5 w-3.5" />
        </button>
        {datePopoverOpen && (
          <div className="absolute right-0 top-full mt-1 w-[260px] bg-white border border-gray-200 rounded-md shadow-lg z-30 p-3">
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
                onClick={() => setDueDate("")}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
      <div className="relative" ref={assigneeRef}>
        <button
          type="button"
          onClick={() => setAssigneePopoverOpen((v) => !v)}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
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
        {assigneePopoverOpen && (
          <div className="absolute right-0 top-full mt-1 w-[260px] bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1 max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setAssigneeId(null);
                setAssigneePopoverOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
            >
              <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                <UserIcon className="h-3 w-3 text-gray-500" />
              </span>
              Unassigned
            </button>
            {members.map((m) => {
              const isMe = m.userId === currentUserId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    setAssigneeId(m.userId);
                    setAssigneePopoverOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left"
                >
                  <span
                    className="h-6 w-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center shrink-0"
                    style={{ background: memberColor(m.userId) }}
                  >
                    {memberInitials(m)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900">{memberName(m)}</span>
                    {isMe && <span className="text-gray-500"> (Assign to me)</span>}
                    {m.user?.email && (
                      <div className="text-[11px] text-gray-500 truncate">{m.user.email}</div>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim() || submitting}
        className="ml-1 inline-flex items-center gap-1 h-7 px-3 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded disabled:opacity-50"
      >
        Create
        <span className="text-[10px] text-gray-500">↵</span>
      </button>
    </div>
      {error && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function SprintMenu({
  onEdit,
  onDelete,
  onMoveUp,
  onMoveTop,
  onClose,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveTop: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1"
    >
      <button
        type="button"
        onClick={onMoveTop}
        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
      >
        Move sprint to top
      </button>
      <button
        type="button"
        onClick={onMoveUp}
        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
      >
        Move sprint up
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
      >
        Edit sprint
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50"
      >
        Delete sprint
      </button>
    </div>
  );
}

function EditSprintModal({
  sprint,
  onClose,
  onUpdated,
}: {
  sprint: Sprint;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(sprint.name);
  const [duration, setDuration] = useState<string>("custom");
  const [startDate, setStartDate] = useState(
    sprint.startDate ? sprint.startDate.slice(0, 10) : "",
  );
  const [startTime, setStartTime] = useState(
    sprint.startDate ? sprint.startDate.slice(11, 16) : "",
  );
  const [endDate, setEndDate] = useState(
    sprint.endDate ? sprint.endDate.slice(0, 10) : "",
  );
  const [endTime, setEndTime] = useState(
    sprint.endDate ? sprint.endDate.slice(11, 16) : "",
  );
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function combine(date: string, time: string) {
    if (!date) return undefined;
    const t = time && /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : "09:00:00";
    return new Date(`${date}T${t}`).toISOString();
  }

  async function submit() {
    if (!name.trim()) {
      setError("Sprint name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          goal: goal || undefined,
          startDate: combine(startDate, startTime),
          endDate: combine(endDate, endTime),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to update sprint");
        return;
      }
      onUpdated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Edit sprint: {sprint.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M4 12l8-8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-gray-500">
            Required fields are marked with an asterisk{" "}
            <span className="text-red-500">*</span>
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Sprint name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="custom">custom</option>
              <option value="1week">1 week</option>
              <option value="2weeks">2 weeks</option>
              <option value="3weeks">3 weeks</option>
              <option value="4weeks">4 weeks</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Start date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-28 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              End date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-28 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Sprint goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {submitting ? "Updating…" : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StartSprintModal({
  sprint,
  itemCount,
  onClose,
  onStarted,
}: {
  sprint: Sprint;
  itemCount: number;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [name, setName] = useState(sprint.name);
  const [duration, setDuration] = useState("2weeks");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const hh = String(today.getHours()).padStart(2, "0");
  const mi = String(today.getMinutes()).padStart(2, "0");
  const [startDate, setStartDate] = useState(`${yyyy}-${mm}-${dd}`);
  const [startTime, setStartTime] = useState(`${hh}:${mi}`);
  const computeEnd = (sd: string, st: string, dur: string) => {
    if (!sd) return { d: "", t: st };
    const [y, m, d] = sd.split("-").map(Number);
    const base = new Date(y!, (m ?? 1) - 1, d);
    const days = dur === "1week" ? 7 : dur === "3weeks" ? 21 : dur === "4weeks" ? 28 : 14;
    base.setDate(base.getDate() + days);
    const ey = base.getFullYear();
    const em = String(base.getMonth() + 1).padStart(2, "0");
    const ed = String(base.getDate()).padStart(2, "0");
    return { d: `${ey}-${em}-${ed}`, t: st };
  };
  const initialEnd = computeEnd(`${yyyy}-${mm}-${dd}`, `${hh}:${mi}`, "2weeks");
  const [endDate, setEndDate] = useState(initialEnd.d);
  const [endTime, setEndTime] = useState(initialEnd.t);
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function combine(date: string, time: string) {
    if (!date) return undefined;
    const t = time && /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : "09:00:00";
    return new Date(`${date}T${t}`).toISOString();
  }

  function onDurationChange(d: string) {
    setDuration(d);
    if (d !== "custom") {
      const e = computeEnd(startDate, startTime, d);
      setEndDate(e.d);
    }
  }

  async function submit() {
    if (!name.trim()) {
      setError("Sprint name is required");
      return;
    }
    if (!startDate) {
      setError("Start date is required");
      return;
    }
    if (!endDate) {
      setError("End date is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // First update sprint metadata, then transition status to ACTIVE.
      const patchRes = await fetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          goal: goal || undefined,
          startDate: combine(startDate, startTime),
          endDate: combine(endDate, endTime),
        }),
      }).then((r) => r.json());
      if (!patchRes.success) {
        setError(patchRes.error || "Failed to update sprint");
        return;
      }
      const startRes = await fetch(`/api/sprints/${sprint.id}/start`, {
        method: "PATCH",
      }).then((r) => r.json());
      if (!startRes.success) {
        setError(startRes.error || "Failed to start sprint");
        return;
      }
      onStarted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Start Sprint</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M4 12l8-8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{itemCount}</span>{" "}
            {itemCount === 1 ? "work item" : "work items"} will be included in this sprint.
          </p>
          <p className="text-xs text-gray-500">
            Required fields are marked with an asterisk{" "}
            <span className="text-red-500">*</span>
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Sprint name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Duration <span className="text-red-500">*</span>
            </label>
            <select
              value={duration}
              onChange={(e) => onDurationChange(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="1week">1 week</option>
              <option value="2weeks">2 weeks</option>
              <option value="3weeks">3 weeks</option>
              <option value="4weeks">4 weeks</option>
              <option value="custom">custom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Start date <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (duration !== "custom") {
                    const ne = computeEnd(e.target.value, startTime, duration);
                    setEndDate(ne.d);
                  }
                }}
                className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-28 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              End date <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={duration !== "custom"}
                className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-28 h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Sprint goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {submitting ? "Starting…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompleteSprintModal({
  sprint,
  doneCount,
  openCount,
  destinations,
  onClose,
  onCompleted,
}: {
  sprint: Sprint;
  doneCount: number;
  openCount: number;
  destinations: { id: string; name: string }[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  // Default destination: first available planning sprint, else "new"
  const [moveTo, setMoveTo] = useState(destinations[0]?.id ?? "new");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sprints/${sprint.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moveOpenTo: moveTo }),
      }).then((r) => r.json());
      if (!res.success) {
        setError(res.error || "Failed to complete sprint");
        return;
      }
      onCompleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-xl overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-cyan-400 to-cyan-300 relative flex items-end justify-center">
          <div className="absolute -bottom-6 h-12 w-12 rounded-full bg-yellow-400 ring-4 ring-white flex items-center justify-center text-2xl">
            🏆
          </div>
        </div>
        <div className="px-6 pt-10 pb-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <h2 className="text-base font-semibold text-gray-900">
            Complete {sprint.name}
          </h2>
          <p className="text-sm text-gray-700">
            This sprint contains{" "}
            <span className="font-semibold">{doneCount} completed work item{doneCount === 1 ? "" : "s"}</span>{" "}
            and{" "}
            <span className="font-semibold">{openCount} open work item{openCount === 1 ? "" : "s"}</span>.
          </p>
          <ul className="text-xs text-gray-700 list-disc pl-5 space-y-1">
            <li>
              Completed work items includes everything in the last column on the board,{" "}
              <span className="text-blue-600 underline">Done</span>.
            </li>
            <li>
              Open work items includes everything from any other column on the board.
              Move these to a new sprint or the backlog.
            </li>
          </ul>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Move open work items to
            </label>
            <select
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="new">New sprint</option>
              <option value="backlog">Backlog</option>
            </select>
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {submitting ? "Completing…" : "Complete sprint"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteSprintModal({
  sprint,
  onClose,
  onDeleted,
}: {
  sprint: Sprint;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sprints/${sprint.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to delete sprint");
        return;
      }
      onDeleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl px-6 py-5">
        <div className="flex items-start gap-3">
          <span className="h-7 w-7 rounded-full bg-red-100 inline-flex items-center justify-center shrink-0 mt-0.5">
            <svg className="h-4 w-4 text-red-600" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 5v3m0 3h.01M2 13h12L8 2 2 13z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">Delete sprint</h2>
            <p className="mt-2 text-sm text-gray-700">
              Are you sure you want to delete sprint{" "}
              <span className="font-semibold">{sprint.name}</span>?
            </p>
            {error && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-9 px-4 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  statuses,
  epics,
  members,
  currentUserId,
  fields = DEFAULT_VIEW_SETTINGS.fields,
  density = DEFAULT_VIEW_SETTINGS.density,
  onDragStart,
  onPatched,
  onOpen,
  onDeleted,
  isSelected,
  onToggleSelect,
  canDelete,
}: {
  issue: Issue;
  statuses: Status[];
  epics: EpicLite[];
  members: Member[];
  currentUserId: string | null;
  fields?: BacklogViewSettings["fields"];
  density?: BacklogViewSettings["density"];
  onDragStart?: (e: React.DragEvent, issueId: string) => void;
  onPatched: (patch: Partial<Issue>) => void;
  onOpen: (issueId: string) => void;
  onDeleted: () => void;
  isSelected: boolean;
  onToggleSelect: (next: boolean) => void;
  canDelete: boolean;
}) {
  const meta = TYPE_META[issue.type];
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(issue.title);
  // Tooltip shown only when the title is actually clipped (scrollWidth >
  // clientWidth). Recomputed on each hover so it tracks resize/zoom.
  const [showTitleTip, setShowTitleTip] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [epicOpen, setEpicOpen] = useState(false);
  const [epicSearch, setEpicSearch] = useState("");
  const epicRef = useRef<HTMLDivElement>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const assigneeRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [childCount, setChildCount] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function openConfirm() {
    setMenuOpen(false);
    setConfirmOpen(true);
    setChildCount(null);
    // Look up how many subtasks the user is about to take down with this row
    // so the confirm dialog can warn them concretely. The detail endpoint
    // already returns a subtasks array, no extra projectId needed.
    try {
      const res = await fetch(`/api/issues/${issue.id}`).then((r) => r.json());
      if (res?.success && Array.isArray(res.data?.subtasks)) {
        setChildCount(res.data.subtasks.length);
      } else {
        setChildCount(0);
      }
    } catch {
      setChildCount(0);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}`, { method: "DELETE" }).then((r) => r.json());
      if (res?.success) {
        setConfirmOpen(false);
        setMenuOpen(false);
        onDeleted();
      } else {
        showToast(res?.error || "Failed to delete", "error");
      }
    } finally {
      setDeleting(false);
    }
  }
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [statusOpen]);

  useEffect(() => {
    if (!epicOpen) return;
    function onClick(e: MouseEvent) {
      if (epicRef.current && !epicRef.current.contains(e.target as Node)) setEpicOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setEpicOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [epicOpen]);

  // Click-outside + Escape are handled by PopoverPanel (which also portals the
  // menu to document.body so it can't be clipped by the scroll container).

  async function patch(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (res?.success) onPatched(body as Partial<Issue>);
    } catch {
      // ignore — next refresh reconciles
    }
  }

  function commitTitle() {
    const v = titleDraft.trim();
    setTitleEditing(false);
    if (!v || v === issue.title) {
      setTitleDraft(issue.title);
      return;
    }
    void patch({ title: v });
  }

  function statusPillCls(cat: Status["category"] | undefined) {
    if (cat === "DONE") return "bg-green-100 text-green-800";
    if (cat === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
    return "bg-gray-200 text-gray-700";
  }

  const isDone = issue.status?.category === "DONE";
  return (
    <div
      draggable={!titleEditing}
      onDragStart={(e) => onDragStart?.(e, issue.id)}
      className={`group flex items-center gap-3 px-4 ${density === "compact" ? "py-1" : "py-2"} border-b border-gray-100 ${
        isSelected ? "bg-blue-50" : "hover:bg-gray-50"
      } ${titleEditing ? "bg-blue-50/40" : "cursor-grab active:cursor-grabbing"}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onToggleSelect(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300 shrink-0 text-blue-600 focus:ring-blue-400"
        aria-label={`Select ${issue.key}`}
      />
      {fields.workType && <meta.Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />}
      {fields.key && (
        <button
          type="button"
          onClick={() => onOpen(issue.id)}
          className={`text-xs font-medium hover:text-blue-600 hover:underline shrink-0 min-w-[56px] text-left ${
            isDone ? "text-gray-400 line-through" : "text-gray-500"
          }`}
        >
          {issue.key}
        </button>
      )}

      {/* Title */}
      {titleEditing ? (
        <div className="flex-1 flex items-center gap-1">
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleDraft(issue.title);
                setTitleEditing(false);
              }
            }}
            className="flex-1 h-7 px-2 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={commitTitle}
            className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
            aria-label="Save"
          >
            <Check className="h-3.5 w-3.5 text-gray-700" />
          </button>
          <button
            type="button"
            onClick={() => {
              setTitleDraft(issue.title);
              setTitleEditing(false);
            }}
            className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5 text-gray-700" />
          </button>
        </div>
      ) : (
        <div
          className="relative flex-1 flex items-center gap-1.5 min-w-0"
          onMouseEnter={() => {
            const el = titleRef.current;
            setShowTitleTip(!!el && el.scrollWidth > el.clientWidth);
          }}
          onMouseLeave={() => setShowTitleTip(false)}
          onClick={() => {
            setTitleDraft(issue.title);
            setTitleEditing(true);
          }}
        >
          <span ref={titleRef} className={`text-sm truncate cursor-text ${isDone ? "text-gray-400 line-through" : "text-gray-900"}`}>{issue.title}</span>
          <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
          {/* Tooltip — only when the title is truncated; full title, dark style. */}
          {showTitleTip && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-50 mt-1 max-w-md whitespace-normal break-words rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-normal normal-case text-white shadow-lg"
            >
              {issue.title}
            </span>
          )}
        </div>
      )}

      {/* Subtask count chip — visible whenever the issue has children. */}
      {(issue.subtaskCount ?? 0) > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 shrink-0"
          title={`${issue.subtaskCount} subtask${issue.subtaskCount === 1 ? "" : "s"}`}
        >
          <GitBranch className="h-2.5 w-2.5" />
          {issue.subtaskCount}
        </span>
      )}

      {/* Epic linker — clickable chip when an epic is linked, "+ Epic" pill
          (faint at rest, full on row hover) when none is. Subtasks and epics
          themselves don't get the linker — subtasks belong to a parent task,
          epics can't link to themselves. */}
      {fields.epic && issue.type !== "EPIC" && issue.type !== "SUBTASK" && (
        <div className="relative shrink-0" ref={epicRef}>
          {(() => {
            const ep = issue.epicId ? (epics ?? []).find((e) => e.id === issue.epicId) : null;
            return ep ? (
              <button
                type="button"
                onClick={() => setEpicOpen((v) => !v)}
                className="inline-flex items-center max-w-[160px] h-5 px-2 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700 hover:bg-red-200"
                title={`Linked to ${ep.key} — ${ep.title}`}
              >
                <Zap className="h-3 w-3 mr-1 flex-shrink-0" />
                <span className="truncate">{ep.title}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEpicOpen((v) => !v)}
                className="inline-flex items-center gap-0.5 h-5 px-2 rounded border border-dashed border-gray-300 bg-white text-[10px] font-medium text-gray-500 opacity-40 transition-opacity hover:border-purple-400 hover:text-purple-600 hover:opacity-100 group-hover:opacity-100"
              >
                <Plus className="h-3 w-3" />
                Epic
              </button>
            );
          })()}
          {epicOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded border border-gray-200 bg-white shadow-lg">
              <input
                autoFocus
                type="text"
                placeholder="Search epics…"
                value={epicSearch}
                onChange={(e) => setEpicSearch(e.target.value)}
                className="w-full rounded-t border-b border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
              />
              <div className="max-h-56 overflow-y-auto py-1">
                {issue.epicId && (
                  <button
                    type="button"
                    onClick={() => { setEpicOpen(false); setEpicSearch(""); void patch({ epicId: null }); }}
                    className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-red-600 hover:bg-red-50"
                  >
                    <X className="h-3 w-3" /> Remove from epic
                  </button>
                )}
                {(() => {
                  const q = epicSearch.trim().toLowerCase();
                  const list = (epics ?? []).filter((e) => e.id !== issue.id);
                  const filtered = q
                    ? list.filter((e) => e.key.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
                    : list;
                  if (filtered.length === 0) {
                    return <p className="px-2 py-2 text-xs text-gray-400">{q ? "No matches" : "No epics in this project"}</p>;
                  }
                  return filtered.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => { setEpicOpen(false); setEpicSearch(""); void patch({ epicId: e.id }); }}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-gray-50"
                    >
                      <Zap className="h-3 w-3 flex-shrink-0 text-purple-500" />
                      <span className="font-mono text-[10px] text-gray-500">{e.key}</span>
                      <span className="truncate text-gray-700">{e.title}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status pill (clickable popover) */}
      {fields.status && (
      <div className="relative shrink-0" ref={statusRef}>
        <button
          type="button"
          onClick={() => setStatusOpen((v) => !v)}
          className={`inline-flex items-center gap-1 h-5 px-2 text-[10px] font-semibold uppercase tracking-wide rounded ${statusPillCls(
            issue.status?.category,
          )}`}
        >
          {issue.status?.name ?? "—"}
          <ChevronDown className="h-3 w-3" />
        </button>
        {statusOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[180px] bg-white border border-gray-200 rounded shadow-lg z-30 py-1">
            {statuses
              .filter((s) => s.id !== issue.statusId)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setStatusOpen(false);
                    void patch({ statusId: s.id });
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-50"
                >
                  <span
                    className={`inline-flex h-5 px-2 items-center text-[10px] font-semibold uppercase tracking-wide rounded ${statusPillCls(
                      s.category,
                    )}`}
                  >
                    {s.name}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
      )}

      {/* Overdue badge — shows the due date with a warning when it's past. */}
      {(() => {
        if (!issue.dueDate) return null;
        const due = new Date(issue.dueDate);
        if (Number.isNaN(due.getTime())) return null;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (due >= today) return null;
        const label = due.toLocaleDateString(undefined, { day: "numeric", month: "short" });
        return (
          <span className="inline-flex items-center h-5 px-1.5 rounded border border-red-200 bg-red-50 text-red-600 text-[10px] font-medium shrink-0">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {label}
          </span>
        );
      })()}

      {fields.assignee && (() => {
        const assigneeMember = issue.assigneeId
          ? members.find((m) => m.user?.id === issue.assigneeId) ?? null
          : null;
        const u = assigneeMember?.user ?? null;
        const name = u
          ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email
          : "Unassigned";
        const q = assigneeSearch.trim().toLowerCase();
        const filtered = q
          ? members.filter(
              (m) =>
                memberName(m).toLowerCase().includes(q) ||
                (m.user?.email ?? "").toLowerCase().includes(q),
            )
          : members;
        return (
          <>
            <button
              ref={assigneeRef}
              type="button"
              onClick={() => {
                setAssigneeSearch("");
                setAssigneeOpen((v) => !v);
              }}
              className="shrink-0 rounded-full hover:ring-2 hover:ring-gray-200"
              aria-label="Assignee"
              title={name}
            >
              {u ? (
                u.avatar ? (
                  <img src={u.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span
                    className="h-6 w-6 rounded-full text-white text-[10px] font-semibold inline-flex items-center justify-center"
                    style={{ background: memberColor(u.id) }}
                  >
                    {(u.firstName?.[0] ?? u.email[0] ?? "?").toUpperCase() +
                      (u.lastName?.[0] ?? "").toUpperCase()}
                  </span>
                )
              ) : (
                <span className="h-6 w-6 rounded-full bg-gray-100 border border-dashed border-gray-300 inline-flex items-center justify-center text-gray-400">
                  <UserIcon className="h-3 w-3" />
                </span>
              )}
            </button>
            <PopoverPanel
              anchorRef={assigneeRef}
              open={assigneeOpen}
              onClose={() => setAssigneeOpen(false)}
              align="right"
              width={260}
              placement="auto"
              estimatedHeight={300}
            >
              <div className="px-2 pb-1.5 pt-1">
                <input
                  autoFocus
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder="Search members"
                  className="w-full h-7 px-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (issue.assigneeId) void patch({ assigneeId: null });
                    setAssigneeOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left"
                >
                  <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <UserIcon className="h-3 w-3 text-gray-500" />
                  </span>
                  Unassigned
                </button>
                {filtered.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-gray-400">No members found</div>
                )}
                {filtered.map((m) => {
                  const isMe = m.userId === currentUserId;
                  const active = m.userId === issue.assigneeId;
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => {
                        if (!active) void patch({ assigneeId: m.userId });
                        setAssigneeOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left ${
                        active ? "bg-blue-50" : ""
                      }`}
                    >
                      <span
                        className="h-6 w-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center shrink-0"
                        style={{ background: memberColor(m.userId) }}
                      >
                        {memberInitials(m)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900">{memberName(m)}</span>
                        {isMe && <span className="text-gray-500"> (Assign to me)</span>}
                        {m.user?.email && (
                          <div className="text-[11px] text-gray-500 truncate">{m.user.email}</div>
                        )}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </PopoverPanel>
          </>
        );
      })()}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`p-1 rounded text-gray-500 ${menuOpen ? "bg-gray-200" : "hover:bg-gray-200"}`}
          aria-label="More"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpen(issue.id);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
            >
              Open
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={openConfirm}
                className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
          onClick={() => !deleting && setConfirmOpen(false)}
        >
          <div
            className="w-[420px] max-w-[95vw] bg-white rounded-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Delete work item?</h3>
              <p className="text-sm text-gray-600">
                Are you sure you want to delete{" "}
                <span className="font-medium text-gray-800">
                  {issue.key} — {issue.title}
                </span>
                ? This action cannot be undone.
              </p>
              {childCount !== null && childCount > 0 && (
                <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This work item has{" "}
                    <span className="font-semibold">
                      {childCount} subtask{childCount === 1 ? "" : "s"}
                    </span>
                    . They will be deleted along with it.
                  </span>
                </div>
              )}
              {childCount === null && (
                <div className="mt-3 h-8 rounded bg-gray-100 animate-pulse" />
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="h-9 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="h-9 px-5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:bg-gray-300"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FilterSelectOption[];
}) {
  return (
    <div className="mb-2 block text-xs">
      <span className="mb-1 block font-medium text-gray-600">{label}</span>
      <FilterSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Any"
        expand
        width={248}
      />
    </div>
  );
}

function SectionHeader({
  collapsed,
  onToggle,
  title,
  rightLabel,
  afterTitle,
  counts,
  trailing,
  allChecked = false,
  someChecked = false,
  onToggleAll,
}: {
  collapsed: boolean;
  onToggle: () => void;
  title: React.ReactNode;
  rightLabel?: string;
  afterTitle?: React.ReactNode;
  counts?: Sprint["counts"];
  trailing?: React.ReactNode;
  allChecked?: boolean;
  someChecked?: boolean;
  onToggleAll?: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-t-md">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
          onChange={(e) => onToggleAll?.(e.target.checked)}
          disabled={!onToggleAll}
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
          aria-label="Select all rows in this section"
        />
        <button
          type="button"
          onClick={onToggle}
          className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {rightLabel && <div className="text-xs text-gray-500">{rightLabel}</div>}
        {afterTitle}
      </div>
      <div className="flex items-center gap-2">
        <CountBadges counts={counts} />
        {trailing}
      </div>
    </div>
  );
}

interface SectionState {
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  issues: Issue[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}

function emptySection(): SectionState {
  return {
    expanded: false,
    loaded: false,
    loading: false,
    issues: [],
    cursor: null,
    hasMore: true,
    total: 0,
  };
}

/**
 * IntersectionObserver-based "load more" sentinel. Fires `onIntersect` when the
 * sentinel scrolls into view. Used both at the bottom of each expanded section
 * (more issues) and at the bottom of the page (more sprints).
 *
 * `options.root` scopes the observer to a nested scroll container (each
 * accordion is its own `overflow-y-auto` box) instead of the viewport; pass a
 * ref to that container. `options.enabled` is REQUIRED whenever the sentinel is
 * rendered conditionally: the observe effect re-runs when `enabled` flips, so
 * the observer attaches on the render where the sentinel first enters the DOM.
 * Without it the effect runs once at mount (sentinel absent → `ref.current`
 * null → bail) and never re-attaches, so load-more silently never fires.
 */
function useOnScreen(
  ref: React.RefObject<HTMLElement>,
  onIntersect: () => void,
  options?: { root?: React.RefObject<HTMLElement | null>; enabled?: boolean },
) {
  // Pin the latest callback in a ref so the observer effect can be dep-free.
  // Without this, every parent render gives `onIntersect` a new identity →
  // the effect tears down + re-creates the observer → if the sentinel is
  // still on screen it fires immediately, re-appending the same page (and
  // duplicating sprint rows on every click). The ref keeps the latest
  // callback reachable while the observer itself is created exactly once.
  const cbRef = useRef(onIntersect);
  useEffect(() => {
    cbRef.current = onIntersect;
  }, [onIntersect]);
  const enabled = options?.enabled ?? true;
  const rootRef = options?.root;
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) cbRef.current();
      },
      { root: rootRef?.current ?? null, rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, rootRef, enabled]);
}

function SectionBody({
  projectId,
  sprintId,
  state,
  setState,
  statusesById,
  members,
  epics,
  currentUserId,
  defaultStatusId,
  onCreated,
  onDragStart,
  onDropIssue,
  onOpenIssue,
  selectedIds,
  onToggleSelect,
  filters,
  fields,
  density,
}: {
  projectId: string;
  sprintId: string | null;
  state: SectionState;
  setState: (updater: (s: SectionState) => SectionState) => void;
  statusesById: Map<string, Status>;
  members: Member[];
  epics: EpicLite[];
  currentUserId: string | null;
  defaultStatusId?: string;
  onCreated: () => void;
  onDragStart?: (e: React.DragEvent, issueId: string) => void;
  onDropIssue?: (issueId: string) => void;
  onOpenIssue: (issueId: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, next: boolean) => void;
  filters: {
    search: string;
    statusId: string;
    assigneeId: string;
    type: string;
    priority: string;
    epicId: string;
  };
  fields: BacklogViewSettings["fields"];
  density: BacklogViewSettings["density"];
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Scroll container for this expanded section — the accordion has its own
  // bounded-height scrollbar, so the load-more observer must watch this box
  // (not the viewport) to fire as the user scrolls inside the accordion.
  const scrollRef = useRef<HTMLDivElement>(null);
  // Delete is permission-gated — hide the row's Delete action for users whose
  // role doesn't grant Issue:delete (the API enforces it too). Cached hook, so
  // this shares the single /api/me/... fetch with the other consumers.
  const perms = useMyProjectPermissions(projectId);
  const canDelete = perms.loading || perms.has("Issue", "delete");

  const loadMore = useCallback(
    async (initial = false) => {
      if (state.loading) return;
      if (!initial && !state.hasMore) return;
      setState((s) => ({ ...s, loading: true }));
      const params = new URLSearchParams({
        projectId,
        sprintId: sprintId ?? "null",
        excludeType: "EPIC,SUBTASK",
        limit: String(ISSUE_PAGE),
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.statusId) params.set("statusId", filters.statusId);
      if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters.type) params.set("type", filters.type);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.epicId) params.set("epicId", filters.epicId);
      if (!initial && state.cursor) params.set("cursor", state.cursor);
      try {
        const res = await fetch(`/api/issues?${params.toString()}`).then((r) => r.json());
        if (!res?.success) {
          setState((s) => ({ ...s, loading: false, loaded: true }));
          return;
        }
        // Defensive: never let an Epic/Subtask leak into the section cache,
        // even if the API somehow returns one (cache, race, stale type, etc.).
        const fresh: Issue[] = (res.data ?? []).filter(
          (x: Issue) => x.type !== "EPIC" && x.type !== "SUBTASK",
        );
        setState((s) => ({
          ...s,
          loading: false,
          loaded: true,
          issues: initial ? fresh : [...s.issues, ...fresh],
          cursor: res.nextCursor,
          hasMore: !!res.nextCursor,
          total: res.total ?? s.total,
        }));
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }
    },
    [projectId, sprintId, state.cursor, state.hasMore, state.loading, setState, filters.search, filters.statusId, filters.assigneeId, filters.type, filters.priority, filters.epicId],
  );

  // First-time load when expanded.
  useEffect(() => {
    if (state.expanded && !state.loaded && !state.loading) {
      loadMore(true);
    }
  }, [state.expanded, state.loaded, state.loading, loadMore]);

  // Reset and re-fetch the section's first page whenever any filter changes.
  // We deliberately don't depend on loadMore (would re-run on cursor change too).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.expanded) return;
    setState((s) => ({ ...s, loaded: false, loading: false, issues: [], cursor: null, hasMore: true }));
  }, [filters.search, filters.statusId, filters.assigneeId, filters.type, filters.priority, filters.epicId]);

  // IntersectionObserver — load more when the sentinel scrolls into view of the
  // accordion's own scroll container. `enabled` re-attaches the observer on the
  // render where the sentinel first mounts (after the first page loads); without
  // it the observer would bind at mount when the sentinel doesn't exist yet.
  useOnScreen(
    sentinelRef,
    () => {
      if (state.expanded && state.loaded && state.hasMore && !state.loading) {
        loadMore(false);
      }
    },
    { root: scrollRef, enabled: state.expanded && state.loaded && state.hasMore },
  );

  if (!state.expanded) return null;

  return (
    <div
      className="bg-white"
      onDragOver={(e) => {
        if (onDropIssue) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!onDropIssue) return;
        e.preventDefault();
        const id = e.dataTransfer.getData("text/issue-id");
        if (id) onDropIssue(id);
      }}
    >
      {/* Scrollable rows. The InlineCreator below is intentionally OUTSIDE this
          box so "+ Create" stays pinned at the bottom of the accordion while the
          issue list scrolls. */}
      <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto">
      {state.loaded === false && state.loading && (
        <div className="px-3 py-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-7 rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}
      {state.issues.length === 0 && state.loaded && !state.loading && (
        <div className="text-center text-xs text-gray-500 py-6">
          {sprintId === null ? "Your backlog is empty." : "No items in this sprint."}
        </div>
      )}
      {state.issues.map((i) => (
        <IssueRow
          key={i.id}
          issue={{ ...i, status: statusesById.get(i.statusId) }}
          statuses={Array.from(statusesById.values())}
          epics={epics}
          members={members}
          currentUserId={currentUserId}
          fields={fields}
          density={density}
          onDragStart={onDragStart}
          onOpen={onOpenIssue}
          canDelete={canDelete}
          isSelected={selectedIds.has(i.id)}
          onToggleSelect={(next) => onToggleSelect(i.id, next)}
          onPatched={(patch) => {
            setState((s) => {
              const merged = s.issues.map((x) => (x.id === i.id ? { ...x, ...patch } : x));
              // If the patch turned this row into something the backlog/sprint
              // sections shouldn't show (Epic/Subtask), drop it locally so it
              // doesn't linger until the next full refresh.
              const filtered = merged.filter((x) => x.type !== "EPIC" && x.type !== "SUBTASK");
              const dropped = merged.length - filtered.length;
              return {
                ...s,
                issues: filtered,
                total: Math.max(0, s.total - dropped),
              };
            });
          }}
          onDeleted={() => {
            setState((s) => ({
              ...s,
              issues: s.issues.filter((x) => x.id !== i.id),
              total: Math.max(0, s.total - 1),
            }));
          }}
        />
      ))}
      {state.hasMore && state.loaded && (
        <div ref={sentinelRef} className="py-2 text-center text-[11px] text-gray-400">
          {state.loading ? "Loading more…" : ""}
        </div>
      )}
      </div>
      <div className="border-t border-gray-100">
        <InlineCreator
          projectId={projectId}
          defaultStatusId={defaultStatusId}
          sprintId={sprintId}
          members={members}
          currentUserId={currentUserId}
          onCreated={onCreated}
        />
      </div>
    </div>
  );
}

export function BacklogView({ projectId }: { projectId: string }) {
  const perms = useMyProjectPermissions(projectId);
  const canCreateSprint = perms.loading || perms.has("Sprint", "create");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // Project statuses + members are cached/shared via React Query under the same
  // keys the issue views use, so navigating between backlog and a work item
  // doesn't refetch them (and the dev StrictMode double-fetch collapses to one).
  const { data: statuses = [] } = useApiData<Status[]>(
    ["quiktrack", "project-statuses", projectId],
    `/api/projects/${projectId}/statuses`,
  );
  const { data: members = [] } = useApiData<Member[]>(
    ["quiktrack", "project-members", projectId],
    `/api/projects/${projectId}/members`,
    {
      select: (d) => {
        const payload = d as { members?: Member[] } | Member[] | null;
        return Array.isArray(payload) ? payload : payload?.members ?? [];
      },
    },
  );
  const [epics, setEpics] = useState<EpicLite[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintCursor, setSprintCursor] = useState<string | null>(null);
  const [sprintsHasMore, setSprintsHasMore] = useState(true);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>({
    backlog: { ...emptySection(), expanded: true },
  });
  const [menuOpenForSprint, setMenuOpenForSprint] = useState<string | null>(null);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<Sprint | null>(null);
  const [startingSprint, setStartingSprint] = useState<Sprint | null>(null);
  const [completingSprint, setCompletingSprint] = useState<Sprint | null>(null);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Backend-driven filters applied to every section. `searchInput` is the raw
  // text typed in the toolbar; `appliedSearch` is the debounced value sent to
  // the API so we don't fire a request per keystroke.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterStatusId, setFilterStatusId] = useState("");
  // Multi-select assignee filter. Empty = Any. The special value "null" means
  // Unassigned and may be combined with real assignee ids. Serialized to a
  // comma-separated `assigneeId` query param the issues API expands to an IN/OR.
  const [filterAssigneeIds, setFilterAssigneeIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  // Epic filter — set by selecting an epic in the left EpicPanel. Empty = none.
  const [filterEpicId, setFilterEpicId] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // Filtered total per section, keyed identically to `sectionStates`. Only
  // populated when at least one filter is active; otherwise the header falls
  // back to the unfiltered sprint counts from /api/sprints.
  const [filteredCounts, setFilteredCounts] = useState<Record<string, number>>({});
  // Filtered To Do / In Progress / Done breakdown per section, so the header
  // count badges stay accurate (and visible) while a filter is active.
  const [filteredBadges, setFilteredBadges] = useState<
    Record<string, { todo: number; inProgress: number; done: number }>
  >({});
  const filterBtnRef = useRef<HTMLDivElement>(null);
  const moveBtnRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const sprintSentinelRef = useRef<HTMLDivElement>(null);

  // ── Backlog view settings (Epic panel / Empty sprints / Density / Fields) ──
  // Persisted per-user, per-org, per-project in the DB (qtUserViewPref.settings)
  // so they survive logout/login and sync across devices. A localStorage cache
  // inside the hook seeds the first paint to avoid a flash of defaults.
  const { settings, updateSettings } = useBacklogViewSettings(projectId);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const viewSettingsRef = useRef<HTMLDivElement>(null);

  const reloadEpics = useCallback(() => {
    fetch(`/api/issues?projectId=${projectId}&type=EPIC&limit=200`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.success) {
          setEpics((res.data ?? []).map((e: EpicLite) => ({ id: e.id, key: e.key, title: e.title })));
        }
      })
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (!viewSettingsOpen) return;
    function onDown(e: MouseEvent) {
      if (viewSettingsRef.current && !viewSettingsRef.current.contains(e.target as Node)) {
        setViewSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [viewSettingsOpen]);

  const onDragStart = useCallback((e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData("text/issue-id", issueId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  // Stable filters object passed down to every SectionBody — re-allocates only
  // when one of the underlying values actually changes.
  const sectionFilters = useMemo(
    () => ({
      search: appliedSearch,
      statusId: filterStatusId,
      // Joined here so SectionBody keeps its simple `assigneeId: string` shape;
      // the API splits it back into an IN/OR clause.
      assigneeId: filterAssigneeIds.join(","),
      type: filterType,
      priority: filterPriority,
      epicId: filterEpicId,
    }),
    [appliedSearch, filterStatusId, filterAssigneeIds, filterType, filterPriority, filterEpicId],
  );

  // Any filter active? The per-sprint status breakdown (CountBadges) reflects the
  // UNfiltered sprint, so it must be hidden while filtering — otherwise it
  // contradicts the filtered "(N work items)" header count.
  const filtersActive = Boolean(
    appliedSearch || filterStatusId || filterAssigneeIds.length || filterType || filterPriority || filterEpicId,
  );

  // Header-checkbox state for a section: returns the all/some flags + a toggle
  // that adds (or removes) every issue in the section's currently-loaded page
  // to/from the global selection set.
  function sectionSelectionState(issues: Issue[]) {
    const ids = issues.map((i) => i.id);
    if (ids.length === 0) return { all: false, some: false, toggle: undefined };
    let selected = 0;
    for (const id of ids) if (selectedIds.has(id)) selected++;
    const all = selected === ids.length;
    const some = selected > 0 && selected < ids.length;
    const toggle = (next: boolean) => {
      setSelectedIds((prev) => {
        const s = new Set(prev);
        if (next) for (const id of ids) s.add(id);
        else for (const id of ids) s.delete(id);
        return s;
      });
    };
    return { all, some, toggle };
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch((prev) => (prev === search.trim() ? prev : search.trim()));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // When any filter is active, fetch a server-side count per section (sprints
  // + backlog) so collapsed section headers reflect the filtered total. Uses
  // limit=1 to keep the payload tiny — only the `total` field matters here.
  useEffect(() => {
    const hasActive =
      Boolean(appliedSearch || filterStatusId || filterAssigneeIds.length || filterType || filterPriority || filterEpicId);
    if (!hasActive) {
      setFilteredCounts({});
      setFilteredBadges({});
      return;
    }
    let cancelled = false;
    const sections: { key: string; sprintId: string | null }[] = [
      ...sprints.filter((sp) => sp.status !== "COMPLETED").map((s) => ({ key: `sprint:${s.id}`, sprintId: s.id })),
      { key: "backlog", sprintId: null },
    ];
    Promise.all(
      sections.map(({ key, sprintId }) => {
        const params = new URLSearchParams({
          projectId,
          sprintId: sprintId ?? "null",
          excludeType: "EPIC,SUBTASK",
          limit: "1",
          statusCounts: "1", // also returns the filtered To Do/In Progress/Done split
        });
        if (appliedSearch) params.set("search", appliedSearch);
        if (filterStatusId) params.set("statusId", filterStatusId);
        if (filterAssigneeIds.length) params.set("assigneeId", filterAssigneeIds.join(","));
        if (filterType) params.set("type", filterType);
        if (filterPriority) params.set("priority", filterPriority);
        if (filterEpicId) params.set("epicId", filterEpicId);
        return fetch(`/api/issues?${params.toString()}`)
          .then((r) => r.json())
          .then((res) => ({
            key,
            total: typeof res?.total === "number" ? res.total : 0,
            counts: res?.statusCounts as { todo: number; inProgress: number; done: number } | undefined,
          }))
          .catch(() => ({ key, total: 0, counts: undefined }));
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      const badges: Record<string, { todo: number; inProgress: number; done: number }> = {};
      for (const r of rows) {
        next[r.key] = r.total;
        if (r.counts) badges[r.key] = r.counts;
      }
      setFilteredCounts(next);
      setFilteredBadges(badges);
    });
    return () => { cancelled = true; };
  }, [projectId, sprints, appliedSearch, filterStatusId, filterAssigneeIds, filterType, filterPriority, filterEpicId]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMoreMenuOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      // FilterSelect (via PopoverPanel) portals its option menu to document.body.
      // That click is outside `filterBtnRef` but must not close this popover, or
      // the option unmounts before its onChange runs and the filter never applies.
      if (t.closest?.("[data-portal-popover]")) return;
      if (filterBtnRef.current && !filterBtnRef.current.contains(t)) setFilterOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFilterOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  useEffect(() => {
    if (!moveOpen) return;
    function onDown(e: MouseEvent) {
      if (moveBtnRef.current && !moveBtnRef.current.contains(e.target as Node)) setMoveOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMoveOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moveOpen]);

  const onDropIntoSection = useCallback(
    async (issueId: string, destSprintId: string | null) => {
      // Optimistically move the issue between local section caches.
      let movedIssue: Issue | null = null;
      let sourceKey: string | null = null;
      let sourceSprintId: string | null = null;
      setSectionStates((all) => {
        const next: Record<string, SectionState> = { ...all };
        for (const [k, s] of Object.entries(all)) {
          const idx = s.issues.findIndex((i) => i.id === issueId);
          if (idx >= 0) {
            movedIssue = s.issues[idx]!;
            sourceKey = k;
            sourceSprintId = movedIssue.sprintId;
            const issues = [...s.issues];
            issues.splice(idx, 1);
            next[k] = { ...s, issues, total: Math.max(0, s.total - 1) };
            break;
          }
        }
        if (movedIssue) {
          const destKey = destSprintId === null ? "backlog" : `sprint:${destSprintId}`;
          if (sourceKey === destKey) return all; // no-op
          const dest = all[destKey] ?? emptySection();
          next[destKey] = {
            ...dest,
            issues: [{ ...movedIssue, sprintId: destSprintId }, ...dest.issues],
            total: dest.total + 1,
          };
        }
        return next;
      });

      // Adjust per-sprint count badges locally so headers reflect the move
      // immediately without an extra round-trip.
      if (movedIssue) {
        const issue = movedIssue as Issue;
        const cat: "todo" | "inProgress" | "done" = ((): "todo" | "inProgress" | "done" => {
          const s = statuses.find((st) => st.id === issue.statusId);
          if (s?.category === "DONE") return "done";
          if (s?.category === "IN_PROGRESS") return "inProgress";
          // TODO, BACKLOG, and any unrecognized category bucket into todo
          // (matches backend aggregation in /api/sprints).
          return "todo";
        })();
        setSprints((arr) =>
          arr.map((sp) => {
            if (sp.id === sourceSprintId) {
              const c = sp.counts ?? { todo: 0, inProgress: 0, done: 0 };
              return { ...sp, counts: { ...c, [cat]: Math.max(0, c[cat] - 1) } };
            }
            if (sp.id === destSprintId) {
              const c = sp.counts ?? { todo: 0, inProgress: 0, done: 0 };
              return { ...sp, counts: { ...c, [cat]: c[cat] + 1 } };
            }
            return sp;
          }),
        );
      }

      try {
        await fetch(`/api/issues/${issueId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sprintId: destSprintId }),
        });
      } catch {
        // ignore — the next refresh will reconcile
      }
    },
    [statuses],
  );

  const updateSection = useCallback(
    (key: string, updater: (s: SectionState) => SectionState) => {
      setSectionStates((all) => ({ ...all, [key]: updater(all[key] ?? emptySection()) }));
    },
    [],
  );

  // Listen for issues created via the global header "Create" modal.
  useEffect(() => {
    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ projectId: string; sprintId: string | null }>).detail;
      if (!detail || detail.projectId !== projectId) return;
      const key = detail.sprintId ? `sprint:${detail.sprintId}` : "backlog";
      void refreshSection(key, detail.sprintId);
    }
    function onUpdated(e: Event) {
      const detail = (e as CustomEvent<{ projectId: string; issueId?: string }>).detail;
      if (!detail || detail.projectId !== projectId) return;
      // Drop the patched row from every section's local cache immediately so
      // a SUBTASK/EPIC type-change doesn't flash in the list while the refresh
      // is in flight. The fetch below restores anything that legitimately
      // belongs.
      if (detail.issueId) {
        setSectionStates((all) => {
          const next: Record<string, SectionState> = {};
          for (const [k, s] of Object.entries(all)) {
            const before = s.issues.length;
            const issues = s.issues.filter((x) => x.id !== detail.issueId);
            next[k] = { ...s, issues, total: Math.max(0, s.total - (before - issues.length)) };
          }
          return next;
        });
      }
      for (const [k, s] of Object.entries(sectionStates)) {
        if (!s.loaded) continue;
        const sId = k === "backlog" ? null : k.replace("sprint:", "");
        void refreshSection(k, sId);
      }
    }
    function onOpenIssue(e: Event) {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setEditingIssueId(id);
    }
    window.addEventListener("quiktrack:issue-created", onCreated);
    window.addEventListener("quiktrack:issue-updated", onUpdated);
    window.addEventListener("quiktrack:open-issue", onOpenIssue);
    return () => {
      window.removeEventListener("quiktrack:issue-created", onCreated);
      window.removeEventListener("quiktrack:issue-updated", onUpdated);
      window.removeEventListener("quiktrack:open-issue", onOpenIssue);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sectionStates]);

  // Boot — fetch session + first page of sprints + epics. (Statuses and
  // members are loaded via React Query above, so they're not in this batch.)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [sessionRes, sprintsRes, epicsRes] = await Promise.all([
        fetch(`/api/session`).then((r) => r.json()).catch(() => null),
        fetch(`/api/sprints?projectId=${projectId}&limit=${SPRINT_PAGE}`).then((r) => r.json()),
        fetch(`/api/issues?projectId=${projectId}&type=EPIC&limit=200`).then((r) => r.json()),
      ]);
      if (!alive) return;
      if (sessionRes?.user?.id) setCurrentUserId(sessionRes.user.id);
      if (sprintsRes?.success) {
        setSprints(sprintsRes.data ?? []);
        setSprintCursor(sprintsRes.nextCursor ?? null);
        setSprintsHasMore(!!sprintsRes.nextCursor);
      }
      if (epicsRes?.success) {
        setEpics((epicsRes.data ?? []).map((e: EpicLite) => ({ id: e.id, key: e.key, title: e.title })));
      }
      setBootLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Refetch members when membership changes via the Add-people modal —
  // invalidate the shared query so every view picks up the new list.
  useMembersChanged(projectId, () => {
    void queryClient.invalidateQueries({
      queryKey: ["quiktrack", "project-members", projectId],
    });
  });

  const loadMoreSprints = useCallback(async () => {
    if (sprintsLoading || !sprintsHasMore) return;
    setSprintsLoading(true);
    try {
      const params = new URLSearchParams({
        projectId,
        limit: String(SPRINT_PAGE),
      });
      if (sprintCursor) params.set("cursor", sprintCursor);
      const res = await fetch(`/api/sprints?${params.toString()}`).then((r) => r.json());
      if (res?.success) {
        setSprints((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const incoming = (res.data ?? []).filter((s: Sprint) => !seen.has(s.id));
          return incoming.length ? [...prev, ...incoming] : prev;
        });
        setSprintCursor(res.nextCursor ?? null);
        setSprintsHasMore(!!res.nextCursor);
      }
    } finally {
      setSprintsLoading(false);
    }
  }, [projectId, sprintCursor, sprintsHasMore, sprintsLoading]);

  useOnScreen(sprintSentinelRef, () => {
    if (!bootLoading) loadMoreSprints();
  });

  const statusesById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s] as const)),
    [statuses],
  );

  const defaultTodoStatusId = useMemo(
    () => statuses.find((s) => s.category === "TODO")?.id ?? statuses[0]?.id,
    [statuses],
  );

  // Re-fetches every currently-expanded section. Called after bulk operations
  // since a delete or move can shift the contents of multiple sections at once.
  async function refreshAllSections() {
    const entries = Object.entries(sectionStates);
    await Promise.all(
      entries.map(([key]) => {
        const sprintId = key === "backlog" ? null : key.replace(/^sprint:/, "");
        return refreshSection(key, key === "backlog" ? null : sprintId);
      }),
    );
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || bulkBusy) return;
    const n = selectedIds.size;
    const ok = await confirmDialog({
      title: "Delete work items",
      message: `Delete ${n} work item${n === 1 ? "" : "s"}? This is reversible from trash.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/issues/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ids: Array.from(selectedIds) }),
      }).then((r) => r.json() as Promise<{ success: boolean; error?: string }>);
      if (!res.success) {
        showToast(res.error ?? "Delete failed", "error");
        return;
      }
      setSelectedIds(new Set());
      await refreshAllSections();
    } finally {
      setBulkBusy(false);
    }
  }

  // Move all currently-selected issues into the given sprint (or null = backlog).
  // PATCHes in parallel — bulk endpoint isn't worth the extra surface for now.
  async function handleBulkMoveToSprint(targetSprintId: string | null) {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    setMoveOpen(false);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/issues/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sprintId: targetSprintId }),
          })
            .then((r) => r.json() as Promise<{ success: boolean }>)
            .catch(() => ({ success: false as const })),
        ),
      );
      const failed = results.filter((r) => !r.success).length;
      if (failed > 0) showToast(`${failed} item${failed === 1 ? "" : "s"} failed to move.`, "error");
      setSelectedIds(new Set());
      await refreshAllSections();
    } finally {
      setBulkBusy(false);
    }
  }

  async function refreshSection(key: string, sprintId: string | null) {
    // Wipe and re-fetch first page for the section.
    setSectionStates((all) => ({
      ...all,
      [key]: { ...emptySection(), expanded: true },
    }));
    const params = new URLSearchParams({
      projectId,
      sprintId: sprintId ?? "null",
      excludeType: "EPIC",
      limit: String(ISSUE_PAGE),
    });
    const [res] = await Promise.all([
      fetch(`/api/issues?${params.toString()}`).then((r) => r.json()),
      refreshSprintCounts(),
    ]);
    if (res?.success) {
      // Defensive: drop any Epic/Subtask the API may still surface so they
      // never appear in the backlog/sprint sections.
      const fresh: Issue[] = (res.data ?? []).filter(
        (x: Issue) => x.type !== "EPIC" && x.type !== "SUBTASK",
      );
      setSectionStates((all) => ({
        ...all,
        [key]: {
          expanded: true,
          loaded: true,
          loading: false,
          issues: fresh,
          cursor: res.nextCursor ?? null,
          hasMore: !!res.nextCursor,
          total: res.total ?? 0,
        },
      }));
    }
  }

  async function refreshSprintCounts() {
    const params = new URLSearchParams({
      projectId,
      limit: String(Math.max(SPRINT_PAGE, sprints.length)),
    });
    const res = await fetch(`/api/sprints?${params.toString()}`).then((r) => r.json());
    if (res?.success) {
      const map = new Map<string, Sprint["counts"]>(
        (res.data as Sprint[]).map((s) => [s.id, s.counts]),
      );
      setSprints((arr) =>
        arr.map((s) => ({ ...s, counts: map.get(s.id) ?? s.counts })),
      );
    }
  }

  async function createSprint() {
    const name = `Sprint ${sprints.length + 1}`;
    await fetch("/api/sprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, name }),
    });
    // Reload first page of sprints.
    setSprints([]);
    setSprintCursor(null);
    setSprintsHasMore(true);
    const res = await fetch(
      `/api/sprints?projectId=${projectId}&limit=${SPRINT_PAGE}`,
    ).then((r) => r.json());
    if (res?.success) {
      setSprints(res.data ?? []);
      setSprintCursor(res.nextCursor ?? null);
      setSprintsHasMore(!!res.nextCursor);
    }
  }

  if (bootLoading) {
    return (
      <div className="px-6 py-6">
        <div className="h-9 w-72 rounded bg-gray-200 animate-pulse mb-4" />
        <div className="h-12 rounded bg-gray-100 animate-pulse mb-2" />
        <div className="h-12 rounded bg-gray-100 animate-pulse" />
      </div>
    );
  }

  const activeSprints = sprints.filter((s) => s.status !== "COMPLETED");
  // "Empty sprints" toggle — when off, hide sprints whose work-item count is 0.
  const displayedSprints = settings.emptySprints
    ? activeSprints
    : activeSprints.filter((s) => {
        const c = s.counts;
        return (c?.todo ?? 0) + (c?.inProgress ?? 0) + (c?.done ?? 0) > 0;
      });
  const totalVisible = Object.values(sectionStates).reduce((acc, s) => acc + s.issues.length, 0);
  const totalAll = Object.values(sectionStates).reduce((acc, s) => acc + s.total, 0);

  return (
    <div className="px-6 py-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search backlog"
              className="h-8 w-[220px] pl-8 pr-3 text-xs border border-gray-300 rounded-md placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {/* Project member avatars — click to filter Assignee. The dashed
              placeholder filters to Unassigned. Selection is multi — clicking
              an already-active avatar removes it from the filter. */}
          {(() => {
            const visibleMembers = members
              .filter((m): m is Member & { user: NonNullable<Member["user"]> } => Boolean(m.user))
              .slice(0, 5);
            const overflow = Math.max(0, members.filter((m) => m.user).length - visibleMembers.length);
            const toggleAssignee = (id: string) => {
              setFilterAssigneeIds((cur) =>
                cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
              );
            };
            return (
              <div className="flex items-center -space-x-1.5">
                <button
                  type="button"
                  onClick={() => toggleAssignee("null")}
                  title="Unassigned"
                  className={`h-7 w-7 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center transition ${
                    filterAssigneeIds.includes("null")
                      ? "outline outline-2 outline-blue-500 z-10"
                      : "hover:bg-gray-200"
                  }`}
                >
                  <UserIcon className="h-3 w-3 text-gray-500" />
                </button>
                {visibleMembers.map((m) => {
                  const u = m.user;
                  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
                  const initials = (u.firstName?.[0] ?? u.email[0] ?? "?").toUpperCase()
                    + (u.lastName?.[0] ?? "").toUpperCase();
                  const active = filterAssigneeIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAssignee(u.id)}
                      title={name}
                      className={`h-7 w-7 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-semibold transition overflow-hidden ${
                        active ? "outline outline-2 outline-blue-500 z-10" : "hover:opacity-90"
                      }`}
                      style={{ background: memberColor(u.id), color: "white" }}
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials
                      )}
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <span
                    className="h-7 w-7 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center text-[10px] font-semibold text-gray-700"
                    title={`${overflow} more — use Filter for the full list`}
                  >
                    +{overflow}
                  </span>
                )}
              </div>
            );
          })()}
          {(() => {
            const activeCount =
              (filterStatusId ? 1 : 0) +
              (filterAssigneeIds.length ? 1 : 0) +
              (filterType ? 1 : 0) +
              (filterPriority ? 1 : 0);
            return (
              <div ref={filterBtnRef} className="relative">
                <button
                  type="button"
                  onClick={() => setFilterOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs border rounded-md ${
                    activeCount > 0
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                  {activeCount > 0 && (
                    <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] font-medium text-white">
                      {activeCount}
                    </span>
                  )}
                </button>
                {filterOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded border border-gray-200 bg-white p-3 shadow-lg">
                    <FilterRow
                      label="Status"
                      value={filterStatusId}
                      onChange={setFilterStatusId}
                      options={[
                        { value: "", label: "Any", muted: true },
                        ...statuses.map((s) => ({ value: s.id, label: s.name })),
                      ]}
                    />
                    <div className="mb-2 block text-xs">
                      <span className="mb-1 block font-medium text-gray-600">Assignee</span>
                      <FilterMultiSelect
                        values={filterAssigneeIds}
                        onChange={setFilterAssigneeIds}
                        placeholder="Any"
                        summaryNoun="people"
                        searchable
                        expand
                        width={248}
                        options={[
                          { value: "null", label: "Unassigned", muted: true },
                          ...members
                            .filter(
                              (m): m is Member & { user: NonNullable<Member["user"]> } =>
                                Boolean(m.user),
                            )
                            .map((m) => ({
                              value: m.user.id,
                              label:
                                [m.user.firstName, m.user.lastName]
                                  .filter(Boolean)
                                  .join(" ")
                                  .trim() || m.user.email,
                            })),
                        ]}
                      />
                    </div>
                    <FilterRow
                      label="Type"
                      value={filterType}
                      onChange={setFilterType}
                      options={[
                        { value: "", label: "Any", muted: true },
                        { value: "TASK", label: "Task" },
                        { value: "BUG", label: "Bug" },
                        { value: "STORY", label: "Story" },
                      ]}
                    />
                    <FilterRow
                      label="Priority"
                      value={filterPriority}
                      onChange={setFilterPriority}
                      options={[
                        { value: "", label: "Any", muted: true },
                        { value: "HIGHEST", label: "Highest" },
                        { value: "HIGH", label: "High" },
                        { value: "MEDIUM", label: "Medium" },
                        { value: "LOW", label: "Low" },
                        { value: "LOWEST", label: "Lowest" },
                      ]}
                    />
                    {activeCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterStatusId("");
                          setFilterAssigneeIds([]);
                          setFilterType("");
                          setFilterPriority("");
                        }}
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        <X className="h-3 w-3" /> Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {(filterStatusId || filterAssigneeIds.length || filterType || filterPriority || appliedSearch) && (
            <button
              type="button"
              onClick={() => {
                setFilterStatusId("");
                setFilterAssigneeIds([]);
                setFilterType("");
                setFilterPriority("");
                setSearch("");
              }}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={viewSettingsRef}>
            <button
              type="button"
              onClick={() => setViewSettingsOpen((v) => !v)}
              className={`p-1.5 rounded text-gray-600 ${viewSettingsOpen ? "bg-gray-100" : "hover:bg-gray-100"}`}
              aria-label="View settings"
              title="View settings"
              aria-haspopup="dialog"
              aria-expanded={viewSettingsOpen}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {viewSettingsOpen && (
              <ViewSettingsPopover
                settings={settings}
                onChange={updateSettings}
                onClose={() => setViewSettingsOpen(false)}
              />
            )}
          </div>
          <Link
            href={`/spaces/${projectId}/summary`}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
            aria-label="Insights"
            title="Insights"
          >
            <BarChart3 className="h-4 w-4" />
          </Link>
          {/* <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              className={`p-1.5 rounded text-gray-600 ${moreMenuOpen ? "bg-gray-100" : "hover:bg-gray-100"}`}
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
              title="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1"
              >
                <Link
                  role="menuitem"
                  href={`/spaces/${projectId}/settings/fields`}
                  onClick={() => setMoreMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Configure fields
                </Link>
                <Link
                  role="menuitem"
                  href={`/spaces/${projectId}/settings/types`}
                  onClick={() => setMoreMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Configure issue types
                </Link>
                <Link
                  role="menuitem"
                  href={`/spaces/${projectId}/settings/automation`}
                  onClick={() => setMoreMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Automation
                </Link>
                <Link
                  role="menuitem"
                  href={`/spaces/${projectId}/settings/notifications`}
                  onClick={() => setMoreMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Notifications
                </Link>
              </div>
            )}
          </div> */}
        </div>
      </div>

      {/* Epic panel (left) + backlog content (right). */}
      <div className="flex items-start gap-4">
        {settings.epicPanel && (
          <EpicPanel
            projectId={projectId}
            defaultStatusId={defaultTodoStatusId}
            onOpenEpic={(id) => setEditingIssueId(id)}
            onCreated={reloadEpics}
            onClose={() => {
              // Don't leave a hidden epic filter active when the panel closes.
              setFilterEpicId("");
              updateSettings({ epicPanel: false });
            }}
            selectedEpicId={filterEpicId || null}
            onSelectEpic={(id) => setFilterEpicId(id ?? "")}
          />
        )}
        <div className="min-w-0 flex-1">
      {/* Bulk action bar — shown when ≥1 issue is selected across any section. */}
      {selectedIds.size > 0 && (() => {
        // Where do the currently-selected issues already live? Used to filter
        // out destinations every selected item is already in (no-op moves).
        const selectedSprintIds = new Set<string | null>();
        for (const s of Object.values(sectionStates)) {
          for (const issue of s.issues) {
            if (selectedIds.has(issue.id)) selectedSprintIds.add(issue.sprintId);
          }
        }
        // Hide a destination only when EVERY selected item is already there
        // (i.e. selection is homogeneous and matches that destination).
        const showBacklog = !(selectedSprintIds.size === 1 && selectedSprintIds.has(null));
        // Drop completed sprints (they're not shown in the page either) and
        // any sprint where every selected item already lives.
        const visibleSprints = sprints
          .filter((sp) => sp.status !== "COMPLETED")
          .filter((sp) => !(selectedSprintIds.size === 1 && selectedSprintIds.has(sp.id)));
        return (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm">
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="rounded p-1 text-gray-600 hover:bg-white"
            title="Clear selection"
            disabled={bulkBusy}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="font-medium text-gray-900">{selectedIds.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <div ref={moveBtnRef} className="relative">
              <button
                type="button"
                onClick={() => setMoveOpen((v) => !v)}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Move to
                <ChevronDown className="h-3 w-3" />
              </button>
              {moveOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded border border-gray-200 bg-white py-1 shadow-lg">
                  {showBacklog && (
                    <button
                      type="button"
                      onClick={() => handleBulkMoveToSprint(null)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <ListTree className="h-3.5 w-3.5 text-gray-500" />
                      Backlog
                    </button>
                  )}
                  {showBacklog && visibleSprints.length > 0 && (
                    <div className="my-1 border-t border-gray-100" />
                  )}
                  <div className="max-h-60 overflow-y-auto">
                    {visibleSprints.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => handleBulkMoveToSprint(sp.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            sp.status === "ACTIVE" ? "bg-blue-500" : sp.status === "COMPLETED" ? "bg-gray-400" : "bg-gray-300"
                          }`}
                        />
                        <span className="truncate">{sp.name}</span>
                      </button>
                    ))}
                    {visibleSprints.length === 0 && !showBacklog && (
                      <p className="px-3 py-2 text-xs text-gray-400">Already in this location</p>
                    )}
                    {visibleSprints.length === 0 && showBacklog && (
                      <p className="px-3 py-2 text-xs text-gray-400">No other sprints</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {(perms.loading || perms.has("Issue", "delete")) && (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {bulkBusy ? "Working…" : "Delete"}
              </button>
            )}
          </div>
        </div>
        );
      })()}

      {/* Sprints */}
      {displayedSprints.map((sprint) => {
        const key = `sprint:${sprint.id}`;
        const state = sectionStates[key] ?? emptySection();
        const sprintCountsSum =
          (sprint.counts?.todo ?? 0) +
          (sprint.counts?.inProgress ?? 0) +
          (sprint.counts?.done ?? 0);
        const filteredKey = `sprint:${sprint.id}`;
        const headerCount = state.loaded
          ? state.total
          : filteredCounts[filteredKey] !== undefined
            ? filteredCounts[filteredKey]
            : sprintCountsSum;
        const sel = sectionSelectionState(state.issues);
        return (
          <div key={sprint.id} className="mb-3 rounded-md border border-gray-200">
            <SectionHeader
              collapsed={!state.expanded}
              onToggle={() =>
                updateSection(key, (s) =>
                  s.expanded
                    ? { ...s, expanded: false }
                    : { ...s, expanded: true },
                )
              }
              title={sprint.name}
              rightLabel={`(${headerCount} work item${headerCount === 1 ? "" : "s"})`}
              counts={filtersActive ? filteredBadges[key] : sprint.counts}
              allChecked={sel.all}
              someChecked={sel.some}
              onToggleAll={sel.toggle}
              afterTitle={
                sprint.startDate || sprint.endDate ? (
                  <button
                    type="button"
                    onClick={() => setEditingSprint(sprint)}
                    className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                    title="Edit dates"
                  >
                    {formatSprintDateRange(sprint.startDate, sprint.endDate)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingSprint(sprint)}
                    className="inline-flex items-center gap-1 h-6 px-1.5 text-xs text-gray-600 rounded hover:bg-gray-200"
                    title="Add dates"
                  >
                    <Pencil className="h-3 w-3 text-gray-500" />
                    Add dates
                  </button>
                )
              }
              trailing={
                <>
                  {sprint.status === "ACTIVE" ? (
                    <button
                      type="button"
                      onClick={() => setCompletingSprint(sprint)}
                      className="h-7 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                    >
                      Complete sprint
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={headerCount === 0}
                      onClick={() => setStartingSprint(sprint)}
                      className="h-7 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
                    >
                      Start sprint
                    </button>
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setMenuOpenForSprint(
                          menuOpenForSprint === sprint.id ? null : sprint.id,
                        )
                      }
                      className="p-1 rounded hover:bg-gray-200 text-gray-500"
                      aria-label="More"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {menuOpenForSprint === sprint.id && (
                      <SprintMenu
                        onMoveTop={() => {
                          setSprints((arr) => {
                            const idx = arr.findIndex((s) => s.id === sprint.id);
                            if (idx <= 0) return arr;
                            const next = [...arr];
                            const [it] = next.splice(idx, 1);
                            if (it) next.unshift(it);
                            return next;
                          });
                          setMenuOpenForSprint(null);
                        }}
                        onMoveUp={() => {
                          setSprints((arr) => {
                            const idx = arr.findIndex((s) => s.id === sprint.id);
                            if (idx <= 0) return arr;
                            const next = [...arr];
                            [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                            return next;
                          });
                          setMenuOpenForSprint(null);
                        }}
                        onEdit={() => {
                          setEditingSprint(sprint);
                          setMenuOpenForSprint(null);
                        }}
                        onDelete={() => {
                          setDeletingSprint(sprint);
                          setMenuOpenForSprint(null);
                        }}
                        onClose={() => setMenuOpenForSprint(null)}
                      />
                    )}
                  </div>
                </>
              }
            />
            <SectionBody
              projectId={projectId}
              sprintId={sprint.id}
              state={state}
              setState={(u) => updateSection(key, u)}
              statusesById={statusesById}
              members={members}
              epics={epics}
              currentUserId={currentUserId}
              defaultStatusId={defaultTodoStatusId}
              onCreated={() => refreshSection(key, sprint.id)}
              onDragStart={onDragStart}
              onDropIssue={(id) => onDropIntoSection(id, sprint.id)}
              onOpenIssue={setEditingIssueId}
              selectedIds={selectedIds}
              onToggleSelect={(id, next) =>
                setSelectedIds((prev) => {
                  const s = new Set(prev);
                  if (next) s.add(id); else s.delete(id);
                  return s;
                })
              }
              filters={sectionFilters}
              fields={settings.fields}
              density={settings.density}
            />
          </div>
        );
      })}

      {/* Sprint pagination sentinel */}
      {sprintsHasMore && (
        <div ref={sprintSentinelRef} className="py-2 text-center text-[11px] text-gray-400">
          {sprintsLoading ? "Loading more sprints…" : ""}
        </div>
      )}

      {/* Backlog */}
      {(() => {
        const backlogState = sectionStates.backlog ?? emptySection();
        const backlogSel = sectionSelectionState(backlogState.issues);
        return (
      <div className="rounded-md border border-gray-200">
        <SectionHeader
          collapsed={!backlogState.expanded}
          onToggle={() =>
            updateSection("backlog", (s) => ({ ...s, expanded: !s.expanded }))
          }
          title="Backlog"
          rightLabel={(() => {
            const count = backlogState.loaded
              ? backlogState.total
              : filteredCounts.backlog !== undefined
                ? filteredCounts.backlog
                : backlogState.total ?? 0;
            return `(${count} work item${count === 1 ? "" : "s"})`;
          })()}
          counts={filtersActive ? filteredBadges.backlog : undefined}
          allChecked={backlogSel.all}
          someChecked={backlogSel.some}
          onToggleAll={backlogSel.toggle}
          trailing={
            canCreateSprint ? (
              <button
                type="button"
                onClick={createSprint}
                className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Create sprint
              </button>
            ) : null
          }
        />
        <SectionBody
          projectId={projectId}
          sprintId={null}
          state={sectionStates.backlog ?? { ...emptySection(), expanded: true }}
          setState={(u) => updateSection("backlog", u)}
          statusesById={statusesById}
          members={members}
          epics={epics}
          currentUserId={currentUserId}
          defaultStatusId={defaultTodoStatusId}
          onCreated={() => refreshSection("backlog", null)}
          onDragStart={onDragStart}
          onDropIssue={(id) => onDropIntoSection(id, null)}
          onOpenIssue={setEditingIssueId}
          selectedIds={selectedIds}
          onToggleSelect={(id, next) =>
            setSelectedIds((prev) => {
              const s = new Set(prev);
              if (next) s.add(id); else s.delete(id);
              return s;
            })
          }
          filters={sectionFilters}
          fields={settings.fields}
          density={settings.density}
        />
      </div>
        );
      })()}

      {/* Footer summary */}
      <div className="mt-3 flex items-center justify-end text-xs text-gray-500">
        {totalVisible} of {totalAll} work items visible
        <span className="mx-2 text-gray-300">|</span>
        Estimate: <span className="ml-1 font-semibold text-gray-700">0</span> of{" "}
        <span className="ml-1 font-semibold text-gray-700">0</span>
      </div>
        </div>{/* /right column */}
      </div>{/* /epic-panel + content flex */}

      {editingSprint && (
        <EditSprintModal
          sprint={editingSprint}
          onClose={() => setEditingSprint(null)}
          onUpdated={async () => {
            const res = await fetch(
              `/api/sprints?projectId=${projectId}&limit=${SPRINT_PAGE}`,
            ).then((r) => r.json());
            if (res?.success) {
              setSprints(res.data ?? []);
              setSprintCursor(res.nextCursor ?? null);
              setSprintsHasMore(!!res.nextCursor);
            }
          }}
        />
      )}

      {deletingSprint && (
        <DeleteSprintModal
          sprint={deletingSprint}
          onClose={() => setDeletingSprint(null)}
          onDeleted={async () => {
            setSprints((arr) => arr.filter((s) => s.id !== deletingSprint.id));
            setSectionStates((all) => ({
              ...all,
              backlog: { ...emptySection(), expanded: true },
            }));
          }}
        />
      )}

      {startingSprint && (
        <StartSprintModal
          sprint={startingSprint}
          itemCount={
            sectionStates[`sprint:${startingSprint.id}`]?.total ??
            ((startingSprint.counts?.todo ?? 0) +
              (startingSprint.counts?.inProgress ?? 0) +
              (startingSprint.counts?.done ?? 0))
          }
          onClose={() => setStartingSprint(null)}
          onStarted={async () => {
            const res = await fetch(
              `/api/sprints?projectId=${projectId}&limit=${SPRINT_PAGE}`,
            ).then((r) => r.json());
            if (res?.success) {
              setSprints(res.data ?? []);
              setSprintCursor(res.nextCursor ?? null);
              setSprintsHasMore(!!res.nextCursor);
            }
          }}
        />
      )}

      {completingSprint && (
        <CompleteSprintModal
          sprint={completingSprint}
          doneCount={completingSprint.counts?.done ?? 0}
          openCount={
            (completingSprint.counts?.todo ?? 0) +
            (completingSprint.counts?.inProgress ?? 0)
          }
          destinations={sprints
            .filter(
              (s) =>
                s.id !== completingSprint.id &&
                s.status !== "COMPLETED" &&
                s.status !== "ACTIVE",
            )
            .map((s) => ({ id: s.id, name: s.name }))}
          onClose={() => setCompletingSprint(null)}
          onCompleted={async () => {
            // Refetch sprints + reset all section caches.
            const res = await fetch(
              `/api/sprints?projectId=${projectId}&limit=${SPRINT_PAGE}`,
            ).then((r) => r.json());
            if (res?.success) {
              setSprints(res.data ?? []);
              setSprintCursor(res.nextCursor ?? null);
              setSprintsHasMore(!!res.nextCursor);
            }
            setSectionStates({ backlog: { ...emptySection(), expanded: true } });
          }}
        />
      )}

      <EditIssueModal
        open={editingIssueId !== null}
        issueId={editingIssueId}
        projectId={projectId}
        onClose={() => setEditingIssueId(null)}
        onSaved={() => {
          // Refresh whichever section the edited issue lives in. Cheapest:
          // refresh all loaded sections so sprint/backlog moves are reflected.
          for (const [key, s] of Object.entries(sectionStates)) {
            if (!s.loaded) continue;
            const sprintId = key === "backlog" ? null : key.replace("sprint:", "");
            void refreshSection(key, sprintId);
          }
        }}
      />
    </div>
  );
}
