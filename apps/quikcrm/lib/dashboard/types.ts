/**
 * Dashboard public types — used by the API routes, the summary service, and
 * the page/components. Re-exported from `@/types/dashboard` for client code.
 */

import type { DeltaResult } from "@/lib/services/dashboard/period";

export type Kpi = {
  value: number;
  priorValue: number;
  /**
   * Bug 6: tagged union so prior=0 cases render as "↑ new" or "—"
   * instead of a misleading "+100%". The old `deltaPct: number` was
   * removed because it could not represent the no-prior case.
   */
  delta: DeltaResult;
};

export type CurrencyBucket = {
  currency: string;
  amount: number;
  display: string;
};

export type StageCount = { stage: string; count: number };
export type DayBucket = { label: string; iso: string; count: number };

export type TeamDashboard = {
  teamMemberCount: number;
  callsLast7Days: number;
  activitiesLast7Days: number;
  topDispositions: { name: string; count: number }[];
};

export type WorkItemRow = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  at: string;
};

export type ActivityMix = {
  calls: number;
  emails: number;
  meetings: number;
  other: number;
  total: number;
};

export type RecentWinRow = {
  id: string;
  name: string;
  amountDisplay: string;
  ownerName: string | null;
  closedAt: string;
};

export type ExecutiveSummary = {
  callsInRange: number;
  emailsInRange: number;
  meetingsInRange: number;
  activityMix: ActivityMix;
  wonDealsCount: number;
  wonRevenueDisplay: string;
  weightedPipelineDisplay: string;
  tasksDueToday: number;
  followUpsDueToday: number;
  tasksDueTodayItems: WorkItemRow[];
  followUpItems: WorkItemRow[];
  recentWins: RecentWinRow[];
};

export type DashboardSummaryDto = {
  range: { fromIso: string; toIso: string; tz: string };

  executive: ExecutiveSummary;

  /** P1 ports: keep raw scalars for legacy compatibility. */
  leadCount: number;
  accountCount: number;
  openTasks: number;
  openOpportunityCount: number;
  pipelineValueInr: number;
  pipelineValueDisplay: string;
  activitiesToday: number;
  activitiesThisWeek: number;
  /**
   * Percentage of in-window leads currently in a configured "qualified"
   * stage. `null` when the selected window contains zero leads — the UI
   * renders an explicit empty-state subtitle in that case rather than a
   * misleading "0% in qualified stages".
   */
  conversionLeadToQualifiedPct: number | null;
  leadsByStage: StageCount[];
  opportunitiesByStage: StageCount[];
  activitiesLast7Days: DayBucket[];
  teamDashboard?: TeamDashboard;

  /**
   * Per-KPI value/prior/delta block.
   *
   * Bug 1: only FLOW KPIs (period-bound by createdAt/occurredAt) carry a
   * Kpi entry. STOCK KPIs (point-in-time snapshots — pipelineOpen,
   * openTasks, accountCount, openOpportunityCount) are intentionally
   * absent so the UI doesn't render a misleading "+X% vs prior" pill on
   * cards the date filter doesn't gate. Their current value still
   * surfaces via the flat fields above (accountCount, openTasks,
   * openOpportunityCount, pipelineValueInr).
   *
   * Stock keys are kept in the type as `?: never` to make any accidental
   * future read at the call site a compile error rather than a silent
   * undefined dereference.
   */
  kpis: {
    leadCount: Kpi;
    activities: Kpi;
    calls: Kpi;
    wonDeals: Kpi;
    pipelineOpen?: never;
    openTasks?: never;
    accountCount?: never;
    openOpportunityCount?: never;
  };
  pipelineValueByCurrency: CurrencyBucket[];
};

export type FunnelStep = {
  stage: string;
  count: number;
  pct: number;
};

export type AtRiskSampleRow = {
  id: string;
  primary: string;
  secondary: string;
  ownerName: string;
  iso: string;
};

export type AtRiskBucket = {
  count: number;
  samples: AtRiskSampleRow[];
};

export type AtRiskDto = {
  overdueTasks: AtRiskBucket;
  staleLeads: AtRiskBucket;
  stuckOpportunities: AtRiskBucket;
  callsWithoutDispo: AtRiskBucket;
};

export type DashboardPin = {
  id: string;
  reportId: string;
  sortOrder: number;
};

export type DashboardFilters = {
  fromIso: string;
  toIso: string;
  ownerId: string | null;
  tz: string;
};
