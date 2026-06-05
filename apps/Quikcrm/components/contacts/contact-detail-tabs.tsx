"use client";

import { useEffect, useState } from "react";
import {
  ContactDashboardOverview,
  type ContactOverviewActivity,
  type ContactOverviewNote,
  type ContactOverviewOpportunity,
  type ContactOverviewTask,
} from "@/components/contacts/contact-dashboard-overview";
import { ContactTasksTab } from "@/components/contacts/contact-tasks-tab";
import { ContactNotesTab, type ContactNoteRow } from "@/components/contacts/contact-notes-tab";
import { ContactRelatedTab } from "@/components/contacts/contact-related-tab";
import { AccountOpportunitiesTab } from "@/components/accounts/account-opportunities-tab";
import {
  UnifiedTimeline,
  type UnifiedTimelineSeed,
} from "@/components/leads/dashboard/unified-timeline";
import { LeadDashboardErrorBoundary } from "@/components/leads/dashboard/error-boundary";
import type { ContactDashboardSnapshot } from "@/lib/services/contacts/dashboard-snapshot";
import type { Contact360Row } from "@/lib/services/contacts/full-record";

export const CONTACT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
  { key: "tasks", label: "Tasks" },
  { key: "opportunities", label: "Opportunities" },
  { key: "related", label: "Related" },
] as const;

export type TabKey = (typeof CONTACT_TABS)[number]["key"];

interface Props {
  contact: Contact360Row;
  contactName: string;
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
  permissions: { contactsEdit: boolean };
  activeTab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
  onLogActivity?: () => void;
  onRefresh?: () => void;
  canCreateNote?: boolean;
}

export function ContactDetailTabs({
  contact,
  contactName,
  account,
  lead,
  snapshot,
  timelineSeed,
  overview,
  initialNotes,
  permissions,
  activeTab: controlledTab,
  onTabChange,
  onLogActivity,
  onRefresh,
  canCreateNote = false,
}: Props) {
  const [internalTab, setInternalTab] = useState<TabKey>("overview");
  const [mountedTabs, setMountedTabs] = useState<Set<TabKey>>(() => new Set(["overview"]));
  const active = controlledTab ?? internalTab;
  const setActive = onTabChange ?? setInternalTab;
  const hasAccount = Boolean(account?.id);

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  const visibleTabs = CONTACT_TABS.filter((t) => t.key !== "opportunities" || hasAccount);

  return (
    <section className="crm-card overflow-hidden shadow-sm">
      <div className="crm-hscroll sticky top-0 z-10 overflow-x-auto border-b border-crm-border bg-white/95 backdrop-blur dark:bg-slate-900/95">
        <div className="flex min-w-max gap-0.5 px-2" role="tablist">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setActive(t.key)}
              className={
                "whitespace-nowrap px-3 py-2.5 text-sm font-medium transition " +
                (active === t.key
                  ? "border-b-2 border-accent-600 text-accent-700"
                  : "text-crm-muted hover:text-crm-text")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {mountedTabs.has("overview") && (
          <div hidden={active !== "overview"}>
            <ContactDashboardOverview
              contactName={contactName}
              snapshot={snapshot}
              activities={overview.activities}
              tasks={overview.tasks}
              notes={overview.notes}
              opportunities={overview.opportunities}
              hasAccount={hasAccount}
              onNavigateTab={setActive}
            />
          </div>
        )}

        {mountedTabs.has("timeline") && (
          <div hidden={active !== "timeline"}>
            <LeadDashboardErrorBoundary>
              <UnifiedTimeline
                leadId={contact.id}
                seed={timelineSeed}
                onLogActivity={onLogActivity}
                emptyTitle="No activity yet"
                emptyDescription="Contact, lead, and account touchpoints roll up here as your team engages this person."
              />
            </LeadDashboardErrorBoundary>
          </div>
        )}

        {mountedTabs.has("notes") && (
          <div hidden={active !== "notes"}>
            <ContactNotesTab
              contactId={contact.id}
              initialNotes={initialNotes}
              canCreate={canCreateNote}
              onNoteAdded={onRefresh}
            />
          </div>
        )}

        {mountedTabs.has("tasks") && (
          <div hidden={active !== "tasks"}>
            <ContactTasksTab
              contactId={contact.id}
              contactName={contactName}
              ownerId={contact.ownerId}
            />
          </div>
        )}

        {hasAccount && mountedTabs.has("opportunities") && account && (
          <div hidden={active !== "opportunities"}>
            <AccountOpportunitiesTab accountId={account.id} />
          </div>
        )}

        {mountedTabs.has("related") && (
          <div hidden={active !== "related"}>
            <ContactRelatedTab account={account} lead={lead} />
          </div>
        )}
      </div>
    </section>
  );
}
