"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MoreHorizontal,
  User,
  Network,
  AlertTriangle,
  Zap,
  ExternalLink,
  Trash2,
} from "lucide-react";
import type { BoardIssue, BoardStatus, EpicLite } from "./board-meta";
import { typeMeta, priorityMeta } from "./board-meta";
import { SubtaskCard } from "./subtask-card";
import { DraggableCard } from "./board-dnd";
import type { ColumnInlineCreateMember } from "./column-inline-create";
import { PopoverPanel } from "../../grouped-kanban/_components/cells/popover-panel";
import { showToast } from "@/lib/ui/toast";

function memberInitials(m: ColumnInlineCreateMember | undefined): string {
  const u = m?.user;
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

function memberDisplayName(m: ColumnInlineCreateMember | undefined): string {
  const u = m?.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}

/**
 * Top-level work-item card on the kanban board (Task / Story / Bug).
 *
 * Matches the close-up reference: title row with a single ⋯ on the right,
 * optional red EPIC chip, optional red overdue date chip, then a footer with
 * type-icon + KEY on the left and hierarchy + priority + assignee on the
 * right. Subtasks are loaded lazily when the user clicks the hierarchy icon.
 */
export function TaskCard({
  task,
  projectId,
  epicsById,
  statusesById,
  membersById,
  hideEpicChip = false,
  onOpen,
}: {
  task: BoardIssue;
  projectId: string;
  epicsById: Record<string, EpicLite>;
  statusesById: Record<string, BoardStatus>;
  membersById?: Record<string, ColumnInlineCreateMember>;
  hideEpicChip?: boolean;
  onOpen?: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState<BoardIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/issues/${task.id}`, { method: "DELETE" }).then(
        (r) => r.json(),
      );
      if (res?.success) {
        setConfirmOpen(false);
        // The board listens for this event and refetches, dropping the card.
        window.dispatchEvent(
          new CustomEvent("quiktrack:issue-deleted", { detail: { id: task.id } }),
        );
      } else {
        showToast(res?.error ?? "Failed to delete work item", "error");
      }
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Failed to delete work item", "error");
    } finally {
      setDeleting(false);
    }
  }

  const fetchSubtasks = useCallback(async () => {
    if (!task.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        projectId,
        parentId: task.id,
        type: "SUBTASK",
        limit: "100",
      });
      const res = await fetch(`/api/issues?${params.toString()}`).then((r) => r.json());
      if (res?.success) setSubtasks(res.data ?? []);
      else setSubtasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, task.id]);

  useEffect(() => {
    if (isExpanded && subtasks === null && !loading) {
      void fetchSubtasks();
    }
  }, [isExpanded, subtasks, loading, fetchSubtasks]);

  const T = typeMeta(task.type);
  const P = priorityMeta(task.priority);
  const epic = task.epicId ? epicsById?.[task.epicId] : null;
  const overdue = isOverdue(task.dueDate);
  // Date label: start–due range when both exist, else whichever single date is
  // set. Shown on every card that has a date (not only overdue ones); the chip
  // turns red only when the due date has passed.
  const dateLabel =
    task.startDate && task.dueDate
      ? `${formatShortDate(task.startDate)} – ${formatShortDate(task.dueDate)}`
      : task.dueDate
        ? formatShortDate(task.dueDate)
        : task.startDate
          ? formatShortDate(task.startDate)
          : null;
  const hasSubtasks = (task.subtaskCount ?? 0) > 0 || (subtasks?.length ?? 0) > 0;
  const isDone = statusesById[task.statusId]?.category === "DONE";

  return (
    <div className="relative">
      <DraggableCard id={task.id} statusId={task.statusId} issueKey={task.key} title={task.title || "Untitled"}>
      <div
        onClick={() => onOpen?.(task.id)}
        className="qt-board-card bg-white border border-gray-200 rounded-md p-2.5 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
      >
        {/* Title + ⋯ */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3
            className={`text-sm font-semibold line-clamp-2 flex-1 min-w-0 ${
              isDone ? "text-gray-400 line-through" : "text-gray-900"
            }`}
          >
            {task.title || "Untitled"}
          </h3>
          <button
            ref={menuBtnRef}
            type="button"
            // Stop the @dnd-kit PointerSensor from claiming this press so the
            // menu button stays clickable (drag listeners live on the card root).
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className={`flex-shrink-0 p-0.5 rounded transition-colors ${
              menuOpen ? "bg-gray-200" : "hover:bg-gray-100"
            }`}
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        {/* Chip row: epic + date. Wrapped in a gapped, wrapping flex container so
            the two chips never butt against each other (and wrap to a new line
            when the epic title is long). */}
        {((epic && !hideEpicChip) || dateLabel) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {/* Epic chip — suppressed inside an EpicGroup (its purple header
                already names the epic). */}
            {epic && !hideEpicChip && (
              <div className="inline-flex items-center max-w-full gap-1 px-1.5 h-5 rounded bg-red-100 text-red-700">
                <Zap className="h-3 w-3 text-purple-500 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wide truncate">
                  {epic.title}
                </span>
              </div>
            )}

            {/* Date chip — neutral gray normally; red with a warning icon once
                the due date is overdue. */}
            {dateLabel && (
              <div
                className={`inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[10px] font-medium ${
                  overdue
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                {overdue && <AlertTriangle className="h-3 w-3" />}
                {dateLabel}
              </div>
            )}
          </div>
        )}

        {/* Footer: type+key | hierarchy + priority + assignee */}
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5 min-w-0">
            <T.Icon className={`w-4 h-4 shrink-0 ${T.color}`} />
            <span
              className={`qt-key-chip truncate font-medium ${isDone ? "line-through text-gray-400" : ""}`}
            >
              {task.key}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasSubtasks && (
              <button
                type="button"
                // Keep the subtask disclosure clickable under the drag sensor.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded((v) => !v);
                }}
                className="p-0.5 rounded hover:bg-gray-100"
                aria-label={isExpanded ? "Hide subtasks" : "Show subtasks"}
                title={isExpanded ? "Hide subtasks" : "Show subtasks"}
              >
                <Network className="h-3.5 w-3.5 text-gray-500" />
              </button>
            )}
            {/* Story-point estimate — small blue pill, shown only when set
                (epics/subtasks aren't point-estimated). Open the card to edit. */}
            {task.storyPoints != null && task.type !== "EPIC" && task.type !== "SUBTASK" && (
              <span
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold tabular-nums text-blue-700"
                title={`${task.storyPoints} story point${task.storyPoints === 1 ? "" : "s"}`}
              >
                {task.storyPoints}
              </span>
            )}
            <P.Icon className={`h-3.5 w-3.5 ${P.color}`} />
            {task.assigneeId ? (
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0"
                style={{ background: memberColor(task.assigneeId) }}
                title={memberDisplayName(membersById?.[task.assigneeId])}
              >
                {memberInitials(membersById?.[task.assigneeId])}
              </span>
            ) : (
              <span
                className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"
                title="No assignee"
              >
                <User className="w-3.5 h-3.5 text-gray-500" />
              </span>
            )}
          </div>
        </div>
      </div>
      </DraggableCard>

      {/* Row actions menu — portaled so it never clips against the card/column
          overflow. Open opens the work item; Delete confirms then removes it. */}
      <PopoverPanel
        anchorRef={menuBtnRef}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        align="right"
        width={176}
        estimatedHeight={84}
      >
        <div role="menu" className="py-1">
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onOpen?.(task.id);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
            Open
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            Delete
          </button>
        </div>
      </PopoverPanel>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            e.stopPropagation();
            if (!deleting) setConfirmOpen(false);
          }}
        >
          <div
            className="w-[380px] rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900">Delete work item?</h3>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{task.key}</span>{" "}
              {task.title || "Untitled"} will be permanently deleted. This can’t be
              undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="h-8 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="h-8 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isExpanded && (
        <SubtaskTree
          subtasks={subtasks}
          loading={loading}
          statusesById={statusesById}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

function SubtaskTree({
  subtasks,
  loading,
  statusesById,
  onOpen,
}: {
  subtasks: BoardIssue[] | null;
  loading: boolean;
  statusesById: Record<string, BoardStatus>;
  onOpen?: (id: string) => void;
}) {
  if (loading || !subtasks) {
    return (
      <div className="ml-1 mt-2 pb-1 pl-6">
        <div className="h-3 w-1/2 rounded bg-gray-200 animate-pulse my-2" />
      </div>
    );
  }
  if (subtasks.length === 0) {
    return (
      <div className="ml-1 mt-2 pb-1 pl-6 text-[11px] text-gray-400">No subtasks.</div>
    );
  }
  return (
    <div
      className="ml-1 -mt-2 pb-1 relative"
      style={subtasks.length === 1 ? { height: "112px" } : undefined}
    >
      <div
        className="absolute left-[6px] bg-[#CAC8C6] w-[1px]"
        style={{ top: "8px", height: "56.5px" }}
      />
      {subtasks.length > 1 && (
        <div
          className="absolute left-[6px] bg-[#CAC8C6] w-[1px]"
          style={{ top: "48.5px", height: `${(subtasks.length - 1) * 81}px` }}
        />
      )}
      {subtasks.map((s, idx) => {
        const isLast = idx === subtasks.length - 1;
        const isSingle = subtasks.length === 1;
        const cardCenter = "48.5px";
        return (
          <div key={s.id} className="relative flex items-center" style={{ minHeight: "65px" }}>
            {!isLast && (
              <div
                className="absolute bg-[#CAC8C6]"
                style={{
                  left: "7px",
                  top: cardCenter,
                  transform: "translateY(-50%)",
                  width: "18px",
                  height: "1px",
                }}
              />
            )}
            {isLast && (
              <div
                className="absolute"
                style={{
                  left: "6px",
                  top: isSingle ? "46%" : cardCenter,
                  width: "19px",
                  height: isSingle ? "65px" : "32.5px",
                  transform: "translateY(-50%)",
                  borderLeft: "1px solid #CAC8C6",
                  borderBottom: "1px solid #CAC8C6",
                }}
              />
            )}
            <div className="ml-6 flex-1">
              <SubtaskCard subtask={s} statusesById={statusesById} onOpen={onOpen} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due < today;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
