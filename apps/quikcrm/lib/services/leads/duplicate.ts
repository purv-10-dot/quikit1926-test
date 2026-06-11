/**
 * Duplicate-identity checks for lead create. Match the legacy MongoDB rules:
 *   - email is unique within an org (case-insensitive)
 *   - mobile/phone digit-normalized is unique within an org
 *
 * Returns the offending field key when a duplicate is found, or null otherwise.
 */

import { prisma } from "@/lib/db/prisma";

export type DuplicateField = "email" | "mobile" | "phone";

/** Strip everything that isn't a digit. Used to compare phone numbers across format variations. */
export function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D+/g, "");
}

interface DuplicateOpts {
  orgId: string;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  /** When updating an existing lead, exclude its id from the dup check. */
  excludeId?: string;
}

export async function findDuplicateLead(opts: DuplicateOpts): Promise<DuplicateField | null> {
  const { orgId, email, mobile, phone, excludeId } = opts;

  if (email && email.trim()) {
    const hit = await prisma.crmLead.findFirst({
      where: {
        orgId,
        email: { equals: email.trim(), mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (hit) return "email";
  }

  // Phone/mobile dedupe: compare digit-normalized values. Prisma can't index-match
  // on a normalized expression, so we filter candidates by raw equality first
  // (cheap, hits the common case) and fall back to a small in-memory scan only
  // when raw equality misses.
  for (const [key, value] of [
    ["mobile", mobile],
    ["phone", phone],
  ] as const) {
    if (!value || !value.trim()) continue;
    const normalized = normalizePhoneDigits(value);
    if (!normalized) continue;

    const exact = await prisma.crmLead.findFirst({
      where: {
        orgId,
        OR: [{ mobile: value }, { phone: value }],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (exact) return key;

    // Fallback: scan candidates that share at least the trailing 10 digits.
    const tail = normalized.slice(-10);
    if (tail.length === 10) {
      const candidates = await prisma.crmLead.findMany({
        where: {
          orgId,
          OR: [{ mobile: { contains: tail } }, { phone: { contains: tail } }],
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true, mobile: true, phone: true },
      });
      for (const c of candidates) {
        if (
          normalizePhoneDigits(c.mobile) === normalized ||
          normalizePhoneDigits(c.phone) === normalized
        ) {
          return key;
        }
      }
    }
  }

  return null;
}
