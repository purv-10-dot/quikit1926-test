/**
 * Derived metrics for the single-account 360 dashboard.
 */

import type { CrmOpportunityStage } from "@quikit/database";

export interface AccountDashboardSnapshot {
  openPipeline: number;
  wonRevenue12mo: number;
  openTasks: number;
  completedTasks: number;
  contactsCount: number;
  leadsCount: number;
  opportunitiesCount: number;
  activeQuotesCount: number;
  activitiesCount: number;
  callsCount: number;
  notesCount: number;
  documentsCount: number;
  lastTouchAt: string | null;
  daysToRenewal: number | null;
  renewalAlert: "none" | "watch" | "urgent" | "overdue";
  /** No touch in the last 30 days (or never touched). */
  isStaleTouch: boolean;
}

const CLOSED_STAGES: CrmOpportunityStage[] = ["ClosedWon", "ClosedLost"];

type OppLike = {
  stage: string;
  amount?: unknown;
  updatedAt?: Date | string | null;
  closeDate?: Date | string | null;
};
type TaskLike = { status: string };
type QuoteLike = { status: string };
type ActivityLike = {
  occurredAt?: Date | string | null;
  createdAt?: Date | string | null;
};

function toMs(d: Date | string | null | undefined): number | null {
  if (d == null) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

function oppAmount(o: OppLike): number {
  const amt = o.amount != null ? Number(o.amount) : 0;
  return Number.isNaN(amt) ? 0 : amt;
}

export function buildAccountDashboardSnapshot(input: {
  renewalDate: Date | string | null;
  opportunities: OppLike[];
  quotes: QuoteLike[];
  tasks: TaskLike[];
  activities: ActivityLike[];
  callLogs: unknown[];
  notes: unknown[];
  attachments: unknown[];
  contacts: unknown[];
  leads: unknown[];
  now?: Date;
}): AccountDashboardSnapshot {
  const now = input.now ?? new Date();
  const yearAgo = now.getTime() - 365 * 24 * 60 * 60 * 1000;

  let openPipeline = 0;
  let wonRevenue12mo = 0;
  for (const o of input.opportunities) {
    const amt = oppAmount(o);
    if (CLOSED_STAGES.includes(o.stage as CrmOpportunityStage)) {
      if (o.stage === "ClosedWon") {
        const at = toMs(o.updatedAt ?? o.closeDate);
        if (at != null && at >= yearAgo) wonRevenue12mo += amt;
      }
    } else {
      openPipeline += amt;
    }
  }

  let openTasks = 0;
  let completedTasks = 0;
  for (const t of input.tasks) {
    if (t.status === "Completed" || t.status === "Cancelled") completedTasks += 1;
    else openTasks += 1;
  }

  let activeQuotesCount = 0;
  for (const q of input.quotes) {
    const s = q.status.toLowerCase();
    if (s === "draft" || s === "active") activeQuotesCount += 1;
  }

  let lastMs: number | null = null;
  for (const a of input.activities) {
    const ms = toMs(a.occurredAt ?? a.createdAt);
    if (ms == null) continue;
    if (lastMs == null || ms > lastMs) lastMs = ms;
  }

  let daysToRenewal: number | null = null;
  let renewalAlert: AccountDashboardSnapshot["renewalAlert"] = "none";
  const renewalMs = toMs(input.renewalDate);
  if (renewalMs != null) {
    daysToRenewal = Math.round((renewalMs - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysToRenewal < 0) renewalAlert = "overdue";
    else if (daysToRenewal < 30) renewalAlert = "urgent";
    else if (daysToRenewal < 90) renewalAlert = "watch";
  }

  const staleMs = 30 * 24 * 60 * 60 * 1000;
  const isStaleTouch = lastMs == null || now.getTime() - lastMs > staleMs;

  return {
    openPipeline,
    wonRevenue12mo,
    openTasks,
    completedTasks,
    contactsCount: input.contacts.length,
    leadsCount: input.leads.length,
    opportunitiesCount: input.opportunities.length,
    activeQuotesCount,
    activitiesCount: input.activities.length,
    callsCount: input.callLogs.length,
    notesCount: input.notes.length,
    documentsCount: input.attachments.length,
    lastTouchAt: lastMs != null ? new Date(lastMs).toISOString() : null,
    daysToRenewal,
    renewalAlert,
    isStaleTouch,
  };
}
