/**
 * One-time grant: `ClientMeetings.Report: delete` for every role that already
 * holds `ClientMeetings.Report: update`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The delete action is new. RBAC v2 has no admin bypass — a permission nobody
 * has been granted is a button nobody can press, including the org admin. The
 * people who could already generate, edit and overwrite a report (which
 * destroys the previous version and its sign-off) are exactly the people who
 * should be able to remove one, so the update grant is the right seed.
 *
 * Anything narrower stays a deliberate choice: revoke the grant in
 * Settings → Roles & Permissions afterwards for roles that should not delete.
 *
 * Usage (from the repo root):
 *   npx tsx apps/quikscale/scripts/grant-report-delete-permission.ts --dry-run
 *   npx tsx apps/quikscale/scripts/grant-report-delete-permission.ts
 *
 * Idempotent: skips roles that already hold the delete grant, so re-running is
 * safe and prints "0 granted".
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), "packages/database/.env") });
loadEnv({ path: resolve(process.cwd(), "apps/quikscale/.env") });

const RESOURCE = "ClientMeetings.Report";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { db } = await import("../lib/db");

  const withUpdate = await db.rolePermission.findMany({
    where: { resource: RESOURCE, action: "update" },
    select: { roleId: true, role: { select: { name: true } } },
  });

  const withDelete = new Set(
    (
      await db.rolePermission.findMany({
        where: { resource: RESOURCE, action: "delete" },
        select: { roleId: true },
      })
    ).map((r) => r.roleId),
  );

  const missing = withUpdate.filter((r) => !withDelete.has(r.roleId));

  console.log(
    `${withUpdate.length} role(s) hold ${RESOURCE}:update — ${missing.length} need the delete grant.`,
  );
  for (const r of missing) console.log(`  • ${r.role?.name ?? r.roleId}`);

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }
  if (!missing.length) return;

  const result = await db.rolePermission.createMany({
    data: missing.map((r) => ({ roleId: r.roleId, resource: RESOURCE, action: "delete" })),
    skipDuplicates: true,
  });
  console.log(`\nGranted ${result.count} role(s) ${RESOURCE}:delete.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
