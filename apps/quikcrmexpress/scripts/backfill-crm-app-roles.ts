/**
 * Backfill CrmExpress AppRole bindings for every existing org member.
 *
 * Why: switching `CRMEXPRESS_RBAC_MODE=on` makes `app_quikcrmexpress`'s RBAC
 * tables the sole source of permissions. Any member without a `UserAppRole` row
 * would resolve to an empty matrix. `getEffectiveMatrix` fails safe and serves
 * the legacy union for such users rather than locking them out, but that also
 * means they silently keep the old additive behaviour — so run this first and
 * get everyone bound.
 *
 * What it does, per org that has CrmExpress enabled (`OrgAppAccess.enabled`):
 *   1. seeds the org's five default AppRoles (idempotent)
 *   2. for each active member, resolves membership role → CRM role → AppRole
 *      name and binds them via `syncUserCrmAppRole`, which also mirrors the
 *      role name onto the central `quikit.UserAppAccess.role`
 *
 * Idempotent — re-running changes nothing once everyone is bound.
 *
 * Usage, from apps/quikcrmexpress:
 *   npm run backfill:app-roles -- --dry-run     # report only, no writes
 *   npm run backfill:app-roles                  # apply
 *   npm run backfill:app-roles -- --org <orgId> # single org
 *
 * Requires DATABASE_URL (reads .env.local, then .env) — same as the other
 * scripts in this directory.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

interface Args {
  dryRun: boolean;
  orgId: string | null;
}

function parseArgs(argv: string[]): Args {
  const orgFlag = argv.indexOf("--org");
  return {
    dryRun: argv.includes("--dry-run"),
    orgId: orgFlag >= 0 ? (argv[orgFlag + 1] ?? null) : null,
  };
}

async function main(): Promise<void> {
  // Imported dynamically so dotenv has populated DATABASE_URL before the shared
  // Prisma client is constructed at module load.
  const { db } = await import("@/lib/db");
  const { crmRoleForMembershipRole } = await import("@/lib/auth/role-grants");
  const { appRoleNameForMembershipRole } = await import("@/lib/api/permissions-registry");
  const { getQuikcrmexpressAppId, QUIKCRMEXPRESS_APP_SLUG } = await import(
    "@/lib/api/quikcrmexpress-app"
  );
  const { seedAllDefaultCrmRoles } = await import("@/lib/api/seed-crm-app-roles");
  const { syncUserCrmAppRole, isCrmRbacClientReady } = await import("@/lib/api/crm-rbac");

  const { dryRun, orgId } = parseArgs(process.argv.slice(2));

  try {
    if (!isCrmRbacClientReady()) {
      throw new Error(
        "CrmExpress RBAC delegates missing — run `npm run db:generate` (stop the dev server first on Windows).",
      );
    }

    const appId = await getQuikcrmexpressAppId();
    if (!appId) {
      throw new Error(
        `No quikit.App row for slug "${QUIKCRMEXPRESS_APP_SLUG}" — register the app before backfilling.`,
      );
    }

    const orgAccess = await db.orgAppAccess.findMany({
      where: { appId, enabled: true, ...(orgId ? { orgId } : {}) },
      select: { orgId: true },
    });

    if (orgAccess.length === 0) {
      console.log("No orgs have CrmExpress enabled — nothing to do.");
      return;
    }

    console.log(`${dryRun ? "[dry-run] " : ""}Backfilling ${orgAccess.length} org(s)…`);

    let bound = 0;
    let failed = 0;

    for (const { orgId: org } of orgAccess) {
      const members = await db.orgMember.findMany({
        where: { orgId: org, status: "active" },
        select: { userId: true, role: true },
      });

      console.log(`\norg ${org} — ${members.length} active member(s)`);

      if (!dryRun) await seedAllDefaultCrmRoles(org);

      for (const member of members) {
        const crmRole = crmRoleForMembershipRole(member.role);
        const appRoleName = appRoleNameForMembershipRole(crmRole);
        console.log(`  ${member.userId}  ${member.role} → ${crmRole} → ${appRoleName}`);

        if (dryRun) continue;

        try {
          await syncUserCrmAppRole(member.userId, org, crmRole);
          bound += 1;
        } catch (error: unknown) {
          failed += 1;
          const message = error instanceof Error ? error.message : "unknown error";
          console.error(`    FAILED: ${message}`);
        }
      }
    }

    console.log(
      dryRun
        ? "\n[dry-run] No changes written. Re-run without --dry-run to apply."
        : `\nDone — ${bound} member(s) bound, ${failed} failure(s).`,
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Backfill failed: ${message}`);
  process.exitCode = 1;
});
