"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { GroupedBoardGroup, GroupedBoardTask } from "../../_types";

const PRESET_COLORS = [
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#14b8a6",
  "#94a3b8",
];

export interface CreateGroupInput {
  name: string;
  color: string;
  icon?: string;
  taskIds: string[];
}

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateGroupInput) => Promise<void>;
  groups: GroupedBoardGroup[];
}

export function CreateGroupModal({
  open,
  onClose,
  onCreate,
  groups,
}: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTasks = useMemo(() => {
    const list: { task: GroupedBoardTask; groupName: string; groupColor: string }[] = [];
    for (const g of groups) {
      for (const t of g.tasks) list.push({ task: t, groupName: g.name, groupColor: g.color });
    }
    return list;
  }, [groups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTasks;
    return allTasks.filter(
      (t) =>
        t.task.title.toLowerCase().includes(q) || t.task.key.toLowerCase().includes(q),
    );
  }, [allTasks, search]);

  function toggleTask(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setName("");
    setColor(PRESET_COLORS[0]);
    setSelected(new Set());
    setSearch("");
    setError(null);
  }

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Group name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), color, taskIds: Array.from(selected) });
      resetForm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-3 sm:p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-[520px] max-h-[90vh] flex flex-col bg-white rounded-md shadow-xl border border-gray-200 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Create group</h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 overflow-y-auto">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Group name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. On Track"
              className="w-full h-9 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
              maxLength={64}
            />
          </label>

          <div>
            <span className="block text-xs font-medium text-gray-600 mb-1">Color</span>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border ${
                    color === c ? "ring-2 ring-offset-1 ring-gray-900" : "ring-0"
                  }`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <TaskPickerDropdown
            allTasks={allTasks}
            selected={selected}
            search={search}
            filtered={filtered}
            onSearchChange={setSearch}
            onToggle={toggleTask}
            onSelectAll={() => setSelected(new Set(filtered.map((t) => t.task.id)))}
            onClearAll={() => setSelected(new Set())}
          />

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="h-8 px-3 text-xs rounded border border-gray-200 bg-white hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-3 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting
              ? "Creating…"
              : selected.size > 0
                ? `Create group + add ${selected.size} task${selected.size === 1 ? "" : "s"}`
                : "Create group"}
          </button>
        </div>
      </form>
    </div>
  );
}

interface TaskPickerDropdownProps {
  allTasks: { task: GroupedBoardTask; groupName: string; groupColor: string }[];
  filtered: { task: GroupedBoardTask; groupName: string; groupColor: string }[];
  selected: Set<string>;
  search: string;
  onSearchChange: (v: string) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

function TaskPickerDropdown({
  allTasks,
  filtered,
  selected,
  search,
  onSearchChange,
  onToggle,
  onSelectAll,
  onClearAll,
}: TaskPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerLabel =
    selected.size === 0
      ? "Select tasks to include"
      : `${selected.size} task${selected.size === 1 ? "" : "s"} selected`;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">
          Add tasks <span className="text-gray-400 font-normal">(optional)</span>
        </span>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] text-blue-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 h-9 px-2 text-xs border border-gray-200 rounded bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        <span className={selected.size > 0 ? "text-gray-900" : "text-gray-400"}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks by title or key"
                className="w-full h-8 pl-8 pr-3 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
            </div>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={onSelectAll}
                className="mt-1.5 text-[11px] text-blue-600 hover:underline"
              >
                Select all {filtered.length} visible
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-400">
                {allTasks.length === 0
                  ? "No tasks on this board yet."
                  : "No tasks match the search."}
              </div>
            ) : (
              filtered.map(({ task, groupName, groupColor }) => {
                const checked = selected.has(task.id);
                return (
                  <label
                    key={task.id}
                    className={`flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${
                      checked ? "bg-blue-50/40" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(task.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span className="font-mono text-[10px] text-gray-500 shrink-0">
                      {task.key}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-gray-900">{task.title}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 shrink-0"
                      style={{ color: groupColor }}
                      title={`Currently in: ${groupName}`}
                    >
                      {groupName}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
