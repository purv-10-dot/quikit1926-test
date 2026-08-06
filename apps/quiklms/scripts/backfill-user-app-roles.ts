/**
 * Give every existing LMS user a `UserAppRole` assignment matching their
 * `LmsUser.role`.
 *
 * WHY THIS IS MANDATORY, NOT HOUSEKEEPING. Authorisation now comes from grants and
 * fails closed: `requireRoles` checks the actor's grant set, and that set is built
 * from their `UserAppRole` rows. A user with no assignment has an empty set and is
 * refused everything — which is the correct behaviour for the model and a total
 * lock-out for anyone the old role fallback used to cover. Before the cutover only
 * 5 of the LMS users had an assignment.
 *
 * `ensureUserOnLmsRole` is reused rather than re-implemented: it seeds the org's
 * AppRole catalogue if needed, replaces any stale assignment, and mirrors the role
 * name onto central `quikit.UserAppAccess` so the Admin Portal agrees.
 *
 *   npx tsx scripts/backfill-user-app-roles.ts
 *   npx tsx scripts/backfill-user-app-roles.ts --dry
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

async function main() {
  const { db } = await import('@/lib/db');
  const { ensureUserOnLmsRole } = await import('@/lib/api/seed-lms-app-roles');

  const dry = process.argv.includes('--dry');

  const users = await db.lmsUser.findMany({
    select: { id: true, email: true, role: true, orgId: true },
    orderBy: { createdAt: 'asc' },
  });

  const existing = await db.lmsUserAppRole.findMany({ select: { userId: true, orgId: true } });
  const has = new Set(existing.map((a) => `${a.userId}:${a.orgId}`));

  console.log(`lms users            : ${users.length}`);
  console.log(`existing assignments : ${existing.length}`);

  let done = 0;
  let skippedNoOrg = 0;
  let alreadyHad = 0;

  for (const u of users) {
    if (!u.orgId) {
      // No org means no tenant to scope an assignment to. These rows predate
      // orgId-native tenancy; they cannot be granted anything meaningful.
      skippedNoOrg += 1;
      continue;
    }
    if (has.has(`${u.id}:${u.orgId}`)) {
      alreadyHad += 1;
      continue;
    }
    if (dry) {
      console.log(`  would assign ${u.role.padEnd(13)} ${u.email}`);
      done += 1;
      continue;
    }
    try {
      await ensureUserOnLmsRole(u.id, u.orgId, u.role);
      console.log(`  assigned ${u.role.padEnd(13)} ${u.email}`);
      done += 1;
    } catch (err) {
      console.error(`  FAILED   ${u.email}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\n${dry ? 'would assign' : 'assigned'}: ${done}` +
      `, already had: ${alreadyHad}, skipped (no orgId): ${skippedNoOrg}`,
  );

  const after = await db.lmsUserAppRole.count();
  console.log(`assignments now      : ${after}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
