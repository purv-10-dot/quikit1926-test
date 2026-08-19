/**
 * Date scan (Phase S2) — fires relative-date triggers. Runs ~once/day: for each
 * Active workflow whose trigger is a date rule (www.due.approaching / www.overdue
 * / …), it queries that module for records hitting the offset window and enqueues
 * a TARGETED event per record. Kept BullMQ-free so it's unit-testable.
 *
 * Idempotency: dedupeKey includes the calendar day, so re-scanning the same day
 * never double-fires a record.
 */
import { db } from "@/lib/db";
import { enqueueEvent } from "@/lib/queue/queue";
import { DATE_RULES, dateRuleFor, type DateRule } from "@/lib/schedule/date-rules";

const DAY_MS = 86_400_000;
const MAX_ROWS = 500;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

interface Delegate {
  findMany(args: unknown): Promise<{ id: string }[]>;
}
function delegate(model: string): Delegate {
  const d = (db as unknown as Record<string, Delegate | undefined>)[model];
  if (!d) throw new Error(`No Prisma delegate for "${model}"`);
  return d;
}

/** Build the where-clause window for a rule + offset relative to `now`. */
function buildWhere(rule: DateRule, orgId: string, now: Date, offsetDays: number): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId };
  if (rule.softDelete) where.deletedAt = null;
  if (rule.excludeStatusColumn && rule.excludeStatusValues?.length) {
    where[rule.excludeStatusColumn] = { notIn: rule.excludeStatusValues };
  }
  if (rule.mode === "before") {
    // The date falls on the day `offsetDays` from today (start-inclusive, next-day-exclusive).
    const target = startOfUtcDay(addDays(now, offsetDays));
    where[rule.dateColumn] = { gte: target, lt: addDays(target, 1) };
  } else {
    // Overdue: strictly before today.
    where[rule.dateColumn] = { lt: startOfUtcDay(now) };
  }
  return where;
}

export async function runDateScan(now: Date = new Date()): Promise<{ fired: number }> {
  // Only Active workflows whose trigger is one of the date-rule events.
  const events = DATE_RULES.map((r) => r.event);
  const workflows = await db.wfWorkflow.findMany({
    where: { status: "Active", deletedAt: null },
    select: { id: true, orgId: true, trigger: true },
  });

  const dayKey = startOfUtcDay(now).toISOString().slice(0, 10);
  let fired = 0;

  for (const wf of workflows) {
    const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
    const eventId = typeof trigger.event === "string" ? trigger.event : "";
    if (!events.includes(eventId)) continue;
    const rule = dateRuleFor(eventId)!;
    const offsetDays =
      rule.mode === "before"
        ? Number(trigger.offsetDays ?? rule.defaultOffsetDays ?? 3)
        : 0;

    const where = buildWhere(rule, wf.orgId, now, offsetDays);
    const rows = await delegate(rule.model).findMany({ where, select: { id: true }, take: MAX_ROWS });

    for (const row of rows) {
      try {
        await enqueueEvent({
          app: "quikscale",
          event: rule.event,
          orgId: wf.orgId,
          dedupeKey: `${rule.event}:${wf.id}:${row.id}:${dayKey}`,
          data: { workflowId: wf.id, recordId: row.id, [`${rule.moduleKey}Id`]: row.id },
          occurredAt: now.toISOString(),
        });
        fired += 1;
      } catch {
        // One bad enqueue shouldn't abort the whole scan.
      }
    }
  }
  return { fired };
}
