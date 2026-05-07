/**
 * resolveUserNames — bulk-load human display names for a set of user
 * ids stored on transactions (`createdBy`, `updatedBy`, the approval
 * timeline, etc.).
 *
 * One Prisma round-trip per call regardless of how many ids are
 * passed in. Returns a Map so callers can do `nameById.get(id) ?? id`
 * — falling back to the raw id keeps the UI self-diagnosing when a
 * legacy / cross-tenant id slips through.
 */

import { db } from "@/lib/db/prisma";

export async function resolveUserNames(
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(
      ids
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );
  if (unique.length === 0) return new Map();
  const rows = await (db as any).cnUser.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true, username: true, email: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(r.id, r.fullName || r.username || r.email || r.id);
  }
  return out;
}
