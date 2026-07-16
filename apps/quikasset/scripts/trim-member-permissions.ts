/**
 * One-off migration: strip legacy over-granted permissions from the default
 * "Member" role of every org, bringing already-seeded orgs in line with the
 * trimmed BRD Phase 0 grant set in lib/api/seedAppRoles.ts.
 *
 * WHY THIS IS NEEDED
 * ------------------
 * Role seeding is additive-only (`backfillMemberPermissions` only ADDS missing
 * grants, never removes). So editing MEMBER_DEFAULT_GRANTS does not revoke the
 * old wide grants (full CRUD on Asset/Category/Assignment/Repair/Replacement/
 * Employee + Report/AuditLog/Budget/Dashboard view) on orgs seeded before the
 * change. This script deletes those extra AstRolePermission rows.
 *
 * SCOPE
 *  - Only touches the default Member role (isSystem=false, name="Member").
 *  - Leaves the system admin role and any custom roles untouched.
 *  - Does NOT touch AstUserPermissionExtra (per-user overrides are deliberate);
 *    it only reports a count of members holding extras for manual review.
 *
 * Run (from apps/quikasset):
 *   npx tsx scripts/trim-member-permissions.ts            # dry-run (default)
 *   npx tsx scripts/trim-member-permissions.ts --apply    # perform deletions
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Must mirror MEMBER_DEFAULT_GRANTS in lib/api/seedAppRoles.ts.
const ALLOWED = new Set<string>([
  "Asset:view",
  "Notification:view",
  "AssetRequest:view",
  "AssetRequest:create",
]);

async function main() {
  const app = await db.app.findUnique({ where: { slug: "quikasset" }, select: { id: true } });
  if (!app) {
    console.error('QuikAsset app not found (slug "quikasset"). Nothing to do.');
    return;
  }

  const memberRoles = await db.astAppRole.findMany({
    where: { appId: app.id, name: "Member", isSystem: false },
    select: {
      id: true,
      orgId: true,
      permissions: { select: { id: true, resource: true, action: true } },
    },
  });

  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — ${memberRoles.length} Member role(s) across orgs\n` +
      `Allowed grants: ${[...ALLOWED].join(", ")}\n`,
  );

  let totalToDelete = 0;
  for (const role of memberRoles) {
    const extra = role.permissions.filter((p) => !ALLOWED.has(`${p.resource}:${p.action}`));
    const extrasCount = await db.astUserPermissionExtra.count({ where: { orgId: role.orgId } });

    if (extra.length === 0) {
      console.log(`  org ${role.orgId}: already trimmed ✓  (per-user extras in org: ${extrasCount})`);
      continue;
    }
    totalToDelete += extra.length;
    console.log(
      `  org ${role.orgId}: ${extra.length} grant(s) to remove — ` +
        `${extra.map((p) => `${p.resource}:${p.action}`).join(", ")}` +
        (extrasCount ? `  (⚠ ${extrasCount} per-user extra rows in org — review separately)` : ""),
    );

    if (APPLY) {
      await db.astRolePermission.deleteMany({ where: { id: { in: extra.map((p) => p.id) } } });
    }
  }

  console.log(
    `\n${APPLY ? "Deleted" : "Would delete"} ${totalToDelete} grant row(s).` +
      (APPLY ? "" : "  Re-run with --apply to perform the deletions."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
