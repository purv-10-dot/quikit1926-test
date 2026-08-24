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
 *   - Member     (isDefault) — curated day-to-day set. Includes
 *                              Channel.Public:create for NEW orgs only —
 *                              existing orgs opt in via Settings → Roles. See
 *                              the two-list block below for why that split
 *                              exists and what each list does.
 *   - Guest                 — no grants at all (participate-only floor): a
 *                              Guest may read/send in channels they're already
 *                              a member of (membership, not RBAC, controls
 *                              that) but holds none of the "create X" grants
 *                              below, so they can't start a channel, DM,
 *                              or call themselves.
 *
 * Also backfills EXISTING orgs (DECISION 1): every current QuikChat user with
 * no role yet is assigned Member, and any ADMIN_TIER_ROLES membership (or a
 * platform super-admin) is promoted to admin. All idempotent.
 *
 * Safe to call on every authenticated request: a per-process/per-org cache
 * short-circuits repeat work, and concurrent callers share one in-flight pass.
 *
 * ── Three properties this file has to hold, and how ─────────────────────────
 *
 *  1. EXACTLY ONE DEFAULT ROLE per (orgId, appId). Owned solely by
 *     `convergeDefaultRole`, which runs on every pass and repairs rather than
 *     asserts — it never overrides a deliberate Phase 3 choice. Nothing in the
 *     database enforces this; see that function for why, and for the partial
 *     unique index that would.
 *
 *  2. CONCURRENT PASSES MUST NOT CORRUPT STATE. `seedRole` no longer demotes
 *     anything (the old demote-before-create is what destroyed the flag), and
 *     absorbs the P2002 a losing racer gets by re-reading the winner's row.
 *     `ensureSeeded` shares one in-flight pass per org so intra-process
 *     concurrency cannot arise at all.
 *
 *  3. FAILURES MUST LEAVE A TRACE. Both swallow points log through the shared
 *     structured logger with `errorFields`. A failed pass also caches a short
 *     backoff — otherwise it re-runs on every subsequent request, re-entering
 *     the same race, unobserved.
 */
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";
import { Prisma } from "@quikit/database";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { db } from "@/lib/db";
import { errorFields, logger } from "@/lib/shared";
import { allPermissionPairs, isValidPermissionPair, type Action } from "./permissionsRegistry";
import { getQuikChatAppId } from "./permissions";

/** Prisma's unique-constraint violation — the concurrent-seed loser's error. */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

type Grant = { resource: string; action: Action };

/* ───────────────────────── Default grant sets (§4) ───────────────────────── */

/* ───────────────────────────────────────────────────────────────────────────
 * TWO LISTS PER ROLE, AND THE DIFFERENCE IS NOT COSMETIC.
 *
 * `seedAllDefaultRoles` uses each role's *_NEW_ORG list when it CREATES the
 * role, and its *_BACKFILL list in `backfillRoleGrants`, which re-applies on
 * EVERY pass. That second call is why the two must be separate:
 *
 *   - a pair in the BACKFILL list is re-added to every org, every pass, so an
 *     admin who un-ticks it in Settings → Roles watches it come back within the
 *     5-minute cache window. It is effectively permanent.
 *   - a pair only in the NEW_ORG list is granted once, at role creation, and an
 *     admin's decision to remove it STICKS.
 *
 * Pick the list by what you want to happen to orgs that already exist. The
 * names carry the safety here, so read them before adding a pair.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Member grants RETRO-ADDED to every existing org on the next seed pass.
 *
 * ⚠️ ADDING A PAIR HERE grants it to EVERY EXISTING DEPLOYMENT within ~5
 * minutes, with no admin action — and makes it un-un-tickable, because this
 * list is re-applied on every pass. Only add here for something that must be
 * universal and is not a policy choice. When in doubt, use the NEW_ORG list.
 */
const MEMBER_GRANTS_BACKFILL: Grant[] = [
  { resource: "Channel", action: "create" },
  { resource: "Channel.DM", action: "create" },
  { resource: "Call", action: "create" },
  { resource: "Call.Group", action: "create" },
  { resource: "Assistant", action: "create" },
  { resource: "Assistant.IngestPrivate", action: "create" },
];

/**
 * Member (isDefault) grants for orgs seeded FROM NOW ON.
 *
 * ⚠️ ADDING A PAIR HERE affects only NEW orgs. Existing orgs are untouched —
 * their admin grants it per-org in Settings → Roles, and that decision sticks.
 *
 * `Channel.Public:create` lives here and NOT in the backfill list on purpose:
 * "who may create a public channel" is a policy choice per organisation, so it
 * ships on by default for new orgs while remaining genuinely revocable.
 */
const MEMBER_GRANTS_NEW_ORG: Grant[] = [
  ...MEMBER_GRANTS_BACKFILL,
  { resource: "Channel.Public", action: "create" },
];

/** Moderator — Member + moderation (DECISION 4 default: Moderator + Admin). */
const MODERATOR_GRANTS_BACKFILL: Grant[] = [
  ...MEMBER_GRANTS_BACKFILL,
  { resource: "Channel.Moderate", action: "update" },
  { resource: "Channel.Moderate", action: "delete" },
];

const MODERATOR_GRANTS_NEW_ORG: Grant[] = [
  ...MEMBER_GRANTS_NEW_ORG,
  { resource: "Channel.Moderate", action: "update" },
  { resource: "Channel.Moderate", action: "delete" },
];

/**
 * Guest — participate-only floor: NO grants at all, deliberately.
 *
 * Used to be `[{ resource: "Channel", action: "view" }]`, but nothing in the
 * codebase ever calls `userCan(..., "Channel", "view")` — viewing is governed
 * by `QcChannelMember` rows (actual channel membership), not this RBAC system.
 * That single grant was a no-op checkbox, removed together with `Channel`'s
 * "view" action in permissionsRegistry.ts. A Guest's real restriction (can't
 * start a channel/DM/call themselves) already comes from the ABSENCE of the
 * "create" grants below — so an empty list here changes no actual behavior,
 * it just stops lying about what "View Channels" does.
 */
const GUEST_GRANTS: Grant[] = [];

/* ───────────────────────── Role primitives ───────────────────────── */

interface RoleSpec {
  name: string;
  description: string;
  isSystem: boolean;
  isDefault: boolean;
}

/**
 * Find-or-create one QcAppRole and seed its grants once. Only fills grants
 * when the role has ZERO rows. Returns the role id.
 *
 * ⚠️ THIS DOES NOT PROTECT ADMIN UN-CHECKS, despite what this comment used to
 * claim ("deliberate admin un-checks are never overwritten"). `seedRole` alone
 * never rewrites a role that already has grants — but `seedAllDefaultRoles`
 * calls `backfillRoleGrants` immediately afterwards, and THAT re-adds every
 * pair in the role's *_BACKFILL list on every pass. An un-ticked pair survives
 * only if it is absent from that list. The old wording asserted a safety
 * property the pass as a whole does not have, which is the kind of note that
 * makes a real bug look impossible. See the two-list block near the top.
 *
 * DOES NOT TOUCH `isDefault` ON AN EXISTING ROW — and deliberately no longer
 * demotes anything. The old shape ran `updateMany(isDefault:true → false)`
 * BEFORE the create, which is what destroyed the flag: two overlapping passes
 * interleave as "A creates Member with the flag → B's stale read misses → B
 * demotes and clears A's flag", leaving the org with zero defaults forever,
 * because `isDefault` was only ever written in the create branch. Enforcing
 * "exactly one default" is now `convergeDefaultRole`'s single job, run once
 * after all four roles exist. See that function for the rule.
 *
 * Concurrency: two passes can both read `null` and both create. The unique
 * index (orgId, appId, name) means one wins and the loser gets P2002 — the
 * loser re-reads the winner's row rather than throwing. Same pattern, and the
 * same reason, as the clientMessageId race in messages.service.ts.
 */
async function seedRole(
  orgId: string,
  appId: string,
  spec: RoleSpec,
  grants: Grant[],
): Promise<string> {
  const where = { orgId_appId_name: { orgId, appId, name: spec.name } };

  let role = await db.qcAppRole.findUnique({ where, select: { id: true } });

  if (!role) {
    try {
      role = await db.qcAppRole.create({
        data: {
          orgId,
          appId,
          name: spec.name,
          description: spec.description,
          isSystem: spec.isSystem,
          isDefault: spec.isDefault,
        },
        select: { id: true },
      });
    } catch (e) {
      // Lost the race on (orgId, appId, name) — the winner's row is
      // authoritative. Re-read it instead of failing the whole seed pass.
      if (isUniqueViolation(e)) {
        role = await db.qcAppRole.findUnique({ where, select: { id: true } });
      }
      if (!role) throw e;
    }
  }

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
 * Enforce "exactly one default role per (orgId, appId)" — the invariant the
 * Admin Portal depends on and nothing in the database guarantees.
 *
 * WHY THIS EXISTS: the Portal's invite modal picks a role with
 * `roles.find(r => r.isDefault)?.name ?? roles[0]?.name`, and its API fills a
 * missing default with `data[0]` ordered `isSystem DESC` — which is `admin`.
 * So an org with ZERO defaults silently preselects **admin** for every newly
 * invited user. That is the escalation this repairs.
 *
 * THE RULE — repair only when broken, never override a deliberate choice:
 *   • exactly 1 → return untouched. This is the Phase 3 guard: once an admin
 *     picks a default via PATCH /api/org/roles/[id], every later seed pass
 *     must leave it alone. Hard-coding "Member is default" here would trade a
 *     privilege-escalation bug for a config-clobbering one — and would be
 *     WORSE in kind, because clobbering is silent and repeats, while a wrong
 *     repair is visible in the invite modal and an admin can just re-pick.
 *   • 0       → promote the seeded Member role. Repairs the current live state
 *     with no one-off data script (a manual UPDATE would be undone by the very
 *     next seed pass).
 *   • >1      → keep the OLDEST, clear the rest. Deterministic; the tie is
 *     already ambiguous (only reachable via concurrent PATCHes, where either
 *     survivor is arbitrary). Note this branch is independent of "Member is
 *     special" — on live data the oldest role is Moderator.
 *
 * NOT ATOMIC, and honestly so: this read-then-write can itself interleave with
 * a concurrent PATCH. The invariant is eventually consistent, converging on the
 * next pass. Durable enforcement needs a partial unique index
 * (`… ON "AppRole"("orgId","appId") WHERE "isDefault"`), which is a schema
 * change queued for review — see
 * packages/database/sql/quikchat_approle_one_default_index_2026-08-11.sql.
 * That index must NOT be applied before this convergence has run: it rejects an
 * org that already holds two defaults.
 */
async function convergeDefaultRole(
  orgId: string,
  appId: string,
  fallbackRoleId: string,
): Promise<void> {
  const defaults = await db.qcAppRole.findMany({
    where: { orgId, appId, isDefault: true },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (defaults.length === 1) return; // deliberate single choice — never touch

  if (defaults.length === 0) {
    await db.qcAppRole.update({
      where: { id: fallbackRoleId },
      data: { isDefault: true },
    });
    logger.info(
      { orgId, roleId: fallbackRoleId },
      "RBAC: org had no default role — promoted the seeded Member role",
    );
    return;
  }

  const staleIds = defaults.slice(1).map((r) => r.id);
  await db.qcAppRole.updateMany({
    where: { id: { in: staleIds } },
    data: { isDefault: false },
  });
  logger.warn(
    { orgId, keptRoleId: defaults[0]!.id, clearedCount: staleIds.length },
    "RBAC: org had multiple default roles — kept the oldest, cleared the rest",
  );
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

/**
 * Delete grant rows whose (resource, action) no longer exists in the permission
 * registry.
 *
 * These rows are already INERT — `userCan` runs `isResource`/`isAction` before
 * it queries, so an unknown pair can never grant anything. But they linger after
 * a resource is retired and quietly inflate every count: removing
 * `Channel.InviteExternal` from the registry left the admin role reporting 17
 * grants against a 16-pair tree, which is exactly the discrepancy that makes a
 * future count assertion look broken.
 *
 * Safe because it only ever removes pairs the registry does not recognise — it
 * cannot touch a deliberate admin grant, since the matrix can only ever tick a
 * pair the registry defines. Scoped to this org's roles.
 */
async function pruneUnknownGrants(orgId: string, appId: string): Promise<void> {
  const rows = await db.qcRolePermission.findMany({
    where: { role: { orgId, appId } },
    select: { id: true, resource: true, action: true },
  });
  const stale = rows.filter((r) => !isValidPermissionPair(r.resource, r.action));
  if (stale.length === 0) return;

  await db.qcRolePermission.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  logger.info(
    { orgId, removed: stale.length, pairs: stale.map((r) => `${r.resource}:${r.action}`) },
    "RBAC: pruned grant rows for resources no longer in the permission registry",
  );
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
    // ADMIN_TIER_ROLES, not string literals: it carries the LEGACY "admin"
    // membership role alongside org_admin/super_admin. Hardcoding the two new
    // names bound a legacy-admin owner to Member while `createRequireAdmin`
    // (ROLE_HIERARCHY["admin"] === 5) still let them through — two gates giving
    // two answers for the same person. Must stay in step with `ensureUserRole`.
    const isAdmin =
      ADMIN_TIER_ROLES.has(String(roleByUser.get(userId) ?? "")) ||
      superById.get(userId) === true;
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

/**
 * Per-process cache of orgs whose seed has settled, keyed by ABSOLUTE expiry so
 * success and failure can carry different lifetimes (see `SEED_RETRY_*`).
 */
const seededUntil = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Backoff after a FAILED pass. The old code set the cache as its last statement,
 * so a thrown pass never cached anything and every subsequent request re-ran the
 * whole seed — re-entering the same race, with both catch blocks silent. That is
 * a self-sustaining retry storm, not a one-off failure. Caching the failure for
 * 30s bounds it to ~2 attempts/minute/process while still self-healing quickly.
 */
const SEED_RETRY_BACKOFF_MS = 30 * 1000;

function markSeeded(orgId: string, ttlMs: number): void {
  seededUntil.set(orgId, Date.now() + ttlMs);
}

function seedIsFresh(orgId: string): boolean {
  const until = seededUntil.get(orgId);
  return until != null && Date.now() < until;
}

/**
 * Seed all four default roles + backfill existing members for this org.
 * Idempotent and cached per process. Returns the four role ids.
 */
export async function seedAllDefaultRoles(orgId: string): Promise<SeededRoleIds | null> {
  const appId = await getQuikChatAppId();
  if (!appId) return null; // QuikChat App not registered — nothing to seed against.

  // SEQUENTIAL, not Promise.all. Four small writes, once per org per process
  // behind a 5-minute cache — the concurrency bought nothing and made the order
  // of writes non-deterministic, which is the last thing you want in the code
  // that repairs a cross-pass race. (To be precise: Promise.all was NOT the
  // cause of the isDefault loss — within one pass only Member carries the flag,
  // so only one demote ever ran. The race was always cross-pass. Sequencing is
  // for legibility and determinism, not correctness.)
  const adminRoleId = await seedRole(
    orgId,
    appId,
    {
      name: "admin",
      description: "Full access — auto-seeded. Rename/delete protected; grants editable.",
      isSystem: true,
      isDefault: false,
    },
    allPermissionPairs(),
  );
  const moderatorRoleId = await seedRole(
    orgId,
    appId,
    {
      name: "Moderator",
      description: "Member access plus channel moderation.",
      isSystem: false,
      isDefault: false,
    },
    MODERATOR_GRANTS_NEW_ORG,
  );
  const memberRoleId = await seedRole(
    orgId,
    appId,
    {
      name: "Member",
      description: "Default role. Channels, DMs, calls, and the assistant.",
      isSystem: false,
      isDefault: true,
    },
    MEMBER_GRANTS_NEW_ORG,
  );
  const guestRoleId = await seedRole(
    orgId,
    appId,
    {
      name: "Guest",
      description: "Participate-only floor — read channels.",
      isSystem: false,
      isDefault: false,
    },
    GUEST_GRANTS,
  );

  // Top up grants on tree growth (admin gets every pair; others their default set).
  await backfillRoleGrants(adminRoleId, allPermissionPairs());
  await backfillRoleGrants(moderatorRoleId, MODERATOR_GRANTS_BACKFILL);
  await backfillRoleGrants(memberRoleId, MEMBER_GRANTS_BACKFILL);
  await backfillRoleGrants(guestRoleId, GUEST_GRANTS);

  await pruneUnknownGrants(orgId, appId);

  // Runs on EVERY pass, including the fully-idempotent one where all four roles
  // already exist — that is what repairs an org whose flag was lost before this
  // fix shipped, with no one-off data script.
  await convergeDefaultRole(orgId, appId, memberRoleId);

  await backfillExistingMembers(orgId, appId, adminRoleId, memberRoleId);

  markSeeded(orgId, SEED_CACHE_TTL_MS);
  return { adminRoleId, moderatorRoleId, memberRoleId, guestRoleId };
}

/**
 * In-flight seed passes, keyed by org — the single-flight guard.
 *
 * Without it, N concurrent requests arriving on a cold process ALL miss the
 * cache and ALL run `seedAllDefaultRoles`, which is precisely the cross-pass
 * concurrency that loses the isDefault flag and trips P2002. Sharing one
 * in-flight promise removes intra-process concurrency outright, leaving only
 * genuine multi-instance races for `seedRole`'s P2002 catch to absorb.
 */
const inFlightSeeds = new Map<string, Promise<void>>();

/** Run one seed pass, swallowing but RECORDING failure. Never throws. */
async function runSeedPass(orgId: string): Promise<void> {
  try {
    await seedAllDefaultRoles(orgId);
  } catch (err) {
    // Still swallowed — a seeding hiccup must never 500 a chat request — but no
    // longer INVISIBLE. Two bare `catch {}` blocks are the reason a failing
    // seed, and the retry storm behind it, went unnoticed for weeks.
    logger.error(
      { ...errorFields(err), orgId },
      "RBAC seed pass failed — roles/grants may be incomplete for this org",
    );
    // Bound the retry rate. Without this the failed pass caches nothing and
    // every subsequent request re-runs the full seed forever.
    markSeeded(orgId, SEED_RETRY_BACKOFF_MS);
  }
}

/**
 * Cheap org-level self-heal. Returns immediately (in-process Map lookup, no DB)
 * when the org was seeded within the TTL; otherwise runs the full seed, sharing
 * a single pass across every concurrent caller. Never throws.
 */
export async function ensureSeeded(orgId: string): Promise<void> {
  if (seedIsFresh(orgId)) return;

  const inFlight = inFlightSeeds.get(orgId);
  if (inFlight) return inFlight;

  const pass: Promise<void> = runSeedPass(orgId).finally(() => {
    // Only clear our own entry — a later pass may already have replaced it.
    if (inFlightSeeds.get(orgId) === pass) inFlightSeeds.delete(orgId);
  });
  inFlightSeeds.set(orgId, pass);
  return pass;
}

/**
 * Seed-before-check (Phase 2). Does TWO things on every authenticated request,
 * and the order between them is load-bearing:
 *
 *   1. ORG-level (`ensureSeeded`) — the org's roles exist, grants are topped up,
 *      and the one-default invariant is converged. Behind a per-org TTL cache.
 *   2. USER-level — the caller holds a role BEFORE any userCan/requireAdmin gate
 *      runs, so fail-closed enforcement can never lock out a not-yet-seeded user
 *      (the rollout-lockout the RBAC_PLAN invariant warns about). The org cache
 *      does NOT cover a freshly-invited user inside the TTL window; this does,
 *      keyed on the user.
 *
 * (1) MUST run before (2)'s early return — see the comment on the call itself.
 * The two concerns are deliberately tangled in one function: separating them
 * would mean touching `withOrgAuth` AND `(dashboard)/page.tsx` and duplicating
 * the call, for no behavioural gain. Noted in QUIKCHAT_BACKLOG.md §9 as a
 * Phase 3 restructuring hazard rather than left to look accidental.
 *
 * Steady state is one in-memory cache lookup plus one indexed existence check
 * (`[userId, orgId]`); the bind path runs once per user (first request after
 * they gain access). The binding rule MIRRORS the Phase-1 backfill:
 * ADMIN_TIER_ROLES (or a platform super-admin) → admin, everyone else → Member.
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

    // ⚠️ THIS CALL MUST STAY ABOVE THE FAST-PATH RETURN BELOW. DO NOT MOVE IT
    // DOWN INTO THE BIND PATH — it looks like a wasted round-trip there and is
    // not.
    //
    // `ensureSeeded` is ORG-level: it creates the org's roles, tops up grants
    // on registry growth, and — the part that bites — runs
    // `convergeDefaultRole`, which repairs a lost/duplicated `isDefault` flag.
    // It used to sit below the `if (existing) return` and was therefore only
    // reachable when the CALLER had no role binding yet. That made the org-level
    // repair unreachable for any org where every user is already bound, which is
    // every mature org: the repair only ran on orgs that did not need it. The
    // live symptom was four roles stuck at isDefault = false while the Admin
    // Portal silently preselected `admin` for every new invitee, with no error
    // in the log because nothing was failing — nothing was running.
    //
    // Cost of keeping it here: one in-memory Map lookup per request. The DB work
    // is behind `ensureSeeded`'s per-org TTL cache, so a warm org pays nothing.
    await ensureSeeded(orgId);

    // Fast path: user already holds a role. Indexed existence check.
    const existing = await db.qcUserAppRole.findFirst({
      where: { userId, orgId, role: { appId } },
      select: { id: true },
    });
    if (existing) return;

    // Bind path (rare): classify + assign. The org's roles are guaranteed to
    // exist by the `ensureSeeded` above.

    const [member, user] = await Promise.all([
      db.orgMember.findFirst({ where: { orgId, userId }, select: { role: true } }),
      db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    ]);
    // ADMIN_TIER_ROLES, not string literals — it carries the LEGACY "admin"
    // membership role (ROLE_HIERARCHY["admin"] === 5, same authority as
    // org_admin) alongside the v4 names. Hardcoding org_admin/super_admin bound
    // a legacy-admin owner to Member here while `createRequireAdmin` admitted
    // them at level 5, so they reached /settings/roles yet were treated as a
    // Member by every userCan() gate. Must stay in step with the Phase-1
    // backfill in `backfillExistingMembers`.
    const isAdmin =
      ADMIN_TIER_ROLES.has(String(member?.role ?? "")) || user?.isSuperAdmin === true;
    const roleName = isAdmin ? "admin" : "Member";

    const role = await db.qcAppRole.findFirst({
      where: { orgId, appId, name: roleName },
      select: { id: true },
    });
    if (!role) return; // seeding not settled yet; next request retries.

    await db.qcUserAppRole.create({
      data: { userId, orgId, roleId: role.id },
    });

    // Highest-volume mirror seam: this bind runs on a user's first entry and is
    // the most common way a QuikChat role is assigned. Keep central
    // UserAppAccess.role in step with the role just bound so the Admin Portal is
    // correct for the bulk of users (not just admin-UI role edits). Best-effort —
    // a no-op when the user has no access row; the outer catch swallows the rest.
    await mirrorAppRoleToCentral(db, { orgId, userId, appId, roleName });
  } catch (err) {
    // Still best-effort — never block a request on the seed-before-check — but
    // no longer silent. A concurrent bind losing the unique race on
    // (userId, orgId, roleId) is EXPECTED and self-correcting, so it stays
    // quiet; anything else is a real fault and gets a line.
    if (!isUniqueViolation(err)) {
      logger.warn(
        { ...errorFields(err), orgId, userId },
        "RBAC seed-before-check failed — user may hold no QuikChat role this request",
      );
    }
  }
}
