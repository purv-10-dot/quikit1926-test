/**
 * TEMP — the CORRECT rule set. A status only moves the Contact Stage when the
 * status NAME matches a Stage NAME (i.e. "this status means we reached that
 * stage"). Generic statuses (Could Not Connect, Last Sync…, Active Partner as a
 * status under other stages, etc.) that don't name a stage do NOT move the lead.
 *
 * Rule:  WHEN Status is <X>  ->  Set Contact Stage to <the stage named X>
 * One rule per matching status. No conflicts (each status -> exactly one stage).
 *
 *   npx tsx --env-file=.env.local scripts/tmp-create-self-transition-rules.mjs           # dry-run
 *   npx tsx --env-file=.env.local scripts/tmp-create-self-transition-rules.mjs --apply   # creates
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

const raw = readFileSync(join(__dirname, "stage-status-map.tsv"), "utf8");
const stages = new Map(); // norm -> canonical stage name
const statuses = new Set(); // canonical status names
const norm = (s) => s.trim().toLowerCase();
for (const line of raw.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const t = line.indexOf("\t");
  if (t < 0) continue;
  const stage = line.slice(0, t).trim();
  const status = line.slice(t + 1).trim();
  if (!stages.has(norm(stage))) stages.set(norm(stage), stage);
  statuses.add(status);
}

// A status becomes a rule only if its name matches a stage name.
const rules = [];
const skipped = [];
for (const status of statuses) {
  const stage = stages.get(norm(status));
  if (stage) rules.push({ status, stage });
  else skipped.push(status);
}

console.log(`Statuses total: ${statuses.size}`);
console.log(`\nRULES (status name matches a stage) = ${rules.length}:`);
rules.forEach((r) => console.log(`   WHEN Status is "${r.status}"  ->  Set Contact Stage to "${r.stage}"`));
console.log(`\nNO rule (generic status -> lead stays) = ${skipped.length}:`);
console.log("   " + skipped.join(" | "));

if (!APPLY) {
  console.log("\n[DRY-RUN] Nothing created. Re-run with --apply.");
  await prisma.$disconnect();
  process.exit(0);
}

const orgId =
  process.env.TENANT_ID ??
  (await prisma.qceFormSet.findFirst({ where: { surface: "call_disposition", isDefault: true }, select: { orgId: true } }))?.orgId;
const set = await prisma.qceFormSet.findFirst({ where: { orgId, surface: "call_disposition", isDefault: true }, select: { id: true } });
const draft = await prisma.qceFormSetVersion.findFirst({ where: { formSetId: set.id, status: "draft" }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true } });

let ok = 0;
const fails = [];
for (let i = 0; i < rules.length; i++) {
  const { stage, status } = rules[i];
  try {
    const rule = await createFormRule({ formSetVersionId: draft.id, name: `${status} -> ${stage}`, matchType: "all", sortOrder: i });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: [status], sortOrder: 0 });
    await addRuleAction({ formRuleId: rule.id, actionType: "set_stage", targetKind: "stage", setStatusId: stage, sortOrder: 0 });
    ok++;
  } catch (e) {
    fails.push({ status, stage, err: e instanceof Error ? e.message : String(e) });
  }
}
console.log(`\n✔ Created ${ok} rule(s) on draft v${draft.versionNumber}.`);
if (fails.length) fails.forEach((f) => console.log(`   ⚠ "${f.status}"->"${f.stage}": ${f.err}`));
await prisma.$disconnect();
console.log("Done.");
