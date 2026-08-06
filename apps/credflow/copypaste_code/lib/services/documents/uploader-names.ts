import { prisma } from "@/lib/db/prisma";

/** Resolve display names for uploader user ids within a tenant. */
export async function resolveUploaderNames(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const members = await prisma.orgMember.findMany({
    where: { orgId: tenantId, userId: { in: unique } },
    select: {
      userId: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const map = new Map<string, string>();
  for (const m of members) {
    const label =
      `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() ||
      m.user.email ||
      m.userId;
    map.set(m.userId, label);
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, id.slice(0, 8));
  }
  return map;
}
