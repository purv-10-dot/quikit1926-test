/**
 * One-off: reset a finalized/reviewed OPSP back to a clean "finalized"
 * (unsubmitted) state for re-testing the Review flow.
 *
 *   1. Flip OPSPData.status: "reviewed" / "draft" → "finalized"
 *   2. Delete every OPSPReviewEntry for that OPSP (all horizons, all rows,
 *      all periods) so Achieved / Comments / per-period Targets are wiped.
 *
 *   Usage:  npx tsx --env-file=.env scripts/reset-opsp-review.ts
 *
 * Adjust EMAIL / YEAR / QUARTER below.
 */
import { PrismaClient } from "@prisma/client";

const EMAIL = "ashwin@moreyeahs.com";
const YEAR = 2026;
const QUARTER = "Q1";

const db = new PrismaClient();

async function main() {
  const user = await db.user.findFirst({
    where: { email: EMAIL },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!user) throw new Error(`User not found for email: ${EMAIL}`);
  console.log(`User: ${user.firstName} ${user.lastName} <${user.email}>`);

  const matches = await db.oPSPData.findMany({
    where: { userId: user.id, year: YEAR, quarter: QUARTER },
    select: { id: true, orgId: true, status: true },
  });

  if (matches.length === 0) {
    console.log(`No OPSP found for ${EMAIL} year=${YEAR} quarter=${QUARTER}.`);
    return;
  }

  for (const m of matches) {
    console.log(`\nOPSP id=${m.id} (orgId=${m.orgId}) currentStatus="${m.status}"`);

    // 1. Wipe every review entry for this OPSP (all horizons).
    const deleted = await db.oPSPReviewEntry.deleteMany({
      where: { orgId: m.orgId, opspId: m.id },
    });
    console.log(`  Deleted ${deleted.count} OPSPReviewEntry row(s).`);

    // 2. Flip status to "finalized" (so the user doesn't have to re-finalize
    //    from the Create OPSP page — they land on the Review page ready to
    //    re-enter Achieved values).
    if (m.status === "finalized") {
      console.log(`  Status already "finalized", skipping update.`);
    } else {
      await db.oPSPData.update({
        where: { id: m.id },
        data: { status: "finalized", updatedBy: user.id },
      });
      console.log(`  Status: "${m.status}" → "finalized"`);
    }
  }

  console.log("\nDone. Hard-refresh /opsp/review to see the clean state.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
