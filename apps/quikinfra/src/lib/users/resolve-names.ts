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

  // Sessions can originate from either cn_users (invited team members) or
  // cn_demo_users (the seeded super-admin / amit / priya etc. accounts).
  // The two tables have different name columns:
  //   - cn_users      → fullName, username, email
  //   - cn_demo_users → name, email
  // Look up both in parallel and merge. `Promise.allSettled` so an env
  // without cn_demo_users (or vice-versa) doesn't bubble up as a failure
  // — we just fall back to the ids we did resolve.
  const [cnRes, demoRes] = await Promise.allSettled([
    (db as any).cnUser.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true, username: true, email: true },
    }),
    (db as any).cnDemoUser.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const out = new Map<string, string>();
  if (cnRes.status === "fulfilled") {
    for (const r of cnRes.value ?? []) {
      if (out.has(r.id)) continue;
      out.set(r.id, r.fullName || r.username || r.email || r.id);
    }
  }
  if (demoRes.status === "fulfilled") {
    for (const r of demoRes.value ?? []) {
      if (out.has(r.id)) continue;
      out.set(r.id, r.name || r.email || r.id);
    }
  }
  return out;
}
