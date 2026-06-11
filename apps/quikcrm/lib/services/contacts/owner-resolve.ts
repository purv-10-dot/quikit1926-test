import { prisma } from "@/lib/db/prisma";

/**
 * Resolve a `ownerId` (User.id) to `{ ownerId, ownerName }` by joining
 * Membership → User in the caller's tenant. Throws a 400-flagged Error if
 * the userId is not a member of the tenant.
 *
 * The CRM stores `ownerName` as a denormalised cache so list views don't
 * have to join across schemas. The cache is refreshed whenever a contact
 * is created/updated — there is no rename-propagation hook today.
 */
export async function resolveOwnerForTenant(
  orgId: string,
  ownerId: string,
): Promise<{ ownerId: string; ownerName: string }> {
  const m = await prisma.orgMember.findFirst({
    where: { orgId: orgId, userId: ownerId, status: "active" },
    select: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!m?.user) {
    const err = new Error("Owner not found in this tenant") as Error & {
      statusCode?: number;
      fieldErrors?: Record<string, string>;
    };
    err.statusCode = 400;
    err.fieldErrors = { ownerId: "User is not a member of this tenant" };
    throw err;
  }
  const fullName =
    `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email;
  return { ownerId: m.user.id, ownerName: fullName };
}
