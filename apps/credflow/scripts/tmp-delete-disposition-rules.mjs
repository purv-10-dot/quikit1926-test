/**
 * TEMP — delete the automation rules on the tenant's DRAFT call_disposition form
 * version (the ones shown in Settings > Disposition Forms > Rules).
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/tmp-delete-disposition-rules.mjs           # dry-run (list only)
 *   npx tsx --env-file=.env.local scripts/tmp-delete-disposition-rules.mjs --apply   # deletes
 *
 * TEMP — delete after use.
 */
const _prismaMod = await import("../lib/db/prisma");
const { prisma } = _prismaMod.default ?? _prismaMod;

const APPLY = process.argv.includes("--apply");

const orgId =
  process.env.TENANT_ID ??
  (
    await prisma.qcfFormSet.findFirst({
      where: { surface: "call_disposition", isDefault: true },
      select: { orgId: true },
    })
  )?.orgId;

if (!orgId) {
  console.log("No default call_disposition tenant found. Set TENANT_ID=<id>.");
  await prisma.$disconnect();
  process.exit(1);
}

const set = await prisma.qcfFormSet.findFirst({
  where: { orgId, surface: "call_disposition", isDefault: true },
  select: { id: true, currentVersionId: true },
});

// The builder edits the latest DRAFT version — that's what the Rules list shows.
const draft = await prisma.qcfFormSetVersion.findFirst({
  where: { formSetId: set.id, status: "draft" },
  orderBy: { versionNumber: "desc" },
  select: { id: true, versionNumber: true },
});

if (!draft) {
  console.log("No draft version found for the call_disposition set.");
  await prisma.$disconnect();
  process.exit(1);
}

const rules = await prisma.qcfFormRule.findMany({
  where: { formSetVersionId: draft.id },
  select: { id: true, name: true },
  orderBy: { sortOrder: "asc" },
});

console.log(`Tenant: ${orgId}`);
console.log(`Draft version: v${draft.versionNumber} (${draft.id})`);
console.log(`Rules to delete: ${rules.length}`);
rules.forEach((r) => console.log(`  - ${r.name} (${r.id})`));

if (!rules.length) {
  console.log("\nNothing to delete.");
  await prisma.$disconnect();
  process.exit(0);
}

if (!APPLY) {
  console.log("\n[DRY-RUN] Nothing deleted. Re-run with --apply.");
  await prisma.$disconnect();
  process.exit(0);
}

const ids = rules.map((r) => r.id);
const a = await prisma.qcfFormRuleAction.deleteMany({ where: { formRuleId: { in: ids } } });
const c = await prisma.qcfFormRuleCondition.deleteMany({ where: { formRuleId: { in: ids } } });
const r = await prisma.qcfFormRule.deleteMany({ where: { id: { in: ids } } });
console.log(`\n✔ Deleted ${r.count} rule(s), ${c.count} condition(s), ${a.count} action(s).`);

await prisma.$disconnect();
console.log("Done.");
