/**
 * Lead Owner Assignment Service
 *
 * Enforces the enterprise CRM role hierarchy for lead ownership:
 *
 *   Administrator  → any active org member
 *   TeamManager    → self + all active members of all groups in managed teams
 *   SalesManager   → self + members/co-managers of managed sales groups
 *   SalesUser      → self only
 *   MarketingUser  → cannot assign (403)
 *   FinanceUser    → cannot assign (403)
 *
 * Used by POST /api/leads, PATCH /api/leads/[id], and
 * GET /api/leads/assignable-users (owner dropdown).
 */
import { prisma } from "@/lib/db/prisma";
import { db } from "@/lib/db";
import { resolveTeamScope } from "@/lib/services/teams/team-scope";
import type { SessionUser } from "@/types/permission";

const ADMIN_ROLE = "Administrator";
const NO_ASSIGN_ROLES = new Set(["MarketingUser", "FinanceUser"]);

export interface AssignableUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the set of users that `user` is permitted to assign as lead owner.
 * Suitable for populating the owner dropdown in the UI.
 */
export async function getAssignableUsers(user: SessionUser): Promise<AssignableUser[]> {
  if (NO_ASSIGN_ROLES.has(user.role)) return [];
  if (user.role === ADMIN_ROLE) return fetchActiveOrgMembers(user.orgId);
  if (user.role === "TeamManager") return getTeamManagerAssignables(user);
  if (user.role === "SalesManager") return getManagerAssignables(user);
  return getSelfOnly(user);
}

/**
 * Throws 403 if `actor` is not permitted to assign a lead to `targetOwnerId`.
 *
 * Call before persisting any ownerId change (create, update, bulk-reassign).
 * Self-assign (targetOwnerId === actor.userId) is always permitted for roles
 * that can assign at all.
 */
export async function assertCanAssignLeadTo(
  actor: SessionUser,
  targetOwnerId: string,
): Promise<void> {
  if (NO_ASSIGN_ROLES.has(actor.role)) {
    throw forbidden(`${actor.role} cannot assign lead ownership`);
  }

  if (actor.role === ADMIN_ROLE) return;

  if (targetOwnerId === actor.userId) return;

  if (actor.role === "TeamManager") {
    const scope = await resolveTeamScope(actor);
    const memberIds = scope?.memberIds ?? [];
    if (memberIds.includes(targetOwnerId)) return;
    throw forbidden("Cannot assign lead to users outside your managed teams");
  }

  if (actor.role === "SalesManager") {
    const allowed = await getManagerAssignables(actor);
    if (allowed.some((u) => u.id === targetOwnerId)) return;
    throw forbidden("Cannot assign lead to users outside your managed sales groups");
  }

  // SalesUser (and any unrecognised role): self only
  throw forbidden("Sales users can only assign leads to themselves");
}

// ─── Role-specific resolvers ──────────────────────────────────────────────────

async function getTeamManagerAssignables(user: SessionUser): Promise<AssignableUser[]> {
  const scope = await resolveTeamScope(user);
  const allIds = scope?.memberIds ?? [];

  if (allIds.length === 0) return getSelfOnly(user);

  const [users, memberships] = await Promise.all([
    db.user.findMany({
      where: { id: { in: allIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.orgMember.findMany({
      where: { userId: { in: allIds }, orgId: user.orgId },
      select: { userId: true, role: true, status: true },
    }),
  ]);

  const membershipMap = new Map(
    memberships.map((m) => [m.userId, { role: m.role, status: m.status }]),
  );

  return users
    .filter((u) => membershipMap.get(u.id)?.status === "active")
    .map((u) => ({
      id: u.id,
      name: buildName(u.firstName, u.lastName, u.email),
      email: u.email,
      role: membershipMap.get(u.id)?.role ?? "",
    }));
}

async function getManagerAssignables(user: SessionUser): Promise<AssignableUser[]> {
  const managedGroups = await prisma.crmSalesGroupManager.findMany({
    where: { userId: user.userId },
    select: { groupId: true },
  });
  const groupIds = managedGroups.map((g) => g.groupId);

  const selfMembership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: user.orgId, userId: user.userId } },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  if (groupIds.length === 0) {
    if (!selfMembership) return [];
    return [
      {
        id: selfMembership.userId,
        name: buildName(
          selfMembership.user.firstName,
          selfMembership.user.lastName,
          selfMembership.user.email,
        ),
        email: selfMembership.user.email,
        role: selfMembership.role,
      },
    ];
  }

  const [memberRows, coManagerRows] = await Promise.all([
    prisma.crmSalesGroupMember.findMany({
      where: { groupId: { in: groupIds } },
      select: { userId: true },
    }),
    prisma.crmSalesGroupManager.findMany({
      where: { groupId: { in: groupIds }, userId: { not: user.userId } },
      select: { userId: true },
    }),
  ]);

  const allIds = [
    ...new Set([
      user.userId,
      ...memberRows.map((r) => r.userId),
      ...coManagerRows.map((r) => r.userId),
    ]),
  ];

  const [users, memberships] = await Promise.all([
    db.user.findMany({
      where: { id: { in: allIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.orgMember.findMany({
      where: { userId: { in: allIds }, orgId: user.orgId },
      select: { userId: true, role: true, status: true },
    }),
  ]);

  const membershipMap = new Map(
    memberships.map((m) => [m.userId, { role: m.role, status: m.status }]),
  );

  return users
    .filter((u) => membershipMap.get(u.id)?.status === "active")
    .map((u) => ({
      id: u.id,
      name: buildName(u.firstName, u.lastName, u.email),
      email: u.email,
      role: membershipMap.get(u.id)?.role ?? "",
    }));
}

async function fetchActiveOrgMembers(orgId: string): Promise<AssignableUser[]> {
  const rows = await prisma.orgMember.findMany({
    where: { orgId, status: "active" },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return rows.map((m) => ({
    id: m.userId,
    name: buildName(m.user.firstName, m.user.lastName, m.user.email),
    email: m.user.email,
    role: m.role,
  }));
}

async function getSelfOnly(user: SessionUser): Promise<AssignableUser[]> {
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: user.orgId, userId: user.userId } },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!membership) return [];
  return [
    {
      id: membership.userId,
      name: buildName(
        membership.user.firstName,
        membership.user.lastName,
        membership.user.email,
      ),
      email: membership.user.email,
      role: membership.role,
    },
  ];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function forbidden(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 403;
  return err;
}

function buildName(firstName: string, lastName: string, email: string): string {
  return [firstName, lastName].filter(Boolean).join(" ") || email;
}
