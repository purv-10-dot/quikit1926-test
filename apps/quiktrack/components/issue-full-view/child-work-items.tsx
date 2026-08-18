"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Plus,
  Search,
  CheckSquare,
  Bug,
  BookOpen,
} from "lucide-react";
import { SkeletonList } from "@/components/skeleton";
import {
  ChildWorkItemRow,
  CHILD_GRID_COLS,
  type ChildIssue,
  type Member,
} from "./child-work-item-row";
import { ChildExistingPicker } from "./child-existing-picker";

// Work types a child may be created as (mirrors Jira — no Epic/Subtask child).
const CHILD_TYPES = ["TASK", "STORY", "BUG"] as const;
type ChildType = (typeof CHILD_TYPES)[number];
const CHILD_TYPE_META: Record<ChildType, { Icon: React.ElementType; color: string; label: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500", label: "Task" },
  STORY: { Icon: BookOpen, color: "text-green-600", label: "Story" },
  BUG: { Icon: Bug, color: "text-red-500", label: "Bug" },
};

/**
 * "Child work items" section for the EPIC issue view. Lists every non-subtask
 * issue whose `epicId` points at this epic, with a progress bar and per-row
 * status control. The header `+` opens an inline creator (create a Task/Story/
 * Bug already attached to this epic) or a "Choose existing" picker (attach an
 * existing issue by setting its epicId). Mirrors the Subtasks grid's chrome.
 */
export function ChildWorkItems({
  epicId,
  projectId,
}: {
  epicId: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<ChildIssue[] | null>(null);
  const [statuses, setStatuses] = useState<{ id: string; name: string; category: string }[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  // Inline create + choose-existing UI state.
  const [creating, setCreating] = useState(false); // inline "new child" input open
  const [choosing, setChoosing] = useState(false); // "Choose existing" picker open
  const [title, setTitle] = useState("");
  const [childType, setChildType] = useState<ChildType>("TASK");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&epicId=${encodeURIComponent(epicId)}&excludeType=SUBTASK&limit=100&expand=true`,
    )
      .then((r) => r.json())
      .then((j) => {
        setItems(
          j?.success
            ? (j.data ?? []).map((i: ChildIssue) => ({
                id: i.id,
                key: i.key,
                title: i.title,
                type: i.type,
                priority: i.priority ?? null,
                storyPoints: i.storyPoints ?? null,
                assigneeId: i.assigneeId ?? null,
                statusId: i.statusId ?? i.status?.id ?? null,
                status: i.status ?? null,
              }))
            : [],
        );
      })
      .catch(() => setItems([]));
  }, [epicId, projectId]);

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/statuses`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setStatuses(j.data ?? []);
      })
      .catch(() => undefined);
    void fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setMembers(Array.isArray(j.data?.members) ? j.data.members : j.data ?? []);
        }
      })
      .catch(() => undefined);
  }, [projectId]);

  // Close the type menu on outside click.
  useEffect(() => {
    if (!typeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [typeMenuOpen]);

  function notifyChanged(issueId: string) {
    window.dispatchEvent(
      new CustomEvent("quiktrack:issue-updated", { detail: { projectId, issueId } }),
    );
  }

  function openCreate() {
    setOpen(true);
    setChoosing(false);
    setCreating(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function createChild() {
    const t = title.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: t, type: childType, epicId, priority: "MEDIUM" }),
      }).then((r) => r.json());
      if (res?.success && res.data) {
        const d = res.data as ChildIssue;
        const st = statuses.find((s) => s.id === d.statusId) ?? null;
        setItems((prev) => [
          ...(prev ?? []),
          {
            id: d.id,
            key: d.key,
            title: d.title,
            type: d.type,
            priority: d.priority ?? "MEDIUM",
            storyPoints: d.storyPoints ?? null,
            assigneeId: d.assigneeId ?? null,
            statusId: d.statusId ?? null,
            status: st,
          },
        ]);
        setTitle("");
        notifyChanged(d.id);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Attach an existing issue: set its epicId, then add it to the list.
  async function attachExisting(hit: ChildIssue) {
    const res = await fetch(`/api/issues/${hit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epicId }),
    }).then((r) => r.json());
    if (res?.success) {
      const d = (res.data ?? hit) as ChildIssue;
      const st = statuses.find((s) => s.id === (d.statusId ?? d.status?.id)) ?? d.status ?? null;
      setItems((prev) => [
        ...(prev ?? []).filter((c) => c.id !== hit.id),
        {
          id: hit.id,
          key: hit.key,
          title: hit.title,
          type: hit.type,
          priority: d.priority ?? null,
          storyPoints: d.storyPoints ?? null,
          assigneeId: d.assigneeId ?? null,
          statusId: st?.id ?? null,
          status: st,
        },
      ]);
      setChoosing(false);
      notifyChanged(hit.id);
    }
  }

  // Generic optimistic patch for the inline-editable cells (priority/assignee).
  async function patchChild(id: string, data: Record<string, unknown>) {
    setItems((arr) => (arr ?? []).map((c) => (c.id === id ? { ...c, ...data } : c)));
    await fetch(`/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => undefined);
    notifyChanged(id);
  }

  async function setStatus(id: string, statusId: string) {
    setItems((arr) =>
      (arr ?? []).map((c) =>
        c.id === id
          ? { ...c, statusId, status: statuses.find((s) => s.id === statusId) ?? c.status }
          : c,
      ),
    );
    await fetch(`/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusId }),
    }).catch(() => undefined);
    notifyChanged(id);
  }

  // Detach: clear epicId so the issue leaves this epic (not deleted).
  async function detach(id: string) {
    setItems((arr) => (arr ?? []).filter((c) => c.id !== id));
    await fetch(`/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epicId: null }),
    }).catch(() => undefined);
    notifyChanged(id);
  }

  const total = items?.length ?? 0;
  const done = (items ?? []).filter((c) => c.status?.category === "DONE").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const excludeIds = new Set<string>([epicId, ...(items ?? []).map((c) => c.id)]);
  const CT = CHILD_TYPE_META[childType];

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Child work items
        </button>
        {open && (
          <button
            type="button"
            onClick={openCreate}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Add child work item"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!open ? null : items === null ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {total > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1 rounded bg-gray-200 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] text-gray-500 shrink-0">{pct}% Done</span>
              </div>
              {/* Horizontal scroll so the narrow issue drawer can reach every
                  column at full width instead of truncating names. The row
                  popovers (priority/assignee) are portaled to <body>, so this
                  overflow can't clip them. */}
              <div className="border border-gray-200 rounded-md overflow-x-auto">
                <div className="min-w-[640px]">
                  <div
                    className={`grid ${CHILD_GRID_COLS} bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-600 uppercase tracking-wide`}
                  >
                    <div className="px-3 py-2">Work</div>
                    <div className="px-3 py-2">Priority</div>
                    <div className="px-3 py-2">Story points</div>
                    <div className="px-3 py-2">Assignee</div>
                    <div className="px-3 py-2">Status</div>
                    <div />
                  </div>
                  {items.map((c) => (
                    <ChildWorkItemRow
                      key={c.id}
                      child={c}
                      projectId={projectId}
                      members={members}
                      statuses={statuses}
                      onPatch={(data) => patchChild(c.id, data)}
                      onStatus={(statusId) => setStatus(c.id, statusId)}
                      onDetach={() => detach(c.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Inline creator */}
          {creating && (
            <div className="mt-2">
              <div className="flex items-center gap-2 border border-blue-500 rounded ring-2 ring-blue-500/20 px-2 h-9 bg-white">
                <div className="relative" ref={typeRef}>
                  <button
                    type="button"
                    onClick={() => setTypeMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1 h-6 px-1.5 text-xs rounded hover:bg-gray-100"
                  >
                    <CT.Icon className={`h-3.5 w-3.5 ${CT.color}`} />
                    <ChevronDown className="h-3 w-3 text-gray-400" />
                  </button>
                  {typeMenuOpen && (
                    <div className="absolute left-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-30 py-1">
                      {CHILD_TYPES.map((t) => {
                        const m = CHILD_TYPE_META[t];
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setChildType(t);
                              setTypeMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                              t === childType ? "bg-blue-50 text-blue-700" : "text-gray-700"
                            }`}
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
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createChild();
                    if (e.key === "Escape") {
                      setTitle("");
                      setCreating(false);
                    }
                  }}
                  placeholder="What needs to be done?"
                  className="flex-1 text-sm bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={createChild}
                  disabled={!title.trim() || submitting}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
                  aria-label="Create child work item"
                >
                  <CornerDownLeft className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setChoosing(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                >
                  <Search className="h-3 w-3" />
                  Choose existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitle("");
                    setCreating(false);
                  }}
                  className="text-xs text-gray-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Choose-existing picker */}
          {choosing && (
            <ChildExistingPicker
              projectId={projectId}
              excludeIds={excludeIds}
              onPick={(hit) => void attachExisting(hit)}
              onCancel={() => setChoosing(false)}
            />
          )}

          {/* Empty state — only when nothing else is open */}
          {total === 0 && !creating && !choosing && (
            <button
              type="button"
              onClick={openCreate}
              className="text-sm text-gray-500 hover:text-gray-800 px-2 -mx-2 py-1 block text-left"
            >
              Add child work item
            </button>
          )}
        </>
      )}
    </section>
  );
}
