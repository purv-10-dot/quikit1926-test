"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { ActivityRow } from "@/lib/services/activities/to-list-row";

interface Props {
  open: boolean;
  row: ActivityRow | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function ActivityDetailModal({ open, row, canEdit, canDelete, onClose, onChanged }: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState("");
  const [detailNotes, setDetailNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");

  useEffect(() => {
    if (!row) return;
    setEditing(false);
    setType(row.type ?? "");
    setSubject(row.subject ?? "");
    setOutcome(row.outcome ?? "");
    setDetailNotes(row.detailNotes ?? "");
    setFollowUpAt(row.followUpAt ? row.followUpAt.slice(0, 16) : "");
  }, [row]);

  if (!row) return null;

  async function save() {
    if (!row) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/activities/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          subject,
          outcome,
          detailNotes,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to save");
        return;
      }
      toast.success("Saved");
      setEditing(false);
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (!row) return;
    if (!confirm("Delete this activity?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/activities/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to delete");
        return;
      }
      toast.success("Deleted");
      onChanged();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Activity" width="max-w-2xl">
      <div className="space-y-3">
        <Section label="Type">
          {editing ? (
            <Input value={type} onChange={(e) => setType(e.target.value)} />
          ) : (
            row.type
          )}
        </Section>
        <Section label="Related">
          {row.relatedKind} · {row.relatedLabel}
        </Section>
        <Section label="Owner">{row.owner || "—"}</Section>
        <Section label="When">{row.when || row.occurredAtIso}</Section>
        <Section label="Subject">
          {editing ? (
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          ) : (
            row.subject || "—"
          )}
        </Section>
        <Section label="Outcome">
          {editing ? (
            <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          ) : (
            row.outcome || "—"
          )}
        </Section>
        <Section label="Notes">
          {editing ? (
            <textarea
              className="crm-input h-24 w-full"
              value={detailNotes}
              onChange={(e) => setDetailNotes(e.target.value)}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-crm-text">
              {row.detailNotes || "—"}
            </pre>
          )}
        </Section>
        {(row.followUpAt || editing) && (
          <Section label="Follow up">
            {editing ? (
              <Input
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
              />
            ) : row.followUpAt ? (
              new Date(row.followUpAt).toLocaleString()
            ) : (
              "—"
            )}
          </Section>
        )}
        {row.outreach && (
          <Section label="Outreach">
            <div className="text-xs text-crm-muted">
              {row.outreach.channel} · {row.outreach.disposition} ·{" "}
              {row.outreach.subDisposition} · {row.outreach.subSubDisposition}
            </div>
          </Section>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {!editing && canEdit && (
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        {!editing && canDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={destroy}
            disabled={deleting}
            className="text-red-600 hover:bg-red-50"
          >
            Delete
          </Button>
        )}
        {editing && (
          <>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              Save
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-crm-muted">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
