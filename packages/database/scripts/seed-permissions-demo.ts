/**
 * QuikPilot — demo seeder for GET /api/internal/permissions.
 *
 * Creates one dedicated user per resolution state that
 * `apps/quiktrack/lib/api/resolvePermissions.ts` can return, so the endpoint's
 * four states can be exercised repeatably instead of hand-seeded with ad hoc
 * SQL mid-session:
 *
 *   admin_bypass  — OrgMember.role = "admin" (∈ ADMIN_TIER_ROLES)
 *   space_admin   — holds the project's "Space Admin" project role
 *   project_role  — holds the project's "Contributor" project role
 *   org_fallback  — no project role. Seeded TWICE, because an empty list is
 *                   ambiguous between "no grants" and "fallback untested":
 *                     · one user with no app-wide role at all → []
 *                     · one user with a dedicated app-wide role holding the
 *                       exact grant set in FALLBACK_GRANTS → non-empty
 *
 * WHY A DEDICATED APP ROLE, not the seeded "Member" role: the integration test
 * asserts `orgPermissions` equals this set exactly, not merely that it is
 * non-empty. Pinning that to "Member" would make the assertion hostage to
 * `seedUserAppRole()`, which owns that role's grants and may change them.
 *
 * WHY DEDICATED USERS, not the existing qt.* demo users: those belong to
 * `apps/quiktrack/scripts/seed-dummy.ts`, which would fight this script for
 * ownership of their roles on every re-run.
 *
 * These users have no password and are never meant to log in — the endpoint
 * takes a userId directly and reads no session.
 *
 * PREREQUISITE: an org with at least one non-deleted QtProject that has its
 * starter project roles ("Contributor", "Space Admin"). Bootstrapping a project
 * from scratch means reproducing the permission registry inside this package,
 * so the script fails with an actionable message instead. Run
 * `npm run db:seed:dummy -w apps/quiktrack` first on an empty database.
 *
 * Idempotent — every write is an upsert on a unique key, and rows that must NOT
 * exist for a given user (project roles, per-user extras, foreign app roles)
 * are deleted rather than assumed absent. Re-running converges.
 *
 * NOT touched: the hand-inserted `QtProjectUserRole` row `demo_pur_1`
 * (qt.lead → WEB/Contributor) from the original walkthrough. It belongs to a
 * different user and deleting someone's demo data is out of this script's remit.
 *
 * Run:
 *   npm run db:seed:permissions-demo -w apps/quiktrack
 *   npm run db:seed:permissions-demo -w apps/quiktrack -- --json
 *
 * Env:
 *   DATABASE_URL             required (supplied by the app's .env.local)
 *   PERM_DEMO_ORG_SLUG       optional — pins the org when several exist
 *   PERM_DEMO_PROJECT_KEY    optional — pins the project
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const APP_SLUG = "quiktrack";
const EMAIL_DOMAIN = "quikit-demo.local";

/** Name of the app-wide role seeded for the non-empty org_fallback case. */
export const FALLBACK_ROLE_NAME = "Permissions Demo (fallback)";

/**
 * The exact app-wide grants the fallback user holds. Kept small and explicit so
 * the integration test can assert set equality.
 *
 * `Report` is deliberately included: it is in APP_WIDE_ONLY_RESOURCES, so it
 * must appear in `orgPermissions` and must NOT appear in the project answer.
 * That one row is what proves the endpoint applies the split rather than
 * echoing the same list twice.
 */
export const FALLBACK_GRANTS: ReadonlyArray<{ resource: string; action: string }> = [
  { resource: "Issue", action: "view" },
  { resource: "Issue", action: "create" },
  { resource: "Issue", action: "update" },
  { resource: "Sprint", action: "view" },
  { resource: "Report", action: "view" },
];

const CONTRIBUTOR_ROLE_NAME = "Contributor";
const SPACE_ADMIN_ROLE_NAME = "Space Admin";

type StateKey =
  | "orgFallbackEmpty"
  | "orgFallbackGrants"
  | "projectRole"
  | "spaceAdmin"
  | "adminBypass";

interface DemoUserSpec {
  key: StateKey;
  localPart: string;
  firstName: string;
  lastName: string;
  /** OrgMember.role — "admin" is the one that trips hasAdminAccess. */
  orgRole: string;
  /** Project role to assign, or null for "must hold none". */
  projectRoleName: string | null;
  /** Whether to link the dedicated fallback app role. */
  appRole: boolean;
  /** The resolution this user is seeded to produce. */
  expectedResolution: "admin_bypass" | "space_admin" | "project_role" | "org_fallback";
}

const USERS: readonly DemoUserSpec[] = [
  {
    key: "orgFallbackEmpty",
    localPart: "perm-demo.fallback-empty",
    firstName: "Fallback",
    lastName: "Empty",
    orgRole: "employee",
    projectRoleName: null,
    appRole: false,
    expectedResolution: "org_fallback",
  },
  {
    key: "orgFallbackGrants",
    localPart: "perm-demo.fallback-grants",
    firstName: "Fallback",
    lastName: "Grants",
    orgRole: "employee",
    projectRoleName: null,
    appRole: true,
    expectedResolution: "org_fallback",
  },
  {
    key: "projectRole",
    localPart: "perm-demo.project-role",
    firstName: "Project",
    lastName: "Contributor",
    orgRole: "employee",
    projectRoleName: CONTRIBUTOR_ROLE_NAME,
    appRole: false,
    expectedResolution: "project_role",
  },
  {
    key: "spaceAdmin",
    localPart: "perm-demo.space-admin",
    firstName: "Space",
    lastName: "Admin",
    orgRole: "employee",
    projectRoleName: SPACE_ADMIN_ROLE_NAME,
    appRole: false,
    expectedResolution: "space_admin",
  },
  {
    key: "adminBypass",
    localPart: "perm-demo.admin",
    firstName: "Admin",
    lastName: "Bypass",
    orgRole: "admin",
    projectRoleName: null,
    appRole: false,
    expectedResolution: "admin_bypass",
  },
];

export interface SeededUser {
  key: StateKey;
  userId: string;
  email: string;
  expectedResolution: DemoUserSpec["expectedResolution"];
}

export interface PermissionsDemoIds {
  orgId: string;
  projectId: string;
  projectKey: string;
  fallbackRoleId: string;
  /**
   * `Resource:action` strings the fallback user holds app-wide, sorted — the
   * exact value `orgPermissions` must equal for that user. The project-scoped
   * subset is NOT derived here: the caller filters it through the registry's
   * `isAppWideOnly`, so nothing hand-copies the split.
   */
  fallbackGrantKeys: string[];
  users: Record<StateKey, SeededUser>;
}

/* ──────────────────────────── resolution helpers ─────────────────────────── */

async function resolveOrgId(): Promise<string> {
  const slug = process.env.PERM_DEMO_ORG_SLUG?.trim();
  if (slug) {
    const org = await db.org.findFirst({ where: { slug }, select: { id: true } });
    if (!org) throw new Error(`PERM_DEMO_ORG_SLUG="${slug}" matches no Org.`);
    return org.id;
  }

  const orgs = await db.org.findMany({ select: { id: true, slug: true }, take: 5 });
  if (orgs.length === 0) {
    throw new Error(
      "No Org rows. Seed a tenant first: npm run db:seed:dummy -w apps/quiktrack",
    );
  }
  if (orgs.length > 1) {
    const list = orgs.map((o) => o.slug).join(", ");
    throw new Error(`Several orgs (${list}). Pin one with PERM_DEMO_ORG_SLUG.`);
  }
  return orgs[0].id;
}

async function resolveAppId(): Promise<string> {
  const app = await db.app.findFirst({ where: { slug: APP_SLUG }, select: { id: true } });
  if (!app) throw new Error(`No App row with slug="${APP_SLUG}".`);
  return app.id;
}

/**
 * Pick the project, then prove it carries both project roles the demo needs.
 * Ordered by createdAt so the choice is stable across runs rather than
 * whatever the planner returns first.
 */
async function resolveProject(orgId: string) {
  const key = process.env.PERM_DEMO_PROJECT_KEY?.trim();
  const project = await db.qtProject.findFirst({
    where: { orgId, isDeleted: false, ...(key ? { projectKey: key } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, projectKey: true },
  });
  if (!project) {
    throw new Error(
      key
        ? `PERM_DEMO_PROJECT_KEY="${key}" matches no live project in this org.`
        : "No live QtProject in this org. Run: npm run db:seed:dummy -w apps/quiktrack",
    );
  }

  const roles = await db.qtProjectRole.findMany({
    where: {
      projectId: project.id,
      name: { in: [CONTRIBUTOR_ROLE_NAME, SPACE_ADMIN_ROLE_NAME] },
    },
    select: { id: true, name: true },
  });
  const byName = new Map(roles.map((r) => [r.name, r.id]));
  for (const name of [CONTRIBUTOR_ROLE_NAME, SPACE_ADMIN_ROLE_NAME]) {
    if (!byName.has(name)) {
      throw new Error(
        `Project ${project.projectKey} has no "${name}" project role — its starter ` +
          `roles were never seeded. Create the project through the app, or pick ` +
          `another with PERM_DEMO_PROJECT_KEY.`,
      );
    }
  }
  return { ...project, roleIdByName: byName };
}

/* ──────────────────────────────── writers ────────────────────────────────── */

/**
 * The dedicated app-wide role. Grants are reconciled, not merely inserted:
 * anything on the role that is not in FALLBACK_GRANTS is removed, so editing
 * that constant and re-running converges instead of accumulating.
 */
async function ensureFallbackRole(orgId: string, appId: string): Promise<string> {
  const role = await db.qtAppRole.upsert({
    where: { orgId_appId_name: { orgId, appId, name: FALLBACK_ROLE_NAME } },
    update: {},
    create: {
      orgId,
      appId,
      name: FALLBACK_ROLE_NAME,
      description:
        "Local demo only. Fixed grant set backing the non-empty org_fallback " +
        "case of GET /api/internal/permissions. Not a product role.",
      isSystem: false,
      isDefault: false,
    },
    select: { id: true },
  });

  const wanted = new Set(FALLBACK_GRANTS.map((g) => `${g.resource}:${g.action}`));
  const existing = await db.qtRolePermission.findMany({
    where: { roleId: role.id },
    select: { id: true, resource: true, action: true },
  });
  const stale = existing
    .filter((p) => !wanted.has(`${p.resource}:${p.action}`))
    .map((p) => p.id);
  if (stale.length > 0) {
    await db.qtRolePermission.deleteMany({ where: { id: { in: stale } } });
  }

  for (const grant of FALLBACK_GRANTS) {
    await db.qtRolePermission.upsert({
      where: {
        roleId_resource_action: {
          roleId: role.id,
          resource: grant.resource,
          action: grant.action,
        },
      },
      update: {},
      create: { roleId: role.id, resource: grant.resource, action: grant.action },
    });
  }
  return role.id;
}

async function ensureUser(spec: DemoUserSpec, orgId: string): Promise<string> {
  const email = `${spec.localPart}@${EMAIL_DOMAIN}`;
  const user = await db.user.upsert({
    where: { email },
    // firstName/lastName are refreshed so a rename in USERS propagates; the
    // row identity is the email.
    update: { firstName: spec.firstName, lastName: spec.lastName },
    create: { email, firstName: spec.firstName, lastName: spec.lastName },
    select: { id: true },
  });

  await db.orgMember.upsert({
    where: { orgId_userId: { orgId, userId: user.id } },
    // The role IS the fixture for admin_bypass — always re-assert it.
    update: { role: spec.orgRole, status: "active" },
    create: { orgId, userId: user.id, role: spec.orgRole, status: "active" },
    select: { id: true },
  });

  return user.id;
}

/**
 * App-role links are reconciled to exactly what the spec wants. Deleting the
 * links we do not want is what makes `orgPermissions` assertable as a set:
 * a stray link from an earlier experiment would silently widen it.
 */
async function reconcileAppRole(
  userId: string,
  orgId: string,
  fallbackRoleId: string,
  wantFallbackRole: boolean,
): Promise<void> {
  await db.qtUserAppRole.deleteMany({
    where: { userId, orgId, ...(wantFallbackRole ? { NOT: { roleId: fallbackRoleId } } : {}) },
  });
  if (wantFallbackRole) {
    await db.qtUserAppRole.upsert({
      where: { userId_orgId_roleId: { userId, orgId, roleId: fallbackRoleId } },
      update: {},
      create: { userId, orgId, roleId: fallbackRoleId },
      select: { id: true },
    });
  }

  // Per-user extras union into orgPermissions, so they must be absent for the
  // exact-set assertion to mean anything.
  await db.qtUserPermissionExtra.deleteMany({ where: { userId, orgId } });
}

/**
 * Membership is seeded for every demo user because reads gate on
 * `QtProjectMember`, not on a view grant — a non-member would make
 * `isMember: false` the interesting fact instead of the resolution.
 */
async function reconcileProject(
  userId: string,
  projectId: string,
  projectRoleId: string | null,
): Promise<void> {
  await db.qtProjectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { isDeleted: false },
    create: { projectId, userId, role: "MEMBER" },
    select: { id: true },
  });

  if (projectRoleId) {
    await db.qtProjectUserRole.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { projectRoleId },
      create: { projectId, userId, projectRoleId },
      select: { id: true },
    });
  } else {
    // "Holds no project role" is a fixture, not an absence to hope for.
    await db.qtProjectUserRole.deleteMany({ where: { projectId, userId } });
  }
}

/* ──────────────────────────────── entrypoint ─────────────────────────────── */

export async function seedPermissionsDemo(): Promise<PermissionsDemoIds> {
  const [orgId, appId] = await Promise.all([resolveOrgId(), resolveAppId()]);
  const project = await resolveProject(orgId);
  const fallbackRoleId = await ensureFallbackRole(orgId, appId);

  const users = {} as Record<StateKey, SeededUser>;
  for (const spec of USERS) {
    const userId = await ensureUser(spec, orgId);
    await reconcileAppRole(userId, orgId, fallbackRoleId, spec.appRole);
    await reconcileProject(
      userId,
      project.id,
      spec.projectRoleName ? (project.roleIdByName.get(spec.projectRoleName) ?? null) : null,
    );
    users[spec.key] = {
      key: spec.key,
      userId,
      email: `${spec.localPart}@${EMAIL_DOMAIN}`,
      expectedResolution: spec.expectedResolution,
    };
  }

  return {
    orgId,
    projectId: project.id,
    projectKey: project.projectKey,
    fallbackRoleId,
    fallbackGrantKeys: FALLBACK_GRANTS.map((g) => `${g.resource}:${g.action}`).sort(),
    users,
  };
}

function report(ids: PermissionsDemoIds): void {
  console.log("");
  console.log("=== 1. fixture ===");
  console.log(`orgId      ${ids.orgId}`);
  console.log(`projectId  ${ids.projectId}  (${ids.projectKey})`);
  console.log(`app role   ${FALLBACK_ROLE_NAME} → ${ids.fallbackGrantKeys.join(", ")}`);
  console.log("");
  console.log("=== 2. one user per resolution state ===");
  for (const spec of USERS) {
    const u = ids.users[spec.key];
    console.log(`${u.expectedResolution.padEnd(13)} ${u.userId}  ${u.email}`);
  }
  console.log("");
  console.log("=== 3. curl one ===");
  console.log(
    `curl -s -H "x-internal-secret: $INTERNAL_AI_RUNTIME_SECRET" \\\n` +
      `  "http://localhost:3004/api/internal/permissions` +
      `?userId=${ids.users.projectRole.userId}` +
      `&orgId=${ids.orgId}&projectId=${ids.projectId}"`,
  );
  console.log("");
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const ids = await seedPermissionsDemo();
  if (asJson) {
    console.log(JSON.stringify(ids, null, 2));
  } else {
    report(ids);
  }
}

// Only run when invoked directly — importing this module (the integration
// harness does) must not print or exit the process.
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith(
  "scripts/seed-permissions-demo.ts",
);
if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Seed failed";
      console.error(`\nFAIL  ${message}\n`);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
