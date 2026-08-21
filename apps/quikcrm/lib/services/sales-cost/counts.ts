/**
 * The CRM record counts a rep's cost is divided by.
 *
 * These are read LIVE from the existing CRM tables using the existing ownership
 * columns. This module deliberately stores nothing and introduces no second
 * ownership system — that is the whole point of requirement 7 ("correct sales
 * rep attribution"): the same `ownerId` that drives the Leads list drives
 * cost-per-lead, so the two can never disagree.
 *
 * Ownership columns, as they exist in the schema today:
 *
 *   Leads         CrmLead.ownerId
 *   Prospects     CrmProspect.savedById   (NOT ownerId — see lib/auth/prospect-acl.ts)
 *   Opportunities CrmOpportunity.ownerId
 *   Won deals     CrmOpportunity.ownerId + stage = ClosedWon
 *
 * PERIOD SEMANTICS. A cost is monthly, so the counts it is divided by must be
 * monthly too: we count records CREATED within the period (and, for won deals,
 * records CLOSED within it — a deal won in August is August's return, whenever
 * it was created). Counting all-time records against one month's cost would
 * make cost-per-lead fall forever as history accumulates, which is not a
 * meaningful metric.
 */
import { prisma } from "@/lib/db/prisma";
import type { Period } from "./period";
import type { RepCounts } from "./calculate";

/**
 * Stage values that mark an opportunity as won. Mirrors the
 * `CrmOpportunityStage` enum — see apps/quikcrm/CLAUDE.md "Opportunities —
 * stage enum / label mapping", where `ClosedWon` is the wire value rendered as
 * "Won".
 */
const WON_STAGE = "ClosedWon" as const;

/**
 * Count leads / prospects / opportunities / won deals owned by one rep in one
 * period. All four queries are org-scoped and run concurrently.
 */
export async function getRepCounts(
  orgId: string,
  userId: string,
  period: Period,
): Promise<RepCounts> {
  const createdInPeriod = { gte: period.start, lt: period.end };

  const [leads, prospects, opportunities, wonDeals] = await Promise.all([
    // Leads owned by this rep, created in the period. Soft-deleted leads are
    // excluded so a deleted lead does not keep depressing cost-per-lead.
    prisma.crmLead.count({
      where: {
        orgId,
        ownerId: userId,
        deletedAt: null,
        createdAt: createdInPeriod,
      },
    }),

    // Prospects are LinkedIn-extension captures owned via `savedById`, not
    // `ownerId`. CrmProspect has no `deletedAt` column, so there is no
    // soft-delete filter to apply here.
    prisma.crmProspect.count({
      where: {
        orgId,
        savedById: userId,
        createdAt: createdInPeriod,
      },
    }),

    prisma.crmOpportunity.count({
      where: {
        orgId,
        ownerId: userId,
        deletedAt: null,
        createdAt: createdInPeriod,
      },
    }),

    // Won deals are counted by WHEN THEY CLOSED, not when they were created:
    // the return a month's spend produced is the deals won in that month.
    // `closeDate` is the business close date; `lastStageChangeAt` is a fallback
    // for rows won without one being set.
    prisma.crmOpportunity.count({
      where: {
        orgId,
        ownerId: userId,
        deletedAt: null,
        stage: WON_STAGE,
        OR: [
          { closeDate: createdInPeriod },
          { closeDate: null, lastStageChangeAt: createdInPeriod },
        ],
      },
    }),
  ]);

  return { leads, prospects, opportunities, wonDeals };
}

/**
 * The same four counts for many reps at once, as `userId -> RepCounts`.
 *
 * Uses four grouped aggregates instead of 4×N per-rep queries so the all-reps
 * summary table stays at constant query count as the org grows. Reps with no
 * records in the period are filled in with zeros, so every requested userId is
 * always present in the result.
 */
export async function getRepCountsBulk(
  orgId: string,
  userIds: string[],
  period: Period,
): Promise<Record<string, RepCounts>> {
  const out: Record<string, RepCounts> = {};
  for (const id of userIds) {
    out[id] = { leads: 0, prospects: 0, opportunities: 0, wonDeals: 0 };
  }
  if (userIds.length === 0) return out;

  const createdInPeriod = { gte: period.start, lt: period.end };
  const ownedByAny = { in: userIds };

  const [leadRows, prospectRows, oppRows, wonRows] = await Promise.all([
    prisma.crmLead.groupBy({
      by: ["ownerId"],
      where: { orgId, ownerId: ownedByAny, deletedAt: null, createdAt: createdInPeriod },
      _count: { _all: true },
    }),
    prisma.crmProspect.groupBy({
      by: ["savedById"],
      where: { orgId, savedById: ownedByAny, createdAt: createdInPeriod },
      _count: { _all: true },
    }),
    prisma.crmOpportunity.groupBy({
      by: ["ownerId"],
      where: { orgId, ownerId: ownedByAny, deletedAt: null, createdAt: createdInPeriod },
      _count: { _all: true },
    }),
    prisma.crmOpportunity.groupBy({
      by: ["ownerId"],
      where: {
        orgId,
        ownerId: ownedByAny,
        deletedAt: null,
        stage: WON_STAGE,
        OR: [
          { closeDate: createdInPeriod },
          { closeDate: null, lastStageChangeAt: createdInPeriod },
        ],
      },
      _count: { _all: true },
    }),
  ]);

  for (const r of leadRows) {
    if (r.ownerId && out[r.ownerId]) out[r.ownerId].leads = r._count._all;
  }
  for (const r of prospectRows) {
    if (r.savedById && out[r.savedById]) out[r.savedById].prospects = r._count._all;
  }
  for (const r of oppRows) {
    if (r.ownerId && out[r.ownerId]) out[r.ownerId].opportunities = r._count._all;
  }
  for (const r of wonRows) {
    if (r.ownerId && out[r.ownerId]) out[r.ownerId].wonDeals = r._count._all;
  }

  return out;
}
