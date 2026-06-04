"use client";

import { useEffect, useState } from "react";
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
import { LeadAnalyticsTab } from "@/components/leads/dashboard/analytics-tab";
import { LeadDashboardErrorBoundary } from "@/components/leads/dashboard/error-boundary";
import type { LeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";
import type { LeadAnalyticsBundle } from "@/lib/services/leads/lead-analytics";

export const TABS = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "analytics", label: "Analytics" },
  { key: "callDisposition", label: "Call Disposition" },
  { key: "details", label: "Details" },
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
  dynamicFields?: Record<string, unknown> | null;
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
              onNavigateTab={setActive}
            />
          ) : null}

          {mountedTabs.has("timeline") && active === "timeline" ? (
            <UnifiedTimeline
              leadId={lead.id}
              seed={timelineSeed}
              onLogActivity={onLogActivity}
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
