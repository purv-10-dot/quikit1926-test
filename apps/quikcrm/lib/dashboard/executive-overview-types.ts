import type { Kpi, DayBucket, StageCount } from "@/lib/dashboard/types";
import type { ExecutiveOverviewAdvanced } from "@/lib/dashboard/executive-overview-advanced-types";

export type OverviewActivityMix = {
  calls: number;
  emails: number;
  meetings: number;
  tasks: number;
  quotes: number;
  notes: number;
  other: number;
  total: number;
};

export type OverviewActivitySummary = {
  calls: Kpi;
  emails: Kpi;
  meetings: Kpi;
  tasksCompleted: Kpi;
  notesAdded: Kpi;
  quotesSent: Kpi;
  followUpsCompleted: Kpi;
};

export type OverviewInsight = {
  id: string;
  tone: "success" | "warning" | "info" | "danger";
  title: string;
  body: string;
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  userName: string;
  leadsCreated: number;
  calls: number;
  emails: number;
  meetings: number;
  dealsWon: number;
  revenueDisplay: string;
  activityScore: number;
  isTop?: boolean;
  /**
   * Today's activity-target status (green/yellow/red) from the shared
   * activity-target services. null when unavailable. Additive/optional so no
   * existing overview behavior changes.
   */
  targetStatus?: "green" | "yellow" | "red" | null;
};

export type ChannelRow = {
  channel: string;
  leadCount: number;
  conversionPct: number | null;
  revenueDisplay: string;
};

export type AtRiskDealRow = {
  id: string;
  dealName: string;
  company: string;
  valueDisplay: string;
  stage: string;
  ownerName: string;
  lastActivityIso: string;
  riskReason: string;
  riskScore: number;
};

export type LiveFeedRow = {
  id: string;
  at: string;
  userName: string;
  action: string;
  detail: string;
  icon: "lead" | "opp" | "quote" | "task" | "call" | "activity";
};

export type UsageRow = {
  userId: string;
  userName: string;
  role: string;
  lastLoginIso: string | null;
  lastActivityIso: string | null;
  sessionHint: string;
  usageScore: number;
  inactive: boolean;
};

export type TopCustomerRow = {
  accountId: string;
  name: string;
  revenueDisplay: string;
  openDeals: number;
  lastInteractionIso: string | null;
  ownerName: string;
};

export type TaskMonitor = {
  pending: number;
  overdue: number;
  completedToday: number;
  upcomingFollowUps: number;
};

export type PipelineHealth = {
  stages: StageCount[];
  totalValueDisplay: string;
  avgDealDisplay: string;
  agingCount: number;
};

export type ExecutiveOverviewDto = {
  range: { fromIso: string; toIso: string; tz: string };
  filters: {
    ownerId: string | null;
    source: string | null;
  };

  executiveKpis: {
    totalLeads: Kpi;
    newLeadsToday: Kpi;
    activeOpportunities: { value: number; priorValue: number };
    dealsWon: Kpi;
    dealsLost: Kpi;
    pipelineValueDisplay: string;
    revenueThisMonthDisplay: string;
    teamProductivityScore: number;
    teamProductivityPrior: number;
  };

  activitySummary: OverviewActivitySummary;
  activityTrend: DayBucket[];
  activityMix: OverviewActivityMix;

  funnel: { stage: string; count: number; pct: number }[];
  pipelineHealth: PipelineHealth;

  insights: OverviewInsight[];
  leaderboard: LeaderboardRow[];
  channels: ChannelRow[];

  leadTrend: DayBucket[];
  revenueTrend: DayBucket[];
  revenueTargetDisplay: string;
  revenueAchievementPct: number | null;

  atRiskDeals: AtRiskDealRow[];
  liveFeed: LiveFeedRow[];
  taskMonitor: TaskMonitor;
  usage: UsageRow[];
  topCustomers: TopCustomerRow[];
  advanced: ExecutiveOverviewAdvanced;
};
