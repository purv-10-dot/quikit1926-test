/**
 * Seed RBAC v2 grants for every LMS tenant (or one, with `--org <id>`).
 *
 * Must be run before the shadow probe in `requireAuth` is meaningful: with zero
 * `RolePermission` rows the probe reports "would DENY" for every request, which is
 * noise rather than signal. After seeding, a `[rbac-v2]` line is a real blocker.
 *
 *   npx tsx scripts/seed-permissions.ts
 *   npx tsx scripts/seed-permissions.ts --org cms380lpj000ragibcqap6zvt
 *   npx tsx scripts/seed-permissions.ts --dry
 *
 * Writes nothing outside `app_quiklms.AppRole` / `app_quiklms.RolePermission`.
 *
 * `.env.local` is read here rather than assumed: this runs outside `next dev`, so
 * nothing else populates DATABASE_URL, and `@quikit/database` throws on an
 * undefined datasource at import time. The env therefore has to be in place BEFORE
 * the client module is loaded, which is why the imports below are dynamic — a
 * static import would be hoisted above the loader and fail.
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
  const { seedLmsPermissions } = await import('@/lib/api/seed-lms-permissions');
  const { PERMISSION_MATRIX, MATRIX_EXCEPTIONS } = await import('@/lib/auth/permission-matrix.generated');

  const args = process.argv.slice(2);
  const onlyOrg = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined;
  const dry = args.includes('--dry');

  let intended = 0;
  for (const actions of Object.values(PERMISSION_MATRIX)) {
    for (const roles of Object.values(actions)) {
      if (roles) intended += roles.length;
    }
  }

  console.log('matrix resources        :', Object.keys(PERMISSION_MATRIX).length);
  console.log('grants per org (planned):', intended);
  console.log('held-back exceptions    :', MATRIX_EXCEPTIONS.length);

  const tenants = onlyOrg
    ? [{ id: onlyOrg, name: '(explicit)' }]
    : await db.lmsTenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });

  console.log(`\ntenants: ${tenants.length}${dry ? '  (dry run — nothing written)' : ''}`);

  for (const t of tenants) {
    if (dry) {
      console.log(`  ${t.name} (${t.id}) — would seed ${intended} grants`);
      continue;
    }
    const r = await seedLmsPermissions(t.id);
    console.log(
      `  ${t.name} (${t.id}) — created ${r.created} of ${r.intended} intended` +
        (r.unknownRoles.length ? `, unknown roles: ${r.unknownRoles.join(', ')}` : ''),
    );
  }

  if (MATRIX_EXCEPTIONS.length) {
    console.log('\nNOT seeded — routes under one resource:action disagree, needs a finer resource:');
    for (const e of MATRIX_EXCEPTIONS) {
      console.log(`  ${e.resource}:${e.action}`);
      for (const p of e.policies) console.log(`      ${p.roles.join('+') || '(none)'}  ${p.route}`);
    }
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
