"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, CheckSquare, Bug, Bookmark, Zap, ListChecks, Plus, Search } from "lucide-react";

interface IssueOption { id: string; key: string; title: string; type: string }
interface Props {
  issues: IssueOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** When set with onCreated, the dropdown footer offers inline task creation
   *  (POST /api/issues, no sprint → goes to the project's backlog). */
  projectId?: string;
  onCreated?: (issue: IssueOption) => void;
}

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK:    { Icon: CheckSquare, color: "text-blue-500" },
  STORY:   { Icon: Bookmark,    color: "text-green-600" },
  BUG:     { Icon: Bug,         color: "text-red-500" },
  EPIC:    { Icon: Zap,         color: "text-purple-600" },
  SUBTASK: { Icon: ListChecks,  color: "text-blue-400" },
};

export function WorkItemPicker({
  issues,
  value,
  onChange,
  disabled,
  placeholder = "Pick a task or subtask",
  projectId,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCreateError(null);
      setCreateMode(false);
    }
  }, [open]);

  useEffect(() => {
    if (createMode) inputRef.current?.focus();
  }, [createMode]);

  // Focus the search box when the dropdown opens (and we're not creating).
  useEffect(() => {
    if (open && !createMode) searchRef.current?.focus();
  }, [open, createMode]);

  const canCreate = Boolean(projectId && onCreated);

  async function createTask() {
    const title = query.trim();
    if (!title || !projectId || !onCreated) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No sprintId → defaults to backlog. Type defaults to TASK.
        body: JSON.stringify({ projectId, title, type: "TASK" }),
      }).then((r) => r.json());
      if (!res?.success) {
        setCreateError(res?.error ?? "Failed to create task");
        return;
      }
      const created: IssueOption = {
        id: res.data.id,
        key: res.data.key,
        title: res.data.title,
        type: res.data.type,
      };
      onCreated(created);
      onChange(created.id);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  // `query` doubles as the list filter and, when creating, the new task title.
  const q = query.trim().toLowerCase();
  const filtered = q
    ? issues.filter(
        (i) =>
          i.key.toLowerCase().includes(q) || i.title.toLowerCase().includes(q),
      )
    : issues;

  const selected = issues.find((i) => i.id === value);
  const meta = (t: string) => TYPE_ICON[t] ?? TYPE_ICON.TASK!;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-9 px-3 inline-flex items-center gap-2 text-sm border rounded text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled ? "bg-gray-50 text-gray-400 border-gray-200" :
          open ? "border-blue-500 bg-white" :
          "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        {selected ? (
          <>
            {(() => { const { Icon, color } = meta(selected.type); return <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />; })()}
            <span className="font-medium text-gray-900">{selected.key}</span>
            <span className="text-gray-700 truncate flex-1">{selected.title}</span>
          </>
        ) : (
          <span className="text-gray-400 flex-1">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg py-1">
          {!createMode && (
            <div className="px-2 pb-1.5 pt-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
                  placeholder="Search work items…"
                  className="w-full h-8 pl-7 pr-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && !canCreate ? (
              <div className="px-3 py-2 text-xs text-gray-400">No work items match.</div>
            ) : filtered.length === 0 ? null : filtered.map((i) => {
              const { Icon, color } = meta(i.type);
              const active = i.id === value;
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => { onChange(i.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span className="font-medium text-gray-900 shrink-0">{i.key}</span>
                  <span className="text-gray-700 truncate flex-1">{i.title}</span>
                  {i.type === "SUBTASK" && <span className="text-[10px] text-gray-400 shrink-0">subtask</span>}
                  {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>
          {canCreate && (
            <div className="border-t border-gray-100">
              {createMode ? (
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && query.trim() && !creating) {
                          e.preventDefault();
                          void createTask();
                        }
                        if (e.key === "Escape") {
                          setCreateMode(false);
                          setQuery("");
                        }
                      }}
                      placeholder="New task title…"
                      className="flex-1 px-2 h-8 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={creating || !query.trim()}
                      onClick={() => void createTask()}
                      className="h-8 px-3 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
                    >
                      {creating ? "Creating…" : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode(false);
                        setQuery("");
                      }}
                      className="h-8 px-2 text-xs text-gray-600 rounded hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mt-1 text-[10px] text-gray-400">Will be created in backlog.</div>
                  {createError && (
                    <div className="mt-1 text-[11px] text-red-600">{createError}</div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreateMode(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="text-blue-700 font-medium">Create task</span>
                  <span className="text-[10px] text-gray-400 shrink-0 ml-auto">in backlog</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
