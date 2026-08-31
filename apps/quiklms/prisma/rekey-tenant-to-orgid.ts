/**
 * Make QuikLMS orgId-native (quikscale parity, by VALUE).
 *
 * Two actions against the LMS db (quiklms_lms):
 *   1. PURGE hardcoded demo tenants (fixed-UUID seed fixtures) and every row
 *      scoped to them across all `tenantId` tables.
 *   2. RE-KEY each remaining tenant that has a platform link (`orgId`) so that
 *      its `Tenant.id` AND every `tenantId` value across all tables becomes the
 *      platform `orgId`. After this, the session `orgId` IS the scope key every
 *      one of the ~324 tenant-scoped call sites already filters on — no code
 *      sweep required.
 *
 * Idempotent, transactional, --dry-run capable. FKs are scalar (no DB-level
 * constraints, per the schema), so re-keying is plain UPDATEs in any order.
 *
 *   DATABASE_URL=... npx tsx prisma/rekey-tenant-to-orgid.ts [--dry-run]
 */
import { prisma } from '@/lib/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

// Hardcoded demo tenants (prisma/seed.ts fixtures) — purge entirely.
const PURGE_TENANT_IDS = [
  '11111111-1111-1111-1111-111111111111', // Acme Corp
  '22222222-2222-2222-2222-222222222222', // Bright School
];

async function tenantIdTables(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.columns
     WHERE column_name = 'tenantId' AND table_schema = 'public'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

async function main() {
  const tables = await tenantIdTables();
  console.log(`[rekey] ${tables.length} tenantId-scoped tables.${DRY_RUN ? ' (dry-run)' : ''}`);

  await prisma.$transaction(async (tx) => {
    // 1) PURGE demo tenants + their scoped rows.
    for (const id of PURGE_TENANT_IDS) {
      let purged = 0;
      for (const t of tables) {
        if (DRY_RUN) {
          const [{ n }] = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
            `SELECT COUNT(*)::bigint AS n FROM "${t}" WHERE "tenantId" = $1`,
            id,
          );
          purged += Number(n);
        } else {
          purged += await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, id);
        }
      }
      const tRows = DRY_RUN
        ? Number(
            (
              await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
                `SELECT COUNT(*)::bigint AS n FROM "tenants" WHERE "id" = $1`,
                id,
              )
            )[0].n,
          )
        : await tx.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "id" = $1`, id);
      console.log(`[rekey] ${DRY_RUN ? 'would purge' : 'purged'} demo tenant ${id}: ${purged} scoped row(s), ${tRows} tenant row(s)`);
    }

    // 2) RE-KEY linked tenants: tenantId (and Tenant.id) := orgId.
    const linked = await tx.$queryRawUnsafe<Array<{ id: string; orgId: string; subdomain: string }>>(
      `SELECT "id", "orgId", "subdomain" FROM "tenants" WHERE "orgId" IS NOT NULL AND "orgId" <> "id"`,
    );
    for (const t of linked) {
      let moved = 0;
      for (const tbl of tables) {
        if (DRY_RUN) {
          const [{ n }] = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
            `SELECT COUNT(*)::bigint AS n FROM "${tbl}" WHERE "tenantId" = $1`,
            t.id,
          );
          moved += Number(n);
        } else {
          moved += await tx.$executeRawUnsafe(`UPDATE "${tbl}" SET "tenantId" = $1 WHERE "tenantId" = $2`, t.orgId, t.id);
        }
      }
      if (!DRY_RUN) {
        await tx.$executeRawUnsafe(`UPDATE "tenants" SET "id" = $1 WHERE "id" = $2`, t.orgId, t.id);
      }
      console.log(`[rekey] ${DRY_RUN ? 'would rekey' : 'rekeyed'} tenant ${t.subdomain} ${t.id} → ${t.orgId}: ${moved} scoped row(s)`);
    }

    if (DRY_RUN) {
      throw new Error('__DRY_RUN_ROLLBACK__'); // abort the tx so nothing persists
    }
  }).catch((e) => {
    if (e instanceof Error && e.message === '__DRY_RUN_ROLLBACK__') return;
    throw e;
  });

  console.log('[rekey] done.');
}

main()
  .catch((err) => {
    console.error('[rekey] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
