"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Command } from "lucide-react";
import {
  LeadCommandPalette,
  useCommandPaletteShortcut,
} from "@/components/leads/dashboard/command-palette";
import { buildAccountCommandActions } from "@/lib/accounts/build-account-command-actions";
import { requestDocumentUpload } from "@/lib/documents/upload-request-event";
import type { AccountScoreHistoryBundle } from "@/lib/services/accounts/account-score-history";
import type { AccountNoteRow } from "@/components/accounts/account-notes-tab";
import { AccountDashboardHeader } from "@/components/accounts/account-dashboard-header";
import { AccountDashboardMetrics } from "@/components/accounts/account-dashboard-metrics";
import { AccountDetailTabs, type TabKey } from "@/components/accounts/account-detail-tabs";
import { AccountQuickActionsPanel } from "@/components/accounts/account-quick-actions-panel";
import { AccountDefaultPriceList } from "@/components/accounts/account-default-price-list";
import {
  AccountFormPanel,
  type AccountFormInitial,
} from "@/components/accounts/account-form-panel";
import { LeadFormDrawer } from "@/components/leads/lead-form-drawer";
import { TaskEditModal, type TaskFormSeed } from "@/components/tasks/task-edit-modal";
import { LogActivityModal } from "@/components/activities/log-activity-modal";
import { OpportunityFormDrawer } from "@/components/opportunities/opportunity-form-drawer";
import { ContactModal, type ContactRow } from "@/components/contacts/contact-modal";
import type { ContactFormValue } from "@/components/contacts/contact-form";
import { useToast } from "@/hooks/use-toast";
import type { AccountRow } from "@/lib/services/accounts";
import { discardLeadFormDraft, hasPendingSettingsReturn } from "@/lib/leads/lead-form-draft";
import type { AccountDashboardSnapshot } from "@/lib/services/accounts/dashboard-snapshot";
import type { UnifiedTimelineSeed } from "@/components/leads/dashboard/unified-timeline";
import type {
  AccountOverviewActivity,
  AccountOverviewContact,
  AccountOverviewLead,
  AccountOverviewNote,
  AccountOverviewOpportunity,
  AccountOverviewTask,
} from "@/components/accounts/account-dashboard-overview";
export interface Account360Permissions {
  accountsEdit: boolean;
  leadsCreate: boolean;
  leadsEdit: boolean;
  activitiesCreate: boolean;
  contactsCreate: boolean;
  opportunitiesCreate: boolean;
}

function accountToFormInitial(account: AccountRow): AccountFormInitial {
  return {
    id: account.id,
    name: account.name,
    segment: account.segment,
    segmentEnum: account.segmentEnum,
    ownerId: account.ownerId,
    industry: account.industry,
    website: account.website,
    city: account.city,
    status: account.status,
    annualRevenue: account.annualRevenue,
    annualRevenueAmount: account.annualRevenueAmount,
    annualRevenueCurrency: account.annualRevenueCurrency,
    countryCode: account.countryCode,
    state: account.state,
    postalCode: account.postalCode,
    parentAccountId: account.parentAccountId,
    healthScore: account.healthScore,
    npsScore: account.npsScore,
    contractStart: account.contractStart,
    contractEnd: account.contractEnd,
    renewalDate: account.renewalDate,
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
  if (value.city) out.city = value.city;
  if (value.contactStage) out.contactStage = value.contactStage;
  if (value.source) out.source = value.source;
  return out;
}

export interface AccountDashboardShellProps {
  account: AccountRow;
  parent: { id: string; name: string } | null;
  subsidiaries: { id: string; name: string; status: string | null }[];
  snapshot: AccountDashboardSnapshot;
  timelineSeed: UnifiedTimelineSeed;
  overview: {
    activities: AccountOverviewActivity[];
    tasks: AccountOverviewTask[];
    contacts: AccountOverviewContact[];
    leads: AccountOverviewLead[];
    opportunities: AccountOverviewOpportunity[];
  };
  initialLeads: AccountOverviewLead[];
  initialNotes: AccountNoteRow[];
  scoreHistory: AccountScoreHistoryBundle;
  permissions: Account360Permissions;
}

export function AccountDashboardShell(props: AccountDashboardShellProps) {
  const {
    account,
    parent,
    subsidiaries,
    snapshot,
    timelineSeed,
    overview,
    initialLeads,
    initialNotes,
    scoreHistory,
    permissions,
  } = props;

  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [accountRow, setAccountRow] = useState(account);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const createLeadDraftScope = `create:account:${account.id}` as const;

  useEffect(() => {
    const fromSettings =
      searchParams.get("createLead") === "1" ||
      hasPendingSettingsReturn(createLeadDraftScope);
    if (!fromSettings) return;
    setCreateLeadOpen(true);
    router.replace(`/accounts/${account.id}`, { scroll: false });
  }, [account.id, createLeadDraftScope, router, searchParams]);

  function openCreateLeadDrawer() {
    discardLeadFormDraft(createLeadDraftScope);
    setCreateLeadOpen(true);
  }

  const [taskOpen, setTaskOpen] = useState(false);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const [touchSales, setTouchSales] = useState(false);
  const [touchSubject, setTouchSubject] = useState("");
  const [touchOutcome, setTouchOutcome] = useState("");
  const [touchSaving, setTouchSaving] = useState(false);
  const [pickerOptions, setPickerOptions] = useState<{
    accounts: { id: string; label: string }[];
    owners: { id: string; label: string }[];
    leads: { id: string; label: string }[];
  }>({ accounts: [], owners: [], leads: [] });

  useCommandPaletteShortcut(() => setCmdOpen(true));

  const isDeleted = Boolean(accountRow.deletedAt);
  const currency = accountRow.annualRevenueCurrency ?? "INR";

  const overviewWithNotes = useMemo(() => {
    const notes: AccountOverviewNote[] = (initialNotes ?? []).map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      noteCategory: n.noteCategory,
    }));

    return { ...overview, notes };
  }, [overview, initialNotes]);

  const loadPickers = useCallback(() => {
    void Promise.all([
      fetch("/api/users/picker", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/accounts/picker", { credentials: "include" }).then((r) => r.json()),
    ]).then(([users, accounts]) => {
      setPickerOptions({
        owners: (users.items ?? []).map((u: { id: string; name: string }) => ({
          id: u.id,
          label: u.name,
        })),
        accounts: (accounts.data?.items ?? accounts.items ?? []).map(
          (a: { id: string; name: string }) => ({
            id: a.id,
            label: a.name,
          }),
        ),
        leads: [],
      });
    });
  }, []);

  const openTouch = useCallback((sales: boolean) => {
    setTouchSales(sales);
    setTouchSubject(sales ? "Sales activity" : "Account activity");
    setTouchOutcome("");
    setTouchOpen(true);
  }, []);

  const commandActions = useMemo(
    () =>
      buildAccountCommandActions({
        onNavigateTab: setActiveTab,
        onClose: () => setCmdOpen(false),
        onEdit: () => setEditOpen(true),
        onAddContact: () => {
          loadPickers();
          setContactOpen(true);
        },
        onAddLead: openCreateLeadDrawer,
        onNewOpportunity: () => setOppOpen(true),
        onAssignLeads: () => setActiveTab("leads"),
        onTask: () => setTaskOpen(true),
        onLogActivity: () => setLogActivityOpen(true),
        onSalesActivity: () => openTouch(true),
        onAddNote: () => {
          setActiveTab("notes");
          window.setTimeout(() => document.getElementById("account-note")?.focus(), 120);
        },
        onViewTrends: () => setActiveTab("trends"),
        onCopyWebsite: () => {
          const url = accountRow.website?.trim();
          if (!url) {
            toast.error("No website on file");
            return;
          }
          void navigator.clipboard.writeText(url).then(
            () => toast.success("Website copied"),
            () => toast.error("Could not copy"),
          );
        },
        canEdit: permissions.accountsEdit,
        canAddContact: permissions.contactsCreate,
        canAddLead: permissions.leadsCreate,
        canNewOpp: permissions.opportunitiesCreate,
        canAssignLeads: permissions.leadsEdit,
        canLogActivity: permissions.activitiesCreate,
        hasLeads: initialLeads.length > 0,
        hasWebsite: !!accountRow.website?.trim(),
        isDeleted,
      }),
    [
      accountRow.website,
      initialLeads.length,
      isDeleted,
      loadPickers,
      openTouch,
      permissions,
      toast,
    ],
  );

  async function saveTouch(e: React.FormEvent) {
    e.preventDefault();
    if (!touchSubject.trim()) return;
    setTouchSaving(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: touchSales ? "Sales" : "General",
          relatedKind: "Account",
          relatedObjectId: account.id,
          subject: touchSubject.trim(),
          outcome: touchOutcome.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Could not save");
      setTouchOpen(false);
      toast.success("Activity logged");
      router.refresh();
    } catch {
      toast.error("Could not save activity");
    } finally {
      setTouchSaving(false);
    }
  }

  async function submitContact(value: ContactFormValue) {
    setContactSaving(true);
    try {
      const body = { ...formContactToBody(value), accountId: account.id };
      const res = await fetch("/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || j.success === false) {
        throw new Error(j.error ?? "Failed to create contact");
      }
      toast.success("Contact created");
      setContactOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create contact");
    } finally {
      setContactSaving(false);
    }
  }

  const taskSeed: TaskFormSeed = {
    subject: `Follow up with ${account.name}`,
    priority: "Medium",
    status: "Open",
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    relatedKind: "Account",
    relatedObjectId: account.id,
    relatedLabel: account.name,
    assignedToUserId: account.ownerId,
  };

  const createContactSeed: ContactRow = {
    id: "",
    firstName: "",
    lastName: null,
    email: null,
    phone: null,
    title: null,
    accountId: account.id,
    ownerId: account.ownerId,
    ownerName: account.owner,
    leadId: null,
    city: null,
    contactStage: null,
    source: null,
    accountName: account.name,
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-bg-secondary)] pb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
        >
          <ChevronLeft size={14} /> All accounts
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

      <AccountDashboardHeader
        account={accountRow}
        parent={parent}
        daysToRenewal={snapshot.daysToRenewal}
        canEdit={permissions.accountsEdit}
        onTagsUpdated={(tags) => setAccountRow((a) => ({ ...a, tags }))}
      />

      <AccountQuickActionsPanel
        onEdit={() => setEditOpen(true)}
        onAddContact={() => {
          loadPickers();
          setContactOpen(true);
        }}
        onAddLead={openCreateLeadDrawer}
        onNewOpportunity={() => setOppOpen(true)}
        onAssignLeads={() => setActiveTab("leads")}
        onTask={() => setTaskOpen(true)}
        onLogActivity={() => setLogActivityOpen(true)}
        onSalesActivity={() => openTouch(true)}
        canEdit={permissions.accountsEdit}
        canAddContact={permissions.contactsCreate}
        canAddLead={permissions.leadsCreate}
        canNewOpp={permissions.opportunitiesCreate}
        canAssignLeads={permissions.leadsEdit}
        canLogActivity={permissions.activitiesCreate}
        isDeleted={isDeleted}
        hasLeads={initialLeads.length > 0}
      />

      {!isDeleted ? (
        <AccountDashboardMetrics
          snapshot={snapshot}
          currency={currency}
          onNavigateTab={setActiveTab}
        />
      ) : null}

      {!isDeleted && permissions.accountsEdit ? (
        <AccountDefaultPriceList
          accountId={account.id}
          initialPriceListId={accountRow.defaultPriceListId}
        />
      ) : null}

      <LeadCommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        leadName={accountRow.name}
        actions={commandActions}
      />

      <AccountDetailTabs
        account={accountRow}
        parent={parent}
        subsidiaries={subsidiaries}
        snapshot={snapshot}
        timelineSeed={timelineSeed}
        overview={overviewWithNotes}
        initialLeads={initialLeads}
        permissions={{
          leadsEdit: permissions.leadsEdit,
          accountsEdit: permissions.accountsEdit,
        }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogActivity={() => setLogActivityOpen(true)}
        onRefresh={() => router.refresh()}
        initialNotes={initialNotes}
        scoreHistory={scoreHistory}
        canCreateNote={permissions.accountsEdit && !isDeleted}
      />

      <AccountFormPanel
        open={editOpen}
        mode="edit"
        initial={accountToFormInitial(account)}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          toast.success("Account updated");
          router.refresh();
        }}
      />

      <LeadFormDrawer
        open={createLeadOpen}
        onClose={() => setCreateLeadOpen(false)}
        onCreated={() => {
          setCreateLeadOpen(false);
          router.refresh();
        }}
        initial={{
          accountId: account.id,
          accountName: account.name,
          company: account.name,
          ownerId: account.ownerId ?? "",
          ownerName: account.owner,
        }}
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

      <LogActivityModal
        open={logActivityOpen}
        onClose={() => setLogActivityOpen(false)}
        onSuccess={() => {
          setLogActivityOpen(false);
          router.refresh();
        }}
        canViewLeads={permissions.leadsCreate || permissions.leadsEdit}
        initialRelated={{
          kind: "Account",
          id: account.id,
          label: account.name,
        }}
      />

      <OpportunityFormDrawer
        open={oppOpen}
        onClose={() => setOppOpen(false)}
        initialAccountId={account.id}
      />

      <ContactModal
        open={contactOpen}
        mode="create"
        contact={createContactSeed}
        canEdit
        canDelete={false}
        saving={contactSaving}
        accountOptions={pickerOptions.accounts}
        ownerOptions={pickerOptions.owners}
        leadOptions={pickerOptions.leads}
        onClose={() => setContactOpen(false)}
        onSubmit={submitContact}
      />

      {touchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={saveTouch}
            className="w-full max-w-md rounded-lg border border-crm-border bg-white p-5 shadow-lg"
          >
            <h2 className="text-base font-semibold text-crm-text">
              {touchSales ? "Sales activity" : "Activity"}
            </h2>
            <label className="mt-4 block text-sm">
              <span className="text-crm-muted">Subject</span>
              <input
                className="mt-1 w-full rounded border border-crm-border px-3 py-2 text-sm"
                value={touchSubject}
                onChange={(e) => setTouchSubject(e.target.value)}
                required
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-crm-muted">Notes / outcome</span>
              <textarea
                className="mt-1 min-h-[88px] w-full rounded border border-crm-border px-3 py-2 text-sm"
                value={touchOutcome}
                onChange={(e) => setTouchOutcome(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-crm-border px-4 py-2 text-sm"
                onClick={() => setTouchOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={touchSaving}
                className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
              >
                {touchSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
