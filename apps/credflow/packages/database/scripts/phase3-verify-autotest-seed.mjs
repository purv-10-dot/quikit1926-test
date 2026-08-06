/**
 * Phase 3 shared-foundation (Task S0) — autotest DB + seed verification.
 *
 * Confirms the dev env resolves to `first_db_crm_autotest` and that the seed
 * carries the rows the Phase 3 track acceptances reference. READ-ONLY: this
 * script makes no writes, so it is safe to run against any target.
 *
 * Usage (from packages/database):
 *   node scripts/phase3-verify-autotest-seed.mjs
 *
 * It reads DATABASE_URL straight from the app's .env.local (no secrets on the
 * command line) so it verifies the SAME connection the app/engine boot with.
 * Set TARGET_DB=<name> to point the read at a different DB on the same server
 * (used only to confirm existence of the autotest DB from the real one).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../../.env.local");
const env = readFileSync(envPath, "utf8");
const baseUrl = (env.match(/^DATABASE_URL="?([^"\n]+)"?/m) || [])[1];
if (!baseUrl) {
  console.error("Could not read DATABASE_URL from .env.local");
  process.exit(2);
}
const targetDb = process.env.TARGET_DB;
const url = targetDb ? baseUrl.replace(/\/[^/?]+(\?|$)/, `/${targetDb}$1`) : baseUrl;

const EXPECTED_DB = "first_db_crm_autotest";
const PROD_TENANT = "cmpzc0bn70000a1xp642kgwmf";

const p = new PrismaClient({ datasources: { db: { url } } });
const j = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? Number(x) : x));
const checks = [];
const record = (label, pass, detail) => {
  checks.push({ label, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${label} — ${detail}`);
};

try {
  const dbName = (await p.$queryRawUnsafe(`SELECT current_database() d`))[0].d;
  record("dev env resolves to autotest by name", dbName === EXPECTED_DB, `current_database()=${dbName}`);

  const owners = await p.$queryRawUnsafe(
    `SELECT count(DISTINCT l."ownerId")::int n
     FROM app_quikcrm."CrmLead" l JOIN auth."User" u ON u.id = l."ownerId"
     WHERE l."tenantId" = $1 AND l."ownerId" IS NOT NULL`, PROD_TENANT);
  record("≥2 assignable users under prod tenant", owners[0].n >= 2, `${owners[0].n} distinct owner-users`);

  const emailLeads = await p.$queryRawUnsafe(
    `SELECT count(*)::int n FROM app_quikcrm."CrmLead"
     WHERE "tenantId" = $1 AND email IS NOT NULL AND email <> ''`, PROD_TENANT);
  record("≥1 lead with a valid email (prod tenant)", emailLeads[0].n >= 1, `${emailLeads[0].n} leads with email`);

  const st = (await p.$queryRawUnsafe(`SELECT count(*)::int n FROM app_quikcrm."CrmLeadStatus"`))[0].n;
  const sub = (await p.$queryRawUnsafe(`SELECT count(*)::int n FROM app_quikcrm."CrmLeadSubStatus"`))[0].n;
  const stages = (await p.$queryRawUnsafe(
    `SELECT count(DISTINCT stage)::int n FROM app_quikcrm."CrmLead" WHERE "tenantId" = $1`, PROD_TENANT))[0].n;
  record("pipeline stages/statuses/substatuses present", st > 0 && sub > 0 && stages > 0,
    `${stages} stages, ${st} statuses, ${sub} substatuses`);

  // NOTE: the Do-Not-Email / unsubscribed flag column is Task B2's additive
  // schema (B2: "if absent, additive nullable flag"). It does not exist yet, so
  // S0 cannot flag a lead. B2 adds the column and flags the earmarked lead below.
  console.log("\nEARMARK for Track B (B2) suppression test — lead to flag Do-Not-Email once B2 adds the column:");
  const earmark = await p.$queryRawUnsafe(
    `SELECT id, email FROM app_quikcrm."CrmLead"
     WHERE "tenantId" = $1 AND email IS NOT NULL AND email <> '' ORDER BY id LIMIT 1`, PROD_TENANT);
  console.log("  ", j(earmark[0]));

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${failed === 0 ? "ALL CHECKS PASS" : failed + " CHECK(S) FAILED"}`);
  process.exit(failed === 0 ? 0 : 1);
} catch (e) {
  console.error("VERIFY ERROR:", e.message);
  process.exit(1);
} finally {
  await p.$disconnect();
}
