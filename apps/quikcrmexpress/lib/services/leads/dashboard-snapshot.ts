/**
 * Derived metrics for the single-lead dashboard (overview KPIs + alerts).
 * Pure function — safe for unit tests without DB.
 */

export interface LeadDashboardSnapshot {
  openTasks: number;
  completedTasks: number;
  activitiesCount: number;
  callsCount: number;
  emailsCount: number;
  meetingsCount: number;
  notesCount: number;
  opportunitiesCount: number;
  documentsCount: number;
  revenueTotal: number;
  daysSinceCreated: number;
  nextFollowUpAt: string | null;
  slaAlerts: { ruleName: string; status: string; breachAt: string | null }[];
  /** Week-over-week deltas (current 7d vs prior 7d) as percentages. */
  trends: {
    calls: number;
    tasks: number;
    emails: number;
    activities: number;
  };
}

type TaskLike = { status: string; createdAt?: Date | string | null };
type ActivityLike = {
  followUpAt: Date | string | null;
  type?: string;
  activityCode?: string | null;
  occurredAt?: Date | string | null;
  createdAt?: Date | string | null;
};
type OppLike = { amount?: unknown; createdAt?: Date | string | null };
type SlaLike = { ruleName: string; status: string; breachAt: Date | string | null };

function toMs(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

export function buildLeadDashboardSnapshot(input: {
  createdAt: Date | string;
  tasks: TaskLike[];
  activities: ActivityLike[];
  notes: unknown[];
  opportunities: unknown[];
  callLogs: unknown[];
  attachments: unknown[];
  slaTracking: SlaLike[];
  now?: Date;
}): LeadDashboardSnapshot {
  const now = input.now ?? new Date();
  const createdMs = toMs(input.createdAt) ?? now.getTime();
  const daysSinceCreated = Math.max(
    0,
    Math.floor((now.getTime() - createdMs) / (24 * 60 * 60 * 1000)),
  );

  let openTasks = 0;
  let completedTasks = 0;
  for (const t of input.tasks) {
    if (t.status === "Completed" || t.status === "Cancelled") completedTasks += 1;
    else openTasks += 1;
  }

  const nowMs = now.getTime();
  let nextFollowUpAt: string | null = null;
  let nextMs: number | null = null;
  for (const a of input.activities) {
    const ms = toMs(a.followUpAt);
    if (ms == null || ms <= nowMs) continue;
    if (nextMs == null || ms < nextMs) {
      nextMs = ms;
      nextFollowUpAt = new Date(ms).toISOString();
    }
  }

  let emailsCount = 0;
  let meetingsCount = 0;
  for (const a of input.activities) {
    const t = `${a.type ?? ""} ${a.activityCode ?? ""}`.toLowerCase();
    if (t.includes("email")) emailsCount += 1;
    if (t.includes("meeting")) meetingsCount += 1;
  }

  let revenueTotal = 0;
  for (const o of input.opportunities as OppLike[]) {
    const amt = o.amount != null ? Number(o.amount) : 0;
    if (!Number.isNaN(amt)) revenueTotal += amt;
  }

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const trendWindow = (at: Date | string | null | undefined): "current" | "prior" | "skip" => {
    const ms = toMs(at);
    if (ms == null) return "skip";
    const diff = now.getTime() - ms;
    if (diff >= 0 && diff < weekMs) return "current";
    if (diff >= weekMs && diff < 2 * weekMs) return "prior";
    return "skip";
  };

  const countTrend = (current: number, prior: number): number => {
    if (prior === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prior) / prior) * 100);
  };

  let callsCur = 0;
  let callsPrior = 0;
  for (const c of input.callLogs as { createdAt?: Date | string | null; startTime?: Date | string | null }[]) {
    const w = trendWindow(c.startTime ?? c.createdAt);
    if (w === "current") callsCur += 1;
    if (w === "prior") callsPrior += 1;
  }

  let tasksCur = 0;
  let tasksPrior = 0;
  for (const t of input.tasks) {
    const w = trendWindow(t.createdAt);
    if (w === "current") tasksCur += 1;
    if (w === "prior") tasksPrior += 1;
  }

  let emailsCur = 0;
  let emailsPrior = 0;
  let actCur = 0;
  let actPrior = 0;
  for (const a of input.activities) {
    const w = trendWindow(a.occurredAt ?? a.createdAt);
    if (w === "current") {
      actCur += 1;
      const t = `${a.type ?? ""} ${a.activityCode ?? ""}`.toLowerCase();
      if (t.includes("email")) emailsCur += 1;
    }
    if (w === "prior") {
      actPrior += 1;
      const t = `${a.type ?? ""} ${a.activityCode ?? ""}`.toLowerCase();
      if (t.includes("email")) emailsPrior += 1;
    }
  }

  const slaAlerts = input.slaTracking
    .filter((s) => {
      const st = s.status.toLowerCase();
      return st.includes("breach") || st.includes("overdue") || st.includes("at_risk");
    })
    .map((s) => ({
      ruleName: s.ruleName,
      status: s.status,
      breachAt: s.breachAt ? new Date(s.breachAt).toISOString() : null,
    }));

  return {
    openTasks,
    completedTasks,
    activitiesCount: input.activities.length,
    callsCount: input.callLogs.length,
    emailsCount,
    meetingsCount,
    notesCount: input.notes.length,
    opportunitiesCount: input.opportunities.length,
    documentsCount: input.attachments.length,
    revenueTotal,
    daysSinceCreated,
    nextFollowUpAt,
    slaAlerts,
    trends: {
      calls: countTrend(callsCur, callsPrior),
      tasks: countTrend(tasksCur, tasksPrior),
      emails: countTrend(emailsCur, emailsPrior),
      activities: countTrend(actCur, actPrior),
    },
  };
}
