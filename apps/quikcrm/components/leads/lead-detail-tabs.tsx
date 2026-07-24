"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { LeadDetailsForm } from "@/components/leads/lead-details-form";
import { LeadTasksTab } from "@/components/leads/lead-tasks-tab";
import { LeadOpportunitiesTab } from "@/components/leads/lead-opportunities-tab";
import { LeadDocumentsTab } from "@/components/leads/lead-documents-tab";
import { LeadChangeLogTimeline } from "@/components/leads/lead-change-log-timeline";
import { LeadCallDispositionTab } from "@/components/leads/lead-call-disposition-tab";
import { LeadNotesTab, type LeadNoteRow } from "@/components/leads/lead-notes-tab";
import {
  LeadDashboardOverview,
  type OverviewActivity,
  type OverviewNote,
  type OverviewOpportunity,
  type OverviewTask,
} from "@/components/leads/lead-dashboard-overview";
import { UnifiedTimeline, type UnifiedTimelineSeed } from "@/components/leads/dashboard/unified-timeline";
import { EmailThreadPanel } from "@/components/email/email-thread-panel";
import { LeadAnalyticsTab } from "@/components/leads/dashboard/analytics-tab";
import { LeadDashboardErrorBoundary } from "@/components/leads/dashboard/error-boundary";
import type { LeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";
import type { LeadAnalyticsBundle } from "@/lib/services/leads/lead-analytics";

export const TABS = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "emails", label: "Emails" },
  { key: "analytics", label: "Analytics" },
  { key: "callDisposition", label: "Call Disposition" },
  { key: "details", label: "Record Details" },
  { key: "tasks", label: "Tasks" },
  { key: "notes", label: "Notes" },
  { key: "opportunities", label: "Opportunities" },
  { key: "documents", label: "Documents" },
  { key: "changelog", label: "Change Log" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

interface LeadInput {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  jobTitle: string | null;
  source: string | null;
  stage: string;
  status: string;
  score: number;
  country?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  accountId?: string | null;
  account?: { id: string; name: string } | null;
  /** Conversion facts — used to surface a "Lead Converted" entry in Recent Activity. */
  convertedAt?: string | null;
  linkedContactId?: string | null;
  dynamicFields?: Record<string, unknown> | null;
  // Contact information
  firstName?: string | null;
  lastName?: string | null;
  secondaryEmail?: string | null;
  contactLinkedinUrl?: string | null;
  // Company information
  industry?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  annualRevenueDisplay?: string | null;
  leadType?: string | null;
  // Address
  addressLine1?: string | null;
  addressLine2?: string | null;
  cityName?: string | null;
  stateName?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  long?: number | null;
}

interface Props {
  lead: LeadInput;
  activeTab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
  overview: {
    activities: OverviewActivity[];
    tasks: OverviewTask[];
    notes: OverviewNote[];
    opportunities: OverviewOpportunity[];
  };
  snapshot: LeadDashboardSnapshot;
  timelineSeed: UnifiedTimelineSeed;
  analytics: LeadAnalyticsBundle;
  conversionProbability: number;
  initialNotes: LeadNoteRow[];
  canCreateNote: boolean;
  onLogActivity?: () => void;
  onLogCall?: () => void;
  onNotesChange?: () => void;
}

export function LeadDetailTabs({
  lead,
  activeTab: controlledTab,
  onTabChange,
  overview,
  snapshot,
  timelineSeed,
  analytics,
  conversionProbability,
  initialNotes,
  canCreateNote,
  onLogActivity,
  onLogCall,
  onNotesChange,
}: Props) {
  const pathname = usePathname();
  const [internalTab, setInternalTab] = useState<TabKey>("overview");
  const [mountedTabs, setMountedTabs] = useState<Set<TabKey>>(() => new Set(["overview"]));
  const active = controlledTab ?? internalTab;
  const setActive = onTabChange ?? setInternalTab;
  const [detailsEpoch, setDetailsEpoch] = useState(0);
  const [notes, setNotes] = useState(initialNotes);

  // Synthesize the "Lead Converted" Recent-Activity / Timeline entry AND
  // identify the Opportunity auto-created during that conversion so it can be
  // hidden on the Lead surfaces (the conversion event already conveys it).
  //
  // The conversion isn't persisted as a CrmActivity, so we derive it from the
  // lead's conversion facts (status + convertedAt). The conversion Opportunity
  // is the one linked to this lead whose createdAt falls within the conversion
  // transaction window (~convertedAt) — NOT any opportunity manually linked to
  // the lead later, which must keep showing on the Lead Timeline.
  // Returns { conversion: null, suppressOpportunityIds: [] } for unconverted leads.
  const { conversion, suppressOpportunityIds } = useMemo(() => {
    const isConverted =
      lead.status?.toLowerCase() === "converted" && !!lead.convertedAt;
    if (!isConverted) {
      return { conversion: null, suppressOpportunityIds: [] as string[] };
    }
    const convertedMs = new Date(lead.convertedAt as string).getTime();
    // Same-transaction window: opp.createdAt and lead.convertedAt are written in
    // one $transaction, so they're within a few ms. A 5s window is comfortably
    // tolerant while still excluding opportunities created in separate sessions.
    const WINDOW_MS = 5_000;
    const conversionOpp =
      Number.isFinite(convertedMs)
        ? timelineSeed.opportunities
            .map((o) => ({ o, dt: Math.abs(new Date(o.createdAt).getTime() - convertedMs) }))
            .filter((x) => Number.isFinite(x.dt) && x.dt <= WINDOW_MS)
            .sort((a, b) => a.dt - b.dt)[0]?.o ?? null
        : null;

    const accountName = lead.account?.name ?? lead.company ?? null;
    const contactName = lead.linkedContactId
      ? [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
        lead.name ||
        null
      : null;
    return {
      conversion: {
        convertedAt: lead.convertedAt as string,
        ownerName: lead.ownerName ?? null,
        accountName,
        contactName,
        opportunityName: conversionOpp?.name ?? null,
      },
      suppressOpportunityIds: conversionOpp ? [conversionOpp.id] : [],
    };
  }, [
    lead.status,
    lead.convertedAt,
    lead.account?.name,
    lead.company,
    lead.linkedContactId,
    lead.firstName,
    lead.lastName,
    lead.name,
    lead.ownerName,
    timelineSeed.opportunities,
  ]);

  useEffect(() => {
    setDetailsEpoch((n) => n + 1);
  }, [pathname]);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

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
          {TABS.map((t) => (
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
            <LeadDashboardOverview
              leadId={lead.id}
              leadName={lead.name}
              timelineSeed={timelineSeed}
              tasks={overview.tasks}
              notes={overview.notes}
              opportunities={overview.opportunities}
              nextFollowUpAt={snapshot.nextFollowUpAt}
              conversion={conversion}
              suppressOpportunityIds={suppressOpportunityIds}
              onNavigateTab={setActive}
            />
          ) : null}

          {mountedTabs.has("timeline") && active === "timeline" ? (
            <UnifiedTimeline
              leadId={lead.id}
              seed={timelineSeed}
              conversion={conversion}
              suppressOpportunityIds={suppressOpportunityIds}
              onLogActivity={onLogActivity}
            />
          ) : null}

          {mountedTabs.has("emails") && active === "emails" ? (
            <EmailThreadPanel
              relatedKind="Lead"
              relatedObjectId={lead.id}
              defaultTo={[lead.email, lead.secondaryEmail].filter((e): e is string => !!e)}
            />
          ) : null}

          {mountedTabs.has("analytics") && active === "analytics" ? (
            <LeadAnalyticsTab
              analytics={analytics}
              stage={lead.stage}
              conversionProbability={conversionProbability}
            />
          ) : null}

          {mountedTabs.has("callDisposition") && active === "callDisposition" ? (
            <LeadCallDispositionTab
              leadId={lead.id}
              leadName={lead.name}
              onAddDisposition={onLogCall}
            />
          ) : null}

          {mountedTabs.has("details") && active === "details" ? (
            <LeadDetailsForm key={`${lead.id}:${detailsEpoch}`} lead={lead} />
          ) : null}

          {mountedTabs.has("tasks") && active === "tasks" ? (
            <LeadTasksTab leadId={lead.id} leadName={lead.name} leadOwnerId={lead.ownerId ?? null} />
          ) : null}

          {mountedTabs.has("notes") && active === "notes" ? (
            <LeadNotesTab
              leadId={lead.id}
              initialNotes={notes}
              canCreate={canCreateNote}
              onNoteAdded={() => onNotesChange?.()}
            />
          ) : null}

          {mountedTabs.has("opportunities") && active === "opportunities" ? (
            <LeadOpportunitiesTab leadId={lead.id} />
          ) : null}

          {mountedTabs.has("documents") && active === "documents" ? (
            <LeadDocumentsTab leadId={lead.id} />
          ) : null}

          {mountedTabs.has("changelog") && active === "changelog" ? (
            <LeadChangeLogTimeline leadId={lead.id} />
          ) : null}
        </LeadDashboardErrorBoundary>
      </div>
    </section>
  );
}
