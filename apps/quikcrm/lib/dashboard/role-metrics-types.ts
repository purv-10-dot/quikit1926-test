/**
 * Role-specific dashboard metric types.
 *
 * Role → dashboard view
 * ─────────────────────
 * Administrator  : org-wide (all tenants, unrestricted)
 * TeamManager    : team-wide (all groups in managed teams)
 * SalesManager   : group-wide (managed sales groups)
 * SalesUser      : personal (own records only)
 * MarketingUser  : campaigns + lead sources (ACL-scoped)
 * FinanceUser    : revenue + forecasts (ACL-scoped)
 *
 * Every role's counts match the corresponding module API counts
 * because the same ACL helpers are used by both.
 */

export type AdminMetrics = {
  totalLeads: number;
  totalAccounts: number;
  totalContacts: number;
  totalOpportunities: number;
  totalRevenue: number;
  totalRevenueDisplay: string;
  totalActivities: number;
  totalTasks: number;
  totalQuotes: number;
};

/** Team-level aggregation for the TeamManager dashboard. */
export type TeamManagerMetrics = {
  /** Number of teams the user manages */
  teamCount: number;
  /** Total number of sales groups across all managed teams */
  groupCount: number;
  /** Total active members across all those groups */
  teamMemberCount: number;
  teamLeads: number;
  teamOpportunities: number;
  teamRevenue: number;
  teamRevenueDisplay: string;
  teamPipeline: number;
  teamPipelineDisplay: string;
  teamActivities: number;
  teamTasks: number;
  teamQuotes: number;
};

export type SalesManagerMetrics = {
  teamLeads: number;
  teamOpportunities: number;
  teamRevenue: number;
  teamRevenueDisplay: string;
  teamActivities: number;
  teamTasks: number;
  teamQuotes: number;
  teamPipeline: number;
  teamPipelineDisplay: string;
  teamMemberCount: number;
};

export type SalesUserMetrics = {
  myLeads: number;
  myOpportunities: number;
  myRevenue: number;
  myRevenueDisplay: string;
  myActivities: number;
  myTasks: number;
  myQuotes: number;
};

export type LeadSourceCount = {
  source: string;
  count: number;
};

export type MarketingMetrics = {
  totalCampaigns: number;
  activeCampaigns: number;
  marketingLeads: number;
  leadSources: LeadSourceCount[];
  conversionRate: number | null;
};

export type FinanceMetrics = {
  totalRevenue: number;
  totalRevenueDisplay: string;
  forecastRevenue: number;
  forecastRevenueDisplay: string;
  totalOpportunities: number;
  totalQuotes: number;
  wonDeals: number;
};

export type RoleMetricsDto =
  | { role: "Administrator"; metrics: AdminMetrics }
  | { role: "TeamManager"; metrics: TeamManagerMetrics }
  | { role: "SalesManager"; metrics: SalesManagerMetrics }
  | { role: "SalesUser"; metrics: SalesUserMetrics }
  | { role: "MarketingUser"; metrics: MarketingMetrics }
  | { role: "FinanceUser"; metrics: FinanceMetrics };
