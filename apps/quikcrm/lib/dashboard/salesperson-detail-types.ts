export type SalespersonKpis = {
  leadsCreated: number;
  leadsConverted: number;
  calls: number;
  callsConnected: number;
  emails: number;
  meetings: number;
  dealsWon: number;
  dealsLost: number;
  quotesCreated: number;
  quotesWon: number;
  quotesLost: number;
  opportunitiesCreated: number;
  tasksCompleted: number;
  totalTasks: number;
  notesAdded: number;
  activityScore: number;
  revenueDisplay: string;
  // New fields
  revenueWon: number;
  revenueWonDisplay: string;
  avgDealSizeDisplay: string;
  totalPipelineValue: number;
  totalPipelineDisplay: string;
  avgResponseTimeMins: number | null;
  overdueTasksCount: number;
};

/**
 * Activity-target attainment for this salesperson, computed from the SAME
 * services the admin tracker uses (activity-target-config + activity-target-count
 * + activity-target-status). Always reflects TODAY + THIS WEEK in the client tz,
 * independent of the detail page's selected date range — so a given user's
 * numbers match the tracker exactly. Optional: null when unavailable.
 */
export type SalespersonActivityTarget = {
  dailyTarget: number;
  todayActivities: number;
  remaining: number;
  completionPct: number;
  weeklyTarget: number;
  weeklyActivities: number;
  status: "green" | "yellow" | "red";
};

export type SalespersonPrevKpis = {
  leadsCreated: number;
  leadsConverted: number;
  calls: number;
  dealsWon: number;
  revenueWon: number;
  emails: number;
  meetings: number;
  tasksCompleted: number;
};

export type SalespersonHeatmapDay = {
  date: string; // YYYY-MM-DD
  count: number;
};

export type SalespersonFunnelStage = {
  stage: string;
  count: number;
  pct: number;
};

export type SalespersonCallDurationBucket = {
  label: string;
  count: number;
};

export type SalespersonRecentLead = {
  id: string;
  name: string;
  company: string;
  stage: string;
  status: string;
  source: string | null;
  createdAtIso: string;
};

export type SalespersonActivityRow = {
  id: string;
  type: string;
  subject: string;
  outcome: string | null;
  detailNotes: string | null;
  leadId: string | null;
  leadName: string | null;
  leadCompany: string | null;
  occurredAtIso: string;
};

export type SalespersonCallRow = {
  id: string;
  leadId: string | null;
  leadName: string | null;
  leadCompany: string | null;
  direction: string | null;
  status: string | null;
  durationSec: number | null;
  disposition: string | null;
  notes: string | null;
  startTimeIso: string | null;
};

export type SalespersonTaskRow = {
  id: string;
  subject: string;
  taskType: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  leadId: string | null;
  leadName: string | null;
  leadCompany: string | null;
  createdAtIso: string;
  isOverdue: boolean;
};

export type SalespersonNoteRow = {
  id: string;
  content: string;
  leadId: string | null;
  leadName: string | null;
  leadCompany: string | null;
  createdAtIso: string;
};

export type SalespersonConversionRow = {
  id: string;
  leadName: string;
  leadCompany: string;
  convertedAtIso: string;
  opportunityName: string | null;
};

export type SalespersonQuoteRow = {
  id: string;
  quoteNumber: string;
  status: string;
  grandTotal: string;
  currency: string;
  accountId: string;
  createdAtIso: string;
};

export type SalespersonOpportunityRow = {
  id: string;
  name: string;
  stage: string;
  amountDisplay: string;
  accountName: string | null;
  closeDate: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export type SalespersonAuditRow = {
  id: string;
  module: string;
  action: string;
  resourceId: string | null;
  summary: string;
  createdAtIso: string;
};

export type SalespersonStageRow = {
  stage: string;
  count: number;
};

export type SalespersonSourceRow = {
  source: string;
  count: number;
};

export type SalespersonDayBucket = {
  label: string;
  leads: number;
  activities: number;
};

export type SalespersonSparklines = {
  leads: number[];
  conversions: number[];
  opportunities: number[];
  calls: number[];
  emails: number[];
  meetings: number[];
  quotes: number[];
  tasks: number[];
  notes: number[];
};

export type SalespersonDetailDto = {
  userId: string;
  userName: string;
  userEmail: string | null;
  rank: number;
  isTop: boolean;
  lastLoginIso: string | null;
  lastActivityIso: string | null;
  kpis: SalespersonKpis;
  prevKpis: SalespersonPrevKpis;
  activityTarget: SalespersonActivityTarget | null;
  activityTrend: SalespersonDayBucket[];
  sparklines: SalespersonSparklines;
  heatmap: SalespersonHeatmapDay[];
  funnel: SalespersonFunnelStage[];
  callDurationBuckets: SalespersonCallDurationBucket[];
  recentLeads: SalespersonRecentLead[];
  activities: SalespersonActivityRow[];
  calls: SalespersonCallRow[];
  tasks: SalespersonTaskRow[];
  notes: SalespersonNoteRow[];
  conversions: SalespersonConversionRow[];
  quotes: SalespersonQuoteRow[];
  opportunities: SalespersonOpportunityRow[];
  auditLog: SalespersonAuditRow[];
  stageBreakdown: SalespersonStageRow[];
  sourceBreakdown: SalespersonSourceRow[];
  range: { fromIso: string; toIso: string };
};
