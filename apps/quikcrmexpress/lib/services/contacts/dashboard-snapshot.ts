/**
 * Derived metrics for the single-contact 360 dashboard.
 */

import type { QceOpportunityStage } from "@quikit/database";

export interface ContactDashboardSnapshot {
  openTasks: number;
  completedTasks: number;
  activitiesCount: number;
  notesCount: number;
  documentsCount: number;
  opportunitiesCount: number;
  openPipeline: number;
  callsCount: number;
  lastTouchAt: string | null;
  isStaleTouch: boolean;
}

const CLOSED_STAGES: QceOpportunityStage[] = ["ClosedWon", "ClosedLost"];

type OppLike = { stage: string; amount?: unknown };
type TaskLike = { status: string };
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

export function buildContactDashboardSnapshot(input: {
  opportunities: OppLike[];
  tasks: TaskLike[];
  activities: ActivityLike[];
  callLogs: unknown[];
  notes: unknown[];
  attachments: unknown[];
  now?: Date;
}): ContactDashboardSnapshot {
  const now = input.now ?? new Date();

  let openPipeline = 0;
  for (const o of input.opportunities) {
    if (!CLOSED_STAGES.includes(o.stage as QceOpportunityStage)) {
      openPipeline += oppAmount(o);
    }
  }

  let openTasks = 0;
  let completedTasks = 0;
  for (const t of input.tasks) {
    if (t.status === "Completed" || t.status === "Cancelled") completedTasks += 1;
    else openTasks += 1;
  }

  let lastMs: number | null = null;
  for (const a of input.activities) {
    const ms = toMs(a.occurredAt ?? a.createdAt);
    if (ms == null) continue;
    if (lastMs == null || ms > lastMs) lastMs = ms;
  }

  const staleMs = 30 * 24 * 60 * 60 * 1000;
  const isStaleTouch = lastMs == null || now.getTime() - lastMs > staleMs;

  return {
    openTasks,
    completedTasks,
    activitiesCount: input.activities.length,
    notesCount: input.notes.length,
    documentsCount: input.attachments.length,
    opportunitiesCount: input.opportunities.length,
    openPipeline,
    callsCount: input.callLogs.length,
    lastTouchAt: lastMs != null ? new Date(lastMs).toISOString() : null,
    isStaleTouch,
  };
}
