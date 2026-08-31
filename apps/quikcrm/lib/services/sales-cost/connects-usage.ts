/**
 * How many Upwork Connects a sales rep consumed in one month, and what that
 * costs at the org's configured Connects price.
 *
 * READS EXISTING UPWORK DATA ONLY. The Connects figures come from the columns
 * the proposal capture already writes on `CrmUpworkJob` — `connectsUsed` and
 * `boostConnects`. This module creates no storage of its own, writes nothing,
 * and does not touch the proposal/job extraction path: it is a read-side
 * aggregation over rows that already exist.
 *
 * Three deliberate scoping decisions, all of them the caller's stated contract:
 *
 *   REP     — a job belongs to the rep in `createdByUserId` (the user whose
 *             extension captured it). CrmUpworkJob has no dedicated owner
 *             column, so this is the ownership signal that exists.
 *   PERIOD  — a proposal counts toward the month it was SUBMITTED in, keyed on
 *             `proposalSubmittedAt` and bounded by the half-open UTC window
 *             from parsePeriod(). Upwork does not render a submitted date on
 *             every proposal page, so when that column is null the row falls
 *             back to `updatedAt` — the moment the proposal was actually saved
 *             onto the job. See the fallback note on the query below.
 *   PROPOSAL— a job is counted ONLY if it carries real proposal data. Merely
 *             existing is not enough: most captured jobs are saved for research
 *             and were never bid on.
 *   DELETED — soft-deleted jobs (`deletedAt`) are excluded, matching every
 *             other read of this table.
 *
 * The cost math is intentionally the caller's formula, unchanged:
 *
 *   totalConnectsUsed = connectsUsed + (boostConnects ?? 0)
 *   costUsd           = (totalConnectsUsed / packageConnects) * packagePriceUsd
 *   costInr           = costUsd * usdToInr
 *
 * USD is an intermediate figure for display/verification; INR is what gets
 * stored as the tool's cost.
 */
import { prisma } from "@/lib/db/prisma";
import { round2 } from "@/lib/services/sales-cost/calculate";
import {
  getUpworkConnectsConfig,
  type UpworkConnectsConfig,
} from "@/lib/services/sales-cost/connects-config";
import type { Period } from "@/lib/services/sales-cost/period";

export interface ConnectsUsage {
  /** `YYYY-MM` the figures were computed for. */
  period: string;
  userId: string;
  /** Jobs with a proposal submitted in this period by this rep. */
  proposalCount: number;
  /** Sum of `connectsUsed`, excluding boost. */
  baseConnects: number;
  /** Sum of `boostConnects`. Kept separate so the split stays visible. */
  boostConnects: number;
  /** baseConnects + boostConnects — the figure the cost is derived from. */
  totalConnectsUsed: number;
  /** The config the cost below was computed with, echoed for the UI. */
  config: UpworkConnectsConfig;
  costUsd: number;
  costInr: number;
}

/**
 * Cost of a Connects quantity. Pure — no DB, no session — so the arithmetic is
 * unit-testable with literals, matching the convention in calculate.ts.
 *
 * `packageConnects` is validated positive by the config schema; the guard here
 * is a second line of defence so a hand-edited settings blob yields 0 rather
 * than Infinity leaking into a stored cost.
 */
export function computeConnectsCost(
  totalConnectsUsed: number,
  config: UpworkConnectsConfig,
): { costUsd: number; costInr: number } {
  const { packageConnects, packagePriceUsd, usdToInr } = config;
  if (
    !Number.isFinite(totalConnectsUsed) ||
    totalConnectsUsed <= 0 ||
    !Number.isFinite(packageConnects) ||
    packageConnects <= 0
  ) {
    return { costUsd: 0, costInr: 0 };
  }
  // Rounded only at the boundaries: the USD figure is what the user verifies
  // against Upwork, and the INR figure is what lands in Decimal(18,2).
  const costUsd = round2((totalConnectsUsed / packageConnects) * packagePriceUsd);
  const costInr = round2(costUsd * usdToInr);
  return { costUsd, costInr };
}

/**
 * Aggregate one rep's Connects for one period and price them.
 *
 * Uses `aggregate` rather than fetching rows: only the two sums and a count are
 * needed, so the whole job set never crosses the wire.
 */
export async function getConnectsUsage(
  orgId: string,
  userId: string,
  period: Period,
): Promise<ConnectsUsage> {
  const config = await getUpworkConnectsConfig(orgId);

  const agg = await prisma.crmUpworkJob.aggregate({
    where: {
      orgId,
      createdByUserId: userId,
      deletedAt: null,

      // Must carry REAL proposal data. A job with none of these was never bid
      // on (most captured jobs are research), and counting it would inflate the
      // proposal count with rows that contribute no Connects.
      OR: [
        { proposalId: { not: null } },
        { connectsUsed: { not: null } },
        { boostConnects: { not: null } },
      ],

      // Period, with a fallback. `proposalSubmittedAt` is authoritative when
      // present — half-open [start, end), so a proposal submitted at 00:00 on
      // the 1st of the next month belongs to that month, never to this one.
      //
      // Upwork does not render a submitted date on every proposal page, so that
      // column is legitimately null for real proposals. Those rows fall back to
      // `updatedAt`, which is when the proposal was saved onto the job — the
      // closest existing evidence of when it happened. No date is invented: a
      // row is only ever placed in the month of a timestamp it already has.
      //
      // `updatedAt` is a general row-touch column (a later edit bumps it), so it
      // is deliberately the SECOND choice and never overrides a real submitted
      // date.
      AND: [
        {
          OR: [
            { proposalSubmittedAt: { gte: period.start, lt: period.end } },
            {
              proposalSubmittedAt: null,
              updatedAt: { gte: period.start, lt: period.end },
            },
          ],
        },
      ],
    },
    _sum: { connectsUsed: true, boostConnects: true },
    _count: { _all: true },
  });

  // `_sum` is null when no row matched, and each column is independently null
  // when every matched row had NULL there — both mean "nothing spent" here.
  const baseConnects = agg._sum.connectsUsed ?? 0;
  const boostConnects = agg._sum.boostConnects ?? 0;
  const totalConnectsUsed = baseConnects + boostConnects;

  const { costUsd, costInr } = computeConnectsCost(totalConnectsUsed, config);

  return {
    period: period.key,
    userId,
    proposalCount: agg._count._all,
    baseConnects,
    boostConnects,
    totalConnectsUsed,
    config,
    costUsd,
    costInr,
  };
}
