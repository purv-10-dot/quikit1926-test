/**
 * Backfill: grant `AssetRequest:view` + `AssetRequest:create` to the default
 * "Member" role of every org, bringing already-seeded orgs in line with the
 * MEMBER_DEFAULT_GRANTS set in lib/api/seedAppRoles.ts when the employee-facing
 * Asset Request feature landed.
 *
 * WHY (and why it's mostly belt-and-suspenders): role seeding is additive, and
 * `backfillMemberPermissions()` already tops up these two pairs on the next
 * authenticated dashboard load / `/api/me/permissions` hit. This script applies
 * them immediately, org-wide, without waiting for a member to log in — with a
 * dry-run and an auditable summary. Same shape as scripts/backfill-member-role.ts.
 *
 * SCOPE
 *  - Only touches the default Member role (isSystem=false, name="Member").
 *  - Leaves the system admin role and any custom roles untouched.
 *  - Additive only (createMany + skipDuplicates) — never removes a grant.
 *  - --org=<id> narrows to a single org.
 *
 * Run (from apps/quikasset, with DATABASE_URL in env):
 *   npx tsx scripts/backfill-assetrequest-member-grants.ts             # dry-run, all orgs
 *   npx tsx scripts/backfill-assetrequest-member-grants.ts --org=<id>  # dry-run, one org
 *   npx tsx scripts/backfill-assetrequest-member-grants.ts --apply     # perform (all orgs)
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";
import { selectMissingGrants, ASSET_REQUEST_MEMBER_GRANTS } from "./assetRequestGrantPlan";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const ORG_FILTER = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) ?? null;

async function main() {
  const app = await db.app.findUnique({ where: { slug: "quikasset" }, select: { id: true } });
  if (!app) {
    console.error('QuikAsset app not registered (slug "quikasset"). Nothing to do.');
    return;
  }

  const memberRoles = await db.astAppRole.findMany({
    where: {
      appId: app.id,
      name: "Member",
      isSystem: false,
      ...(ORG_FILTER ? { orgId: ORG_FILTER } : {}),
    },
    select: {
      id: true,
      orgId: true,
      permissions: { select: { resource: true, action: true } },
    },
  });

  if (memberRoles.length === 0) {
    console.error(
      ORG_FILTER
        ? `No Member role found for org ${ORG_FILTER}. Nothing to do.`
        : "No Member roles found. Nothing to do.",
    );
    return;
  }

  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — backfill ${ASSET_REQUEST_MEMBER_GRANTS.map((g) => `${g.resource}:${g.action}`).join(" + ")} ` +
      `on ${memberRoles.length} Member role(s)` +
      `${ORG_FILTER ? ` (org ${ORG_FILTER})` : ""}\n`,
  );

  let totalToAdd = 0;
  let totalAdded = 0;

  for (const role of memberRoles) {
    const missing = selectMissingGrants(role.permissions);
    if (missing.length === 0) {
      console.log(`  org ${role.orgId}: already granted ✓`);
      continue;
    }
    totalToAdd += missing.length;
    console.log(
      `  org ${role.orgId}: add ${missing.map((g) => `${g.resource}:${g.action}`).join(", ")}`,
    );

    if (APPLY) {
      const res = await db.astRolePermission.createMany({
        data: missing.map((g) => ({ roleId: role.id, resource: g.resource, action: g.action })),
        skipDuplicates: true,
      });
      totalAdded += res.count;
    }
  }

  console.log(
    `\nSUMMARY: ${APPLY ? `added ${totalAdded} grant row(s)` : `would add ${totalToAdd} grant row(s)`}.` +
      (APPLY ? " APPLIED." : "  Re-run with --apply to perform the backfill."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
