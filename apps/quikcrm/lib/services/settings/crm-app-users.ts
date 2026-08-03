/**
 * "Who is a QuikCRM user?" — the single source of truth.
 *
 * An org can contain members who only use other QuikIT apps (QuikScale,
 * QuikInfra, QuikHRMS, …). Being an active `OrgMember` therefore does NOT mean
 * the person is a CRM user; app membership is recorded in `quikit.UserAppAccess`
 * scoped to the QuikCRM `appId` (written by `ensureQuikCrmAppAccess`).
 *
 * Surfaces that list "salespeople" (e.g. Settings → Activity Targets → Assign
 * Targets) must intersect active org members with this set, otherwise they show
 * users from other modules who can never log an activity in the CRM.
 */
import { prisma } from "@/lib/db/prisma";
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";

/**
 * userIds in `orgId` that hold QuikCRM app access.
 *
 * Returns `null` — meaning "cannot determine, do not filter" — when the
 * QuikCRM App row is not registered (local/dev DBs seeded before the app
 * registry existed). Callers should treat `null` as "no filtering" rather than
 * as an empty set, so a missing registry row degrades to the previous
 * behaviour instead of emptying every list.
 */
export async function getCrmAppUserIds(orgId: string): Promise<Set<string> | null> {
  const appId = await getQuikCrmAppId();
  if (!appId) return null;

  const rows = await prisma.userAppAccess.findMany({
    where: { orgId, appId },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Filter a list of org members down to those with QuikCRM access, preserving
 * order. A `null` access set (unregistered app) passes everything through.
 */
export function filterToCrmAppUsers<T extends { userId: string }>(
  members: T[],
  crmUserIds: Set<string> | null,
): T[] {
  if (!crmUserIds) return members;
  return members.filter((m) => crmUserIds.has(m.userId));
}
