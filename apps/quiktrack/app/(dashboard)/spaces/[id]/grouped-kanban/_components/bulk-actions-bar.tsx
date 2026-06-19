"use client";

import { useRef, useState } from "react";
import { Download, MoveRight, Trash2, X } from "lucide-react";
import type {
  BoardMemberLite,
  GroupedBoardGroup,
  GroupedBoardStatus,
  GroupedBoardTask,
  SprintLite,
} from "../_types";
import { PopoverPanel } from "./cells/popover-panel";
import { confirmDialog } from "@/lib/ui/confirm";

interface BulkActionsBarProps {
  allTasks: GroupedBoardTask[];
  groups: GroupedBoardGroup[];
  statuses: GroupedBoardStatus[];
  sprints: SprintLite[];
  members: BoardMemberLite[];
  selectedIds: Set<string>;
  onClear: () => void;
  onDelete: (taskIds: string[]) => void;
  onMove: (taskIds: string[], toGroupId: string | null) => void;
}

export function BulkActionsBar({
  allTasks,
  groups,
  statuses,
  sprints,
  members,
  selectedIds,
  onClear,
  onDelete,
  onMove,
}: BulkActionsBarProps) {
  const moveBtnRef = useRef<HTMLButtonElement | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  if (selectedIds.size === 0) return null;

  const selectedTasks = allTasks.filter((t) => selectedIds.has(t.id));
  const count = selectedTasks.length;

  async function handleDelete() {
    const ok = await confirmDialog({
      title: "Delete tasks",
      message: `Delete ${count} task${count === 1 ? "" : "s"}? This can't be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    onDelete(selectedTasks.map((t) => t.id));
  }

  function handleExport() {
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const statusName = new Map(statuses.map((s) => [s.id, s.name]));
    const sprintName = new Map(sprints.map((s) => [s.id, s.name]));
    const memberName = new Map(
      members
        .filter((m) => m.user)
        .map((m) => {
          const u = m.user!;
          const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
          return [u.id, full || u.email] as const;
        }),
    );
    const groupName = new Map(groups.map((g) => [g.id, g.name]));
    const taskGroupName = (t: GroupedBoardTask) => {
      if (!t.groupId) return groups.find((g) => g.isDefault)?.name ?? "";
      return groupName.get(t.groupId) ?? "";
    };
    const header = ["Key", "Title", "Type", "Priority", "Status", "Group", "Sprint", "Assignee", "Due"];
    const rows = selectedTasks.map((t) => [
      t.key,
      t.title,
      t.type,
      t.priority,
      statusName.get(t.statusId) ?? "",
      taskGroupName(t),
      t.sprintId ? sprintName.get(t.sprintId) ?? "" : "",
      t.assigneeId ? memberName.get(t.assigneeId) ?? "" : "",
      t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
    ]);
    const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiktrack-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg shadow-xl"
    >
      <span className="text-xs font-semibold pr-2 border-r border-white/20">
        {count} selected
      </span>
      <button
        type="button"
        onClick={handleDelete}
        className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded hover:bg-red-600/80 transition-colors"
        title="Delete selected tasks"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
      <button
        type="button"
        onClick={handleExport}
        className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded hover:bg-white/10 transition-colors"
        title="Download selected as CSV"
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </button>
      <button
        ref={moveBtnRef}
        type="button"
        onClick={() => setMoveOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded hover:bg-white/10 transition-colors"
        title="Move selected tasks to a different group"
      >
        <MoveRight className="h-3.5 w-3.5" />
        Move to
      </button>
      <PopoverPanel
        anchorRef={moveBtnRef}
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        placement="up"
        width={220}
        estimatedHeight={Math.min(groups.length, 8) * 32 + 16}
      >
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400">
          Move {count} task{count === 1 ? "" : "s"} to
        </div>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              setMoveOpen(false);
              onMove(selectedTasks.map((t) => t.id), g.isDefault ? null : g.id);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 rounded mx-1 hover:bg-slate-100 transition-colors"
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: g.color }} />
            <span className="truncate">{g.name}</span>
            {g.isDefault && (
              <span className="ml-auto text-[10px] text-slate-400">Default</span>
            )}
          </button>
        ))}
      </PopoverPanel>
      <button
        type="button"
        onClick={onClear}
        className="ml-2 inline-flex items-center justify-center h-7 w-7 rounded hover:bg-white/10"
        title="Clear selection"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
