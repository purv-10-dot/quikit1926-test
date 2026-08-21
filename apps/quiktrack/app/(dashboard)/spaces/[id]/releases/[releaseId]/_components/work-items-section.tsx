"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  Link2,
  Plus,
  X,
  MoreHorizontal,
  ChevronsUp,
  ChevronUp,
  Equal,
  ChevronDown,
  ChevronsDown,
  ChevronRight,
} from "lucide-react";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { showToast } from "@/lib/ui/toast";
import { PortalDropdown } from "../../_shared/portal-dropdown";
import { AddWorkItemsModal } from "./add-work-items-modal";

type IssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";
type Priority = "HIGHEST" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST";

interface WorkItem {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  priority: Priority;
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

const PRIORITY_META: Record<Priority, { label: string; color: string; Icon: React.ElementType }> = {
  HIGHEST: { label: "Highest", color: "text-red-600", Icon: ChevronsUp },
  HIGH: { label: "High", color: "text-red-500", Icon: ChevronUp },
  MEDIUM: { label: "Medium", color: "text-amber-500", Icon: Equal },
  LOW: { label: "Low", color: "text-blue-500", Icon: ChevronDown },
  LOWEST: { label: "Lowest", color: "text-blue-400", Icon: ChevronsDown },
};

function assigneeName(a: NonNullable<WorkItem["assignee"]>): string {
  return [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || a.email;
}
function assigneeInitials(a: NonNullable<WorkItem["assignee"]>): string {
  return ((a.firstName?.[0] ?? a.email[0] ?? "?") + (a.lastName?.[0] ?? "")).toUpperCase();
}

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
  const [sectionOpen, setSectionOpen] = useState(true);

  const [epicFilter, setEpicFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  // Display-information toggle ("..." menu) — which optional columns render
  // on each row. Status always shows; Priority/Assignee are opt-out.
  const [showPriority, setShowPriority] = useState(true);
  const [showAssignee, setShowAssignee] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

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
    // Optimistically drop the row so it disappears immediately, then confirm
    // with the server. `onChanged()` refreshes the parent's progress panel, but
    // it does NOT reload THIS section's local `items` list — so without the
    // optimistic update (or an explicit reload) the row stayed visible and the
    // remove looked broken.
    const prev = items;
    setItems((arr) => arr.filter((i) => i.id !== issueId));
    const res = await fetch(`/api/releases/${releaseId}/issues?issueId=${issueId}`, {
      method: "DELETE",
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.success) {
      onChanged();
      void load();
    } else {
      setItems(prev); // rollback
      showToast(res?.error || "Couldn't remove the work item.", "error");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSectionOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {sectionOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Work items
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-36">
            <PortalDropdown
              placeholder="Epic: all"
              options={[
                { value: "", label: "Epic: all" },
                ...epics.map((ep) => ({ value: ep.id, label: ep.key })),
              ]}
              selected={[epicFilter]}
              onChange={(next) => setEpicFilter(next[0] ?? "")}
            />
          </div>
          <div className="w-36">
            <PortalDropdown
              placeholder="Status: all"
              options={[
                { value: "", label: "Status: all" },
                { value: "DONE", label: "Done" },
                { value: "IN_PROGRESS", label: "In progress" },
                { value: "BACKLOG", label: "To do" },
              ]}
              selected={[statusFilter]}
              onChange={(next) => setStatusFilter(next[0] ?? "")}
            />
          </div>
          <div className="w-40">
            <PortalDropdown
              placeholder="Assignee: all"
              options={[
                { value: "", label: "Assignee: all" },
                ...assigneeOptions.map(([id, name]) => ({ value: id, label: name })),
              ]}
              selected={[assigneeFilter]}
              onChange={(next) => setAssigneeFilter(next[0] ?? "")}
            />
          </div>
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
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
              aria-label="Display options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-40 py-1">
                <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
                  Display information
                </div>
                <label className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPriority}
                    onChange={(e) => setShowPriority(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  Priority
                </label>
                <label className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAssignee}
                    onChange={(e) => setShowAssignee(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  Assignee
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {sectionOpen &&
        (loading ? (
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
              const P = PRIORITY_META[i.priority] ?? PRIORITY_META.MEDIUM;
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
                    {showPriority && (
                      <P.Icon className={`h-3.5 w-3.5 ${P.color}`} aria-label={P.label} />
                    )}
                    {i.status && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium text-gray-700 bg-gray-100">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.status.color ?? "#9ca3af" }} />
                        {i.status.name}
                      </span>
                    )}
                    {showAssignee &&
                      (i.assignee ? (
                        <span
                          title={assigneeName(i.assignee)}
                          className="h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center"
                        >
                          {assigneeInitials(i.assignee)}
                        </span>
                      ) : (
                        <span
                          title="Unassigned"
                          className="h-6 w-6 rounded-full bg-gray-100 border border-dashed border-gray-300"
                        />
                      ))}
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
        ))}

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
