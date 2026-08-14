/**
 * One-time backfill for the multi-role removal (secondaryRole → single role).
 *
 * `LmsUser.secondaryRole` is no longer read anywhere in this app (Rule 2: the
 * column itself lives in the shared schema and stays — dropping it is a
 * request to the integration owner, not something this script or app can do).
 * Before the code that stopped reading it ships, existing rows need a decision
 * so nobody silently loses a capability they were deliberately given:
 *
 *   - `secondaryRole = 'SUB_ADMIN'` is the ONLY value this app's own UI ever
 *     wrote (via the now-removed `promoteToSubAdmin`). For these rows the
 *     product's own answer to "what does this mean under single-role" is
 *     unambiguous: they become a PRIMARY SUB_ADMIN. `role = 'SUB_ADMIN',
 *     secondaryRole = NULL` — indistinguishable afterwards from a sub-admin
 *     created directly via the `sub-admins` page.
 *   - Any OTHER non-null `secondaryRole` value is only reachable through the
 *     old `POST /api/auth/register` body field (removed in this pass), never
 *     through a UI button. These rows are NOT auto-promoted — inferring a
 *     primary-role change nobody asked for is exactly the kind of surprising,
 *     hard-to-reverse action this app's rule book warns against. They are
 *     printed for manual review, then have `secondaryRole` nulled (inert
 *     either way once the code stops reading it).
 *
 * Run this BEFORE or ATOMICALLY WITH the deploy that removes secondaryRole
 * reads — never after, or affected users lose access (answer-key visibility,
 * certificate-template approval, master-course edit rights) with no error
 * pointing at the cause.
 *
 *   npx tsx scripts/backfill-secondary-role.ts --dry
 *   npx tsx scripts/backfill-secondary-role.ts
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

  const dry = process.argv.includes('--dry');

  const rows = await db.lmsUser.findMany({
    where: { secondaryRole: { not: null } },
    select: { id: true, email: true, role: true, secondaryRole: true, orgId: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`rows with a non-null secondaryRole: ${rows.length}`);
  if (rows.length === 0) {
    console.log('nothing to do.');
    await db.$disconnect();
    return;
  }

  const autoPromote = rows.filter((r) => r.secondaryRole === 'SUB_ADMIN');
  const manualReview = rows.filter((r) => r.secondaryRole !== 'SUB_ADMIN');

  console.log(`  auto-promote to primary SUB_ADMIN : ${autoPromote.length}`);
  console.log(`  manual review (other values)      : ${manualReview.length}`);

  if (manualReview.length > 0) {
    console.log('\nManual-review rows — NOT auto-promoted, secondaryRole will be nulled:');
    for (const r of manualReview) {
      console.log(`  ${r.email.padEnd(40)} role=${r.role.padEnd(13)} secondaryRole=${r.secondaryRole} org=${r.orgId ?? '(none)'}`);
    }
  }

  if (dry) {
    console.log('\n--dry: no writes performed.');
    for (const r of autoPromote) {
      console.log(`  would promote ${r.email} → role=SUB_ADMIN, secondaryRole=null`);
    }
    await db.$disconnect();
    return;
  }

  let promoted = 0;
  let cleared = 0;

  for (const r of autoPromote) {
    await db.lmsUser.update({
      where: { id: r.id },
      data: { role: 'SUB_ADMIN', secondaryRole: null },
    });
    promoted += 1;
  }

  for (const r of manualReview) {
    await db.lmsUser.update({
      where: { id: r.id },
      data: { secondaryRole: null },
    });
    cleared += 1;
  }

  console.log(`\npromoted to primary SUB_ADMIN: ${promoted}`);
  console.log(`cleared (manual review, unchanged role): ${cleared}`);

  const remaining = await db.lmsUser.count({ where: { secondaryRole: { not: null } } });
  console.log(`rows with a non-null secondaryRole now: ${remaining}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
