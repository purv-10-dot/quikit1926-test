/**
 * One-off: soft-delete obvious test/placeholder accountability functions.
 *
 * Criteria for "junk":
 *  - name shorter than 3 chars
 *  - name matches a gibberish pattern (no vowels, or random low-info strings
 *    like "rejbhkcjdfm" / "gergvf" that came up in demo feedback)
 *
 * Idempotent — already-soft-deleted rows are skipped. Lists what would be
 * touched first; pass `--apply` to actually run the soft-delete.
 *
 *   npx tsx scripts/cleanup-face-junk.ts            # dry run (default)
 *   npx tsx scripts/cleanup-face-junk.ts --apply    # actually soft-delete
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function isJunk(name: string): boolean {
  const n = name.trim();
  if (n.length < 3) return true;
  // No vowels at all → gibberish (e.g. "rejbhkcjdfm").
  // Allow 1-vowel-but-no-spaces strings that are >= 6 chars as low-signal too.
  const lower = n.toLowerCase();
  const hasVowel = /[aeiou]/.test(lower);
  if (!hasVowel) return true;
  // Single-token strings of length >= 6 with very low vowel ratio.
  const vowelCount = (lower.match(/[aeiou]/g) ?? []).length;
  if (!n.includes(" ") && lower.length >= 6 && vowelCount / lower.length < 0.2) return true;
  return false;
}

(async () => {
  const rows = await db.accountabilityFunction.findMany({
    where: { deletedAt: null },
    select: {
      id: true, orgId: true, chartType: true, name: true,
      org: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const junk = rows.filter((r) => isJunk(r.name));
  console.log(`Scanned ${rows.length} active rows · flagged ${junk.length} as junk.\n`);
  if (junk.length === 0) {
    console.log("Nothing to clean.");
    await db.$disconnect();
    return;
  }

  for (const r of junk) {
    console.log(`  ${APPLY ? "→" : " "} ${r.chartType.toUpperCase()}  org=${r.org.slug.padEnd(20)}  "${r.name}"  (id=${r.id})`);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with `--apply` to soft-delete.");
    await db.$disconnect();
    return;
  }

  const result = await db.accountabilityFunction.updateMany({
    where: { id: { in: junk.map((r) => r.id) } },
    data: { deletedAt: new Date() },
  });
  console.log(`\n✅ Soft-deleted ${result.count} junk row(s).`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
