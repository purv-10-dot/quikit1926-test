/**
 * One-off cleanup: remove the `seed-asset-requests.ts` demo overlay from
 * MoreYeahs, which introduced a duplicate "Electronics/Laptop" taxonomy that
 * shadows the real "IT Equipment/Laptops".
 *
 * DELETES (seed data only):
 *   - 3 demo Asset Requests   (justification starts with "[seed:asset-request]")
 *   - 4 demo assets           (itemCode starts with "SEED-AR-")
 *   - 3 categories            (Electronics/Laptop, Furniture/Chair, Subscriptions/SaaS)
 *   - 2 base categories       (Electronics, Subscriptions)
 *
 * NEVER TOUCHES: IT Equipment (+ Laptops/Monitors/Phones), the Furniture BASE
 * or Furniture/Desks, or any of the 12 real assets. Hard guards abort the run if
 * a real (non-SEED-AR-) asset is found under any target category, or if the
 * Electronics/Subscriptions bases hold anything other than their one seed sub.
 *
 * Run (from apps/quikasset, DATABASE_URL in env):
 *   npx tsx scripts/cleanup-moreyeahs-seed-categories.ts            # dry-run (default)
 *   npx tsx scripts/cleanup-moreyeahs-seed-categories.ts --apply    # perform deletions
 *
 * Idempotent — re-running after a successful apply finds nothing to do.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const SEED_ASSET_PREFIX = "SEED-AR-";
const SEED_REQUEST_TAG = "[seed:asset-request]";

// base name -> the single seed sub-category expected under it, and whether the
// base itself should be deleted (Furniture stays — it also holds real Desks).
const TARGETS: Array<{ base: string; sub: string; deleteBase: boolean }> = [
  { base: "Electronics", sub: "Laptop", deleteBase: true },
  { base: "Furniture", sub: "Chair", deleteBase: false },
  { base: "Subscriptions", sub: "SaaS", deleteBase: true },
];

function abort(msg: string): never {
  throw new Error(`ABORT (nothing deleted): ${msg}`);
}

async function main() {
  const org = await db.org.findFirst({
    where: { name: { contains: "MoreYeahs", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!org) abort("MoreYeahs org not found.");
  const orgId = org.id;
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — seed-category cleanup for ${org.name} (${orgId})\n`);

  // ── Resolve seed data ──────────────────────────────────────────────
  const seedRequests = await db.astAssetRequest.findMany({
    where: { orgId, justification: { startsWith: SEED_REQUEST_TAG } },
    select: { id: true, itemType: true, status: true },
  });
  const seedAssets = await db.astAsset.findMany({
    where: { orgId, itemCode: { startsWith: SEED_ASSET_PREFIX } },
    select: { id: true, itemCode: true, itemName: true, assetStatus: true },
  });
  const seedAssetIds = seedAssets.map((a) => a.id);
  const seedRequestIds = seedRequests.map((r) => r.id);

  // ── Guard: seed assets must not be referenced anywhere ──────────────
  const [asg, rep, repl] = await Promise.all([
    db.astAssignment.count({ where: { assetId: { in: seedAssetIds } } }),
    db.astRepair.count({ where: { assetId: { in: seedAssetIds } } }),
    db.astReplacement.count({ where: { assetId: { in: seedAssetIds } } }),
  ]);
  if (asg || rep || repl) {
    abort(`seed assets are referenced (assignments=${asg}, repairs=${rep}, replacements=${repl}) — not safe to delete.`);
  }
  const reqAsg = seedRequestIds.length
    ? await db.astAssignment.count({ where: { requestId: { in: seedRequestIds } } })
    : 0;
  if (reqAsg) abort(`seed requests have ${reqAsg} fulfilment assignment(s) — not safe to delete.`);

  // ── Resolve + guard target categories / bases ───────────────────────
  const categoryIdsToDelete: Array<{ id: string; label: string }> = [];
  const baseIdsToDelete: Array<{ id: string; label: string }> = [];

  for (const t of TARGETS) {
    const base = await db.astBaseCategory.findFirst({
      where: { orgId, name: t.base },
      select: { id: true, name: true, categories: { select: { id: true, name: true } } },
    });
    if (!base) {
      console.log(`  · base "${t.base}" not found — already cleaned? skipping`);
      continue;
    }
    const sub = base.categories.find((c) => c.name === t.sub);
    if (sub) {
      // Guard: the sub-category must contain only SEED-AR- assets.
      const nonSeed = await db.astAsset.count({
        where: { orgId, categoryId: sub.id, NOT: { itemCode: { startsWith: SEED_ASSET_PREFIX } } },
      });
      if (nonSeed > 0) abort(`category "${t.base}/${t.sub}" holds ${nonSeed} real (non-seed) asset(s).`);
      categoryIdsToDelete.push({ id: sub.id, label: `${t.base}/${t.sub}` });
    } else {
      console.log(`  · category "${t.base}/${t.sub}" not found — skipping`);
    }

    if (t.deleteBase) {
      // Guard: base must contain ONLY the one seed sub-category and no real assets.
      const others = base.categories.filter((c) => c.name !== t.sub);
      if (others.length > 0) {
        abort(`base "${t.base}" also has sub-categories [${others.map((c) => c.name).join(", ")}] — refusing to delete the base.`);
      }
      const nonSeedInBase = await db.astAsset.count({
        where: { orgId, baseCategoryId: base.id, NOT: { itemCode: { startsWith: SEED_ASSET_PREFIX } } },
      });
      if (nonSeedInBase > 0) abort(`base "${t.base}" holds ${nonSeedInBase} real (non-seed) asset(s).`);
      baseIdsToDelete.push({ id: base.id, label: t.base });
    }
  }

  // ── Report the plan ─────────────────────────────────────────────────
  console.log("\nWill delete:");
  console.log(`  Asset Requests (${seedRequests.length}):`);
  seedRequests.forEach((r) => console.log(`     - "${r.itemType}" [${r.status}]  ${r.id}`));
  console.log(`  Assets (${seedAssets.length}):`);
  seedAssets.forEach((a) => console.log(`     - ${a.itemCode}  "${a.itemName}" [${a.assetStatus}]  ${a.id}`));
  console.log(`  Categories (${categoryIdsToDelete.length}):`);
  categoryIdsToDelete.forEach((c) => console.log(`     - ${c.label}  ${c.id}`));
  console.log(`  Base categories (${baseIdsToDelete.length}):`);
  baseIdsToDelete.forEach((b) => console.log(`     - ${b.label}  ${b.id}`));

  if (!APPLY) {
    console.log("\nDRY-RUN only. Re-run with --apply to perform the deletions.");
    return;
  }

  // ── Apply, FK-safe order, in one transaction ────────────────────────
  await db.$transaction(async (tx) => {
    if (seedRequestIds.length) await tx.astAssetRequest.deleteMany({ where: { id: { in: seedRequestIds } } });
    if (seedAssetIds.length) await tx.astAsset.deleteMany({ where: { id: { in: seedAssetIds } } });
    if (categoryIdsToDelete.length) await tx.astCategory.deleteMany({ where: { id: { in: categoryIdsToDelete.map((c) => c.id) } } });
    if (baseIdsToDelete.length) await tx.astBaseCategory.deleteMany({ where: { id: { in: baseIdsToDelete.map((b) => b.id) } } });
  });

  console.log(
    `\nAPPLIED — deleted ${seedRequests.length} request(s), ${seedAssets.length} asset(s), ` +
      `${categoryIdsToDelete.length} categor(y/ies), ${baseIdsToDelete.length} base categor(y/ies).`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
