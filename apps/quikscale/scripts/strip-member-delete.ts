/**
 * One-time cleanup: remove the `delete` grant from existing default "Member"
 * AppRoles on the day-to-day work surfaces (KPI / Team KPI / Priority / WWW).
 *
 * WHY: `MEMBER_DEFAULT_GRANTS` used to seed Members with full CRUDV. The
 * default no longer includes `delete` (see lib/api/seedAdminAppRole.ts), but
 * `backfillMemberPermissions` only ever ADDS grants — it never removes the
 * delete rows already written to existing orgs. This script does that removal
 * once, so existing Member roles converge on the new no-delete default.
 *
 * SCOPE — surgical, by design:
 *   - ONLY rows where action = "delete"
 *   - ONLY resources KPI / TeamKPI / Priority / WWW
 *   - ONLY roles named "Member" with isSystem = false, under the QuikScale app
 *   → admin role, other roles, other actions (view/create/update), and every
 *     other resource are left completely untouched.
 *
 * Run MANUALLY, once per environment, from the repo root:
 *   npx tsx apps/quikscale/scripts/strip-member-delete.ts --dry-run
 *   npx tsx apps/quikscale/scripts/strip-member-delete.ts
 *
 * Idempotent: re-running after the rows are gone is a no-op (deletes 0).
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), "packages/database/.env") });
loadEnv({ path: resolve(process.cwd(), "apps/quikscale/.env") });

const TARGET_RESOURCES = ["KPI", "TeamKPI", "Priority", "WWW"] as const;
const QUIKSCALE_APP_SLUG = "quikscale";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { db } = await import("@quikit/database");

  const where = {
    action: "delete",
    resource: { in: [...TARGET_RESOURCES] },
    role: {
      name: "Member",
      isSystem: false,
      app: { slug: QUIKSCALE_APP_SLUG },
    },
  };

  const matches = await db.rolePermission.findMany({
    where,
    select: { id: true, resource: true, role: { select: { orgId: true } } },
  });

  // Per-org tally for a readable report.
  const byOrg = new Map<string, number>();
  for (const m of matches) {
    byOrg.set(m.role.orgId, (byOrg.get(m.role.orgId) ?? 0) + 1);
  }

  console.log(
    `Found ${matches.length} Member 'delete' grant row(s) across ${byOrg.size} org(s) ` +
      `on [${TARGET_RESOURCES.join(", ")}].`,
  );
  for (const [orgId, count] of byOrg) console.log(`  org ${orgId}: ${count} row(s)`);

  if (dryRun) {
    console.log("\nDry run — nothing deleted.");
    await db.$disconnect();
    return;
  }

  const { count } = await db.rolePermission.deleteMany({ where });
  console.log(`\nDeleted ${count} Member 'delete' grant row(s).`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("strip-member-delete failed:", err);
  process.exit(1);
});
