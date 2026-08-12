"use client";

import { useEffect, useState } from "react";
import {
  AccountDashboardOverview,
  type AccountOverviewActivity,
  type AccountOverviewContact,
  type AccountOverviewLead,
  type AccountOverviewOpportunity,
  type AccountOverviewNote,
  type AccountOverviewTask,
} from "@/components/accounts/account-dashboard-overview";
import { AccountLeadsTab } from "@/components/accounts/account-leads-tab";
import { AccountContactsTab } from "@/components/accounts/account-contacts-tab";
import { AccountOpportunitiesTab } from "@/components/accounts/account-opportunities-tab";
import { AccountQuotesTab } from "@/components/accounts/account-quotes-tab";
import { AccountTasksTab } from "@/components/accounts/account-tasks-tab";
import { AccountHierarchyTab } from "@/components/accounts/account-hierarchy-tab";
import { EntityDocumentsCard } from "@/components/documents/entity-documents-card";
import {
  AccountNotesTab,
  type AccountNoteRow,
} from "@/components/accounts/account-notes-tab";
import { AccountScoreTrendsTab } from "@/components/accounts/account-score-trends-tab";
import type { AccountScoreHistoryBundle } from "@/lib/services/accounts/account-score-history";
import {
  UnifiedTimeline,
  type UnifiedTimelineSeed,
} from "@/components/leads/dashboard/unified-timeline";
import { LeadDashboardErrorBoundary } from "@/components/leads/dashboard/error-boundary";
import type { AccountDashboardSnapshot } from "@/lib/services/accounts/dashboard-snapshot";
import type { AccountRow } from "@/lib/services/accounts";

export const ACCOUNT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
  { key: "trends", label: "Score trends" },
  { key: "contacts", label: "Contacts" },
  { key: "leads", label: "Leads" },
  { key: "opportunities", label: "Opportunities" },
  { key: "quotes", label: "Quotes" },
  { key: "tasks", label: "Tasks" },
  { key: "documents", label: "Documents" },
  { key: "hierarchy", label: "Hierarchy" },
] as const;

export type TabKey = (typeof ACCOUNT_TABS)[number]["key"];

interface Props {
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
    notes: AccountOverviewNote[];
  };
  initialLeads: AccountOverviewLead[];
  permissions: {
    leadsEdit: boolean;
    accountsEdit: boolean;
  };
  activeTab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
  onLogActivity?: () => void;
  onRefresh?: () => void;
  initialNotes?: AccountNoteRow[];
  scoreHistory?: AccountScoreHistoryBundle;
  canCreateNote?: boolean;
}

export function AccountDetailTabs({
  account,
  parent,
  subsidiaries,
  snapshot,
  timelineSeed,
  overview,
  initialLeads,
  permissions,
  activeTab: controlledTab,
  onTabChange,
  onLogActivity,
  onRefresh,
  initialNotes = [],
  scoreHistory,
  canCreateNote = false,
}: Props) {
  const [internalTab, setInternalTab] = useState<TabKey>("overview");
  const [mountedTabs, setMountedTabs] = useState<Set<TabKey>>(() => new Set(["overview"]));
  const active = controlledTab ?? internalTab;
  const setActive = onTabChange ?? setInternalTab;

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  return (
    <section className="crm-card overflow-hidden shadow-sm">
      <div className="crm-hscroll sticky top-0 z-10 overflow-x-auto border-b border-crm-border bg-white/95 backdrop-blur dark:bg-slate-900/95">
        <div className="flex min-w-max gap-0.5 px-2" role="tablist">
          {ACCOUNT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setActive(t.key)}
              className={
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition " +
                (active === t.key
                  ? "border-accent-600 font-semibold text-accent-700"
                  : "border-transparent text-crm-text hover:border-accent-200 hover:text-accent-600")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <LeadDashboardErrorBoundary>
          {mountedTabs.has("overview") && active === "overview" ? (
            <AccountDashboardOverview
              accountName={account.name}
              snapshot={snapshot}
              activities={overview.activities}
              tasks={overview.tasks}
              contacts={overview.contacts}
              leads={overview.leads}
              opportunities={overview.opportunities}
              notes={overview.notes}
              onNavigateTab={setActive}
            />
          ) : null}

          {mountedTabs.has("timeline") && active === "timeline" ? (
            <UnifiedTimeline
              leadId={account.id}
              seed={timelineSeed}
              onLogActivity={onLogActivity}
              emptyTitle="No activity yet"
              emptyDescription="Account, lead, and contact touchpoints roll up here as your team engages this company."
            />
          ) : null}

          {mountedTabs.has("notes") && active === "notes" ? (
            <AccountNotesTab
              accountId={account.id}
              initialNotes={initialNotes}
              canCreate={canCreateNote}
              onNoteAdded={onRefresh}
            />
          ) : null}

          {mountedTabs.has("trends") && active === "trends" && scoreHistory ? (
            <AccountScoreTrendsTab history={scoreHistory} />
          ) : null}

          {mountedTabs.has("contacts") && active === "contacts" ? (
            <AccountContactsTab accountId={account.id} accountName={account.name} />
          ) : null}

          {mountedTabs.has("leads") && active === "leads" ? (
            <AccountLeadsTab
              accountId={account.id}
              initialLeads={initialLeads}
              canBulkAssign={permissions.leadsEdit}
              onChanged={onRefresh}
            />
          ) : null}

          {mountedTabs.has("opportunities") && active === "opportunities" ? (
            <AccountOpportunitiesTab accountId={account.id} />
          ) : null}

          {mountedTabs.has("quotes") && active === "quotes" ? (
            <AccountQuotesTab accountId={account.id} />
          ) : null}

          {mountedTabs.has("tasks") && active === "tasks" ? (
            <AccountTasksTab
              accountId={account.id}
              accountName={account.name}
              ownerId={account.ownerId}
            />
          ) : null}

          {mountedTabs.has("documents") && active === "documents" ? (
            <EntityDocumentsCard
              refType="account"
              entityId={account.id}
              readOnly={!!account.deletedAt}
            />
          ) : null}

          {mountedTabs.has("hierarchy") && active === "hierarchy" ? (
            <AccountHierarchyTab parent={parent} subsidiaries={subsidiaries} />
          ) : null}
        </LeadDashboardErrorBoundary>
      </div>
    </section>
  );
}
