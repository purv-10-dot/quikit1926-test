/**
 * Phase-3 role cleanup: assign the org's default "Member" AstAppRole to every
 * QuikAsset-access user who currently holds NO app role ("No role").
 *
 * WHY: a user with UserAppAccess to QuikAsset but no AstUserAppRole has zero
 * permissions — they can't even view their own assets, and User Management
 * renders them as "No role". New users created via POST /api/org/users already
 * default to Member; this backfills everyone who received access via other
 * paths (Admin-Portal / platform org invites) before that default applied.
 *
 * SCOPE: all orgs by default. This is safe/additive — it only ADDS the default
 * role a user should already have, never removes or changes an existing role.
 * --org=<id> narrows to a single org.
 *
 * Mirrors ensureUserOnRole()'s two writes:
 *   1. app_quikasset.UserAppRole  (userId, orgId, Member roleId)  — the RBAC row
 *   2. quikit.UserAppAccess.role = "Member"                       — Admin-Portal mirror
 * Orgs with no seeded Member role are SKIPPED + reported (the role is seeded on
 * the next authenticated app visit; re-run afterwards). Idempotent.
 *
 * Run (from apps/quikasset, with DATABASE_URL in env):
 *   npx tsx scripts/backfill-member-role.ts               # dry-run, all orgs
 *   npx tsx scripts/backfill-member-role.ts --org=<id>    # dry-run, one org
 *   npx tsx scripts/backfill-member-role.ts --apply       # perform (all orgs)
 */
import { PrismaClient } from "@prisma/client";
import { selectNoRoleUsers } from "./memberBackfillPlan";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const ORG_FILTER = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) ?? null;

async function main() {
  const app = await db.app.findUnique({ where: { slug: "quikasset" }, select: { id: true } });
  if (!app) {
    console.error('QuikAsset app not registered (slug "quikasset"). Nothing to do.');
    return;
  }
  const appId = app.id;

  const accessRows = await db.userAppAccess.findMany({
    where: { appId },
    select: { userId: true, orgId: true },
  });
  const byOrg = new Map<string, string[]>();
  for (const r of accessRows) {
    const list = byOrg.get(r.orgId) ?? [];
    list.push(r.userId);
    byOrg.set(r.orgId, list);
  }

  let orgIds = [...byOrg.keys()];
  if (ORG_FILTER) {
    orgIds = orgIds.filter((id) => id === ORG_FILTER);
    if (orgIds.length === 0) {
      console.error(`--org=${ORG_FILTER} has no QuikAsset access rows. Nothing to do.`);
      return;
    }
  }

  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — backfill Member role for no-role QuikAsset users` +
      `${ORG_FILTER ? ` (org ${ORG_FILTER})` : ` across ${orgIds.length} org(s)`}\n`,
  );

  let totalNoRole = 0;
  let totalDone = 0;
  let skippedOrgs = 0;

  for (const orgId of orgIds) {
    const accessIds = [...new Set(byOrg.get(orgId)!)];
    const roled = await db.astUserAppRole.findMany({
      where: { orgId, userId: { in: accessIds }, role: { appId } },
      select: { userId: true },
    });
    const noRole = selectNoRoleUsers(accessIds, roled.map((r) => r.userId));
    if (noRole.length === 0) continue;

    const org = await db.org.findUnique({ where: { id: orgId }, select: { name: true } });
    const member = await db.astAppRole.findFirst({
      where: { orgId, appId, name: "Member" },
      select: { id: true },
    });
    if (!member) {
      skippedOrgs++;
      console.log(`  ${orgId} (${org?.name ?? "?"}): ${noRole.length} no-role — SKIPPED (no Member role seeded)`);
      continue;
    }

    totalNoRole += noRole.length;
    console.log(`  ${orgId} (${org?.name ?? "?"}): ${noRole.length} no-role → Member (${member.id})`);

    if (APPLY) {
      const created = await db.astUserAppRole.createMany({
        data: noRole.map((userId) => ({ userId, orgId, roleId: member.id })),
        skipDuplicates: true,
      });
      await db.userAppAccess.updateMany({
        where: { orgId, appId, userId: { in: noRole } },
        data: { role: "Member" },
      });
      totalDone += created.count;
    }
  }

  console.log(
    `\nSUMMARY: ${APPLY ? `assigned Member to ${totalDone} user(s)` : `would assign Member to ${totalNoRole} user(s)`}` +
      (skippedOrgs ? ` — ${skippedOrgs} org(s) skipped (no Member role seeded)` : ""),
  );
  console.log(APPLY ? "APPLIED." : "Dry-run only. Re-run with --apply to assign.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
