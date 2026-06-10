"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Plus } from "lucide-react";
import { LeadEmptyState } from "@/components/leads/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TaskDueChip } from "@/components/tasks/task-due-chip";
import { TaskEditModal, type TaskFormSeed } from "@/components/tasks/task-edit-modal";

interface TaskRow {
  id: string;
  subject: string;
  taskType: string | null;
  priority: "Low" | "Medium" | "High";
  status: "Open" | "InProgress" | "Completed" | "Cancelled";
  dueDate: string | null;
  assignedToUserId: string | null;
  relatedKind: string | null;
  relatedObjectId: string | null;
  leadId: string | null;
}

interface AssigneeOption {
  id: string;
  name: string;
}

type Pill = "Open" | "Completed" | "All";

interface Props {
  leadId: string;
  leadName: string;
  leadOwnerId: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  Open: "Open",
  InProgress: "In Progress",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

export function LeadTasksTab({ leadId, leadName, leadOwnerId }: Props) {
  const toast = useToast();
  const [pill, setPill] = useState<Pill>("Open");
  const [items, setItems] = useState<TaskRow[]>([]);
  const [counts, setCounts] = useState<{ Open: number; Completed: number; All: number }>({
    Open: 0,
    Completed: 0,
    All: 0,
  });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormSeed | null>(null);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Fan out: pill view + per-pill counts. The leadId param maps to both
      // leadId and (relatedKind=Lead, relatedObjectId=leadId) on the server,
      // so we don't have to send both.
      // `limit` (max 500) — not `pageSize=200`, which fails list validation (allow-list: 10/25/50/100).
      const [openR, completedR, allR] = await Promise.all([
        fetch(`/api/tasks?leadId=${encodeURIComponent(leadId)}&status=Open&limit=200`, {
          credentials: "include",
        }),
        fetch(`/api/tasks?leadId=${encodeURIComponent(leadId)}&status=Completed&limit=200`, {
          credentials: "include",
        }),
        fetch(`/api/tasks?leadId=${encodeURIComponent(leadId)}&limit=200`, { credentials: "include" }),
      ]);
      const [openJ, completedJ, allJ] = await Promise.all([openR.json(), completedR.json(), allR.json()]);
      if (!openR.ok || !completedR.ok || !allR.ok) {
        const err = openJ.error ?? completedJ.error ?? allJ.error ?? "Failed to load tasks";
        throw new Error(typeof err === "string" ? err : "Failed to load tasks");
      }
      setCounts({
        Open: openJ.total ?? (openJ.items?.length ?? 0),
        Completed: completedJ.total ?? (completedJ.items?.length ?? 0),
        All: allJ.total ?? (allJ.items?.length ?? 0),
      });
      const chosen = pill === "Open" ? openJ : pill === "Completed" ? completedJ : allJ;
      setItems(Array.isArray(chosen.items) ? chosen.items : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [leadId, pill, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Lazy-load assignees the first time the modal opens — avoids a blocking
  // /api/users/picker fetch for users who never click +New task.
  async function ensureAssignees() {
    if (assignees.length > 0) return;
    try {
      const res = await fetch("/api/users/picker", { credentials: "include" });
      const json = await res.json();
      setAssignees(Array.isArray(json.items) ? json.items : []);
    } catch {
      // Non-fatal; modal still works with a free-text Unassigned default.
    }
  }

  function openCreate() {
    void ensureAssignees();
    setEditing({
      priority: "Medium",
      status: "Open",
      relatedKind: "Lead",
      relatedObjectId: leadId,
      relatedLabel: leadName,
      leadId,
      assignedToUserId: leadOwnerId,
    });
    setModalOpen(true);
  }
  function openEdit(t: TaskRow) {
    void ensureAssignees();
    setEditing({
      id: t.id,
      subject: t.subject,
      taskType: t.taskType,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      assignedToUserId: t.assignedToUserId,
      relatedKind: (t.relatedKind as TaskFormSeed["relatedKind"]) ?? "Lead",
      relatedObjectId: t.relatedObjectId ?? leadId,
      relatedLabel: leadName,
      leadId: t.leadId ?? leadId,
    });
    setModalOpen(true);
  }

  const PILLS: { key: Pill; label: string }[] = useMemo(
    () => [
      { key: "Open", label: `Open · ${counts.Open}` },
      { key: "Completed", label: `Completed · ${counts.Completed}` },
      { key: "All", label: `All · ${counts.All}` },
    ],
    [counts],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-crm-border bg-white p-1">
          {PILLS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPill(p.key)}
              className={
                "rounded-md px-3 py-1 text-xs transition " +
                (pill === p.key
                  ? "bg-crm-blue text-white"
                  : "text-crm-text hover:bg-slate-100")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={openCreate}>
          <Plus size={14} /> New task
        </Button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-crm-muted">Loading…</p>
      ) : items.length === 0 ? (
        <LeadEmptyState
          icon={CheckSquare}
          title="No tasks scheduled yet"
          description="Create follow-ups and reminders so nothing slips through the cracks."
          actionLabel="Create task"
          onAction={openCreate}
        />
      ) : (
        <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => openEdit(t)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-crm-text">{t.subject}</div>
                <div className="text-xs text-crm-muted">
                  {t.priority} · {STATUS_LABEL[t.status] ?? t.status}
                </div>
              </div>
              <TaskDueChip dueDate={t.dueDate} status={t.status} />
            </li>
          ))}
        </ul>
      )}

      <TaskEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
        seed={editing}
        assigneeOptions={assignees}
        locked={{ relatedKind: true, leadId: true }}
      />
    </div>
  );
}
