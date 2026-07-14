/**
 * Seed script: registers the "QuikAsset" app in the platform catalog, grants
 * every active membership access to it, and seeds default RBAC roles per org.
 *
 * Run: npx tsx scripts/seed-app.ts   (from apps/quikasset)
 *
 * Idempotent. Does NOT create the OAuth client — that's provisioned by the
 * integration owner via the super-admin flow (or apps/quikit OAuthClient seed).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Keep in sync with lib/api/permissionsRegistry.ts + lib/api/seedAppRoles.ts.
const RESOURCES = [
  "Dashboard", "Asset", "Category", "Assignment", "Repair", "Replacement",
  "Budget", "Report", "AuditLog", "Notification", "Employee", "Settings",
] as const;
const VIEW_ONLY = new Set(["Dashboard", "Report", "AuditLog", "Notification"]);
const VIEW_ALL_RESOURCES = new Set(["Asset"]);
const ACTIONS = ["view", "create", "update", "delete"] as const;

function allPairs() {
  const out: Array<{ resource: string; action: string }> = [];
  for (const resource of RESOURCES) {
    if (VIEW_ONLY.has(resource)) {
      out.push({ resource, action: "view" });
    } else {
      for (const action of ACTIONS) out.push({ resource, action });
      if (VIEW_ALL_RESOURCES.has(resource)) out.push({ resource, action: "viewAll" });
    }
  }
  return out;
}

// BRD Phase 0: Members may only view their assigned assets (row-scoped in the
// route layer) + their own notifications. See seedAppRoles.ts for the rationale.
const MEMBER_GRANTS = [
  { resource: "Asset", action: "view" },
  { resource: "Notification", action: "view" },
];

async function main() {
  // 1. Upsert the QuikAsset app catalog row.
  const app = await db.app.upsert({
    where: { slug: "quikasset" },
    update: {
      name: "QuikAsset",
      description: "IT & fixed-asset lifecycle management — inventory, assignments, repairs, budgets & reports",
      status: "active",
    },
    create: {
      name: "QuikAsset",
      slug: "quikasset",
      description: "IT & fixed-asset lifecycle management — inventory, assignments, repairs, budgets & reports",
      baseUrl: process.env.QUIKASSET_URL || "http://localhost:3012",
      status: "active",
    },
  });
  console.log(`App upserted: ${app.name} (${app.id})`);

  // 2. Grant access + enable org access for all active memberships.
  const memberships = await db.orgMember.findMany({ where: { status: "active" } });
  const orgIds = new Set<string>();
  let granted = 0;
  for (const m of memberships) {
    orgIds.add(m.orgId);
    await db.orgAppAccess.upsert({
      where: { orgId_appId: { orgId: m.orgId, appId: app.id } },
      update: { enabled: true },
      create: { orgId: m.orgId, appId: app.id, enabled: true },
    });
    await db.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId: m.userId, orgId: m.orgId, appId: app.id } },
      update: {},
      create: {
        userId: m.userId,
        orgId: m.orgId,
        appId: app.id,
        role: m.role === "admin" || m.role === "org_admin" || m.role === "super_admin" ? "admin" : "member",
      },
    });
    granted++;
  }
  console.log(`Granted QuikAsset access to ${granted} memberships across ${orgIds.size} orgs`);

  // 3. Seed default RBAC roles per org (admin = all, Member = curated).
  for (const orgId of orgIds) {
    const admin = await db.astAppRole.upsert({
      where: { orgId_appId_name: { orgId, appId: app.id, name: "admin" } },
      update: {},
      create: { orgId, appId: app.id, name: "admin", description: "Full access (auto-seeded).", isSystem: true },
    });
    if ((await db.astRolePermission.count({ where: { roleId: admin.id } })) === 0) {
      await db.astRolePermission.createMany({
        data: allPairs().map((p) => ({ roleId: admin.id, ...p })),
        skipDuplicates: true,
      });
    }
    const member = await db.astAppRole.upsert({
      where: { orgId_appId_name: { orgId, appId: app.id, name: "Member" } },
      update: {},
      create: { orgId, appId: app.id, name: "Member", description: "Default team-member role.", isDefault: true },
    });
    if ((await db.astRolePermission.count({ where: { roleId: member.id } })) === 0) {
      await db.astRolePermission.createMany({
        data: MEMBER_GRANTS.map((g) => ({ roleId: member.id, ...g })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`Seeded admin + Member roles for ${orgIds.size} orgs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
