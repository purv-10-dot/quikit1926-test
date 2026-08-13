/**
 * TEMP — create automation rules from scripts/stage-status-map.tsv.
 * Each row "Stage<TAB>Status" -> rule:  WHEN Status is <Status>  ->  Set Contact Stage to <Stage>
 * Named "<Status> -> <Stage>". Written to the tenant's DRAFT call_disposition version.
 *
 *   npx tsx --env-file=.env.local scripts/tmp-create-rules-from-map.mjs           # dry-run
 *   npx tsx --env-file=.env.local scripts/tmp-create-rules-from-map.mjs --apply   # creates
 *
 * NOTE: first-match-wins — a status under many stages will have many rules; only
 * the first fires at runtime. Curate/reorder in the UI after. TEMP — delete after.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const _prisma = await import("../lib/db/prisma");
const { prisma } = _prisma.default ?? _prisma;
const _fr = await import("../lib/services/forms/form-rule.service");
const { createFormRule, addRuleCondition } = _fr.default ?? _fr;
const _fa = await import("../lib/services/forms/form-rule-action.service");
const { addRuleAction } = _fa.default ?? _fa;

const APPLY = process.argv.includes("--apply");
const __dirname = dirname(fileURLToPath(import.meta.url));

// parse tsv -> unique (stage,status) pairs, in file order
const raw = readFileSync(join(__dirname, "stage-status-map.tsv"), "utf8");
const pairs = [];
const seen = new Set();
for (const line of raw.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const t = line.indexOf("\t");
  if (t < 0) continue;
  const stage = line.slice(0, t).trim();
  const status = line.slice(t + 1).trim();
  const key = `${status}||${stage}`;
  if (seen.has(key)) continue;
  seen.add(key);
  pairs.push({ stage, status });
}
console.log(`Rules to create: ${pairs.length}`);

// resolve tenant + draft version
const orgId =
  process.env.TENANT_ID ??
  (await prisma.qceFormSet.findFirst({ where: { surface: "call_disposition", isDefault: true }, select: { orgId: true } }))?.orgId;
const set = await prisma.qceFormSet.findFirst({ where: { orgId, surface: "call_disposition", isDefault: true }, select: { id: true } });
const draft = await prisma.qceFormSetVersion.findFirst({ where: { formSetId: set.id, status: "draft" }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true } });
console.log(`Tenant ${orgId} · draft v${draft.versionNumber}`);
console.log(`Sample: WHEN Status is "${pairs[0].status}" -> Set Contact Stage to "${pairs[0].stage}"`);

if (!APPLY) {
  console.log("\n[DRY-RUN] Nothing created. Re-run with --apply.");
  await prisma.$disconnect();
  process.exit(0);
}

let ok = 0;
const fails = [];
for (let i = 0; i < pairs.length; i++) {
  const { stage, status } = pairs[i];
  try {
    const rule = await createFormRule({
      formSetVersionId: draft.id,
      name: `${status} -> ${stage}`,
      matchType: "all",
      sortOrder: i,
    });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: [status], sortOrder: 0 });
    await addRuleAction({ formRuleId: rule.id, actionType: "set_stage", targetKind: "stage", setStatusId: stage, sortOrder: 0 });
    ok++;
    if (ok % 50 === 0) console.log(`  ...${ok}/${pairs.length}`);
  } catch (e) {
    fails.push({ status, stage, err: e instanceof Error ? e.message : String(e) });
  }
}

console.log(`\n✔ Created ${ok} rule(s).`);
if (fails.length) {
  console.log(`⚠ ${fails.length} failed:`);
  fails.slice(0, 10).forEach((f) => console.log(`   "${f.status}" -> "${f.stage}": ${f.err}`));
}
await prisma.$disconnect();
console.log("Done.");
