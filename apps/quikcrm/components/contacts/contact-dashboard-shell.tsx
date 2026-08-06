"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Command } from "lucide-react";
import {
  LeadCommandPalette,
  useCommandPaletteShortcut,
} from "@/components/leads/dashboard/command-palette";
import { buildContactCommandActions } from "@/lib/contacts/build-contact-command-actions";
import { ContactDashboardHeader } from "@/components/contacts/contact-dashboard-header";
import { ContactDashboardMetrics } from "@/components/contacts/contact-dashboard-metrics";
import { ContactDetailTabs, type TabKey } from "@/components/contacts/contact-detail-tabs";
import { ContactQuickActionsPanel } from "@/components/contacts/contact-quick-actions-panel";
import {
  ContactModal,
  type ContactRow,
} from "@/components/contacts/contact-modal";
import type { ContactFormValue } from "@/components/contacts/contact-form";
import { TaskEditModal, type TaskFormSeed } from "@/components/tasks/task-edit-modal";
import {
  CreateOpportunityModal,
  type CreateOpportunityResult,
} from "@/components/opportunities/create-opportunity-modal";
import { useToast } from "@/hooks/use-toast";
import { handleApiFormError } from "@/lib/forms/handle-api-form-error";
import type { ContactFormServerError } from "@/components/contacts/contact-form";
import type { Contact360Row } from "@/lib/services/contacts/full-record";
import type { ContactDashboardSnapshot } from "@/lib/services/contacts/dashboard-snapshot";
import type { UnifiedTimelineSeed } from "@/components/leads/dashboard/unified-timeline";
import type {
  ContactOverviewActivity,
  ContactOverviewNote,
  ContactOverviewOpportunity,
  ContactOverviewTask,
} from "@/components/contacts/contact-dashboard-overview";
import type { ContactNoteRow } from "@/components/contacts/contact-notes-tab";

export interface Contact360Permissions {
  contactsEdit: boolean;
  contactsDelete: boolean;
  activitiesCreate: boolean;
  opportunitiesCreate: boolean;
  canViewLeads: boolean;
}

function toContactRow(c: Contact360Row): ContactRow {
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

export interface ContactDashboardShellProps {
  contact: Contact360Row;
  account: { id: string; name: string } | null;
  lead: { id: string; name: string; company: string | null } | null;
  snapshot: ContactDashboardSnapshot;
  timelineSeed: UnifiedTimelineSeed;
  overview: {
    activities: ContactOverviewActivity[];
    tasks: ContactOverviewTask[];
    notes: ContactOverviewNote[];
    opportunities: ContactOverviewOpportunity[];
  };
  initialNotes: ContactNoteRow[];
  permissions: Contact360Permissions;
}

export function ContactDashboardShell(props: ContactDashboardShellProps) {
  const {
    contact: initialContact,
    account,
    lead,
    snapshot,
    timelineSeed,
    overview,
    initialNotes,
    permissions,
  } = props;

  const router = useRouter();
  const toast = useToast();
  const [contact, setContact] = useState(initialContact);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<ContactFormServerError | undefined>();
  const [accountOptions, setAccountOptions] = useState<{ id: string; label: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<{ id: string; label: string }[]>([]);
  const [leadOptions, setLeadOptions] = useState<{ id: string; label: string }[]>([]);
  const [pickersLoading, setPickersLoading] = useState(false);

  useCommandPaletteShortcut(() => setCmdOpen(true));

  const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();

  // Log activity is now a dedicated page (/activities/log). Navigate there with
  // the contact pre-linked instead of opening a modal.
  const goLogActivity = useCallback(() => {
    const qs = new URLSearchParams({
      relatedKind: "Contact",
      relatedObjectId: contact.id,
      label: fullName,
    });
    router.push(`/activities/log?${qs.toString()}`);
  }, [router, contact.id, fullName]);
  const isDeleted = Boolean(contact.deletedAt);
  const linkedAccount = Boolean(account?.id && account?.name);

  const loadPickers = useCallback(async () => {
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
    } finally {
      setPickersLoading(false);
    }
  }, []);

  const commandActions = useMemo(
    () =>
      buildContactCommandActions({
        onNavigateTab: setActiveTab,
        onClose: () => setCmdOpen(false),
        onEdit: () => {
          setServerError(undefined);
          void loadPickers();
          setEditOpen(true);
        },
        onTask: () => setTaskOpen(true),
        onLogActivity: goLogActivity,
        onAddNote: () => {
          setActiveTab("notes");
          window.setTimeout(() => document.getElementById("contact-note")?.focus(), 120);
        },
        onNewOpportunity: () => setOppOpen(true),
        onCopyEmail: () => {
          if (!contact.email) return;
          void navigator.clipboard.writeText(contact.email).then(
            () => toast.success("Email copied"),
            () => toast.error("Could not copy"),
          );
        },
        onCopyPhone: () => {
          if (!contact.phone) return;
          void navigator.clipboard.writeText(contact.phone).then(
            () => toast.success("Phone copied"),
            () => toast.error("Could not copy"),
          );
        },
        canEdit: permissions.contactsEdit,
        canLogActivity: permissions.activitiesCreate,
        canNewOpp: permissions.opportunitiesCreate && linkedAccount,
        hasEmail: !!contact.email,
        hasPhone: !!contact.phone,
        isDeleted,
      }),
    [
      contact.email,
      contact.phone,
      isDeleted,
      goLogActivity,
      linkedAccount,
      loadPickers,
      permissions,
      toast,
    ],
  );

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
      const body = (await res.json()) as { success?: boolean; data?: ContactRow };
      const updated = body.data;
      if (updated) {
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
      }
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

  function handleOppSuccess(result: CreateOpportunityResult) {
    toast.success("Opportunity created");
    setTimeout(() => {
      toast.info(`View opportunity → /opportunities/${result.opportunityId}`);
    }, 50);
    router.refresh();
  }

  const taskSeed: TaskFormSeed = {
    subject: `Follow up with ${fullName}`,
    priority: "Medium",
    status: "Open",
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    relatedKind: "Contact",
    relatedObjectId: contact.id,
    relatedLabel: fullName,
    assignedToUserId: contact.ownerId,
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-bg-secondary)] pb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
        >
          <ChevronLeft size={14} /> All contacts
        </Link>
        {!isDeleted ? (
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="crm-btn-secondary inline-flex items-center gap-1 text-xs"
            title="Command palette (Ctrl+K)"
          >
            <Command size={14} /> Commands
          </button>
        ) : null}
      </div>

      {isDeleted && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">This contact is in Trash.</p>
          <p className="mt-1 text-amber-800/90">
            Restore it to edit details or log new activities.
          </p>
          {permissions.contactsDelete && (
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

      <ContactDashboardHeader contact={contact} account={account} lead={lead} />

      <ContactQuickActionsPanel
        onEdit={() => {
          setServerError(undefined);
          void loadPickers();
          setEditOpen(true);
        }}
        onTask={() => setTaskOpen(true)}
        onLogActivity={goLogActivity}
        onNewOpportunity={() => setOppOpen(true)}
        canEdit={permissions.contactsEdit}
        canLogActivity={permissions.activitiesCreate}
        canNewOpp={permissions.opportunitiesCreate && linkedAccount}
        isDeleted={isDeleted}
      />

      {!isDeleted ? (
        <ContactDashboardMetrics
          snapshot={snapshot}
          hasAccount={linkedAccount}
          onNavigateTab={setActiveTab}
        />
      ) : null}

      <LeadCommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        leadName={fullName}
        actions={commandActions}
      />

      <ContactDetailTabs
        contact={contact}
        contactName={fullName}
        account={account}
        lead={lead}
        snapshot={snapshot}
        timelineSeed={timelineSeed}
        overview={overview}
        initialNotes={initialNotes}
        permissions={{ contactsEdit: permissions.contactsEdit }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogActivity={goLogActivity}
        onRefresh={() => router.refresh()}
        canCreateNote={permissions.contactsEdit && !isDeleted}
      />

      <ContactModal
        open={editOpen}
        mode="edit"
        contact={toContactRow(contact)}
        canEdit={permissions.contactsEdit}
        canDelete={permissions.contactsDelete}
        saving={saving}
        deleting={deleting}
        serverError={serverError}
        accountOptions={accountOptions}
        ownerOptions={ownerOptions}
        leadOptions={leadOptions}
        pickersLoading={pickersLoading}
        onClose={() => setEditOpen(false)}
        onSubmit={(v) => void submitEdit(v)}
        onDelete={permissions.contactsDelete ? submitDelete : undefined}
      />

      <TaskEditModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        onSaved={() => {
          setTaskOpen(false);
          router.refresh();
        }}
        seed={taskSeed}
        locked={{ relatedKind: true }}
      />

      {linkedAccount && account && (
        <CreateOpportunityModal
          open={oppOpen}
          onClose={() => setOppOpen(false)}
          contactId={contact.id}
          contactFullName={fullName}
          accountId={account.id}
          accountName={account.name}
          onSuccess={handleOppSuccess}
        />
      )}
    </div>
  );
}
