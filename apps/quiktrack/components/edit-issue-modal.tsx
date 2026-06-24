"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { FieldValue } from "@/lib/customFields/registry";
import {
  X,
  ExternalLink,
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUp,
  ChevronsDown,
  ChevronDown as ChevronDownArrow,
  Equal,
  Plus,
  MoreHorizontal,
  Lock,
  Eye,
  Share2,
  ZapIcon,
  SlidersHorizontal,
  Link2,
  Search,
  CornerDownLeft,
  LayoutGrid,
  AlertTriangle,
  Trash2,
  Check,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { uploadProjectImage } from "@/lib/upload-image";
import { DeleteTaskModal } from "@/components/delete-task-modal";
import { LinkedWorkItems } from "@/components/linked-work-items";
import { IssueActivity } from "@/components/issue-activity";
import { IssueAttachments } from "@/components/issue-attachments";
import { AlertCircle } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { formatHoursAsClock } from "@/lib/utils/timesheetPeriod";

type IssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";
type Priority = "HIGHEST" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST";

interface Status {
  id: string;
  name: string;
  category: "TODO" | "IN_PROGRESS" | "DONE" | "BACKLOG";
}

interface Member {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface Sprint {
  id: string;
  name: string;
  status: string;
}

interface EpicOption {
  id: string;
  key: string;
  title: string;
}

interface IssueFull {
  id: string;
  key: string;
  title: string;
  description: string | null;
  type: IssueType;
  statusId: string;
  priority: Priority;
  assigneeId: string | null;
  sprintId: string | null;
  epicId: string | null;
  parentId: string | null;
  parent?: { id: string; key: string; title: string; type: IssueType } | null;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  eta: number | null;
  reporterId: string | null;
  createdBy?: string | null;
  projectId: string;
  createdAt?: string;
  updatedAt?: string;
  timeLogs?: { id: string; hours: number }[];
  customFields?: CustomFieldDTO[];
  customFieldValues?: Record<string, FieldValue>;
}

/**
 * Parse a Jira-style time input ("30m", "2h", "1h 30m", "1d 4h", "1w", "8") to
 * fractional hours. Returns null when the string cannot be parsed.
 *
 * Units: w=5d, d=8h, h=1h, m=1/60h. A bare number is treated as hours.
 */
function parseEtaHours(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  // Clock HH:MM / H:MM → hours + minutes ("01:30" → 1.5).
  const clock = /^(\d{1,3}):([0-5]?\d)$/.exec(s);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  // Bare number → hours.
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  // Legacy Jira-style tokens still accepted (1d, 2h 30m, 1w …).
  const re = /(\d+(?:\.\d+)?)\s*(w|d|h|m)/g;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    const n = parseFloat(m[1]!);
    switch (m[2]) {
      case "w": total += n * 40; break;
      case "d": total += n * 8; break;
      case "h": total += n; break;
      case "m": total += n / 60; break;
    }
  }
  return matched ? total : null;
}

/** Format hours into the clock-style "HH:MM" string ("" when unset). */
function formatEtaHours(h: number | null | undefined): string {
  if (h == null || h <= 0) return "";
  return formatHoursAsClock(h);
}

const TYPE_META: Record<IssueType, { Icon: React.ElementType; label: string; color: string }> = {
  TASK: { Icon: CheckSquare, label: "Task", color: "text-blue-500" },
  BUG: { Icon: Bug, label: "Bug", color: "text-red-500" },
  STORY: { Icon: BookOpen, label: "Story", color: "text-green-600" },
  EPIC: { Icon: Zap, label: "Epic", color: "text-purple-500" },
  SUBTASK: { Icon: Link2, label: "Subtask", color: "text-blue-500" },
};

function typeMeta(t: string | undefined) {
  return TYPE_META[(t as IssueType) ?? "TASK"] ?? TYPE_META.TASK;
}

// The "flat" work types the breadcrumb switcher offers. EPIC and SUBTASK are
// deliberately excluded — they carry hierarchy (epics contain children,
// subtasks need a parent), so converting to/from them from a quick menu would
// orphan children or break the tree. The switcher only appears when the issue
// is already one of these.
const WORK_TYPE_OPTIONS: IssueType[] = ["TASK", "STORY", "BUG"];

const PRIORITY_META: Record<Priority, { label: string; color: string; Icon: React.ElementType }> = {
  HIGHEST: { label: "Highest", color: "text-red-600", Icon: ChevronsUp },
  HIGH: { label: "High", color: "text-red-500", Icon: ChevronUp },
  MEDIUM: { label: "Medium", color: "text-amber-500", Icon: Equal },
  LOW: { label: "Low", color: "text-blue-500", Icon: ChevronDownArrow },
  LOWEST: { label: "Lowest", color: "text-blue-400", Icon: ChevronsDown },
};

function memberLabel(m: Member): string {
  const u = m.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}

function memberInitials(m: Member): string {
  const u = m.user;
  if (!u) return "?";
  const a = (u.firstName ?? "").trim();
  const b = (u.lastName ?? "").trim();
  return ((a[0] ?? "") + (b[0] ?? "")).toUpperCase() || (u.email[0] ?? "?").toUpperCase();
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fmtDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Roll-up helpers — when a parent has subtasks, the parent's schedule fields
 * are derived from the children:
 *   - ETA  = sum of subtask ETAs
 *   - Start date = earliest child start date
 *   - Due date   = latest child due date
 *
 * Pure functions so they're trivial to unit-test.
 */
export function rollUpEta(subtasks: { eta?: number | null }[]): number | null {
  const vals = subtasks.map((s) => s.eta).filter((v): v is number => typeof v === "number" && v > 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0);
}

export function rollUpStartDate(subtasks: { startDate?: string | null }[]): string | null {
  const dates = subtasks
    .map((s) => s.startDate)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates)).toISOString();
}

export function rollUpDueDate(subtasks: { dueDate?: string | null }[]): string | null {
  const dates = subtasks
    .map((s) => s.dueDate)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates)).toISOString();
}

function statusPillCls(cat: Status["category"] | undefined) {
  if (cat === "DONE") return "qt-issue-status-pill qt-issue-status-pill--done bg-green-100 text-green-800";
  if (cat === "IN_PROGRESS") return "qt-issue-status-pill qt-issue-status-pill--progress bg-blue-100 text-blue-800";
  return "qt-issue-status-pill qt-issue-status-pill--todo bg-gray-200 text-gray-700";
}

export function EditIssueModal({
  open,
  issueId,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  issueId: string | null;
  projectId: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [currentIssueId, setCurrentIssueId] = useState<string | null>(issueId);
  // Reset internal pointer whenever the parent opens a new issue. We adjust
  // state DURING render (the React derived-state pattern) rather than in an
  // effect so `currentIssueId` is correct on the very first render with the
  // new prop. The old effect-based sync lagged one render, which let the
  // subtask loader fire against the previous issue id and paint its result
  // into the new issue's drawer.
  const [syncedIssueId, setSyncedIssueId] = useState<string | null>(issueId);
  if (issueId && issueId !== syncedIssueId) {
    setSyncedIssueId(issueId);
    setCurrentIssueId(issueId);
  }
  // Holds the latest issue id so async loaders can detect that the drawer has
  // navigated away mid-flight and discard their (now stale) response. A plain
  // closure capture can't do this — it would compare the captured value to
  // itself — so we read through a ref kept current on every render.
  const currentIssueIdRef = useRef<string | null>(currentIssueId);
  currentIssueIdRef.current = currentIssueId;

  // Project-scoped perms decide which fields are editable and whether the
  // subtask composer is rendered at all. Server enforces; this just hides
  // controls the user can't actually use.
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const perms = useMyProjectPermissions(projectId);
  const canUpdateIssue = perms.loading || perms.has("Issue", "update");
  const canCreateIssue = perms.loading || perms.has("Issue", "create");
  // Delete is shown when the role has the full Issue:delete grant OR the viewer
  // owns this issue (reported or created it) — mirroring the server's single
  // delete rule, so a Contributor sees the trash on their own tasks.
  const canDeleteIssue = perms.loading || perms.has("Issue", "delete");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [issue, setIssue] = useState<IssueFull | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [epics, setEpics] = useState<EpicOption[]>([]);

  const [title, setTitle] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [descEditing, setDescEditing] = useState(false);
  const [statusId, setStatusId] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [epicId, setEpicId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [eta, setEta] = useState("");
  const [etaError, setEtaError] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomFieldDTO[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, FieldValue>>({});
  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.userId, label: memberLabel(m) })),
    [members],
  );

  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const [epicMenuOpen, setEpicMenuOpen] = useState(false);
  const [epicAllOpen, setEpicAllOpen] = useState(false);
  const [epicAllDraft, setEpicAllDraft] = useState("");
  const epicMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (epicMenuOpen && epicMenuRef.current && !epicMenuRef.current.contains(e.target as Node)) {
        setEpicMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [epicMenuOpen]);

  function attachEpic(id: string) {
    setEpicId(id);
    // Empty id = detach → send null so the epic is actually cleared (undefined
    // would just omit the field and leave the link in place).
    void patch({ epicId: id || null });
    setEpicMenuOpen(false);
  }

  // Inline work-type switcher on the breadcrumb key chip.
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (typeMenuOpen && typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [typeMenuOpen]);

  const [loading, setLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [subtasksOpen, setSubtasksOpen] = useState(true);

  // Subtasks state — managed independently so we can paginate by scroll.
  interface SubtaskRow {
    id: string;
    key: string;
    title: string;
    statusId: string;
    priority: Priority;
    assigneeId: string | null;
    eta?: number | null;
    startDate?: string | null;
    dueDate?: string | null;
  }
  const [subtasks, setSubtasks] = useState<SubtaskRow[]>([]);
  const [subtaskCursor, setSubtaskCursor] = useState<string | null>(null);
  const [subtaskHasMore, setSubtaskHasMore] = useState(false);
  const [subtaskLoading, setSubtaskLoading] = useState(false);
  const [subtaskCreating, setSubtaskCreating] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskInputOpen, setSubtaskInputOpen] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const subtaskSentinelRef = useRef<HTMLDivElement>(null);

  const SUBTASK_PAGE = 20;
  async function loadSubtasks(initial: boolean) {
    if (!currentIssueId) return;
    // A paginated follow-up bails if one is already in flight or there's no
    // next page. The initial (reset) load must NOT bail on subtaskLoading —
    // otherwise switching issues while a previous fetch is in flight drops the
    // new issue's load and the stale fetch overwrites the cleared list.
    if (!initial && (subtaskLoading || !subtaskHasMore)) return;
    const reqParent = currentIssueId;
    setSubtaskLoading(true);
    try {
      const params = new URLSearchParams({
        projectId,
        parentId: reqParent,
        type: "SUBTASK",
        limit: String(SUBTASK_PAGE),
      });
      if (!initial && subtaskCursor) params.set("cursor", subtaskCursor);
      const res = await fetch(`/api/issues?${params.toString()}`).then((r) => r.json());
      // Discard a response whose issue we've already navigated away from.
      if (reqParent !== currentIssueIdRef.current) return;
      if (res?.success) {
        const rows: SubtaskRow[] = (res.data ?? []).map((d: SubtaskRow) => d);
        setSubtasks((prev) => (initial ? rows : [...prev, ...rows]));
        setSubtaskCursor(res.nextCursor ?? null);
        setSubtaskHasMore(!!res.nextCursor);
      }
    } finally {
      setSubtaskLoading(false);
    }
  }
  // Refresh whenever the modal opens with a different issue.
  useEffect(() => {
    if (!open || !currentIssueId) return;
    setSubtasks([]);
    setSubtaskCursor(null);
    setSubtaskHasMore(false);
    setSubtaskInputOpen(false);
    setSubtaskTitle("");
    void loadSubtasks(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentIssueId]);
  // IntersectionObserver-based scroll pagination.
  useEffect(() => {
    const el = subtaskSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && subtaskHasMore && !subtaskLoading) {
            void loadSubtasks(false);
          }
        }
      },
      { rootMargin: "100px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtaskHasMore, subtaskLoading, subtaskCursor]);

  async function createSubtask() {
    const t = subtaskTitle.trim();
    if (!t || !currentIssueId || subtaskCreating) return;
    setSubtaskCreating(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: t,
          type: "SUBTASK",
          parentId: currentIssueId,
          priority: "MEDIUM",
        }),
      }).then((r) => r.json());
      if (res?.success) {
        setSubtaskTitle("");
        const created = res.data as SubtaskRow;
        setSubtasks((prev) => [created, ...prev]);
        // Re-pull from server so the grid reflects the canonical record
        // (key, statusId resolution, ordering) instead of trusting the
        // POST echo alone.
        setSubtaskCursor(null);
        setSubtaskHasMore(false);
        void loadSubtasks(true);
      }
    } finally {
      setSubtaskCreating(false);
    }
  }

  function subtaskDoneCount(): { done: number; total: number; pct: number } {
    const total = subtasks.length;
    const done = subtasks.filter((s) => {
      const st = statuses.find((x) => x.id === s.statusId);
      return st?.category === "DONE";
    }).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, pct };
  }

  // Drawer width — drag the left edge to expand/collapse.
  const [width, setWidth] = useState(520);
  const draggingRef = useRef(false);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const next = Math.min(
        Math.max(360, window.innerWidth - e.clientX),
        Math.min(1200, window.innerWidth - 80),
      );
      setWidth(next);
    }
    function onUp() {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // Click-outside for status popover.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [statusOpen]);

  // Load on open / change.
  useEffect(() => {
    if (!open || !currentIssueId) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/issues/${currentIssueId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/statuses`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/members`).then((r) => r.json()),
      fetch(`/api/sprints?projectId=${projectId}&limit=50`).then((r) => r.json()),
      fetch(`/api/issues?projectId=${projectId}&type=EPIC&limit=100`).then((r) => r.json()),
    ])
      .then(([i, s, m, sp, ep]) => {
        if (!alive) return;
        if (i?.success && i.data) {
          const d = i.data as IssueFull;
          setIssue(d);
          setTitle(d.title);
          setDescription(d.description ?? "");
          setStatusId(d.statusId);
          setPriority((d.priority as Priority) ?? "MEDIUM");
          setAssigneeId(d.assigneeId ?? "");
          setSprintId(d.sprintId ?? "");
          setEpicId(d.epicId ?? "");
          setStartDate(toDateInput(d.startDate));
          setDueDate(toDateInput(d.dueDate));
          setStoryPoints(d.storyPoints == null ? "" : String(d.storyPoints));
          setEta(formatEtaHours(d.eta));
          setCustomFields(d.customFields ?? []);
          setCustomValues(d.customFieldValues ?? {});
        }
        setStatuses(s?.success ? s.data : []);
        const mData = m?.success ? m.data?.members ?? m.data : [];
        setMembers(Array.isArray(mData) ? mData : []);
        setSprints(sp?.success ? sp.data ?? [] : []);
        const epicData = ep?.success ? ep.data ?? [] : [];
        setEpics(
          epicData.map((e: { id: string; key: string; title: string }) => ({
            id: e.id,
            key: e.key,
            title: e.title,
          })),
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, currentIssueId, projectId]);

  // Generic field-level patch — fires immediately when a field changes.
  async function patch(body: Record<string, unknown>) {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (res?.success) {
        setIssue((cur) => (cur ? { ...cur, ...body } : cur));
        window.dispatchEvent(
          new CustomEvent("quiktrack:issue-updated", {
            detail: { projectId, issueId: issue.id },
          }),
        );
        onSaved?.();
      }
    } catch {
      // ignore
    }
  }

  // Custom field inline edit — debounced so typing doesn't fire a PATCH per
  // keystroke. Uses its own request (not `patch`) so the partial values map
  // never gets merged onto `issue` (which holds the field *definitions*).
  const cfTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function commitCustomField(id: string, value: FieldValue) {
    setCustomValues((prev) => ({ ...prev, [id]: value }));
    const issueId = issue?.id;
    if (!issueId) return;
    clearTimeout(cfTimers.current[id]);
    cfTimers.current[id] = setTimeout(() => {
      void fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customFields: { [id]: value } }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res?.success) {
            window.dispatchEvent(
              new CustomEvent("quiktrack:issue-updated", { detail: { projectId, issueId } }),
            );
            onSaved?.();
          }
        })
        .catch(() => undefined);
    }, 500);
  }

  if (!open) return null;

  const currentStatus = statuses.find((s) => s.id === statusId);
  const assignee = members.find((m) => m.userId === assigneeId) ?? null;
  const linkedEpic = epics.find((e) => e.id === epicId) ?? null;

  // People list for @-mentions in the description + comment editors.
  const memberMentions = members
    .filter((m) => m.user)
    .map((m) => ({
      id: m.userId,
      name: [m.user!.firstName, m.user!.lastName].filter(Boolean).join(" ").trim() || m.user!.email,
      email: m.user!.email,
    }));

  return (
    <>
      {issue && (
        <DeleteTaskModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          issueId={issue.id}
          issueKey={issue.key}
          issueTitle={issue.title}
          subtaskCount={subtasks.length}
          subtasks={subtasks.map((s) => ({ id: s.id, key: s.key, title: s.title }))}
          onDeleted={() => {
            setDeleteOpen(false);
            window.dispatchEvent(
              new CustomEvent("quiktrack:issue-deleted", { detail: { id: issue.id } }),
            );
            onClose();
          }}
        />
      )}
      {/* Right-side drawer — no backdrop so the page behind stays interactive. */}
      <aside
        className="fixed top-12 right-0 bottom-0 z-40 bg-white border-l border-gray-200 shadow-xl flex flex-col"
        style={{ width: `${width}px`, maxWidth: "95vw" }}
      >
        {/* Drag handle — sits on the left edge of the drawer. The user
            grabs this to resize the panel; mouse indicator becomes col-resize. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          onMouseDown={startDrag}
          className="absolute top-0 bottom-0 -left-1 w-2 cursor-col-resize group z-50"
        >
          <span className="absolute top-1/2 -translate-y-1/2 left-0.5 w-1 h-12 rounded bg-gray-300 group-hover:bg-blue-500 transition-colors" />
        </div>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="inline-flex items-center gap-2 text-sm text-gray-700">
            {issue ? (
              <>
                {(() => {
                  const T = typeMeta(issue.type);
                  return <T.Icon className={`h-4 w-4 ${T.color}`} />;
                })()}
                <span>QuikTrack work item</span>
              </>
            ) : (
              <>
                <span className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
                <span className="h-3 w-32 rounded bg-gray-200 animate-pulse" />
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            {/* <button className="p-1.5 hover:bg-gray-100 rounded" aria-label="Open in new tab">
              <ExternalLink className="h-4 w-4" />
            </button> */}
            {issue &&
              (canDeleteIssue ||
                (!!currentUserId &&
                  (issue.reporterId === currentUserId || issue.createdBy === currentUserId))) && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                aria-label="Delete task"
                title="Delete task"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!perms.loading && !canUpdateIssue && issue && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-[12px] text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Read-only</span> — your role
                does not have <span className="font-medium">Issue:update</span>{" "}
                permission, so changes you make here won&apos;t save.
              </span>
            </div>
          )}
          {loading && !issue && <DrawerSkeleton />}
          {issue && (
            <>
              {/* Wrap the entire editable region (everything except the
                  Activity stream) in one fieldset so a Member without
                  Issue:update has every button, input, select, and
                  textarea disabled automatically — native HTML semantics
                  propagate `disabled` to every descendant form control. */}
              <fieldset
                disabled={!perms.loading && !canUpdateIssue}
                className={`m-0 p-0 border-0 min-w-0 space-y-3 ${
                  !perms.loading && !canUpdateIssue
                    ? "[&_input]:cursor-not-allowed [&_button]:cursor-not-allowed [&_select]:cursor-not-allowed [&_textarea]:cursor-not-allowed"
                    : ""
                }`}
              >
              {/* Top action row: Add epic, breadcrumb, eye, more */}
              <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
                <div className="inline-flex items-center gap-1.5">
                  {issue.parent ? (
                    <button
                      type="button"
                      onClick={() => setCurrentIssueId(issue.parent!.id)}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded text-blue-600 hover:bg-blue-50"
                    >
                      {(() => {
                        const T = typeMeta(issue.parent.type);
                        return <T.Icon className={`h-3 w-3 ${T.color}`} />;
                      })()}
                      {issue.parent.key}
                    </button>
                  ) : issue.type === "EPIC" ? null : linkedEpic ? (
                    <button
                      type="button"
                      onClick={() => attachEpic("")}
                      className="inline-flex items-center gap-1 px-2 h-6 rounded bg-purple-50 text-purple-700 hover:bg-purple-100"
                      title="Detach epic"
                    >
                      <Zap className="h-3 w-3" />
                      {linkedEpic.key}
                    </button>
                  ) : (
                    <div className="relative" ref={epicMenuRef}>
                      <button
                        type="button"
                        onClick={() => setEpicMenuOpen((v) => !v)}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded border border-gray-300 hover:bg-gray-50"
                      >
                        <Plus className="h-3 w-3" /> Add epic
                      </button>
                      {epicMenuOpen && (
                        <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
                          <div className="px-3 py-2 text-[11px] font-semibold text-gray-500">
                            Recent epics
                          </div>
                          {epics.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500">
                              No epics in this project yet.
                            </div>
                          )}
                          {epics.slice(0, 5).map((ep) => (
                            <button
                              key={ep.id}
                              type="button"
                              onClick={() => attachEpic(ep.id)}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                            >
                              <Zap className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                              <span className="text-gray-700 shrink-0">{ep.key}</span>
                              <span className="text-gray-800 truncate">{ep.title}</span>
                            </button>
                          ))}
                          <div className="border-t border-gray-100 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEpicMenuOpen(false);
                                setEpicAllDraft("");
                                setEpicAllOpen(true);
                              }}
                              className="block w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
                            >
                              View all epics
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {issue.type !== "EPIC" && <span className="text-gray-400 mx-1">/</span>}
                  {WORK_TYPE_OPTIONS.includes(issue.type as IssueType) ? (
                    <div className="relative" ref={typeMenuRef}>
                      <button
                        type="button"
                        onClick={() => setTypeMenuOpen((v) => !v)}
                        className="inline-flex items-center gap-1 h-6 px-1.5 -mx-1 rounded hover:bg-gray-100"
                        title="Change work type"
                      >
                        {(() => {
                          const T = typeMeta(issue.type);
                          return <T.Icon className={`h-3 w-3 ${T.color}`} />;
                        })()}
                        {issue.key}
                        <ChevronDown className="h-3 w-3 text-gray-400" />
                      </button>
                      {typeMenuOpen && (
                        <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
                          <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-500">
                            Change work type
                          </div>
                          {WORK_TYPE_OPTIONS.map((t) => {
                            const T = typeMeta(t);
                            const active = t === issue.type;
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  setTypeMenuOpen(false);
                                  if (t !== issue.type) void patch({ type: t });
                                }}
                                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                                  active ? "text-blue-700 font-medium" : "text-gray-700"
                                }`}
                              >
                                <T.Icon className={`h-3.5 w-3.5 ${T.color}`} />
                                {T.label}
                                {active && <Check className="h-3.5 w-3.5 ml-auto text-blue-600" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {(() => {
                        const T = typeMeta(issue.type);
                        return <T.Icon className={`h-3 w-3 ${T.color}`} />;
                      })()}
                      {issue.key}
                    </span>
                  )}
                </div>
                {/* <div className="inline-flex items-center gap-1 text-gray-500">
                  <button className="p-1 hover:bg-gray-100 rounded" aria-label="Lock">
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 rounded bg-blue-50 text-blue-600" aria-label="Watching">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 hover:bg-gray-100 rounded" aria-label="Share">
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 hover:bg-gray-100 rounded" aria-label="More">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div> */}
              </div>

              {/* Time-exceeded banner — shows when total logged hours
                  exceed the issue's original estimate. Sits between the
                  breadcrumb and the title so it's hard to miss. */}
              {(() => {
                const eta = issue.eta ?? 0;
                const total = (issue.timeLogs ?? []).reduce(
                  (s, t) => s + (t.hours || 0),
                  0,
                );
                if (eta <= 0 || total <= eta) return null;
                const over = total - eta;
                return (
                  <div className="mb-3 inline-flex items-center gap-2 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold">Time exceeded</span> by{" "}
                      <span className="font-semibold">{formatEtaHours(over)}</span> —
                      logged {formatEtaHours(total)} of {formatEtaHours(eta)} estimated.
                    </span>
                  </div>
                );
              })()}

              {/* Title */}
              {titleEditing ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    setTitleEditing(false);
                    if (title.trim() && title !== issue.title) {
                      void patch({ title: title.trim() });
                    } else {
                      setTitle(issue.title);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setTitle(issue.title);
                      setTitleEditing(false);
                    }
                  }}
                  className="w-full text-2xl font-semibold text-gray-900 px-2 py-1 -ml-2 border border-blue-500 rounded focus:outline-none"
                />
              ) : (
                <h1
                  onClick={() => canUpdateIssue && setTitleEditing(true)}
                  className={`text-2xl font-semibold text-gray-900 mb-3 px-2 py-1 -ml-2 rounded ${
                    canUpdateIssue ? "cursor-text hover:bg-gray-50" : "cursor-default"
                  }`}
                >
                  {title}
                </h1>
              )}

              {/* Action toolbar: Add, More, Status, lightning */}
              <div className="flex items-center gap-2 mb-5">
                {/* <button className="inline-flex items-center justify-center h-7 w-7 rounded border border-gray-300 hover:bg-gray-50 text-gray-600" aria-label="Add">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button className="inline-flex items-center justify-center h-7 w-7 rounded border border-gray-300 hover:bg-gray-50 text-gray-600" aria-label="More">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button> */}

                <div className="relative" ref={statusRef}>
                  <button
                    type="button"
                    onClick={() => setStatusOpen((v) => !v)}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold uppercase tracking-wide rounded ${statusPillCls(currentStatus?.category)}`}
                  >
                    {currentStatus?.name ?? "—"}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {statusOpen && (
                    <div className="absolute left-0 top-full mt-1 min-w-[200px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
                      {statuses.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setStatusId(s.id);
                            setStatusOpen(false);
                            void patch({ statusId: s.id });
                          }}
                          className={`flex items-center gap-2 w-full px-3 py-1.5 text-left ${
                            s.id === statusId ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
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

                {/* <button className="inline-flex items-center justify-center h-7 w-7 rounded text-amber-500 hover:bg-amber-50" aria-label="Automation">
                  <ZapIcon className="h-3.5 w-3.5" />
                </button> */}
              </div>

              {/* Description */}
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Description</h3>
                {descEditing ? (
                  <div>
                    <RichTextEditor
                      value={description}
                      onChange={setDescription}
                      mentions={memberMentions}
                      uploadImage={(file) => uploadProjectImage(projectId, file)}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDescEditing(false);
                          void patch({ description: description ?? "" });
                        }}
                        className="h-8 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDescription(issue.description ?? "");
                          setDescEditing(false);
                        }}
                        className="h-8 px-3 text-xs text-gray-700 hover:bg-gray-100 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!canUpdateIssue}
                    onClick={() => setDescEditing(true)}
                    className={`block w-full text-left text-sm text-gray-500 rounded px-3 py-2 ${
                      canUpdateIssue ? "hover:bg-gray-50" : "cursor-default opacity-80"
                    }`}
                  >
                    {description ? (
                      <span
                        className="prose prose-sm max-w-none text-gray-800"
                        dangerouslySetInnerHTML={{ __html: description }}
                      />
                    ) : (
                      "Add a description..."
                    )}
                  </button>
                )}
              </div>

              {/* Subtasks — hidden for Epics (which group via epicId) and
                  Subtasks themselves (which can't have grandchildren). */}
              {issue?.type !== "EPIC" && issue?.type !== "SUBTASK" && (() => {
                const { pct } = subtaskDoneCount();
                const hasAny = subtasks.length > 0;
                return (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        type="button"
                        onClick={() => setSubtasksOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
                      >
                        {subtasksOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Subtasks
                      </button>
                      <div className="flex items-center gap-1 text-gray-500">
                        {/* {hasAny && (
                          <>
                            <button
                              className="p-1 hover:bg-gray-100 rounded"
                              aria-label="More"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="p-1 hover:bg-gray-100 rounded"
                              aria-label="Layout"
                            >
                              <LayoutGrid className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )} */}
                        {canCreateIssue && (
                        <button
                          type="button"
                          onClick={() => {
                            setSubtasksOpen(true);
                            setSubtaskInputOpen(true);
                            // Focus / scroll to the input on the next tick so
                            // a re-click while already open still draws attention.
                            requestAnimationFrame(() => {
                              subtaskInputRef.current?.focus();
                              subtaskInputRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "nearest",
                              });
                            });
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          aria-label="Add subtask"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        )}
                      </div>
                    </div>

                    {subtasksOpen && (
                      <>
                        {hasAny && (
                          <>
                            {/* Progress bar */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-1 rounded bg-gray-200 overflow-hidden">
                                <div
                                  className="h-full bg-gray-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-gray-500 shrink-0">
                                {pct}% Done
                              </span>
                            </div>

                            {/* Subtask grid (paginated by scroll) */}
                            <div className="border border-gray-200 rounded-md overflow-x-auto">
                              <div className="grid grid-cols-[minmax(180px,1.6fr)_minmax(110px,1fr)_minmax(140px,1.2fr)_minmax(120px,1fr)_minmax(90px,0.8fr)_minmax(80px,0.7fr)] bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                                <div className="px-3 py-2">Work</div>
                                <div className="px-3 py-2">Priority</div>
                                <div className="px-3 py-2">Assignee</div>
                                <div className="px-3 py-2">Status</div>
                                <div className="px-3 py-2">ETA</div>
                                <div className="px-3 py-2">Σ Progress</div>
                              </div>
                              <div className="max-h-60 overflow-y-auto">
                                {subtasks.map((s) => (
                                  <SubtaskGridRow
                                    key={s.id}
                                    subtask={s}
                                    statuses={statuses}
                                    members={members}
                                    onOpen={() => setCurrentIssueId(s.id)}
                                    onPatched={(patch) =>
                                      setSubtasks((prev) =>
                                        prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)),
                                      )
                                    }
                                  />
                                ))}
                                {subtaskHasMore && (
                                  <div ref={subtaskSentinelRef} className="px-3 py-2">
                                    {subtaskLoading && (
                                      <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {canCreateIssue && subtaskInputOpen ? (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 border border-blue-500 rounded ring-2 ring-blue-500 px-2 h-9 bg-white">
                              <input
                                ref={subtaskInputRef}
                                autoFocus
                                value={subtaskTitle}
                                onChange={(e) => setSubtaskTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void createSubtask();
                                  if (e.key === "Escape") {
                                    setSubtaskTitle("");
                                    setSubtaskInputOpen(false);
                                  }
                                }}
                                placeholder="What needs to be done?"
                                className="flex-1 text-sm bg-transparent focus:outline-none"
                              />
                              <span className="inline-flex items-center gap-1 h-6 px-2 text-xs text-gray-500 bg-gray-50 rounded">
                                <Link2 className="h-3 w-3 text-blue-500" />
                                Subtask
                                <ChevronDown className="h-3 w-3" />
                              </span>
                              <button
                                type="button"
                                onClick={createSubtask}
                                disabled={!subtaskTitle.trim() || subtaskCreating}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
                                aria-label="Create subtask"
                              >
                                <CornerDownLeft className="h-3.5 w-3.5 text-gray-600" />
                              </button>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                              
                               
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSubtaskTitle("");
                                  setSubtaskInputOpen(false);
                                }}
                                className="text-xs text-gray-600 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          canCreateIssue && !hasAny && (
                            <button
                              type="button"
                              onClick={() => setSubtaskInputOpen(true)}
                              className="text-sm text-gray-500 hover:bg-gray-50 rounded px-3 py-2 -mx-3 block w-[calc(100%+1.5rem)] text-left"
                            >
                              Add subtask
                            </button>
                          )
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
              {/* end Subtasks */}

              {/* Linked work items */}
              {issue?.id && issue.projectId && (
                <LinkedWorkItems
                  issueId={issue.id}
                  projectId={issue.projectId}
                  onOpenIssue={(id) => setCurrentIssueId(id)}
                />
              )}

              {/* Attachments — read-only list, sourced from migration imports. */}
              {issue?.id && <IssueAttachments issueId={issue.id} />}

              {/* Details (collapsible) */}
              <div className={`border border-gray-200 rounded-md ${!perms.loading && !canUpdateIssue ? "opacity-80" : ""}`}>
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-900"
                >
                  <span className="inline-flex items-center gap-2">
                    {detailsOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Details
                  </span>
                  {/* <SlidersHorizontal className="h-3.5 w-3.5 text-gray-500" /> */}
                </button>
                {detailsOpen && (
                  <div className="px-4 py-3 space-y-3 border-t border-gray-100">
                    <DetailRow label="Assignee">
                      <AssigneePicker
                        members={members}
                        value={assigneeId}
                        onChange={(id) => {
                          setAssigneeId(id);
                          void patch({ assigneeId: id || undefined });
                        }}
                      />
                      {!assignee && currentUserId && members.some((m) => m.userId === currentUserId) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAssigneeId(currentUserId);
                            void patch({ assigneeId: currentUserId });
                          }}
                          className="block text-xs text-blue-600 hover:underline mt-1"
                        >
                          Assign to me
                        </button>
                      )}
                    </DetailRow>

                    <DetailRow label="Priority">
                      <RowPriorityPicker
                        value={priority}
                        onChange={(p) => {
                          setPriority(p);
                          void patch({ priority: p });
                        }}
                      />
                    </DetailRow>

                    {/* Parent (epic link) — N/A for Epics themselves. */}
                    {issue?.type !== "EPIC" && (
                      <DetailRow label="Parent">
                        {linkedEpic ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEpicId("");
                              void patch({ epicId: null });
                            }}
                            className="inline-flex items-center gap-1.5 max-w-full px-2 h-6 rounded bg-red-100 text-red-700 hover:bg-red-200"
                            title="Detach parent"
                          >
                            <Zap className="h-3 w-3 text-purple-500 shrink-0" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide truncate">
                              {linkedEpic.key} {linkedEpic.title}
                            </span>
                          </button>
                        ) : (
                          <ParentRowPicker
                            epics={epics}
                            value={epicId}
                            onChange={(id) => {
                              setEpicId(id);
                              void patch({ epicId: id || undefined });
                            }}
                          />
                        )}
                      </DetailRow>
                    )}

                    <DetailRow label="Due date">
                      {(() => {
                        // Subtasks dictate this field. Once any subtask exists
                        // the parent's value is derived (max of children) and
                        // not editable.
                        if (subtasks.length > 0) {
                          const rolled = rollUpDueDate(subtasks);
                          if (rolled) {
                            const d = new Date(rolled);
                            const overdue = d < new Date(new Date().toDateString());
                            return (
                              <RolledUpChip overdue={overdue} icon={overdue}>
                                {d.toLocaleDateString(undefined, {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </RolledUpChip>
                            );
                          }
                          return <RolledUpChip>—</RolledUpChip>;
                        }
                        return (
                          <DueDateChip
                            value={dueDate}
                            onChange={(v) => {
                              setDueDate(v);
                              void patch({ dueDate: v ? new Date(v).toISOString() : null });
                            }}
                          />
                        );
                      })()}
                    </DetailRow>

                    {/* Sprint — Epics span sprints, so they don't get assigned to one. */}
                    {issue?.type !== "EPIC" && (
                      <DetailRow label="Sprint">
                        <SprintRowPicker
                          sprints={sprints}
                          value={sprintId}
                          onChange={(id) => {
                            setSprintId(id);
                            void patch({ sprintId: id || null });
                          }}
                        />
                      </DetailRow>
                    )}

                    <DetailRow label="Start date">
                      {(() => {
                        if (subtasks.length > 0) {
                          const rolled = rollUpStartDate(subtasks);
                          if (rolled) {
                            return (
                              <RolledUpChip>
                                {new Date(rolled).toLocaleDateString(undefined, {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </RolledUpChip>
                            );
                          }
                          return <RolledUpChip>—</RolledUpChip>;
                        }
                        return (
                          <DateField
                            value={startDate}
                            onChange={(v) => {
                              setStartDate(v);
                              void patch({ startDate: v ? new Date(v).toISOString() : null });
                            }}
                          />
                        );
                      })()}
                    </DetailRow>

                    <DetailRow label="Original estimate">
                      {(() => {
                        if (subtasks.length > 0) {
                          const rolled = rollUpEta(subtasks);
                          return (
                            <RolledUpChip>
                              {rolled != null ? formatEtaHours(rolled) : "—"}
                            </RolledUpChip>
                          );
                        }
                        return (
                      <div>
                        <input
                          value={eta}
                          onChange={(e) => {
                            setEta(e.target.value);
                            if (etaError) setEtaError(null);
                          }}
                          onBlur={() => {
                            const raw = eta.trim();
                            if (raw === "") {
                              setEtaError(null);
                              void patch({ eta: undefined });
                              return;
                            }
                            const hours = parseEtaHours(raw);
                            if (hours == null) {
                              setEtaError(
                                "Use HH:MM (e.g. 01:30), a number of hours (1.5), or tokens like 1d 2h.",
                              );
                              return;
                            }
                            if (hours < 0 || hours > 10000) {
                              setEtaError("Estimate must be between 0 and 10000h.");
                              return;
                            }
                            setEtaError(null);
                            // Round to nearest minute to keep DB tidy.
                            const rounded = Math.round(hours * 60) / 60;
                            setEta(formatEtaHours(rounded));
                            void patch({ eta: rounded });
                          }}
                          placeholder="00:00"
                          className={`w-28 text-sm bg-transparent focus:outline-none border rounded px-1 ${
                            etaError
                              ? "border-red-500 ring-1 ring-red-500"
                              : "border-transparent hover:border-gray-300 focus:border-blue-500"
                          }`}
                        />
                        {etaError && (
                          <div className="mt-1 text-[11px] text-red-600">{etaError}</div>
                        )}
                      </div>
                        );
                      })()}
                    </DetailRow>

                    <DetailRow label="Story point estimate">
                      <input
                        type="number"
                        min={0}
                        value={storyPoints}
                        onChange={(e) => setStoryPoints(e.target.value)}
                        onBlur={() => {
                          const raw = storyPoints.trim();
                          if (raw === "") {
                            void patch({ storyPoints: undefined });
                          } else {
                            const n = parseInt(raw, 10);
                            if (!Number.isNaN(n)) void patch({ storyPoints: n });
                          }
                        }}
                        placeholder="None"
                        className="w-24 text-sm bg-transparent focus:outline-none border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-1"
                      />
                    </DetailRow>

                    <DetailRow label="Reporter">
                      {(() => {
                        const r = members.find((m) => m.userId === issue.reporterId);
                        if (!r) return <span className="text-sm text-gray-500">—</span>;
                        return (
                          <span className="inline-flex items-center gap-2 text-sm text-gray-800">
                            <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
                              {memberInitials(r)}
                            </span>
                            {memberLabel(r)}
                          </span>
                        );
                      })()}
                    </DetailRow>

                    {customFields.length > 0 && (
                      <CustomFieldsSection
                        variant="detail"
                        fields={customFields}
                        values={customValues}
                        onChange={commitCustomField}
                        members={memberOptions}
                        disabled={!canUpdateIssue}
                      />
                    )}
                  </div>
                )}
              </div>

              </fieldset>

              <div className="mt-4 text-[11px] text-gray-500">
                {issue.createdAt && <div>Created {fmtDateLabel(issue.createdAt)}</div>}
                {issue.updatedAt && <div>Updated {fmtDateLabel(issue.updatedAt)}</div>}
              </div>

              {/* Activity — Comments / History / Work log tabs. Mounted at
                  the bottom of the right rail per the reference designs. */}
              {issue?.id && issue.projectId && (
                <div className="mt-6">
                  <IssueActivity
                    issueId={issue.id}
                    projectId={issue.projectId}
                    mentions={memberMentions}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {epicAllOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
          onClick={() => setEpicAllOpen(false)}
        >
          <div
            className="w-[520px] max-w-[95vw] bg-white rounded-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Add epic</h2>
              <p className="text-sm text-gray-600 mb-4">
                Select a parent work item. Work items can only belong to one parent at a time.
              </p>
              <label className="block text-xs font-medium text-gray-700 mb-1">Epic</label>
              <div className="relative border border-blue-500 rounded ring-2 ring-blue-500">
                <select
                  value={epicAllDraft}
                  onChange={(e) => setEpicAllDraft(e.target.value)}
                  className="w-full h-9 pl-3 pr-8 text-sm bg-white appearance-none focus:outline-none"
                >
                  <option value="">Choose parent</option>
                  {epics.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.key} {ep.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEpicAllOpen(false)}
                className="h-9 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!epicAllDraft}
                onClick={() => {
                  attachEpic(epicAllDraft);
                  setEpicAllOpen(false);
                }}
                className="h-9 px-5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-3 text-sm py-0.5">
      <div className="text-gray-500 whitespace-nowrap">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ───────── Subtask grid row (inline-editable) ───────── */

interface InlineSubtask {
  id: string;
  key: string;
  title: string;
  statusId: string;
  priority: Priority;
  assigneeId: string | null;
  eta?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
}

function SubtaskGridRow({
  subtask,
  statuses,
  members,
  onOpen,
  onPatched,
}: {
  subtask: InlineSubtask;
  statuses: Status[];
  members: Member[];
  onOpen: () => void;
  onPatched: (patch: Partial<InlineSubtask>) => void;
}) {
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(subtask.title);
  // Each picker tracks its open state + the viewport coords of the trigger
  // button. Using `position: fixed` for the popover lets it escape the grid's
  // `overflow-y-auto` clipping at the bottom of the visible area.
  const [pPos, setPPos] = useState<{ top: number; left: number } | null>(null);
  const [aPos, setAPos] = useState<{ top: number; left: number } | null>(null);
  const [sPos, setSPos] = useState<{ top: number; left: number } | null>(null);
  const [assigneeQuery, setAssigneeQuery] = useState("");

  // Close any picker on outside click / scroll.
  useEffect(() => {
    if (!pPos && !aPos && !sPos) return;
    function close() {
      setPPos(null);
      setAPos(null);
      setSPos(null);
    }
    function onMouse(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("[data-fixed-popover]")) return;
      close();
    }
    document.addEventListener("mousedown", onMouse);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      window.removeEventListener("scroll", close, true);
    };
  }, [pPos, aPos, sPos]);

  function anchor(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { top: r.bottom + 4, left: r.left };
  }

  const st = statuses.find((x) => x.id === subtask.statusId);
  const ass = members.find((m) => m.userId === subtask.assigneeId);
  const P = PRIORITY_META[(subtask.priority as Priority) ?? "MEDIUM"];

  async function patch(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/issues/${subtask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (res?.success) onPatched(body as Partial<InlineSubtask>);
    } catch {
      // ignore — next refresh reconciles
    }
  }

  function commitTitle() {
    const v = titleDraft.trim();
    setTitleEditing(false);
    if (!v || v === subtask.title) {
      setTitleDraft(subtask.title);
      return;
    }
    void patch({ title: v });
  }

  return (
    <div className="grid grid-cols-[minmax(180px,1.6fr)_minmax(110px,1fr)_minmax(140px,1.2fr)_minmax(120px,1fr)_minmax(90px,0.8fr)_minmax(80px,0.7fr)] items-center border-b border-gray-100 last:border-b-0 text-sm hover:bg-gray-50">
      {/* Work — key opens drawer; title is click-to-edit */}
      <div className="px-3 py-2 inline-flex items-center gap-1.5 min-w-0">
        <Link2 className="h-3 w-3 text-blue-500 shrink-0" />
        <button
          type="button"
          onClick={onOpen}
          className="text-blue-600 hover:underline shrink-0"
        >
          {subtask.key}
        </button>
        {titleEditing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleDraft(subtask.title);
                setTitleEditing(false);
              }
            }}
            className="flex-1 min-w-0 h-6 px-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(subtask.title);
              setTitleEditing(true);
            }}
            className="text-gray-800 truncate text-left hover:bg-gray-100 rounded px-1 -mx-1 min-w-0 flex-1"
          >
            {subtask.title}
          </button>
        )}
      </div>

      {/* Priority */}
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={(e) => setPPos(pPos ? null : anchor(e))}
          className={`inline-flex items-center gap-1.5 h-6 px-1 -mx-1 rounded text-gray-700 ${
            pPos ? "bg-white border border-blue-500 ring-2 ring-blue-500" : "hover:bg-gray-100"
          }`}
        >
          <P.Icon className={`h-3.5 w-3.5 ${P.color}`} />
          {P.label}
        </button>
        {pPos && (
          <div
            data-fixed-popover
            style={{ position: "fixed", top: pPos.top, left: pPos.left }}
            className="w-[180px] bg-white border border-gray-200 rounded shadow-lg z-[80] py-1"
          >
            {(Object.keys(PRIORITY_META) as Priority[])
              .filter((p) => p !== subtask.priority)
              .map((p) => {
                const M = PRIORITY_META[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPPos(null);
                      void patch({ priority: p });
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                  >
                    <M.Icon className={`h-3.5 w-3.5 ${M.color}`} />
                    <span className="text-gray-800">{M.label}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Assignee */}
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={(e) => setAPos(aPos ? null : anchor(e))}
          className={`inline-flex items-center gap-1.5 h-6 px-1 -mx-1 rounded text-gray-700 max-w-full ${
            aPos ? "bg-white border border-blue-500 ring-2 ring-blue-500" : "hover:bg-gray-100"
          }`}
        >
          {ass ? (
            <>
              <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                {memberInitials(ass)}
              </span>
              <span className="truncate">{memberLabel(ass)}</span>
            </>
          ) : (
            <>
              <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 text-[10px] inline-flex items-center justify-center shrink-0">
                ?
              </span>
              <span className="text-gray-500">Unassigned</span>
            </>
          )}
        </button>
        {aPos && (
          <div
            data-fixed-popover
            style={{ position: "fixed", top: aPos.top, left: aPos.left }}
            className="w-[220px] bg-white border border-gray-200 rounded shadow-lg z-[80] flex flex-col max-h-60 dark:bg-gray-900 dark:border-gray-700"
          >
            <div className="relative border-b border-gray-100 px-2 py-1.5 dark:border-gray-700">
              <Search className="absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                autoFocus
                value={assigneeQuery}
                onChange={(e) => setAssigneeQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-6 pl-6 pr-2 text-xs bg-transparent border-none outline-none text-gray-800 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
            <div className="overflow-y-auto py-1">
              {(() => {
                const q = assigneeQuery.trim().toLowerCase();
                const filteredMembers = members.filter((m) => {
                  if (!q) return true;
                  return memberLabel(m).toLowerCase().includes(q);
                });
                const showUnassigned = !q || "unassigned".includes(q);
                return (
                  <>
                    {showUnassigned && (
                      <button
                        type="button"
                        onClick={() => {
                          setAPos(null);
                          setAssigneeQuery("");
                          void patch({ assigneeId: null });
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
                          !subtask.assigneeId
                            ? "bg-blue-50 border-l-2 border-blue-600 dark:bg-blue-500/15"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        } dark:text-gray-200`}
                      >
                        <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 text-[10px] inline-flex items-center justify-center dark:bg-gray-700 dark:text-gray-300">
                          ?
                        </span>
                        Unassigned
                      </button>
                    )}
                    {filteredMembers.map((m) => (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => {
                          setAPos(null);
                          setAssigneeQuery("");
                          void patch({ assigneeId: m.userId });
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
                          m.userId === subtask.assigneeId
                            ? "bg-blue-50 border-l-2 border-blue-600 dark:bg-blue-500/15"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        } dark:text-gray-200`}
                      >
                        <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
                          {memberInitials(m)}
                        </span>
                        <span className="truncate">{memberLabel(m)}</span>
                      </button>
                    ))}
                    {!showUnassigned && filteredMembers.length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                        No matches.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={(e) => setSPos(sPos ? null : anchor(e))}
          className={`inline-flex items-center gap-1 h-5 px-2 text-[10px] font-semibold uppercase tracking-wide rounded whitespace-nowrap max-w-full ${statusPillCls(
            st?.category,
          )}`}
        >
          {st?.name ?? "—"}
          <ChevronDown className="h-3 w-3" />
        </button>
        {sPos && (
          <div
            data-fixed-popover
            style={{ position: "fixed", top: sPos.top, left: sPos.left }}
            className="min-w-[180px] bg-white border border-gray-200 rounded shadow-lg z-[80] py-1"
          >
            {statuses
              .filter((x) => x.id !== subtask.statusId)
              .map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    setSPos(null);
                    void patch({ statusId: x.id });
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-50"
                >
                  <span
                    className={`inline-flex h-5 px-2 items-center text-[10px] font-semibold uppercase tracking-wide rounded ${statusPillCls(x.category)}`}
                  >
                    {x.name}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* ETA — inline-editable */}
      <SubtaskEtaCell
        value={subtask.eta ?? null}
        onSave={(hours) => patch({ eta: hours })}
      />

      {/* Σ Progress */}
      <div className="px-3 py-2 text-xs text-gray-500">
        {st?.category === "DONE" ? "100%" : "0%"}
      </div>
    </div>
  );
}

function SubtaskEtaCell({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (hours: number | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatEtaHours(value));
  const [error, setError] = useState(false);

  function commit() {
    setEditing(false);
    const raw = draft.trim();
    if (raw === "") {
      setError(false);
      onSave(undefined);
      return;
    }
    const h = parseEtaHours(raw);
    if (h == null || h < 0 || h > 10000) {
      setError(true);
      return;
    }
    setError(false);
    const rounded = Math.round(h * 60) / 60;
    setDraft(formatEtaHours(rounded));
    onSave(rounded);
  }

  if (editing) {
    return (
      <div className="px-3 py-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(formatEtaHours(value));
              setError(false);
              setEditing(false);
            }
          }}
          placeholder="00:00"
          className={`w-20 h-6 text-xs text-gray-700 bg-transparent rounded px-1 border focus:outline-none ${
            error ? "border-red-500 ring-1 ring-red-500" : "border-blue-500"
          }`}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(formatEtaHours(value));
        setEditing(true);
      }}
      className="px-3 py-2 text-xs text-gray-500 text-left hover:bg-gray-100 rounded"
      title="Original estimate"
    >
      {value && value > 0 ? formatEtaHours(value) : "-"}
    </button>
  );
}

/* ───────── Detail-row pickers ───────── */

function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onMouse);
    return () => document.removeEventListener("mousedown", onMouse);
  }, [open, onClose]);
  return ref;
}

function AssigneePicker({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const selected = members.find((m) => m.userId === value) ?? null;

  const filtered = query
    ? members.filter((m) => memberLabel(m).toLowerCase().includes(query.toLowerCase()))
    : members;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 w-full text-left px-2 -mx-2 py-1 rounded text-sm ${
          open ? "border border-blue-500 ring-2 ring-blue-500 bg-white" : "hover:bg-gray-50"
        }`}
      >
        {selected ? (
          <>
            <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
              {memberInitials(selected)}
            </span>
            <span className="text-gray-800 truncate">{memberLabel(selected)}</span>
          </>
        ) : (
          <>
            <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center">
              ?
            </span>
            <span className="text-gray-500">Unassigned</span>
          </>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[260px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full h-7 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
              !value ? "bg-blue-50 border-l-2 border-blue-600" : "hover:bg-gray-50"
            }`}
          >
            <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center">
              ?
            </span>
            Unassigned
          </button>
          {filtered.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => {
                onChange(m.userId);
                setOpen(false);
              }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
                m.userId === value ? "bg-blue-50 border-l-2 border-blue-600" : "hover:bg-gray-50"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
                {memberInitials(m)}
              </span>
              <span className="text-gray-800 truncate">{memberLabel(m)}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
          )}
        </div>
      )}
    </div>
  );
}

function RowPriorityPicker({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const Sel = PRIORITY_META[value];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between w-full text-left px-2 -mx-2 py-1 rounded text-sm ${
          open ? "border border-blue-500 ring-2 ring-blue-500 bg-white" : "hover:bg-gray-50"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <Sel.Icon className={`h-3.5 w-3.5 ${Sel.color}`} />
          <span className="text-gray-800">{Sel.label}</span>
        </span>
        {open && <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[220px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
          {(Object.keys(PRIORITY_META) as Priority[])
            .filter((p) => p !== value)
            .map((p) => {
              const M = PRIORITY_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                >
                  <M.Icon className={`h-3.5 w-3.5 ${M.color}`} />
                  <span className="text-gray-800">{M.label}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

function ParentRowPicker({
  epics,
  value,
  onChange,
}: {
  epics: EpicOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useClickOutside<HTMLDivElement>(open, () => {
    setOpen(false);
    setQuery("");
  });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? epics.filter((e) => e.key.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    : epics;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-gray-500 hover:bg-gray-50 rounded px-2 -mx-2 py-1 text-left w-full"
      >
        None
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[280px] bg-white border border-gray-200 rounded shadow-lg z-50 flex flex-col">
          {/* Search — keeps the list usable when a space has many epics. */}
          <div className="shrink-0 border-b border-gray-100 p-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search epics…"
                className="w-full h-7 pl-7 pr-2 text-sm rounded border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
              />
            </div>
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            {epics.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">No epics in this project.</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onChange(e.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex items-start gap-2 w-full px-3 py-1.5 text-sm text-left ${
                    e.id === value ? "bg-blue-50 border-l-2 border-blue-600" : "hover:bg-gray-50"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5 mt-0.5 text-purple-500 shrink-0" />
                  <span className="min-w-0">
                    <div className="text-[11px] text-gray-500">{e.key}</div>
                    <div className="text-gray-800 truncate">{e.title}</div>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DueDateChip({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing || !value) {
    return (
      <input
        autoFocus={editing}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        className="text-sm bg-transparent focus:outline-none border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-1"
      />
    );
  }
  const due = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = due < today;
  const label = due.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`inline-flex items-center gap-1 h-6 px-2 rounded border text-[11px] font-medium ${
        overdue
          ? "border-red-300 bg-red-50 text-red-600"
          : "border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {overdue && <AlertTriangle className="h-3 w-3" />}
      {label}
    </button>
  );
}

function SprintRowPicker({
  sprints,
  value,
  onChange,
}: {
  sprints: Sprint[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scopeOnly, setScopeOnly] = useState(true);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const selected = sprints.find((s) => s.id === value) ?? null;

  // Group by sprint status — `ACTIVE` / `PLANNING` (future) / `COMPLETED`.
  const filtered = query
    ? sprints.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : sprints;
  const active = filtered.filter((s) => s.status === "ACTIVE");
  const future = filtered.filter((s) => s.status !== "ACTIVE" && s.status !== "COMPLETED");
  void scopeOnly; // checkbox is purely visual today; left in for parity with reference

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-sm text-left px-2 -mx-2 py-1 rounded w-full ${
          open ? "border border-blue-500 ring-2 ring-blue-500 bg-white" : "hover:bg-gray-50"
        }`}
      >
        {selected ? (
          <span className="text-blue-700 hover:underline">{selected.name}</span>
        ) : (
          <span className="text-gray-500">None</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[320px] bg-white border border-gray-200 rounded shadow-lg z-50 max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sprints"
                className="w-full h-8 pl-2 pr-7 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100"
                  aria-label="Clear"
                >
                  <X className="h-3 w-3 text-gray-500" />
                </button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={scopeOnly}
              onChange={(e) => setScopeOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            Only show sprints in this project
          </label>
          <div className="overflow-y-auto">
            {active.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
                  Active
                </div>
                {active.map((s) => (
                  <SprintOption
                    key={s.id}
                    name={s.name}
                    active={s.id === value}
                    onClick={() => {
                      onChange(s.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </>
            )}
            {future.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
                  Future
                </div>
                {future.map((s) => (
                  <SprintOption
                    key={s.id}
                    name={s.name}
                    active={s.id === value}
                    onClick={() => {
                      onChange(s.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-500">No sprints found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SprintOption({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col w-full px-3 py-1.5 text-sm text-left ${
        active ? "bg-blue-50 border-l-2 border-blue-600" : "hover:bg-gray-50"
      }`}
    >
      <span className="text-gray-800">{name}</span>
    </button>
  );
}

function DrawerSkeleton() {
  return (
    <div className="animate-pulse">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-20 rounded bg-gray-200" />
        <div className="h-3 w-3 rounded bg-gray-100" />
        <div className="h-5 w-16 rounded bg-gray-200" />
      </div>
      {/* title */}
      <div className="h-7 w-3/4 rounded bg-gray-200 mb-5" />
      {/* action toolbar */}
      <div className="flex items-center gap-2 mb-5">
        <div className="h-7 w-7 rounded bg-gray-200" />
        <div className="h-7 w-7 rounded bg-gray-200" />
        <div className="h-7 w-20 rounded bg-gray-200" />
        <div className="h-7 w-7 rounded bg-gray-100" />
      </div>
      {/* description heading */}
      <div className="h-4 w-24 rounded bg-gray-200 mb-2" />
      <div className="h-3 w-full rounded bg-gray-100 mb-1.5" />
      <div className="h-3 w-5/6 rounded bg-gray-100 mb-5" />
      {/* subtasks heading */}
      <div className="h-4 w-20 rounded bg-gray-200 mb-2" />
      <div className="h-9 w-full rounded bg-gray-100 mb-5" />
      {/* details panel */}
      <div className="border border-gray-200 rounded-md p-4 space-y-3">
        <div className="h-4 w-16 rounded bg-gray-200 mb-2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[120px_1fr] gap-3">
            <div className="h-3 w-16 rounded bg-gray-200" />
            <div className="h-3 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A read-only chip used for fields that are dictated by subtasks (Due date,
 * Start date, Original estimate). The chip carries an explicit `(rolled up)`
 * label and a tooltip so the user knows why the field can't be edited.
 */
function RolledUpChip({
  children,
  overdue,
  icon,
}: {
  children: React.ReactNode;
  overdue?: boolean;
  icon?: boolean;
}) {
  return (
    <span
      title="Rolled up from subtasks — edit a subtask to change this value."
      className={`inline-flex items-center gap-1 h-6 px-2 rounded border text-[11px] font-medium cursor-not-allowed ${
        overdue
          ? "border-red-300 bg-red-50 text-red-600"
          : "border-gray-300 bg-gray-50 text-gray-700"
      }`}
    >
      {icon && <AlertTriangle className="h-3 w-3" />}
      {children}
      <span className="ml-1 text-[10px] text-gray-500">(rolled up)</span>
    </span>
  );
}

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm bg-transparent focus:outline-none border border-transparent hover:border-gray-300 rounded px-1"
    />
  );
}
