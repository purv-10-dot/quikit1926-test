"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  FileText,
  Hash,
  History,
  Link2,
  Mail,
  Phone,
  User,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/utils/date-helpers";
import type { ActivityRow } from "@/lib/services/activities/to-list-row";

interface Props {
  open: boolean;
  row: ActivityRow | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}

// Per-record-type badge tokens — mirrors KIND_BADGE in activities-list-client so
// the modal's "Related Record" badge matches the table. Hardcoded (not accent-*)
// because these encode record type, not brand — see CLAUDE.md accent rules.
const KIND_BADGE: Record<string, string> = {
  Lead: "bg-blue-50 text-blue-700 ring-blue-200",
  Account: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Contact: "bg-violet-50 text-violet-700 ring-violet-200",
  Opportunity: "bg-amber-50 text-amber-800 ring-amber-200",
};
const KIND_BADGE_FALLBACK = "bg-slate-50 text-slate-600 ring-slate-200";

// Icon + tint for the activity type chip in the header. Reuses the same
// type→icon/colour language as the activity timeline for visual consistency.
function typeVisual(type: string) {
  const t = type.toLowerCase();
  if (t.includes("call")) return { Icon: Phone, tint: "text-emerald-600 bg-emerald-50" };
  if (t.includes("email") || t.includes("mail"))
    return { Icon: Mail, tint: "text-violet-600 bg-violet-50" };
  if (t.includes("meeting")) return { Icon: Calendar, tint: "text-blue-600 bg-blue-50" };
  if (t.includes("stage") || t.includes("disposition"))
    return { Icon: History, tint: "text-blue-600 bg-blue-50" };
  return { Icon: FileText, tint: "text-slate-600 bg-slate-100" };
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

  const { Icon: TypeIcon, tint } = typeVisual(row.type);
  const isStandalone =
    row.relatedKind === "None" || !row.relatedLabel || row.relatedLabel === "—";
  const kindBadge = KIND_BADGE[row.relatedKind] ?? KIND_BADGE_FALLBACK;

  // The activity's headline: subject → outcome → notes → type, matching the
  // list's precedence so the modal title agrees with the row a user clicked.
  const headline =
    row.subject.trim() || row.outcome.trim() || row.detailNotes.trim() || row.type;

  const footer = (
    <div className="flex flex-wrap items-center gap-2">
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
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      )}
      <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
        Close
      </Button>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Activity 360 View" width="max-w-3xl" footer={footer}>
      <div className="space-y-5">
        {/* ── Header: type chip, headline, related-record badge ────────────── */}
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tint}`}
          >
            <TypeIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {row.type}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                  isStandalone ? KIND_BADGE_FALLBACK : kindBadge
                }`}
              >
                {isStandalone ? "Standalone" : row.relatedKind}
              </span>
              {row.relatedOrphanedAt && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                  Record deleted
                </span>
              )}
            </div>
            <h3 className="mt-1 break-words text-lg font-semibold leading-snug text-crm-text">
              {headline}
            </h3>
            <div className="mt-0.5 text-xs text-crm-muted">
              {row.owner || "Unknown owner"} · {row.when || formatDateTime(row.occurredAtIso)}
            </div>
          </div>
        </div>

        {/* ── Activity Summary — what happened ─────────────────────────────── */}
        <Card title="Activity Summary" icon={FileText}>
          <Field label="Type">
            {editing ? (
              <Input value={type} onChange={(e) => setType(e.target.value)} />
            ) : (
              <span className="text-sm text-crm-text">{row.type}</span>
            )}
          </Field>
          <Field label="Subject">
            {editing ? (
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            ) : (
              <span className="text-sm text-crm-text">{row.subject || "—"}</span>
            )}
          </Field>
          <Field label="Outcome">
            {editing ? (
              <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} />
            ) : (
              <span className="text-sm text-crm-text">{row.outcome || "—"}</span>
            )}
          </Field>
          <Field label="Notes" full>
            {editing ? (
              <textarea
                className="crm-input h-24 w-full"
                value={detailNotes}
                onChange={(e) => setDetailNotes(e.target.value)}
              />
            ) : row.detailNotes ? (
              <pre className="whitespace-pre-wrap rounded-md bg-crm-panel px-3 py-2 font-sans text-sm text-crm-text">
                {row.detailNotes}
              </pre>
            ) : (
              <span className="text-sm text-crm-muted">—</span>
            )}
          </Field>
        </Card>

        {/* ── Ownership & Audit — who did it / provenance ──────────────────── */}
        <Card title="Ownership & Audit" icon={User}>
          <Field label="Owner">
            <span className="text-sm text-crm-text">{row.owner || "—"}</span>
          </Field>
          <Field label="Source">
            <span className="text-sm text-crm-text">
              {row.sourceSystem ? row.sourceSystem : "Logged in CRM"}
            </span>
          </Field>
          {row.externalId && (
            <Field label="External ID">
              <span className="break-all font-mono text-xs text-crm-text">{row.externalId}</span>
            </Field>
          )}
          <Field label="Activity ID">
            <span className="break-all font-mono text-xs text-crm-muted">{row.id}</span>
          </Field>
        </Card>

        {/* ── Related Record — what it belongs to ──────────────────────────── */}
        <Card title="Related Record" icon={Link2}>
          {isStandalone ? (
            <Field label="Linked to" full>
              <span className="text-sm text-crm-muted">
                Standalone activity — not linked to a record.
              </span>
            </Field>
          ) : (
            <>
              <Field label="Type">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${kindBadge}`}
                >
                  {row.relatedKind}
                </span>
              </Field>
              <Field label="Record">
                <span className="text-sm font-medium text-crm-text">{row.relatedLabel}</span>
              </Field>
            </>
          )}
          {row.relatedOrphanedAt && (
            <Field label="Status" full>
              <span className="text-sm text-amber-800">
                The linked record was deleted on {formatDateTime(row.relatedOrphanedAt)}. This
                activity is kept for the audit trail.
              </span>
            </Field>
          )}
        </Card>

        {/* ── Timeline Information — when it happened ──────────────────────── */}
        <Card title="Timeline Information" icon={Clock}>
          <Field label="Occurred at">
            <span className="text-sm text-crm-text">
              {row.when || formatDateTime(row.occurredAtIso)}
            </span>
          </Field>
          <Field label="Follow up">
            {editing ? (
              <Input
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
              />
            ) : row.followUpAt ? (
              <span className="text-sm text-amber-700">{formatDateTime(row.followUpAt)}</span>
            ) : (
              <span className="text-sm text-crm-muted">—</span>
            )}
          </Field>
          <Field label="Recorded">
            <span className="text-sm text-crm-text">{formatDateTime(row.createdAtIso)}</span>
          </Field>
          <Field label="Last updated">
            <span className="text-sm text-crm-text">{formatDateTime(row.updatedAtIso)}</span>
          </Field>
        </Card>

        {/* ── Activity Specific Details — what changed / channel data ──────── */}
        <SpecificDetails row={row} />
      </div>
    </Modal>
  );
}

// The "what changed" section. Renders whichever structured metadata the activity
// carries: SMB outreach (call/email disposition chain) or a lead-log entry
// (activity code + outcome). Falls back to a neutral note when neither exists so
// the section header still answers the "what changed" question honestly.
function SpecificDetails({ row }: { row: ActivityRow }) {
  const o = row.outreach;
  const l = row.leadLog;

  const hasOutreach =
    o &&
    (o.channel ||
      o.disposition ||
      o.subDisposition ||
      o.subSubDisposition ||
      o.competitor ||
      o.competitorDetails ||
      o.country ||
      o.followupPriority ||
      o.currentSystemDetails);

  const hasLeadLog = l && (l.activityCode || l.logOutcome || l.opportunityId);

  return (
    <Card title="Activity Specific Details" icon={Hash}>
      {hasOutreach ? (
        <>
          {o!.channel && (
            <Field label="Channel">
              <span className="text-sm text-crm-text">{o!.channel}</span>
            </Field>
          )}
          {o!.disposition && (
            <Field label="Disposition" full>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-crm-text">
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                  {o!.disposition}
                </span>
                {o!.subDisposition && (
                  <>
                    <span className="text-crm-muted">›</span>
                    <span className="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                      {o!.subDisposition}
                    </span>
                  </>
                )}
                {o!.subSubDisposition && (
                  <>
                    <span className="text-crm-muted">›</span>
                    <span className="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                      {o!.subSubDisposition}
                    </span>
                  </>
                )}
              </div>
            </Field>
          )}
          {o!.followupPriority && (
            <Field label="Follow-up priority">
              <span className="text-sm text-crm-text">{o!.followupPriority}</span>
            </Field>
          )}
          {o!.country && (
            <Field label="Country">
              <span className="text-sm text-crm-text">{o!.country}</span>
            </Field>
          )}
          {o!.competitor && (
            <Field label="Competitor">
              <span className="text-sm text-crm-text">{o!.competitor}</span>
            </Field>
          )}
          {o!.competitorDetails && (
            <Field label="Competitor details" full>
              <span className="text-sm text-crm-text">{o!.competitorDetails}</span>
            </Field>
          )}
          {o!.currentSystemDetails && (
            <Field label="Current system" full>
              <span className="text-sm text-crm-text">{o!.currentSystemDetails}</span>
            </Field>
          )}
        </>
      ) : hasLeadLog ? (
        <>
          {l!.activityCode && (
            <Field label="Activity code">
              <span className="text-sm text-crm-text">{l!.activityCode}</span>
            </Field>
          )}
          {l!.logOutcome && (
            <Field label="Log outcome">
              <span className="text-sm text-crm-text">{l!.logOutcome}</span>
            </Field>
          )}
          {l!.opportunityId && (
            <Field label="Opportunity">
              <span className="break-all font-mono text-xs text-crm-text">{l!.opportunityId}</span>
            </Field>
          )}
        </>
      ) : (
        <Field label="Details" full>
          <span className="text-sm text-crm-muted">
            No channel-specific details recorded for this activity.
          </span>
        </Field>
      )}
      {row.linkedCallLogId && (
        <Field label="Linked call log">
          <span className="break-all font-mono text-xs text-crm-text">{row.linkedCallLogId}</span>
        </Field>
      )}
    </Card>
  );
}

// A titled section card. The two-column grid inside keeps label/value pairs
// scannable; `Field full` spans both columns for wide content (notes, chains).
function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-crm-border bg-white">
      <div className="flex items-center gap-2 border-b border-crm-border px-4 py-2.5">
        <Icon size={14} className="text-crm-muted" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-crm-muted">{title}</h4>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-crm-muted">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
