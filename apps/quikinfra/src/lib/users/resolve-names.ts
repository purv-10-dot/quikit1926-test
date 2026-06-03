/**
 * resolveUserNames — bulk-load human display names for a set of user
 * ids stored on transactions (`createdBy`, `updatedBy`, the approval
 * timeline, etc.).
 *
 * One Prisma round-trip regardless of how many ids are passed in.
 * Returns a Map so callers can do `nameById.get(id) ?? id` — falling
 * back to the raw id keeps the UI self-diagnosing when a legacy /
 * cross-tenant id slips through.
 *
 * Step H: now sources entirely from central `auth.User`. The legacy
 * cn_users / cn_demo_users lookups were removed when those tables
 * were dropped.
 */

import { findCnUsersByIds } from "@/lib/users/lookup";

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

  const users = await findCnUsersByIds(unique);
  const out = new Map<string, string>();
  for (const u of users) {
    out.set(u.id, u.fullName || u.email || u.id);
  }
  return out;
}
