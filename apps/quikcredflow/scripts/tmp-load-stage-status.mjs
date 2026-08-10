/**
 * TEMP — load the Stage -> Status dependency map into pipeline config.
 *
 * Reads scripts/stage-status-map.tsv (Stage<TAB>Status per line), builds
 * stageToStatuses (order-preserving, deduped) + the stage list, and MERGES it
 * into the tenant's leadPipelineConfig. This drives the disposition form's
 * Status dropdown per Contact Stage (getDispositionStatuses).
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/tmp-load-stage-status.mjs           # dry-run (prints, no write)
 *   npx tsx --env-file=.env.local scripts/tmp-load-stage-status.mjs --apply   # writes
 *   TENANT_ID=<id> npx tsx --env-file=.env.local scripts/tmp-load-stage-status.mjs --apply
 *
 * TEMP — delete after use.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const _prismaMod = await import("../lib/db/prisma");
const { prisma } = _prismaMod.default ?? _prismaMod;
const _pc = await import("../lib/services/workspace/pipeline-config");
const { getPipelineConfig, setPipelineConfig } = _pc.default ?? _pc;

const APPLY = process.argv.includes("--apply");
const __dirname = dirname(fileURLToPath(import.meta.url));
const TSV_PATH = join(__dirname, "stage-status-map.tsv");

// ── parse the TSV ─────────────────────────────────────────────────────────────
const raw = readFileSync(TSV_PATH, "utf8");
const lines = raw.split(/\r?\n/).map((l) => l).filter((l) => l.trim() !== "");

const stageToStatuses = {};
const stagesOrder = [];
const statusesSet = new Set();
const bad = [];

for (const line of lines) {
  const tab = line.indexOf("\t");
  if (tab < 0) {
    bad.push(line);
    continue;
  }
  const stage = line.slice(0, tab).trim();
  const status = line.slice(tab + 1).trim();
  if (!stage || !status) {
    bad.push(line);
    continue;
  }
  if (!stageToStatuses[stage]) {
    stageToStatuses[stage] = [];
    stagesOrder.push(stage);
  }
  if (!stageToStatuses[stage].includes(status)) stageToStatuses[stage].push(status);
  statusesSet.add(status);
}

const statuses = [...statusesSet];

console.log(`Parsed ${lines.length} rows.`);
if (bad.length) {
  console.log(`⚠ ${bad.length} line(s) had no TAB separator (skipped):`);
  bad.slice(0, 5).forEach((b) => console.log("   ", JSON.stringify(b)));
}
console.log(`Stages: ${stagesOrder.length}, unique statuses: ${statuses.length}`);
console.log(`Sample — "Demo Completed-demo Syncing" ->`, stageToStatuses["Demo Completed-demo Syncing"]);

// ── resolve the target tenant ─────────────────────────────────────────────────
async function resolveTenant() {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;
  const sets = await prisma.qcfFormSet.findMany({
    where: { surface: "call_disposition", isDefault: true },
    select: { orgId: true, name: true },
  });
  const tenants = [...new Set(sets.map((s) => s.orgId))];
  if (tenants.length === 1) return tenants[0];
  console.log("Multiple / zero default call_disposition tenants found:", tenants);
  console.log("Re-run with TENANT_ID=<id> to pick one.");
  return null;
}

const orgId = await resolveTenant();
if (!orgId) {
  await prisma.$disconnect();
  process.exit(1);
}
console.log(`\nTarget tenant: ${orgId}`);

// ── merge into pipeline config ────────────────────────────────────────────────
const cfg = await getPipelineConfig(orgId);
const mergedStages = [...new Set([...(cfg.stages ?? []), ...stagesOrder])];
const nextDependentRules = { ...cfg.dependentRules, stageToStatuses };

console.log(`\nExisting stages in config: ${cfg.stages?.length ?? 0} -> after merge: ${mergedStages.length}`);
console.log(`Existing stageToStatuses keys: ${Object.keys(cfg.dependentRules?.stageToStatuses ?? {}).length} -> new: ${Object.keys(stageToStatuses).length}`);

if (!APPLY) {
  console.log("\n[DRY-RUN] Nothing written. Re-run with --apply to save.");
  await prisma.$disconnect();
  process.exit(0);
}

await setPipelineConfig(orgId, {
  stages: mergedStages,
  dependentRules: nextDependentRules,
});
console.log("\n✔ Written to leadPipelineConfig.");

// ── verify readback ───────────────────────────────────────────────────────────
const _ds = await import("../lib/services/forms/disposition-statuses.service");
const { getDispositionStatuses } = _ds.default ?? _ds;
for (const s of ["Demo Completed-demo Syncing", "Negotiation", "Renewal Due"]) {
  const got = await getDispositionStatuses(orgId, s);
  console.log(`  getDispositionStatuses("${s}") -> ${got.length} statuses`);
}

await prisma.$disconnect();
console.log("\nDone.");
