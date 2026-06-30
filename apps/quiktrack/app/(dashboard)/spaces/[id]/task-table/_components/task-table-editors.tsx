"use client";

import { useEffect, useRef, useState } from "react";
import { Check, GitBranch, Plus, Zap } from "lucide-react";
import type { EpicLite, SprintLite, TaskIssue } from "./task-types";

/** Close-on-outside-click + ESC for a popover. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, onClose]);
}

// ── Sprint editor ────────────────────────────────────────────────────────────

export function SprintEditor({
  value,
  sprints,
  onChange,
}: {
  value: SprintLite | null;
  sprints: SprintLite[];
  onChange: (sprintId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex max-w-[160px] items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-gray-100 ${
          value ? "text-gray-700" : "text-gray-400"
        }`}
      >
        <GitBranch className="h-3 w-3 flex-shrink-0 text-gray-400" />
        <span className="truncate">{value?.name ?? "—"}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-gray-50"
          >
            <span className="text-gray-500">No sprint</span>
            {value === null && <Check className="h-3 w-3 text-gray-500" />}
          </button>
          {sprints.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs hover:bg-gray-50"
            >
              <span className="flex items-center gap-1.5 truncate text-gray-700">
                <GitBranch className="h-3 w-3 flex-shrink-0 text-gray-400" />
                {s.name}
              </span>
              {value?.id === s.id && <Check className="h-3 w-3 flex-shrink-0 text-gray-500" />}
            </button>
          ))}
          {sprints.length === 0 && (
            <p className="px-2 py-2 text-xs text-gray-400">No sprints in this project</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline epic linker (moved here from task-table-row to keep that file lean) ─

export function EpicLinker({
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
  useDismiss(open, ref, () => setOpen(false));

  // Filter out the issue itself (an issue can't be its own epic).
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
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-xs text-gray-400">
                {search ? "No matches" : "No epics in this project"}
              </p>
            )}
            {filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onChange(e.id);
                  setOpen(false);
                }}
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
