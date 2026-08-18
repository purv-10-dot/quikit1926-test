/**
 * Seed the QuikLMS `AppRole` catalogue (+ the grants behind it) for every org
 * that already has QuikLMS access but an empty catalogue.
 *
 * WHY THIS IS NEEDED. An org's catalogue is written by exactly two paths, and both
 * can miss:
 *
 *   1. `POST /api/internal/provision-roles`, fired by the launcher the moment
 *      QuikLMS is granted to an org (apps/quikit/lib/provisionAppRoles.ts). That
 *      call is fire-and-forget: it resolves `false` on any non-2xx or network
 *      error, never retries, and the grant succeeds regardless. If QuikLMS was
 *      unreachable at that instant — deploy in flight, wrong `QUIKLMS_URL`, stale
 *      `App.baseUrl`, mismatched `INTERNAL_SECRET` — the catalogue is silently
 *      lost, permanently. Orgs granted access BEFORE that endpoint existed
 *      (2026-07-27) never had it called at all.
 *   2. The lazy top-up in `GET /api/me`, which only fires once a member of the org
 *      actually signs in to QuikLMS. An org that was provisioned but never opened
 *      never reaches it.
 *
 * The visible symptom is the Admin Portal's "Roles per Application" dropdown
 * showing "No roles available" for QuikLMS while every other app lists its roles:
 * `GET apps/admin/app/api/roles?appSlug=quiklms` reads `app_quiklms."AppRole"`
 * directly and has no static fallback by design.
 *
 * `ensureLmsRbacSeeded` is reused rather than re-implemented — it seeds the seven
 * `AppRole` rows and the `RolePermission` grants in one call, exactly as the
 * provisioning endpoint does. Idempotent: upserts on `@@unique([orgId, appId, name])`,
 * so re-running is a no-op and an interrupted run can simply be repeated.
 *
 * Roles only — this deliberately assigns nothing to any user. `UserAppRole` rows are
 * a separate concern with its own backfill (`backfill-user-app-roles.ts`); handing
 * out roles is not something a catalogue repair should do behind an admin's back.
 *
 *   npx tsx scripts/backfill-app-role-catalogue.ts --dry     # report only
 *   npx tsx scripts/backfill-app-role-catalogue.ts
 *   npx tsx scripts/backfill-app-role-catalogue.ts --org <orgId>
 *
 * Against a deployed database, set DATABASE_URL in the environment — an explicit
 * env var wins over `.env.local`, which is only read to fill what is unset:
 *
 *   DATABASE_URL="postgresql://…" npx tsx scripts/backfill-app-role-catalogue.ts --dry
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    const val = rawVal.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(resolve(appRoot, '.env.local'));

const QUIKLMS_SLUG = 'quiklms';

async function main() {
  const { db } = await import('@/lib/db');
  const { ensureLmsRbacSeeded } = await import('@/lib/api/seed-lms-permissions');
  const { LMS_APP_ROLES } = await import('@/lib/api/seed-lms-app-roles');

  const dry = process.argv.includes('--dry');
  const orgFlag = process.argv.indexOf('--org');
  const onlyOrg = orgFlag !== -1 ? process.argv[orgFlag + 1] : undefined;

  const app = await db.app.findFirst({ where: { slug: QUIKLMS_SLUG }, select: { id: true, baseUrl: true } });
  if (!app) {
    // Without the central App row there is no `appId` to hang the catalogue on;
    // `seedLmsAppRoles` would return an empty map for every org and the run would
    // report success while writing nothing.
    console.error(`no central App row for slug "${QUIKLMS_SLUG}" — nothing to seed against`);
    process.exitCode = 1;
    return;
  }
  console.log(`db          : ${(process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//***:***@')}`);
  console.log(`quiklms app : ${app.id}  baseUrl=${app.baseUrl}`);

  // Every org the launcher has granted QuikLMS to — `enabled` is ignored on
  // purpose. A catalogue for a currently-disabled org costs seven rows and means
  // re-enabling it later doesn't depend on the provisioning call landing that time.
  const access = await db.orgAppAccess.findMany({
    where: { appId: app.id, ...(onlyOrg ? { orgId: onlyOrg } : {}) },
    select: { orgId: true, enabled: true, org: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const expected = LMS_APP_ROLES.length;
  console.log(`orgs with access : ${access.length} (${access.filter((a) => !a.enabled).length} currently disabled)`);
  console.log(`roles per org    : ${expected}\n`);

  let seeded = 0;
  let alreadyComplete = 0;
  let failed = 0;

  for (const row of access) {
    const have = await db.lmsAppRole.count({ where: { orgId: row.orgId, appId: app.id } });
    if (have >= expected) {
      alreadyComplete += 1;
      continue;
    }
    const label = `${row.orgId}  ${row.org.name}`;
    if (dry) {
      console.log(`  would seed  ${label}  (has ${have}/${expected})`);
      seeded += 1;
      continue;
    }
    try {
      await ensureLmsRbacSeeded(row.orgId);
      const now = await db.lmsAppRole.count({ where: { orgId: row.orgId, appId: app.id } });
      console.log(`  seeded ${String(now).padStart(2)}/${expected}  ${label}`);
      seeded += 1;
    } catch (err) {
      failed += 1;
      console.error(`  FAILED      ${label}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\n${dry ? 'would seed' : 'seeded'}: ${seeded}` +
      `, already complete: ${alreadyComplete}` +
      (failed ? `, failed: ${failed}` : ''),
  );

  const remaining = access.length - alreadyComplete - (dry ? 0 : seeded - failed);
  console.log(`orgs still without a full catalogue: ${dry ? access.length - alreadyComplete : remaining}`);

  if (failed) process.exitCode = 1;
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
