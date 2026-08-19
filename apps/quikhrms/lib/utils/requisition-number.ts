import { prisma } from "@/lib/prisma";
import { getOrCreateCompanyShortCode } from "@/lib/utils/company-short-code";

/**
 * Short random suffix so a same-instant duplicate sequence number (a rare
 * concurrent-create race) can never collide against the `[orgId,
 * requisitionNumber]` unique constraint — cheaper and safer than re-parsing
 * the previous row's number to derive the next one (see below).
 */
function shortSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * Sequence number is a plain count of requisitions ever raised for the org —
 * NOT parsed from the previous row's `requisitionNumber` text. An earlier
 * version read the last row's trailing digits and incremented them; a
 * one-time DB trigger (since removed) used to append a long timestamp to
 * that same column, so the "last number" it read was already corrupted and
 * every new one compounded further, producing ever-growing IDs. Counting
 * rows directly is immune to whatever text ended up stored historically.
 *
 * Prefix is the org's own short code (e.g. "MY"), not the fixed "QK" used
 * before — every org gets its own-looking IDs. This is the single generator
 * for BOTH the direct-create and Raise-Requisition flows (previously a
 * second, differently-shaped generator lived in requisitions/raise/route.ts).
 * Requisitions created before this change keep their old "QK-REQ-..." number
 * — nothing is backfilled.
 */
export async function generateRequisitionNumber(orgId: string): Promise<string> {
  const [count, shortCode] = await Promise.all([
    prisma.jobRequisition.count({ where: { orgId } }),
    getOrCreateCompanyShortCode(orgId),
  ]);
  const next = count + 1;
  return `${shortCode}-REQ-${String(next).padStart(4, "0")}-${shortSuffix()}`;
}
