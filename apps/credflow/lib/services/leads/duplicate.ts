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
  tenantId: string;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  /** When updating an existing lead, exclude its id from the dup check. */
  excludeId?: string;
}

export interface DuplicateLeadMatch {
  id: string;
  field: DuplicateField;
}

/**
 * Like findDuplicateLead but returns the matched lead's id alongside the field,
 * so callers (e.g. the import row builder) can upsert onto the existing record
 * instead of inserting a duplicate. Returns null when no duplicate exists.
 */
export async function findDuplicateLeadRecord(opts: DuplicateOpts): Promise<DuplicateLeadMatch | null> {
  const { tenantId, email, mobile, phone, excludeId } = opts;

  if (email && email.trim()) {
    const hit = await prisma.crmLead.findFirst({
      where: {
        tenantId,
        email: { equals: email.trim(), mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (hit) return { id: hit.id, field: "email" };
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
        tenantId,
        OR: [{ mobile: value }, { phone: value }],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (exact) return { id: exact.id, field: key };

    // Fallback: scan candidates that share at least the trailing 10 digits.
    const tail = normalized.slice(-10);
    if (tail.length === 10) {
      const candidates = await prisma.crmLead.findMany({
        where: {
          tenantId,
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
          return { id: c.id, field: key };
        }
      }
    }
  }

  return null;
}

export async function findDuplicateLead(opts: DuplicateOpts): Promise<DuplicateField | null> {
  const match = await findDuplicateLeadRecord(opts);
  return match?.field ?? null;
}
