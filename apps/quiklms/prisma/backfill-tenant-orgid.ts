/**
 * Phase-3 backfill: link each LMS Tenant to its platform quikit Org.
 *
 * Sets `Tenant.orgId` by matching the natural key `Org.slug === Tenant.subdomain`
 * — the same rule `resolveOrgToTenantId` uses. Idempotent and safe to re-run;
 * only touches tenants that don't already have an `orgId`. Reports every tenant
 * it could NOT match so they can be linked by hand (LMS tenants are created
 * independently of the platform Org, so a slug/subdomain divergence is expected
 * for some rows).
 *
 * Run AFTER applying the 20260706000000_add_tenant_orgid migration. Requires BOTH
 * DATABASE_URL (LMS: quikskill_lms) and ORG_DATABASE_URL (platform: quikit_dev).
 *
 *   DATABASE_URL=... ORG_DATABASE_URL=... \
 *     npx tsx prisma/backfill-tenant-orgid.ts [--dry-run]
 */
import { prisma } from '@/lib/prisma';
import { orgDb, ORG_DB_ENABLED } from '@/lib/org-db';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!ORG_DB_ENABLED) {
    throw new Error('ORG_DATABASE_URL is not set — cannot read platform Orgs.');
  }

  const tenants = await prisma.tenant.findMany({
    where: { orgId: null },
    select: { id: true, subdomain: true, name: true },
  });

  console.log(
    `[backfill] ${tenants.length} tenant(s) without an orgId link.${DRY_RUN ? ' (dry-run)' : ''}`,
  );

  let linked = 0;
  const unmatched: Array<{ id: string; subdomain: string; name: string }> = [];
  const conflicts: Array<{ tenantId: string; subdomain: string; orgId: string; reason: string }> = [];

  for (const t of tenants) {
    const org = await orgDb.org.findUnique({
      where: { slug: t.subdomain },
      select: { id: true },
    });
    if (!org) {
      unmatched.push(t);
      continue;
    }

    // `orgId` is @unique — guard against a prior partial/manual link claiming it.
    const taken = await prisma.tenant.findFirst({
      where: { orgId: org.id },
      select: { id: true },
    });
    if (taken && taken.id !== t.id) {
      conflicts.push({
        tenantId: t.id,
        subdomain: t.subdomain,
        orgId: org.id,
        reason: `orgId already linked to tenant ${taken.id}`,
      });
      continue;
    }

    if (!DRY_RUN) {
      await prisma.tenant.update({ where: { id: t.id }, data: { orgId: org.id } });
    }
    linked++;
    console.log(
      `[backfill] ${DRY_RUN ? 'would link' : 'linked'} tenant ${t.id} (${t.subdomain}) → org ${org.id}`,
    );
  }

  console.log(
    `\n[backfill] summary: ${linked} linked, ${unmatched.length} unmatched, ${conflicts.length} conflicts.`,
  );
  if (unmatched.length) {
    console.log('[backfill] UNMATCHED (no platform Org.slug === Tenant.subdomain — link by hand):');
    for (const t of unmatched) {
      console.log(`  - ${t.id}  subdomain="${t.subdomain}"  name="${t.name}"`);
    }
  }
  if (conflicts.length) {
    console.log('[backfill] CONFLICTS (resolve by hand):');
    for (const c of conflicts) {
      console.log(`  - tenant ${c.tenantId} (${c.subdomain}) → org ${c.orgId}: ${c.reason}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await orgDb.$disconnect();
  });
