/**
 * Idempotent default-role seeders for QuikChat's Roles & Permissions v2
 * substrate (docs/RBAC_PLAN.md §5, Phase 1).
 *
 * Seeds four roles per org — mirroring QuikScale's seeder shape:
 *   - admin      (isSystem)  — every (resource, action) pair. Lowercase name
 *                              is canonical: matches `isOrgAdmin`, the Phase-2
 *                              `extraAdminCheck` bridge, and every
 *                              assignAppRoles call.
 *   - Moderator             — Member grants + Channel.Moderate (DECISION 4).
 *   - Member     (isDefault) — curated day-to-day set (DECISION 2: no public
 *                              channels by default).
 *   - Guest                 — Channel:view only (participate-only floor).
 *
 * Also backfills EXISTING orgs (DECISION 1): every current QuikChat user with
 * no role yet is assigned Member, and org_admin / super_admin (or a platform
 * super-admin) is promoted to admin. All idempotent, all user-invisible —
 * Phase 1 seeds the substrate; NOTHING enforces it yet.
 *
 * Safe to call on every authenticated request: a 5-minute per-process/per-org
 * cache short-circuits repeat work.
 */
import { db } from "@/lib/db";
import { allPermissionPairs, type Action } from "./permissionsRegistry";
import { getQuikChatAppId } from "./permissions";

type Grant = { resource: string; action: Action };

/* ───────────────────────── Default grant sets (§4) ───────────────────────── */

/** Member (isDefault) — curated. NO Channel.Public / Moderate / IngestOrg / config. */
const MEMBER_GRANTS: Grant[] = [
  { resource: "Channel", action: "view" },
  { resource: "Channel", action: "create" },
  { resource: "Channel.DM", action: "create" },
  { resource: "Call", action: "create" },
  { resource: "Call.Group", action: "create" },
  { resource: "Assistant", action: "view" },
  { resource: "Assistant", action: "create" },
  { resource: "Assistant.IngestPrivate", action: "create" },
];

/** Moderator — Member + moderation (DECISION 4 default: Moderator + Admin). */
const MODERATOR_GRANTS: Grant[] = [
  ...MEMBER_GRANTS,
  { resource: "Channel.Moderate", action: "update" },
  { resource: "Channel.Moderate", action: "delete" },
];

/** Guest — participate-only floor: read channels, nothing else. */
const GUEST_GRANTS: Grant[] = [{ resource: "Channel", action: "view" }];

/* ───────────────────────── Role primitives ───────────────────────── */

interface RoleSpec {
  name: string;
  description: string;
  isSystem: boolean;
  isDefault: boolean;
}

/**
 * Find-or-create one QcAppRole and seed its grants once. Only fills grants
 * when the role has ZERO rows, so deliberate admin un-checks (Phase 3) are
 * never overwritten. Returns the role id.
 */
async function seedRole(
  orgId: string,
  appId: string,
  spec: RoleSpec,
  grants: Grant[],
): Promise<string> {
  const existing = await db.qcAppRole.findFirst({
    where: { orgId, appId, name: spec.name },
    select: { id: true },
  });

  // Only one isDefault role at a time — demote others before creating a new default.
  if (!existing && spec.isDefault) {
    await db.qcAppRole.updateMany({
      where: { orgId, appId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const role =
    existing ??
    (await db.qcAppRole.create({
      data: {
        orgId,
        appId,
        name: spec.name,
        description: spec.description,
        isSystem: spec.isSystem,
        isDefault: spec.isDefault,
      },
      select: { id: true },
    }));

  const grantCount = await db.qcRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0 && grants.length > 0) {
    await db.qcRolePermission.createMany({
      data: grants.map((g) => ({ roleId: role.id, resource: g.resource, action: g.action })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/**
 * Top up a role with any default-set pair missing from the row — used when the
 * permission tree grows so existing orgs converge without an admin re-ticking
 * every cell. Only ever ADDS rows.
 */
async function backfillRoleGrants(roleId: string, grants: Grant[]): Promise<void> {
  if (grants.length === 0) return;
  const have = new Set(
    (
      await db.qcRolePermission.findMany({
        where: { roleId },
        select: { resource: true, action: true },
      })
    ).map((p) => `${p.resource}:${p.action}`),
  );
  const missing = grants.filter((g) => !have.has(`${g.resource}:${g.action}`));
  if (missing.length === 0) return;
  await db.qcRolePermission.createMany({
    data: missing.map((g) => ({ roleId, resource: g.resource, action: g.action })),
    skipDuplicates: true,
  });
}

/* ───────────────────────── user → role assignment ───────────────────────── */

/**
 * Enforce the single-role-per-user invariant. The Admin-Portal write path
 * (shared assignAppRoles) deletes+inserts, but a legacy/stale double-assign
 * would make readers union grants ambiguously. Keep the most recently assigned
 * role, delete the rest. Idempotent — a no-op once the user has one role.
 * Returns the number of stale rows removed.
 */
export async function collapseToLatestRole(userId: string, orgId: string): Promise<number> {
  const appId = await getQuikChatAppId();
  if (!appId) return 0;

  const roles = await db.qcUserAppRole.findMany({
    where: { userId, orgId, role: { appId } },
    select: { id: true },
    orderBy: { assignedAt: "desc" },
  });
  if (roles.length <= 1) return 0;

  const staleIds = roles.slice(1).map((r) => r.id);
  await db.qcUserAppRole.deleteMany({ where: { id: { in: staleIds } } });
  return staleIds.length;
}

/**
 * DECISION 1 — existing-org migration. Assign a role to every current QuikChat
 * user (those with a `UserAppAccess` row for this org's QuikChat app) who has
 * none yet: admin for org_admin / super_admin members and platform
 * super-admins, Member for everyone else. Idempotent — users who already hold
 * a role are skipped. User-invisible in Phase 1 (nothing enforces roles).
 */
async function backfillExistingMembers(
  orgId: string,
  appId: string,
  adminRoleId: string,
  memberRoleId: string,
): Promise<void> {
  const access = await db.userAppAccess.findMany({
    where: { orgId, appId },
    select: { userId: true },
  });
  const userIds = [...new Set(access.map((a) => a.userId))];
  if (userIds.length === 0) return;

  const already = new Set(
    (
      await db.qcUserAppRole.findMany({
        where: { orgId, userId: { in: userIds } },
        select: { userId: true },
      })
    ).map((r) => r.userId),
  );
  const toAssign = userIds.filter((id) => !already.has(id));
  if (toAssign.length === 0) return;

  const [members, users] = await Promise.all([
    db.orgMember.findMany({
      where: { orgId, userId: { in: toAssign } },
      select: { userId: true, role: true },
    }),
    db.user.findMany({
      where: { id: { in: toAssign } },
      select: { id: true, isSuperAdmin: true },
    }),
  ]);
  const roleByUser = new Map(members.map((m) => [m.userId, m.role]));
  const superById = new Map(users.map((u) => [u.id, u.isSuperAdmin]));

  const rows = toAssign.map((userId) => {
    const orgRole = roleByUser.get(userId);
    const isAdmin =
      orgRole === "org_admin" || orgRole === "super_admin" || superById.get(userId) === true;
    return { userId, orgId, roleId: isAdmin ? adminRoleId : memberRoleId };
  });

  await db.qcUserAppRole.createMany({ data: rows, skipDuplicates: true });
}

/* ───────────────────────── orchestrator ───────────────────────── */

interface SeededRoleIds {
  adminRoleId: string;
  moderatorRoleId: string;
  memberRoleId: string;
  guestRoleId: string;
}

/** 5-minute per-process cache so we don't re-seed on every request. */
const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Seed all four default roles + backfill existing members for this org.
 * Idempotent and cached per process. Returns the four role ids.
 */
export async function seedAllDefaultRoles(orgId: string): Promise<SeededRoleIds | null> {
  const appId = await getQuikChatAppId();
  if (!appId) return null; // QuikChat App not registered — nothing to seed against.

  const [adminRoleId, moderatorRoleId, memberRoleId, guestRoleId] = await Promise.all([
    seedRole(
      orgId,
      appId,
      {
        name: "admin",
        description: "Full access — auto-seeded. Rename/delete protected; grants editable.",
        isSystem: true,
        isDefault: false,
      },
      allPermissionPairs(),
    ),
    seedRole(
      orgId,
      appId,
      {
        name: "Moderator",
        description: "Member access plus channel moderation.",
        isSystem: false,
        isDefault: false,
      },
      MODERATOR_GRANTS,
    ),
    seedRole(
      orgId,
      appId,
      {
        name: "Member",
        description: "Default role. Channels, DMs, calls, and the assistant.",
        isSystem: false,
        isDefault: true,
      },
      MEMBER_GRANTS,
    ),
    seedRole(
      orgId,
      appId,
      {
        name: "Guest",
        description: "Participate-only floor — read channels.",
        isSystem: false,
        isDefault: false,
      },
      GUEST_GRANTS,
    ),
  ]);

  // Top up grants on tree growth (admin gets every pair; others their default set).
  await Promise.all([
    backfillRoleGrants(adminRoleId, allPermissionPairs()),
    backfillRoleGrants(moderatorRoleId, MODERATOR_GRANTS),
    backfillRoleGrants(memberRoleId, MEMBER_GRANTS),
    backfillRoleGrants(guestRoleId, GUEST_GRANTS),
  ]);

  await backfillExistingMembers(orgId, appId, adminRoleId, memberRoleId);

  seededOrgs.set(orgId, Date.now());
  return { adminRoleId, moderatorRoleId, memberRoleId, guestRoleId };
}

/**
 * Cheap org-level self-heal. Returns immediately (in-process Map lookup, no
 * DB) when the org was seeded within the TTL, otherwise runs the full seed.
 * Failures are swallowed — a seeding hiccup must never break a request.
 */
export async function ensureSeeded(orgId: string): Promise<void> {
  const seededAt = seededOrgs.get(orgId);
  if (seededAt && Date.now() - seededAt < SEED_CACHE_TTL_MS) return;
  try {
    await seedAllDefaultRoles(orgId);
  } catch {
    // best-effort; next request retries.
  }
}

/**
 * Per-user seed-before-check (Phase 2). Guarantees the caller holds a role
 * BEFORE any userCan/requireAdmin gate runs, so fail-closed enforcement can
 * never lock out a not-yet-seeded user (the rollout-lockout the RBAC_PLAN
 * invariant warns about). The org-level `ensureSeeded` cache does NOT cover a
 * freshly-invited user inside the TTL window — this does, keyed on the user.
 *
 * Steady state is a single indexed existence check (`[userId, orgId]`); the
 * bind path only runs once per user (first request after they gain access).
 * The binding rule MIRRORS the Phase-1 backfill: org_admin / super_admin (or a
 * platform super-admin) → admin, everyone else → the default Member role.
 * Idempotent and best-effort — a concurrent bind or transient error is
 * swallowed (the unique constraint + next-request retry keep it correct).
 *
 * Call from `withOrgAuth` (covers every gated API route, incl. deep-links) and
 * from `(dashboard)/page.tsx`.
 */
export async function ensureUserRole(userId: string, orgId: string): Promise<void> {
  try {
    const appId = await getQuikChatAppId();
    if (!appId) return;

    // Fast path: user already holds a role. Indexed existence check.
    const existing = await db.qcUserAppRole.findFirst({
      where: { userId, orgId, role: { appId } },
      select: { id: true },
    });
    if (existing) return;

    // Bind path (rare): make sure the org's roles exist, then classify + assign.
    await ensureSeeded(orgId);

    const [member, user] = await Promise.all([
      db.orgMember.findFirst({ where: { orgId, userId }, select: { role: true } }),
      db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    ]);
    const isAdmin =
      member?.role === "org_admin" ||
      member?.role === "super_admin" ||
      user?.isSuperAdmin === true;
    const roleName = isAdmin ? "admin" : "Member";

    const role = await db.qcAppRole.findFirst({
      where: { orgId, appId, name: roleName },
      select: { id: true },
    });
    if (!role) return; // seeding not settled yet; next request retries.

    await db.qcUserAppRole.create({
      data: { userId, orgId, roleId: role.id },
    });
  } catch {
    // Best-effort: a concurrent bind hits the unique constraint; anything else
    // retries next request. Never block a request on the seed-before-check.
  }
}
