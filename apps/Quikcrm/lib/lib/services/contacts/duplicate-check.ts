import { prisma } from "@/lib/db/prisma";

/**
 * Look up an existing contact in the same tenant with the same email
 * (case-insensitive). Used for the duplicate-email 409 path on create/update.
 *
 * Returns `null` if the email is empty, falsy, or has no match.
 */
export async function findDuplicateContactByEmail(
  orgId: string,
  email: string | null | undefined,
  excludeId?: string,
): Promise<{ id: string; firstName: string; lastName: string | null } | null> {
  if (!email) return null;
  const normalised = email.trim().toLowerCase();
  if (!normalised) return null;
  const dup = await prisma.crmContact.findFirst({
    where: {
      orgId,
      deletedAt: null,
      email: { equals: normalised, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
  });
  return dup;
}
