/**
 * Repair master courses that lost their authoring tenant.
 *
 * THE DEFECT (fixed in code 2026-07-23). `selectedTenants` is the only thing
 * that makes a master course visible to a tenant — `findAllForTenant`,
 * `courses-service.findOne` and `assignCourse` all gate on
 * `selectedTenants: { some: { orgId } }`. `POST /api/master-courses/:id/publish`
 * accepted a body with no `selectedTenants` and defaulted it to `[]`, which
 * wiped the whole list while answering "published successfully". The tenant that
 * wrote the course could then no longer see it, open it, or assign it — with no
 * error anywhere to explain the disappearance.
 *
 * The code fix (`setSelectedTenants` always re-adds `submittedByTenantId`, and
 * the publish route now requires the field) stops it happening again. It does
 * NOT heal rows already damaged — this script does that.
 *
 * WHAT IT TOUCHES. Exactly the rows where all three hold:
 *   • `submittedByTenantId` is set  — we know who authored it
 *   • the course has ZERO selectedTenants
 *   • the authoring tenant still exists
 * and it only ever ADDS the authoring tenant back. It never removes a tenant,
 * never touches a course with a non-empty list, and never touches a
 * super-admin-authored course (`submittedByTenantId: null`), because for those
 * "distributed to nobody" is a legitimate state and there is no author to infer.
 *
 * On the production database at the time of writing this matched 19 courses
 * across two tenants, spanning 2026-03 to 2026-05.
 *
 * USAGE — dry run first; it prints exactly what it would do and changes nothing:
 *   npx tsx --env-file=.env.local scripts/repair-orphaned-course-distribution.ts
 *   npx tsx --env-file=.env.local scripts/repair-orphaned-course-distribution.ts --apply
 */
import { prisma } from '../lib/prisma';

const APPLY = process.argv.includes('--apply');

async function main() {
  const orphans = await prisma.lmsMasterCourse.findMany({
    where: {
      status: 'Published',
      parentCourseId: null,
      submittedByTenantId: { not: null },
      selectedTenants: { none: {} },
    },
    select: { id: true, title: true, submittedByTenantId: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
  });

  if (orphans.length === 0) {
    console.log('Nothing to repair — every published course with an author is distributed to it.');
    return;
  }

  console.log(
    `${orphans.length} published course(s) have an authoring tenant but no distribution:\n`,
  );

  // A tenant that no longer exists cannot be restored — report it rather than
  // writing a dangling join row.
  const authorIds = [...new Set(orphans.map((c) => c.submittedByTenantId as string))];
  const liveTenants = await prisma.lmsTenant.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true },
  });
  const tenantName = new Map(liveTenants.map((t) => [t.id, t.name]));

  const repairable = orphans.filter((c) => tenantName.has(c.submittedByTenantId as string));
  const unrepairable = orphans.filter((c) => !tenantName.has(c.submittedByTenantId as string));

  for (const c of repairable) {
    console.log(
      `  ${APPLY ? 'RESTORE' : 'would restore'}  "${c.title}" → ${tenantName.get(
        c.submittedByTenantId as string,
      )} (${c.submittedByTenantId})`,
    );
  }
  for (const c of unrepairable) {
    console.log(`  SKIP     "${c.title}" — authoring tenant ${c.submittedByTenantId} no longer exists`);
  }

  if (!APPLY) {
    console.log(`\nDry run. Re-run with --apply to restore ${repairable.length} course(s).`);
    return;
  }

  let restored = 0;
  for (const c of repairable) {
    // `createMany` + `skipDuplicates` rather than a blind create: another
    // process may have re-distributed the course between the read and here.
    const res = await prisma.lmsMasterCourseSelectedTenant.createMany({
      data: [{ masterCourseId: c.id, orgId: c.submittedByTenantId as string }],
      skipDuplicates: true,
    });
    restored += res.count;
  }
  console.log(`\nRestored ${restored} course(s) to their authoring tenant.`);
}

main()
  .catch((err) => {
    console.error('Repair failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
