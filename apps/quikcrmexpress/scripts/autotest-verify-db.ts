/**
 * [P0.1] Automation-build DB isolation check (AUTOMATION-BUILD-PLAN Constraint 1.1).
 *
 * Confirms the dev env resolves to the SEEDED test DB `first_db_crm_autotest`
 * and NOT the protected `first_db_crm`. The engine must never run against
 * `first_db_crm` during the Phase 0-2 build; this script is the guard a human
 * (or a later task) runs to prove the connection target before any engine work.
 *
 * Env is loaded exactly as the app / worker load it (dotenv: .env.local then .env),
 * and the query goes through the same Prisma client the engine uses
 * (`@/lib/db/prisma` -> `@quikit/database`), so a green result here means the
 * ENGINE's own connection points at the test DB.
 *
 * Run: npx tsx scripts/autotest-verify-db.ts
 * Exit 0 = target is first_db_crm_autotest. Exit 1 = wrong target / not isolated.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { prisma } from "@/lib/db/prisma";

const EXPECTED = "first_db_crm_autotest";
const FORBIDDEN = "first_db_crm";

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ db: string }[]>(
    "SELECT current_database() AS db",
  );
  const db = rows[0]?.db ?? "(unknown)";
  console.log(`Connected database (via app Prisma client): ${db}`);

  if (db === FORBIDDEN) {
    console.error(`FAIL: connected to the protected DB ${FORBIDDEN}.`);
    process.exit(1);
  }
  if (db !== EXPECTED) {
    console.error(
      `FAIL: expected ${EXPECTED} but connected to ${db}. ` +
        `Refusing to run the engine against a non-test DB.`,
    );
    process.exit(1);
  }

  const fixtures = await prisma.qceLead.count({ where: { source: "autotest-fixture" } });
  const total = await prisma.qceLead.count();
  console.log(`Lead rows total: ${total}; autotest-fixture rows: ${fixtures}`);
  console.log(`PASS: dev env is isolated on ${EXPECTED}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
