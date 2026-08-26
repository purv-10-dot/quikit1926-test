import { prisma } from "@/lib/prisma";
import { getOrCreateCompanyShortCode } from "@/lib/utils/company-short-code";

function shortSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * Human-readable candidate ID, e.g. "MY-CAN-0387-K2P9" — same shape as
 * requisitionNumber (org short code + sequence + random collision guard).
 * Candidates created before this field existed have no code — nothing is
 * backfilled.
 */
export async function generateCandidateCode(orgId: string): Promise<string> {
  const [count, shortCode] = await Promise.all([
    prisma.candidate.count({ where: { orgId } }),
    getOrCreateCompanyShortCode(orgId),
  ]);
  const next = count + 1;
  return `${shortCode}-CAN-${String(next).padStart(4, "0")}-${shortSuffix()}`;
}
