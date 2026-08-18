// Activity ACL — restricted users see activities whose related
// Lead/Opp/Contact/Account is in their account scope, PLUS any activity
// they own (ownerId = user.userId). Ownership always grants visibility
// regardless of account scope so a user can always see what they logged.
import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/auth/account-acl";
import type { SessionUser } from "@/types/permission";

/**
 * Build a Prisma `where` fragment that restricts CrmActivity rows to the
 * user's account scope. Returns `null` when the user is unrestricted —
 * caller should skip the AND.
 *
 * Strategy: resolve scope once, then for each kind compute the list of
 * relatedObjectIds whose parent record is in scope. The fragment is a flat
 * OR over (relatedKind + id-in) tuples, plus a special branch for rows
 * whose relatedOrphanedAt is set (those stay visible — audit trail).
 */
export async function buildActivityAclWhere(
  user: SessionUser,
): Promise<Record<string, unknown> | null> {
  const scope = await getScope(user);
  if (scope.unrestricted) return null;

  const orgId = user.orgId;
  const allowed = scope.allowedAccountIds;

  // No allowed accounts → only show activities the user owns.
  if (allowed.length === 0) {
    return { ownerId: user.userId };
  }

  const [leads, opps, contacts] = await Promise.all([
    prisma.crmLead.findMany({
      where: { orgId, OR: [{ accountId: { in: allowed } }, { accountId: null }] },
      select: { id: true },
    }),
    prisma.crmOpportunity.findMany({
      where: { orgId, OR: [{ accountId: { in: allowed } }, { accountId: null }] },
      select: { id: true },
    }),
    prisma.crmContact.findMany({
      where: { orgId, OR: [{ accountId: { in: allowed } }, { accountId: null }] },
      select: { id: true },
    }),
  ]);

  const leadIds = leads.map((x) => x.id);
  const oppIds = opps.map((x) => x.id);
  const contactIds = contacts.map((x) => x.id);

  return {
    OR: [
      { ownerId: user.userId },
      { relatedOrphanedAt: { not: null } },
      { relatedKind: { in: ["Account", "account"] }, relatedObjectId: { in: allowed } },
      { relatedKind: { in: ["Lead", "lead"] }, relatedObjectId: { in: leadIds } },
      { relatedKind: { in: ["Opportunity", "opportunity"] }, relatedObjectId: { in: oppIds } },
      { relatedKind: { in: ["Contact", "contact"] }, relatedObjectId: { in: contactIds } },
    ],
  };
  // Note: Prospect / Upwork activities are intentionally absent from this OR.
  // Neither record has an `accountId`, so account scope cannot express "in
  // scope" for them. They surface for a restricted user only via the
  // `{ ownerId: user.userId }` branch above — the same rule the Upwork job
  // timeline already documents. Adding a blanket kind branch here would leak
  // every prospect's activities to every restricted user.
}
