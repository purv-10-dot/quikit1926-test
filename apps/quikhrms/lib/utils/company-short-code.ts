import { prisma } from "@/lib/prisma";

/**
 * Derives a short ID prefix from a company name — first letter of the first
 * two significant words ("MoreYeahs Pvt Ltd" -> "MY"), or the first two
 * letters of a single word ("Moreyeahs" -> "MO"). Falls back to "OR" if the
 * name yields nothing usable.
 */
function deriveShortCode(companyName: string): string {
  const words = companyName
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, ""))
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase().padEnd(2, "X");
  return "OR";
}

/**
 * Returns this org's ID prefix (e.g. "MY"), generating and caching it on
 * CompanySettings the first time it's needed. Stable for the org's lifetime —
 * never recomputed on a later companyName change, so already-issued IDs never
 * shift underneath existing records.
 *
 * `shortCode` isn't in the generated Prisma client yet, so it's read/written
 * via raw SQL (see requisitionNumber/candidateCode, same pattern).
 */
export async function getOrCreateCompanyShortCode(orgId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ shortCode: string | null; companyName: string }[]>`
    SELECT "shortCode", "companyName" FROM "app_quikhrms"."CompanySettings" WHERE "orgId" = ${orgId}`;
  const existing = rows[0];
  if (existing?.shortCode) return existing.shortCode;

  const shortCode = deriveShortCode(existing?.companyName ?? "Org");
  await prisma.$executeRaw`UPDATE "app_quikhrms"."CompanySettings" SET "shortCode" = ${shortCode} WHERE "orgId" = ${orgId}`;
  return shortCode;
}
