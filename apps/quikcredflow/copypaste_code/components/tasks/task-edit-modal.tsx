"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormActions } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  RelatedEntityPicker,
  type RelatedKind,
} from "@/components/tasks/related-entity-picker";

export interface TaskFormSeed {
  id?: string;
  subject?: string;
  taskType?: string | null;
  priority?: "Low" | "Medium" | "High";
  status?: "Open" | "InProgress" | "Completed" | "Cancelled";
  dueDate?: string | null; // ISO
  assignedToUserId?: string | null;
  relatedKind?: RelatedKind | null;
  relatedObjectId?: string | null;
  relatedLabel?: string | null;
  leadId?: string | null;
}

interface AssigneeOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  seed?: TaskFormSeed | null;
  /** Locked relations (e.g. when opened from a Lead detail page). */
  locked?: { relatedKind?: boolean; leadId?: boolean };
  assigneeOptions?: AssigneeOption[];
}

const STATUSES = ["Open", "InProgress", "Completed", "Cancelled"] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  Open: "Open",
  InProgress: "In Progress",
  Completed: "Completed",
  Cancelled: "Cancelled",
};
// "Waiting" is in the spec but the CrmTaskStatus enum hasn't been extended
// yet. Re-add to STATUSES once the schema migration lands.

/**
 * Convert a server ISO string into the value an <input type="datetime-local">
 * can render. The native input expects "YYYY-MM-DDTHH:mm" in **local** time
 * (no timezone suffix); using toISOString() here would silently convert to
 * UTC and confuse users in non-UTC zones.
 */
function isoToLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskEditModal({ open, onClose, onSaved, seed, locked, assigneeOptions = [] }: Props) {
  const toast = useToast();
  const isEdit = !!seed?.id;

  const [subject, setSubject] = useState("");
  const [taskType, setTaskType] = useState("");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Open");
  const [dueDate, setDueDate] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  const [relatedKind, setRelatedKind] = useState<RelatedKind | null>(null);
  const [relatedObjectId, setRelatedObjectId] = useState<string | null>(null);
  const [relatedLabel, setRelatedLabel] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject(seed?.subject ?? "");
    setTaskType(seed?.taskType ?? "");
    setPriority(seed?.priority ?? "Medium");
    setStatus(seed?.status ?? "Open");
    setDueDate(isoToLocalDateTime(seed?.dueDate ?? null));
    setAssignedToUserId(seed?.assignedToUserId ?? "");
    setRelatedKind(seed?.relatedKind ?? null);
    setRelatedObjectId(seed?.relatedObjectId ?? null);
    setRelatedLabel(seed?.relatedLabel ?? null);
    setCancellationReason("");
  }, [open, seed]);

  const requiresCancelReason = status === "Cancelled";
  const canSave = useMemo(() => {
    if (!subject.trim()) return false;
    if (requiresCancelReason && !cancellationReason.trim()) return false;
    return true;
  }, [subject, requiresCancelReason, cancellationReason]);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // datetime-local emits "YYYY-MM-DDTHH:mm" in local time. new Date()
      // interprets that as local, .toISOString() converts to UTC for storage.
      const dueIso = dueDate ? new Date(dueDate).toISOString() : null;
      const body = {
        subject: subject.trim(),
        taskType: taskType.trim() || null,
        priority,
        status,
        dueDate: dueIso,
        assignedToUserId: assignedToUserId || null,
        relatedKind: relatedKind ?? null,
        relatedObjectId: relatedObjectId ?? null,
        leadId:
          seed?.leadId ??
          (relatedKind === "Lead" ? relatedObjectId : null),
        cancellationReason: requiresCancelReason ? cancellationReason.trim() : null,
      };
      const url = isEdit ? `/api/tasks/${seed!.id}` : "/api/tasks";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      toast.success(isEdit ? "Task updated" : "Task created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit task" : "New task"} width="max-w-2xl">
      <div className="space-y-4 md:space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-crm-muted">Subject</label>
          <Input
            placeholder="What needs doing?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            autoFocus
          />
        </div>

        {/* Type / Priority / Status — 1col mobile → 2col tablet → 3col desktop */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-crm-muted">Type</label>
            <Input
              placeholder="e.g. Call, Meeting"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-crm-muted">Priority</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              {(["Low", "Medium", "High"] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2 md:col-span-1">
            <label className="mb-1 block text-xs font-medium text-crm-muted">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-crm-muted">Due (local time)</label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-crm-muted">Stored as UTC; rendered in your timezone.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-crm-muted">Assignee</label>
            <Select
              value={assignedToUserId}
              onChange={(e) => setAssignedToUserId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {!locked?.relatedKind && (
          <div>
            <label className="mb-1 block text-xs font-medium text-crm-muted">Related to</label>
            <RelatedEntityPicker
              kind={relatedKind}
              objectId={relatedObjectId}
              initialLabel={relatedLabel ?? undefined}
              onChange={({ kind, objectId, label }) => {
                setRelatedKind(kind);
                setRelatedObjectId(objectId);
                setRelatedLabel(label);
              }}
            />
          </div>
        )}
        {locked?.relatedKind && relatedLabel && (
          <p className="text-xs text-crm-muted">
            Linked to <span className="font-medium text-crm-text">{relatedKind}: {relatedLabel}</span>
          </p>
        )}

        {requiresCancelReason && (
          <div>
            <label className="mb-1 block text-xs font-medium text-crm-muted">
              Cancellation reason <span className="text-red-600">*</span>
            </label>
            <textarea
              className="crm-input min-h-20 w-full"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Why is this task being cancelled?"
            />
          </div>
        )}
      </div>

      <FormActions className="mt-5">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!canSave || saving}>
          {saving ? "Saving…" : isEdit ? "Save" : "Create"}
        </Button>
      </FormActions>
    </Modal>
  );
}
