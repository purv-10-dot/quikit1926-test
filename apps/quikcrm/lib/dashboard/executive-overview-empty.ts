import type { ExecutiveOverviewAdvanced } from "@/lib/dashboard/executive-overview-advanced-types";

/** Safe fallback when advanced metrics fail to load — keeps the UI from crashing. */
export function emptyExecutiveOverviewAdvanced(): ExecutiveOverviewAdvanced {
  return {
    todaySnapshot: [],
    adoption: [],
    inactiveUsers: [],
    followUpCompliance: {
      totalAssigned: 0,
      completedOnTime: 0,
      completedLate: 0,
      overdue: 0,
      missed: 0,
      compliancePct: 0,
    },
    leadAging: [],
    slaBreaches: [],
    approvalCenter: { pending: 0, approved: 0, rejected: 0, rows: [] },
    teamHeatmap: [],
    workload: [],
    customerEngagement: {
      contactedThisWeek: 0,
      withoutActivity30d: 0,
      upcomingRenewals: 0,
      customerMeetings: 0,
      openSupportIssues: 0,
      healthScore: 0,
    },
    executiveAlerts: [],
    filters: {
      ownerId: null,
      source: null,
      role: null,
      teamId: null,
      department: null,
      leadStage: null,
      oppStage: null,
      territory: null,
      industry: null,
      dealStatus: null,
      revenueMin: null,
      revenueMax: null,
    },
  };
}
