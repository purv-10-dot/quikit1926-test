import type { Kpi } from "@/lib/dashboard/types";

export type TodaySnapshotMetric = {
  label: string;
  value: number;
  priorValue: number;
  display?: string;
};

export type AdoptionStatus = "excellent" | "good" | "average" | "poor";

export type AdoptionRow = {
  rank: number;
  userId: string;
  userName: string;
  role: string;
  score: number;
  trend: "up" | "down" | "flat";
  status: AdoptionStatus;
  badge?: string;
};

export type InactiveUserRow = {
  userId: string;
  userName: string;
  lastLoginIso: string | null;
  lastActivityIso: string | null;
  sessionDurationHint: string;
  daysInactive: number;
  warningLevel: "none" | "today" | "3d" | "7d";
};

export type FollowUpCompliance = {
  totalAssigned: number;
  completedOnTime: number;
  completedLate: number;
  overdue: number;
  missed: number;
  compliancePct: number;
};

export type LeadAgingBucket = {
  label: string;
  minDays: number;
  maxDays: number | null;
  leadCount: number;
  valueDisplay: string;
  pct: number;
  stale: boolean;
};

export type SlaSeverity = "low" | "medium" | "high" | "critical";

export type SlaBreachCard = {
  id: string;
  title: string;
  count: number;
  priorCount: number;
  severity: SlaSeverity;
  trend: "up" | "down" | "flat";
};

export type ApprovalRequestRow = {
  id: string;
  requestType: string;
  title: string;
  requestedBy: string;
  amountDisplay: string;
  createdIso: string;
  status: "Pending" | "Approved" | "Rejected";
};

export type ApprovalSummary = {
  pending: number;
  approved: number;
  rejected: number;
  rows: ApprovalRequestRow[];
};

export type HeatmapCell = {
  userId: string;
  userName: string;
  calls: number;
  emails: number;
  meetings: number;
  tasks: number;
  deals: number;
  revenue: number;
};

export type WorkloadRow = {
  userId: string;
  userName: string;
  assignedLeads: number;
  assignedOpportunities: number;
  assignedTasks: number;
  pendingFollowUps: number;
};

export type CustomerEngagement = {
  contactedThisWeek: number;
  withoutActivity30d: number;
  upcomingRenewals: number;
  customerMeetings: number;
  openSupportIssues: number;
  healthScore: number;
};

export type ExecutiveAlert = {
  id: string;
  priority: "high" | "medium" | "low";
  tone: "danger" | "warning" | "success";
  message: string;
  ownerName: string | null;
  createdIso: string;
};

export type ExtendedOverviewFilters = {
  ownerId: string | null;
  source: string | null;
  role: string | null;
  teamId: string | null;
  department: string | null;
  leadStage: string | null;
  oppStage: string | null;
  territory: string | null;
  industry: string | null;
  dealStatus: string | null;
  revenueMin: number | null;
  revenueMax: number | null;
};

export type ExecutiveOverviewAdvanced = {
  todaySnapshot: TodaySnapshotMetric[];
  adoption: AdoptionRow[];
  inactiveUsers: InactiveUserRow[];
  followUpCompliance: FollowUpCompliance;
  leadAging: LeadAgingBucket[];
  slaBreaches: SlaBreachCard[];
  approvalCenter: ApprovalSummary;
  teamHeatmap: HeatmapCell[];
  workload: WorkloadRow[];
  customerEngagement: CustomerEngagement;
  executiveAlerts: ExecutiveAlert[];
  filters: ExtendedOverviewFilters;
};
