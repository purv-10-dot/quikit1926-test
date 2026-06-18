/**
 * User-lookup helpers (Step H).
 *
 * Replaces the legacy `cnUser.findUnique/findMany({...,
 * select: { fullName, email, ... } })` pattern that's scattered across
 * approval/workflow/store routes. Sources from `auth.User` instead and
 * composes `fullName` from `firstName + lastName`.
 *
 * Drop the `cnUser` delegate from the local Prisma client without
 * runtime breakage by routing every actor-name lookup through these.
 */

import { db as dbCentral } from "@quikit/database";

export interface CnUserShape {
  id: string;
  email: string;
  fullName: string;
}

function compose(u: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}): CnUserShape {
  const fullName =
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
    u.email.split("@")[0] ||
    "Unknown";
  return { id: u.id, email: u.email, fullName };
}

/**
 * Drop-in for `cnUser.findUnique({ where: { id }, select: {
 * id, email, fullName } })`. Returns null when the central auth user
 * doesn't exist.
 */
export async function findCnUserById(userId: string): Promise<CnUserShape | null> {
  const u = await dbCentral.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  return u ? compose(u) : null;
}

/**
 * Drop-in for `cnUser.findMany({ where: { id: { in } } })`.
 * Returns an array preserving the order of the input ids when possible.
 */
export async function findCnUsersByIds(ids: string[]): Promise<CnUserShape[]> {
  if (ids.length === 0) return [];
  const users = await dbCentral.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  return (users as Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }>).map(compose);
}

/**
 * Drop-in for `cnUser.findMany({ where: { ..., status }, ... })`.
 * Looks up org members through quikit.OrgMember + auth.User. Used by the
 * approver-chain expansion when a workflow step targets a ROLE rather
 * than a specific user — we need to enumerate everyone in that role.
 */
export async function findCnUsersByRoleKey(
  orgId: string,
  roleKey: string,
  opts: { onlyActive?: boolean } = {},
): Promise<CnUserShape[]> {
  // Look up the v2 role row for this org, then find every user assigned
  // to it. roleKey matches CnAppRole.name (lowercase: admin / ho_user /
  // site_admin / user).
  const roles = await dbCentral.cnAppRole.findMany({
    where: { orgId, name: roleKey },
    select: {
      id: true,
      members: {
        select: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });
  const userIds = new Set<string>();
  const users: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }> = [];
  for (const role of roles as Array<{
    members: Array<{
      user: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
      };
    }>;
  }>) {
    for (const m of role.members) {
      if (userIds.has(m.user.id)) continue;
      userIds.add(m.user.id);
      users.push(m.user);
    }
  }

  if (opts.onlyActive) {
    // Filter to active OrgMembers only.
    const memberships = await dbCentral.orgMember.findMany({
      where: {
        orgId,
        userId: { in: Array.from(userIds) },
        status: "active",
      },
      select: { userId: true },
    }) as Array<{ userId: string }>;
    const activeIds = new Set(memberships.map((m) => m.userId));
    return users.filter((u) => activeIds.has(u.id)).map(compose);
  }
  return users.map(compose);
}
