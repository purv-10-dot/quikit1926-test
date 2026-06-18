"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Link2,
  Plus,
} from "lucide-react";
import { SubtaskRow } from "./subtask-row";
import type { Priority } from "./types";

interface Subtask {
  id: string;
  key: string;
  title: string;
  priority?: Priority | null;
  assigneeId?: string | null;
  statusId?: string | null;
  status?: { id: string; name: string; category: string } | null;
}

interface Member {
  userId: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
}

/**
 * Subtasks section as a Jira-style mini-grid: collapsible header with
 * progress bar + per-row Work / Priority / Assignee / Status / Σ Progress
 * columns. When there are no subtasks, the empty-state "Add subtask" link
 * stays inline (matches the empty header in the reference design).
 */
export function SubtaskGrid({
  parentIssueId,
  projectId,
  subtasks: incoming,
}: {
  parentIssueId: string;
  projectId: string;
  subtasks: Subtask[];
}) {
  const [open, setOpen] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; name: string; category: string }[]>([]);
  // Local copy so inline edits update without waiting for the full parent
  // refetch — parent re-syncs on its own poll/event.
  const [subtasks, setSubtasks] = useState<Subtask[]>(incoming);
  useEffect(() => setSubtasks(incoming), [incoming]);

  // Inline subtask creation.
  const [inputOpen, setInputOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function openInput() {
    setOpen(true);
    setInputOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function createSubtask() {
    const t = title.trim();
    if (!t || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: t,
          type: "SUBTASK",
          parentId: parentIssueId,
          priority: "MEDIUM",
        }),
      }).then((r) => r.json());
      if (res?.success && res.data) {
        const d = res.data as Subtask;
        setSubtasks((prev) => [
          {
            id: d.id,
            key: d.key,
            title: d.title,
            priority: d.priority ?? null,
            assigneeId: d.assigneeId ?? null,
            statusId: d.statusId ?? null,
            status: d.status ?? null,
          },
          ...prev,
        ]);
        setTitle("");
        // Let the parent view re-sync its canonical subtask list / rollups.
        window.dispatchEvent(
          new CustomEvent("quiktrack:issue-updated", {
            detail: { projectId, issueId: parentIssueId },
          }),
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function patchSubtask(id: string, data: Record<string, unknown>) {
    // Optimistic update.
    setSubtasks((arr) =>
      arr.map((s) => (s.id === id ? mergePatch(s, data, statuses) : s)),
    );
    const res = await fetch(`/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json());
    if (!res?.success) {
      // Rollback on failure.
      setSubtasks(incoming);
    }
    window.dispatchEvent(
      new CustomEvent("quiktrack:issue-updated", {
        detail: { projectId, issueId: id },
      }),
    );
  }

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setMembers(Array.isArray(j.data?.members) ? j.data.members : j.data ?? []);
        }
      })
      .catch(() => undefined);
    void fetch(`/api/projects/${projectId}/statuses`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setStatuses(j.data ?? []);
      })
      .catch(() => undefined);
  }, [projectId]);

  const total = subtasks.length;
  const done = subtasks.filter(
    (s) => statuses.find((st) => st.id === s.statusId)?.category === "DONE",
  ).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Subtasks
        </button>
        {open && (
          <button
            type="button"
            onClick={openInput}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Add subtask"
          >
            <Plus className="h-3.5 w-3.5 text-gray-600" />
          </button>
        )}
      </div>
      {!open ? null : (
        <>
          {total > 0 && (
            <>
              {/* Progress bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1 rounded bg-gray-200 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] text-gray-500 shrink-0">{pct}% Done</span>
              </div>

              {/* No `overflow` here — it would clip the row dropdowns (priority /
                  assignee / status) vertically. The grid is wide enough for the
                  issue page's left column. */}
              <div className="border border-gray-200 rounded-md">
                <div className="grid grid-cols-[minmax(220px,2fr)_minmax(110px,1fr)_minmax(140px,1fr)_minmax(110px,1fr)_minmax(90px,0.7fr)] bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                  <div className="px-3 py-2">Work</div>
                  <div className="px-3 py-2">Priority</div>
                  <div className="px-3 py-2">Assignee</div>
                  <div className="px-3 py-2">Status</div>
                  <div className="px-3 py-2 text-right">Σ Progress</div>
                </div>
                {subtasks.map((s) => (
                  <SubtaskRow
                    key={s.id}
                    subtask={s}
                    projectId={projectId}
                    members={members}
                    statuses={statuses}
                    onPatch={(data) => patchSubtask(s.id, data)}
                  />
                ))}
              </div>
            </>
          )}

          {inputOpen ? (
            <div className="mt-2">
              <div className="flex items-center gap-2 border border-blue-500 rounded ring-2 ring-blue-500/20 px-2 h-9 bg-white">
                <input
                  ref={inputRef}
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createSubtask();
                    if (e.key === "Escape") {
                      setTitle("");
                      setInputOpen(false);
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
                  disabled={!title.trim() || creating}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
                  aria-label="Create subtask"
                >
                  <CornerDownLeft className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setTitle("");
                    setInputOpen(false);
                  }}
                  className="text-xs text-gray-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            total === 0 && (
              <button
                type="button"
                onClick={openInput}
                className="text-sm text-gray-500 hover:text-gray-800 px-2 -mx-2 py-1 block text-left"
              >
                Add subtask
              </button>
            )
          )}
        </>
      )}
    </section>
  );
}

function mergePatch(
  s: Subtask,
  data: Record<string, unknown>,
  statuses: { id: string; name: string; category: string }[],
): Subtask {
  const next: Subtask = { ...s, ...data } as Subtask;
  // When statusId changes, also stamp the `status` denorm so the row's pill
  // re-colours immediately without waiting for a refetch.
  if (typeof data.statusId === "string") {
    const st = statuses.find((x) => x.id === data.statusId);
    if (st) next.status = { id: st.id, name: st.name, category: st.category };
  }
  return next;
}

