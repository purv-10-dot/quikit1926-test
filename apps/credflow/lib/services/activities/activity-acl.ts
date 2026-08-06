// Activity ACL — port of the Contacts pattern. Restricted users only see
// activities whose related Lead/Opp/Contact/Account is in their account
// scope. Per the plan: "Strict" (rows out-of-scope are excluded entirely;
// owning the activity does NOT grant access if the related record is out
// of scope).
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

  const tenantId = user.tenantId;
  const allowed = scope.allowedAccountIds;

  // No allowed accounts → the user can see only orphaned rows that they
  // own. Empty case keeps things simple: return a where that matches
  // nothing (`id: { in: [] }` would also work but is more obscure).
  if (allowed.length === 0) {
    return { id: { in: [] as string[] } };
  }

  const [leads, opps, contacts] = await Promise.all([
    prisma.crmLead.findMany({
      where: { tenantId, OR: [{ accountId: { in: allowed } }, { accountId: null }] },
      select: { id: true },
    }),
    prisma.crmOpportunity.findMany({
      where: { tenantId, OR: [{ accountId: { in: allowed } }, { accountId: null }] },
      select: { id: true },
    }),
    prisma.crmContact.findMany({
      // CrmContact isn't middleware-protected; exclude trashed so activities tied
      // to deleted contacts don't leak into the visibility scope.
      where: { tenantId, deletedAt: null, OR: [{ accountId: { in: allowed } }, { accountId: null }] },
      select: { id: true },
    }),
  ]);

  const leadIds = leads.map((x) => x.id);
  const oppIds = opps.map((x) => x.id);
  const contactIds = contacts.map((x) => x.id);

  return {
    OR: [
      { relatedOrphanedAt: { not: null } },
      { relatedKind: { in: ["Account", "account"] }, relatedObjectId: { in: allowed } },
      { relatedKind: { in: ["Lead", "lead"] }, relatedObjectId: { in: leadIds } },
      { relatedKind: { in: ["Opportunity", "opportunity"] }, relatedObjectId: { in: oppIds } },
      { relatedKind: { in: ["Contact", "contact"] }, relatedObjectId: { in: contactIds } },
    ],
  };
}
