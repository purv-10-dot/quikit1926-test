/**
 * [P2.1] Runtime loop guard (SPEC §6 / Build-Plan Task 2.1).
 *
 * Counts lead-mutating AUTOMATED writes per lead per UTC calendar day. When the
 * count exceeds the cap the lead is marked Terminated (observable) and the
 * engine stops writing for that lead — so a runaway/self-referential rule can
 * never churn a lead indefinitely.
 *
 * Dual-engine: the SAME counter is incremented by BOTH the workflow engine and
 * the legacy disposition engine (via `source`), so a cross-engine ping-pong is
 * caught below either engine's individual cap — the CrmExpress-specific
 * requirement from SPEC §6.
 */
import { prisma } from "@/lib/db/prisma";

/**
 * Default per-lead/day cap on automated lead-mutating writes. LSQ uses
 * 50/lead/day; CrmExpress adopts the same default. Overridable via the
 * AUTOMATION_LOOP_CAP env var (tests set it low to force termination quickly).
 */
export const AUTOMATION_LOOP_CAP_DEFAULT = 50;

export function loopCap(): number {
  const n = Number(process.env.AUTOMATION_LOOP_CAP);
  return Number.isFinite(n) && n > 0 ? n : AUTOMATION_LOOP_CAP_DEFAULT;
}

export type EngineSource = "automation" | "legacy-disposition";

/** UTC calendar-day key (the app is UTC-only — Engineering-Practices B1.6). */
export function loopDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface LoopGuardResult {
  count: number;
  terminated: boolean;
  cap: number;
}

/**
 * Count ONE lead-mutating automated write toward the per-lead/day cap and
 * report whether the lead is now terminated. Atomic increment via upsert; the
 * row is keyed on (orgId, leadId, day) so both engines share it.
 */
export async function recordWriteAndCheck(opts: {
  orgId: string;
  leadId: string;
  source: EngineSource;
  now?: Date;
}): Promise<LoopGuardResult> {
  const day = loopDayKey(opts.now);
  const cap = loopCap();
  const row = await prisma.qceAutomationLeadDayCount.upsert({
    where: { orgId_leadId_day: { orgId: opts.orgId, leadId: opts.leadId, day } },
    create: { orgId: opts.orgId, leadId: opts.leadId, day, count: 1 },
    update: { count: { increment: 1 } },
  });
  const terminated = row.count > cap;
  if (terminated && !row.terminated) {
    await prisma.qceAutomationLeadDayCount.update({
      where: { orgId_leadId_day: { orgId: opts.orgId, leadId: opts.leadId, day } },
      data: { terminated: true },
    });
  }
  return { count: row.count, terminated, cap };
}

/** Read-only: has this lead hit the loop cap (Terminated) for the given day? */
export async function isLeadTerminated(
  orgId: string,
  leadId: string,
  now?: Date,
): Promise<boolean> {
  const row = await prisma.qceAutomationLeadDayCount.findUnique({
    where: { orgId_leadId_day: { orgId, leadId, day: loopDayKey(now) } },
  });
  return row?.terminated ?? false;
}
