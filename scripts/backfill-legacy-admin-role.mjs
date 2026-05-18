// One-off Phase-2 backfill for the QuikScale dual-role desync.
//
// Before Phase 2, promoting a user to admin via Org Setup → User Management
// wrote only the dynamic-RBAC v2 grant (UserAppRole → system "admin"
// AppRole) and never the legacy org-wide OrgMember.role. The shared
// role-tier requireAdmin() reads only OrgMember.role, so every existing
// v2-only admin is still "member" (or similar) at the legacy layer and
// depends entirely on the Phase-1 read-time bridge.
//
// This script reconciles the backlog: every user holding an active
// QuikScale system-admin AppRole whose OrgMember.role is BELOW the admin
// tier is bumped to "admin". It mirrors syncLegacyAdminRole exactly —
// users already at/above admin tier (super_admin / org_admin / admin) are
// left untouched so platform authority is never downgraded.
//
// Idempotent. Dry-run by default. Run from repo root:
//   DATABASE_URL='...' DATABASE_URL_DIRECT='...' \
//     node scripts/backfill-legacy-admin-role.mjs            # preview only
//   DATABASE_URL='...' DATABASE_URL_DIRECT='...' \
//     node scripts/backfill-legacy-admin-role.mjs --apply    # write

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const QUIKSCALE_APP_SLUG = "quikscale";

// Roles already at or above the admin tier (ROLE_HIERARCHY: super_admin=6,
// admin=5, org_admin=5). Anything else is below admin → eligible to promote.
// Kept in sync with apps/quikscale/lib/api/syncLegacyAdminRole.ts.
const ALREADY_ADMIN_OR_HIGHER = new Set(["super_admin", "admin", "org_admin"]);

function log(...a) {
  console.log(...a);
}

async function main() {
  log("═".repeat(78));
  log(`  Phase-2 legacy admin-role backfill  (${APPLY ? "APPLY" : "DRY-RUN"})`);
  log("═".repeat(78));

  const app = await db.app.findUnique({
    where: { slug: QUIKSCALE_APP_SLUG },
    select: { id: true },
  });
  if (!app) {
    log("QuikScale app not registered — nothing to do.");
    return;
  }

  const adminRoles = await db.appRole.findMany({
    where: { appId: app.id, isSystem: true, name: "admin" },
    select: { id: true },
  });
  if (adminRoles.length === 0) {
    log("No system admin AppRole rows exist yet — nothing to do.");
    return;
  }
  const adminRoleIds = adminRoles.map((r) => r.id);

  const grants = await db.userAppRole.findMany({
    where: { roleId: { in: adminRoleIds } },
    select: { orgId: true, userId: true },
  });

  // Dedupe (orgId,userId) — a user could theoretically appear once per
  // admin role row.
  const seen = new Set();
  const pairs = [];
  for (const g of grants) {
    const key = `${g.orgId}:${g.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(g);
  }

  log(`v2 admin grants found: ${grants.length}  (unique users: ${pairs.length})`);

  let promoted = 0;
  let skippedNoMembership = 0;
  let skippedAlreadyAdmin = 0;

  for (const { orgId, userId } of pairs) {
    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true },
    });
    if (!membership) {
      skippedNoMembership++;
      continue;
    }
    if (ALREADY_ADMIN_OR_HIGHER.has(membership.role)) {
      skippedAlreadyAdmin++;
      continue;
    }

    log(
      `  ${APPLY ? "PROMOTE" : "would promote"}  org=${orgId} user=${userId}  "${membership.role}" → "admin"`,
    );
    if (APPLY) {
      await db.orgMember.update({
        where: { orgId_userId: { orgId, userId } },
        data: { role: "admin" },
      });
    }
    promoted++;
  }

  log("─".repeat(78));
  log(`  ${APPLY ? "promoted" : "would promote"}:        ${promoted}`);
  log(`  skipped (no membership):  ${skippedNoMembership}`);
  log(`  skipped (already ≥admin): ${skippedAlreadyAdmin}`);
  if (!APPLY) {
    log("");
    log("  DRY-RUN — no rows written. Re-run with --apply to commit.");
  }
  log("═".repeat(78));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
