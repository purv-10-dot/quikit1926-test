"use client";

/**
 * ContactDetailView — interactive shell for /contacts/[id].
 * Header with actions (Edit, Task, Create Opportunity), details card,
 * and activity timeline. Edit uses the shared ContactModal + ContactForm.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Pencil, User } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactActivityTimeline } from "@/components/contacts/contact-activity-timeline";
import {
  ContactModal,
  type ContactRow,
} from "@/components/contacts/contact-modal";
import { ContactDetailActions } from "@/components/contacts/contact-detail-actions";
import { TaskEditModal, type TaskFormSeed } from "@/components/tasks/task-edit-modal";
import { useToast } from "@/hooks/use-toast";
import { handleApiFormError } from "@/lib/forms/handle-api-form-error";
import type {
  ContactFormServerError,
  ContactFormValue,
} from "@/components/contacts/contact-form";

export interface ContactDetailDto {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  accountId: string | null;
  accountName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  leadId: string | null;
  leadName: string | null;
  city: string | null;
  contactStage: string | null;
  source: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PickerOption {
  id: string;
  label: string;
}

interface AssigneeOption {
  id: string;
  name: string;
}

interface Props {
  contact: ContactDetailDto;
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canLogActivity: boolean;
    canViewLeads: boolean;
  };
}

function toContactRow(c: ContactDetailDto): ContactRow {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    title: c.title,
    accountId: c.accountId,
    ownerId: c.ownerId,
    ownerName: c.ownerName,
    leadId: c.leadId,
    city: c.city,
    contactStage: c.contactStage,
    source: c.source,
    accountName: c.accountName,
    deletedAt: c.deletedAt,
  };
}

function formContactToBody(value: ContactFormValue): Record<string, unknown> {
  const out: Record<string, unknown> = {
    firstName: value.firstName,
    lastName: value.lastName,
  };
  if (value.email) out.email = value.email;
  if (value.phone) out.phone = value.phone;
  if (value.title) out.title = value.title;
  if (value.accountId) out.accountId = value.accountId;
  if (value.ownerId) out.ownerId = value.ownerId;
  if (value.leadId) out.leadId = value.leadId;
  if (value.city) out.city = value.city;
  if (value.contactStage) out.contactStage = value.contactStage;
  if (value.source) out.source = value.source;
  return out;
}

export function ContactDetailView({ contact: initial, permissions }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [contact, setContact] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskSeed, setTaskSeed] = useState<TaskFormSeed | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<ContactFormServerError | undefined>();
  const [accountOptions, setAccountOptions] = useState<PickerOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<PickerOption[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const [leadOptions, setLeadOptions] = useState<PickerOption[]>([]);
  const [pickersLoading, setPickersLoading] = useState(false);

  const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
  const isTrashed = Boolean(contact.deletedAt);

  useEffect(() => {
    setContact(initial);
  }, [initial]);

  useEffect(() => {
    void fetch("/api/users/picker", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: { id: string; name: string }[]; data?: { items?: { id: string; name: string }[] } } | null) => {
        const list = j?.data?.items ?? j?.items;
        if (!list?.length) return;
        setAssigneeOptions(list);
        setOwnerOptions(list.map((u) => ({ id: u.id, label: u.name })));
      })
      .catch(() => {
        /* best-effort */
      });
  }, []);

  const loadPickers = useCallback(async () => {
    if (accountOptions.length > 0 && ownerOptions.length > 0) return;
    setPickersLoading(true);
    try {
      const [accRes, userRes, leadRes] = await Promise.all([
        fetch("/api/accounts/picker?limit=100", { credentials: "include" }),
        fetch("/api/users/picker", { credentials: "include" }),
        fetch("/api/leads/picker?limit=100", { credentials: "include" }),
      ]);
      if (accRes.ok) {
        const body = await accRes.json();
        const items: { id: string; name: string }[] = body?.data?.items ?? [];
        setAccountOptions(items.map((a) => ({ id: a.id, label: a.name })));
      }
      if (userRes.ok) {
        const body = await userRes.json();
        const items: { id: string; name: string }[] = body?.items ?? body?.data?.items ?? [];
        setAssigneeOptions(items);
        setOwnerOptions(items.map((u) => ({ id: u.id, label: u.name })));
      }
      if (leadRes.ok) {
        const body = await leadRes.json();
        const items: { id: string; name: string; company: string | null }[] =
          body?.data?.items ?? [];
        setLeadOptions(
          items.map((l) => ({
            id: l.id,
            label: l.company ? `${l.name} — ${l.company}` : l.name,
          })),
        );
      }
    } catch {
      /* pickers are best-effort */
    } finally {
      setPickersLoading(false);
    }
  }, [accountOptions.length, ownerOptions.length]);

  function openEdit() {
    if (!permissions.canEdit || isTrashed) return;
    setServerError(undefined);
    void loadPickers();
    setEditOpen(true);
  }

  function openTaskModal() {
    if (isTrashed) return;
    setTaskSeed({
      subject: `Follow up with ${fullName}`,
      priority: "Medium",
      status: "Open",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      relatedKind: "Contact",
      relatedObjectId: contact.id,
      relatedLabel: fullName,
      assignedToUserId: contact.ownerId,
    });
    setTaskModalOpen(true);
  }

  async function submitEdit(value: ContactFormValue) {
    setSaving(true);
    setServerError(undefined);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(formContactToBody(value)),
      });
      if (!res.ok) {
        const parsed = await handleApiFormError(res);
        setServerError({
          formError: parsed.formError,
          fieldErrors: parsed.fieldErrors,
          existingId: parsed.existingId,
        });
        return;
      }
      const body = (await res.json()) as { success: true; data: ContactRow };
      const updated = body.data;
      setContact((prev) => ({
        ...prev,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        title: updated.title,
        accountId: updated.accountId,
        accountName: updated.accountName ?? null,
        ownerId: updated.ownerId,
        ownerName: updated.ownerName,
        leadId: updated.leadId,
        city: updated.city,
        contactStage: updated.contactStage,
        source: updated.source,
      }));
      toast.success("Contact saved");
      setEditOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const parsed = await handleApiFormError(res);
        toast.error(parsed.formError ?? "Failed to delete");
        return;
      }
      toast.success("Contact moved to Trash");
      setEditOpen(false);
      router.push("/contacts");
    } finally {
      setDeleting(false);
    }
  }

  async function restoreContact() {
    try {
      const res = await fetch(`/api/contacts/${contact.id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Restore failed");
      }
      toast.success("Contact restored");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/contacts" className="text-sm text-crm-blue hover:underline">
        ← All contacts
      </Link>

      {isTrashed && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">This contact is in Trash.</p>
          <p className="mt-1 text-amber-800/90">
            Restore it to edit details or log new activities.
          </p>
          {permissions.canDelete && (
            <button
              type="button"
              className="mt-2 rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-crm-blue hover:bg-amber-100"
              onClick={() => void restoreContact()}
            >
              Restore contact
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-crm-border pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-crm-border bg-crm-panel text-crm-blue">
            <User className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-crm-text">{fullName}</h1>
            <p className="mt-0.5 text-sm text-crm-muted">
              {[contact.title, contact.contactStage, contact.ownerName && `Owner ${contact.ownerName}`]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            {(contact.email || contact.phone) && (
              <p className="mt-1 text-sm text-crm-muted">
                {contact.email}
                {contact.email && contact.phone ? " · " : ""}
                {contact.phone}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="crm-btn-secondary inline-flex items-center gap-1.5"
            disabled={!permissions.canEdit || isTrashed}
            title={
              isTrashed
                ? "Restore the contact before editing"
                : !permissions.canEdit
                  ? "You don't have permission to edit contacts"
                  : undefined
            }
            onClick={openEdit}
          >
            <Pencil className="h-4 w-4" /> Edit contact
          </button>
          <button
            type="button"
            className="crm-btn-secondary inline-flex items-center gap-1.5"
            disabled={isTrashed}
            onClick={openTaskModal}
          >
            <ClipboardList className="h-4 w-4" /> Task
          </button>
          <ContactDetailActions
            contactId={contact.id}
            contactFullName={fullName}
            accountId={contact.accountId}
            accountName={contact.accountName}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <DetailItem label="Email" value={contact.email} />
            <DetailItem label="Phone" value={contact.phone} />
            <DetailItem label="Title" value={contact.title} />
            <DetailItem label="City" value={contact.city} />
            <DetailItem label="Stage" value={contact.contactStage} />
            <DetailItem label="Source" value={contact.source} />
            <DetailItem
              label="Account"
              value={
                contact.accountId && contact.accountName ? (
                  <Link
                    href={`/accounts/${contact.accountId}`}
                    className="text-crm-blue hover:underline"
                  >
                    {contact.accountName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <DetailItem
              label="Lead"
              value={
                contact.leadId && contact.leadName ? (
                  <Link href={`/leads/${contact.leadId}`} className="text-crm-blue hover:underline">
                    {contact.leadName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <DetailItem label="Owner" value={contact.ownerName} />
            <DetailItem
              label="Created"
              value={new Date(contact.createdAt).toLocaleString()}
            />
            <DetailItem
              label="Updated"
              value={new Date(contact.updatedAt).toLocaleString()}
            />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardBody>
          <ContactActivityTimeline
            contactId={contact.id}
            contactName={fullName}
            leadId={contact.leadId}
            leadName={contact.leadName}
            canLogActivity={permissions.canLogActivity && !isTrashed}
            canViewLeads={permissions.canViewLeads}
          />
        </CardBody>
      </Card>

      <ContactModal
        open={editOpen}
        mode="edit"
        contact={toContactRow(contact)}
        canEdit={permissions.canEdit}
        canDelete={permissions.canDelete}
        saving={saving}
        deleting={deleting}
        serverError={serverError}
        accountOptions={accountOptions}
        ownerOptions={ownerOptions}
        leadOptions={leadOptions}
        pickersLoading={pickersLoading}
        onClose={() => setEditOpen(false)}
        onSubmit={(v) => void submitEdit(v)}
        onDelete={permissions.canDelete ? submitDelete : undefined}
      />

      <TaskEditModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onSaved={() => setTaskModalOpen(false)}
        seed={taskSeed}
        assigneeOptions={assigneeOptions}
        locked={{ relatedKind: true }}
      />
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-crm-muted">{label}</dt>
      <dd className="mt-0.5 text-crm-text">{value ?? "—"}</dd>
    </div>
  );
}