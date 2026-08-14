"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Bug, BookOpen, Zap, Link2, Plus, X } from "lucide-react";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { showToast } from "@/lib/ui/toast";
import { AddWorkItemsModal } from "./add-work-items-modal";

type IssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";

interface WorkItem {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  epicId: string | null;
  assigneeId: string | null;
  status: { id: string; name: string; color: string | null; category: string } | null;
  assignee?: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

interface EpicOption {
  id: string;
  key: string;
  title: string;
}

const TYPE_META: Record<IssueType, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-600" },
  EPIC: { Icon: Zap, color: "text-purple-500" },
  SUBTASK: { Icon: Link2, color: "text-blue-500" },
};

export function WorkItemsSection({
  projectId,
  releaseId,
  canEdit,
  onChanged,
}: {
  projectId: string;
  releaseId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [epics, setEpics] = useState<EpicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [epicFilter, setEpicFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const issueRes = await fetch(
      `/api/issues?projectId=${projectId}&releaseId=${releaseId}&excludeType=SUBTASK&expand=true&limit=200`,
    )
      .then((r) => r.json())
      .catch(() => null);
    if (issueRes?.success) {
      setItems((issueRes.data ?? []) as WorkItem[]);
    }
    const epicRes = await fetch(`/api/issues?projectId=${projectId}&type=EPIC&limit=100`)
      .then((r) => r.json())
      .catch(() => null);
    if (epicRes?.success) {
      setEpics(
        (epicRes.data ?? []).map((e: { id: string; key: string; title: string }) => ({
          id: e.id,
          key: e.key,
          title: e.title,
        })),
      );
    }
    setLoading(false);
  }, [projectId, releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpdated = () => void load();
    window.addEventListener("quiktrack:issue-updated", onUpdated);
    return () => window.removeEventListener("quiktrack:issue-updated", onUpdated);
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (epicFilter && i.epicId !== epicFilter) return false;
      if (statusFilter && i.status?.category !== statusFilter) return false;
      if (assigneeFilter && i.assigneeId !== assigneeFilter) return false;
      return true;
    });
  }, [items, epicFilter, statusFilter, assigneeFilter]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      if (i.assignee) {
        const name = [i.assignee.firstName, i.assignee.lastName].filter(Boolean).join(" ").trim() || i.assignee.email;
        map.set(i.assignee.id, name);
      }
    }
    return Array.from(map.entries());
  }, [items]);

  async function removeItem(issueId: string) {
    const res = await fetch(`/api/releases/${releaseId}/issues?issueId=${issueId}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (res?.success) onChanged();
    else showToast(res?.error || "Couldn't remove the work item.", "error");
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Work items</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={epicFilter}
            onChange={(e) => setEpicFilter(e.target.value)}
            className="h-8 px-2 text-xs border border-gray-300 rounded bg-white"
          >
            <option value="">Epic: all</option>
            {epics.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.key}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2 text-xs border border-gray-300 rounded bg-white"
          >
            <option value="">Status: all</option>
            <option value="DONE">Done</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="BACKLOG">To do</option>
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-8 px-2 text-xs border border-gray-300 rounded bg-white"
          >
            <option value="">Assignee: all</option>
            {assigneeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {canEdit && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
            >
              <Plus className="h-3.5 w-3.5" />
              Add work items
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className="qt-shimmer block h-6 rounded" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-gray-500">
          {items.length === 0 ? "No work items have been added yet." : "No work items match these filters."}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map((i) => {
            const T = TYPE_META[i.type] ?? TYPE_META.TASK;
            return (
              <div key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setEditingId(i.id)}
                  className="flex items-center gap-2 min-w-0 text-left"
                >
                  <T.Icon className={`h-3.5 w-3.5 shrink-0 ${T.color}`} />
                  <span className="text-xs text-gray-500 shrink-0">{i.key}</span>
                  <span className="text-sm text-gray-800 truncate hover:underline">{i.title}</span>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {i.status && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium text-gray-700 bg-gray-100">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.status.color ?? "#9ca3af" }} />
                      {i.status.name}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void removeItem(i.id)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600"
                      aria-label="Remove from release"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditIssueModal
        open={editingId !== null}
        issueId={editingId}
        projectId={projectId}
        onClose={() => setEditingId(null)}
        onSaved={() => void load()}
      />
      <AddWorkItemsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={projectId}
        releaseId={releaseId}
        excludeIds={items.map((i) => i.id)}
        onAdded={() => {
          void load();
          onChanged();
        }}
      />
    </div>
  );
}
