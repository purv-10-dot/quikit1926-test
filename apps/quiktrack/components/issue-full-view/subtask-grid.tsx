"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  MoreHorizontal,
  LayoutGrid,
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
        {total > 0 && (
          <div className="flex items-center gap-1 text-gray-500">
            <button className="p-1 rounded hover:bg-gray-100" aria-label="More">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            <button className="p-1 rounded hover:bg-gray-100" aria-label="Layout">
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button className="p-1 rounded hover:bg-gray-100" aria-label="Add subtask">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {!open ? null : total === 0 ? (
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-gray-800 px-2 -mx-2 py-1 block text-left"
        >
          Add subtask
        </button>
      ) : (
        <>
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-1 rounded bg-gray-200 overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-gray-500 shrink-0">{pct}% Done</span>
          </div>

          <div className="border border-gray-200 rounded-md overflow-x-auto">
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
      {/* Suppress unused-warning when parentIssueId is wired later for inline create. */}
      <span className="hidden">{parentIssueId}</span>
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

