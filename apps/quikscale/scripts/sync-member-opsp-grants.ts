/**
 * One-time cleanup: converge existing default "Member" AppRoles onto the new
 * OPSP grant set (see lib/api/memberDefaults.ts / Req 6).
 *
 * The new Member OPSP defaults are:
 *   - OPSP.Create        → view
 *   - OPSP.History       → view
 *   - OPSP.Review.Critical → view + update
 *   - OPSP.Categories    → view
 *
 * `backfillMemberPermissions` (run on every authenticated request) already ADDS
 * the new `OPSP.Review.Critical:update` grant to existing orgs — but it never
 * REMOVES grants. Existing Members seeded under the OLD default still carry
 * `create` on Create / History / Review.Critical / Categories. This script:
 *   1. ADDS   OPSP.Review.Critical:update   (idempotent; in case backfill hasn't run)
 *   2. REMOVES the stale `create` rows on the four OPSP resources
 * so existing Member roles match the new default exactly.
 *
 * SCOPE — surgical, by design:
 *   - ONLY roles named "Member" with isSystem = false, under the QuikScale app
 *   - ADD touches only OPSP.Review.Critical:update
 *   - REMOVE touches only action = "create" on the four OPSP resources
 *   → admin role, other roles, the `view`/`update` actions, and every non-OPSP
 *     resource are left completely untouched.
 *
 * Run MANUALLY, once per environment, from the repo root:
 *   npx tsx apps/quikscale/scripts/sync-member-opsp-grants.ts --dry-run
 *   npx tsx apps/quikscale/scripts/sync-member-opsp-grants.ts
 *
 * Idempotent: re-running is a no-op (adds 0 with skipDuplicates, deletes 0).
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), "packages/database/.env") });
loadEnv({ path: resolve(process.cwd(), "apps/quikscale/.env") });

const QUIKSCALE_APP_SLUG = "quikscale";
// `create` rows on these resources are no longer part of the Member default.
const STRIP_CREATE_RESOURCES = [
  "OPSP.Create",
  "OPSP.History",
  "OPSP.Review.Critical",
  "OPSP.Categories",
] as const;
// New grant the Member default now includes.
const ADD_GRANT = { resource: "OPSP.Review.Critical", action: "update" } as const;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { db } = await import("@quikit/database");

  // All default Member roles for the QuikScale app.
  const memberRoles = await db.appRole.findMany({
    where: { name: "Member", isSystem: false, app: { slug: QUIKSCALE_APP_SLUG } },
    select: { id: true, orgId: true },
  });
  console.log(`Found ${memberRoles.length} Member role(s) under the QuikScale app.`);
  if (memberRoles.length === 0) {
    await db.$disconnect();
    return;
  }
  const roleIds = memberRoles.map((r) => r.id);

  // ── 1. ADD OPSP.Review.Critical:update (idempotent via skipDuplicates) ──
  const alreadyHasUpdate = await db.rolePermission.count({
    where: { roleId: { in: roleIds }, resource: ADD_GRANT.resource, action: ADD_GRANT.action },
  });
  const toAdd = memberRoles.length - alreadyHasUpdate;
  console.log(`ADD  ${ADD_GRANT.resource}:${ADD_GRANT.action} → ${toAdd} role(s) missing it.`);

  // ── 2. REMOVE stale `create` grants on the four OPSP resources ──
  const removeWhere = {
    roleId: { in: roleIds },
    action: "create",
    resource: { in: [...STRIP_CREATE_RESOURCES] },
  };
  const removeMatches = await db.rolePermission.findMany({
    where: removeWhere,
    select: { resource: true },
  });
  const byResource = new Map<string, number>();
  for (const m of removeMatches) byResource.set(m.resource, (byResource.get(m.resource) ?? 0) + 1);
  console.log(`REMOVE create grants → ${removeMatches.length} row(s):`);
  for (const r of STRIP_CREATE_RESOURCES) console.log(`  ${r}:create → ${byResource.get(r) ?? 0} row(s)`);

  if (dryRun) {
    console.log("\nDry run — nothing changed.");
    await db.$disconnect();
    return;
  }

  const added = await db.rolePermission.createMany({
    data: roleIds.map((roleId) => ({ roleId, ...ADD_GRANT })),
    skipDuplicates: true,
  });
  const removed = await db.rolePermission.deleteMany({ where: removeWhere });

  console.log(`\nAdded ${added.count} grant row(s); removed ${removed.count} create grant row(s).`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("sync-member-opsp-grants failed:", err);
  process.exit(1);
});
