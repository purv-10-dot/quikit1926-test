"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TaskDueChip } from "@/components/tasks/task-due-chip";
import { TaskEditModal, type TaskFormSeed } from "@/components/tasks/task-edit-modal";
import { LeadEmptyState } from "@/components/leads/dashboard/empty-state";

interface TaskRow {
  id: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export function ContactTasksTab({
  contactId,
  contactName,
  ownerId,
}: {
  contactId: string;
  contactName: string;
  ownerId: string | null;
}) {
  const toast = useToast();
  const [items, setItems] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tasks?relatedKind=Contact&relatedObjectId=${encodeURIComponent(contactId)}&pageSize=100`,
        { credentials: "include" },
      );
      const j = await res.json();
      const rows = Array.isArray(j?.items) ? j.items : [];
      setItems(rows);
    } catch {
      toast.error("Failed to load tasks");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [contactId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const seed: TaskFormSeed = {
    subject: `Follow up with ${contactName}`,
    priority: "Medium",
    status: "Open",
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    relatedKind: "Contact",
    relatedObjectId: contactId,
    relatedLabel: contactName,
    assignedToUserId: ownerId,
  };

  if (loading) return <p className="py-8 text-center text-sm text-crm-muted">Loading…</p>;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} className="mr-1" /> Add task
        </Button>
      </div>
      {items.length === 0 ? (
        <LeadEmptyState
          icon={CheckSquare}
          title="No tasks"
          description="Create a follow-up task for this contact."
        />
      ) : (
        <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
          {items.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium text-crm-text">{t.subject}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-crm-muted">{t.status}</span>
                <TaskDueChip dueDate={t.dueDate} status={t.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <TaskEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          void refresh();
        }}
        seed={seed}
        locked={{ relatedKind: true }}
      />
    </div>
  );
}
