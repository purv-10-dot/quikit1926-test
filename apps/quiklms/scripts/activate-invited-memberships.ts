/**
 * Activate the `OrgMember` rows QuikLMS left at `invited`.
 *
 * WHY THEY EXIST. Until the convention change, QuikLMS created memberships as
 * `invited` and withheld access until acceptance. Every other app on the platform
 * creates them `active` (zero writes of `"invited"` across quikscale, quikasset,
 * quikinfra, quiktrack and quiksupport), so `identity-service` now does too. New
 * invitations are unaffected by this script — it exists only for the rows written
 * under the old rule.
 *
 * WHY THEY CANNOT BE LEFT ALONE. `packages/auth/get-tenant-id.ts` resolves a user's
 * org only when the membership is `active`. An `invited` row therefore yields no
 * org, no session, and a bounce to the launcher — and the emailed accept link that
 * would have fixed that expires after 7 days. Several of these are already past it,
 * so those people cannot get in by any route.
 *
 * SCOPE. Only rows whose `inviteAppIds` include QuikLMS, so this cannot activate a
 * membership another app is deliberately holding. `acceptedAt` is left NULL: nobody
 * accepted these, and back-dating an acceptance would be inventing an audit record.
 * The single-use token is cleared, because an active membership with a live token is
 * exactly the replay window `apps/auth` refuses.
 *
 *   npx tsx scripts/activate-invited-memberships.ts --dry
 *   npx tsx scripts/activate-invited-memberships.ts
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

const TTL_DAYS = 7;

async function main() {
  const { orgDb } = await import('@/lib/org-db');
  const dry = process.argv.includes('--dry');

  const app = await orgDb.app.findFirst({ where: { slug: 'quiklms' }, select: { id: true } });
  if (!app) {
    console.error('No App row with slug "quiklms" — nothing to scope to. Aborting.');
    process.exitCode = 1;
    return;
  }

  const rows = await orgDb.orgMember.findMany({
    where: { status: 'invited', inviteAppIds: { has: app.id } },
    select: {
      id: true,
      orgId: true,
      invitedAt: true,
      invitationToken: true,
      user: { select: { email: true } },
      org: { select: { name: true } },
    },
    orderBy: { invitedAt: 'asc' },
  });

  const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000;
  const expired = rows.filter((r) => r.invitedAt && r.invitedAt.getTime() < cutoff);

  console.log(`invited memberships scoped to QuikLMS : ${rows.length}`);
  console.log(`  of which past the ${TTL_DAYS}-day token TTL      : ${expired.length}`);
  console.log(dry ? '\n(dry run — nothing written)\n' : '');

  for (const r of rows) {
    const age = r.invitedAt ? Math.floor((Date.now() - r.invitedAt.getTime()) / 86_400_000) : null;
    const label = `${r.user.email} @ ${r.org.name}${age === null ? '' : ` (invited ${age}d ago)`}`;
    if (dry) {
      console.log(`  would activate  ${label}`);
      continue;
    }
    await orgDb.orgMember.update({
      where: { id: r.id },
      // `acceptedAt` deliberately untouched — see the note above.
      data: { status: 'active', invitationToken: null },
    });
    console.log(`  activated       ${label}`);
  }

  const remaining = await orgDb.orgMember.count({
    where: { status: 'invited', inviteAppIds: { has: app.id } },
  });
  console.log(`\ninvited memberships remaining: ${remaining}`);

  await orgDb.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
