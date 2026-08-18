import { prisma } from "@/lib/prisma";

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
 */
export async function generateRequisitionNumber(orgId: string): Promise<string> {
  const count = await prisma.jobRequisition.count({ where: { orgId } });
  const next = count + 1;
  return `QK-REQ-${String(next).padStart(4, "0")}-${shortSuffix()}`;
}
