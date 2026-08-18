import { db } from "@/lib/db";
import { toCron, computeNextRun, type ScheduleConfig, type Recurrence } from "./cron";

/**
 * Bridge between a saved workflow and its WfSchedule row. A workflow whose
 * trigger event is `schedule.tick` carries a `schedule` block on its trigger
 * JSON; when the workflow is Active we keep exactly one WfSchedule row in sync
 * (cron + nextRunAt), and when it isn't we remove it.
 */

const RECURRENCES: Recurrence[] = [
  "every_day",
  "every_weekday",
  "every_week",
  "every_month",
  "every_quarter",
  "every_year",
];

/** Extract a ScheduleConfig from a workflow trigger, or null if not scheduled. */
export function scheduleConfigFromTrigger(trigger: unknown): ScheduleConfig | null {
  const t = (trigger ?? {}) as Record<string, unknown>;
  if (t.event !== "schedule.tick") return null;
  const s = (t.schedule ?? {}) as Record<string, unknown>;
  const recurrence = RECURRENCES.includes(s.recurrence as Recurrence)
    ? (s.recurrence as Recurrence)
    : "every_week";
  return {
    recurrence,
    time: typeof s.time === "string" ? s.time : undefined,
    dayOfWeek: typeof s.dayOfWeek === "string" ? s.dayOfWeek : undefined,
    dayOfMonth: typeof s.dayOfMonth === "number" ? s.dayOfMonth : undefined,
  };
}

/**
 * Reconcile the WfSchedule row for a workflow. Active + scheduled → upsert
 * (delete-then-create; there is one row per workflow). Otherwise → remove.
 * Returns the persisted { cron, nextRunAt } or null when removed.
 */
export async function syncSchedule(opts: {
  orgId: string;
  workflowId: string;
  trigger: unknown;
  active: boolean;
  from?: Date;
  tz?: string;
}): Promise<{ cron: string; nextRunAt: Date | null } | null> {
  const cfg = opts.active ? scheduleConfigFromTrigger(opts.trigger) : null;

  // Always clear the existing row first (idempotent; one row per workflow).
  await db.wfSchedule.deleteMany({ where: { workflowId: opts.workflowId } });
  if (!cfg) return null;

  const cron = toCron(cfg);
  const nextRunAt = computeNextRun(cron, opts.from ?? new Date(), opts.tz ?? "UTC");
  await db.wfSchedule.create({
    data: { orgId: opts.orgId, workflowId: opts.workflowId, cron, nextRunAt },
  });
  return { cron, nextRunAt };
}
