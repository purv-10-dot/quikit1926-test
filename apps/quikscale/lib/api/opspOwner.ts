import { db } from "@/lib/db";

/**
 * Resolve the canonical OPSP owner for an org.
 *
 * OPSP is an org-level document — a single "One-Page Strategic Plan" shared by
 * everyone with OPSP permission. But `OPSPData` rows are physically keyed by
 * `(orgId, userId, year, quarter)`, so we designate ONE canonical owner per org
 * and resolve every OPSP read/write to that owner's rows. The owner is the
 * creator of the org's earliest OPSP record (the person who first set it up).
 *
 * Returns `null` when the org has no OPSP yet — callers fall back to the acting
 * user (`?? userId`), so the first person to create an OPSP becomes the owner.
 *
 * Permission is enforced separately by the `withOrgAuthForResource` wrapper —
 * this helper only decides WHICH record is the org's plan, never WHO may
 * read/write it. Audit fields (`updatedBy`/`createdBy`/`actorId`) must still
 * record the acting user, not the owner.
 */
export async function resolveOpspOwnerId(orgId: string): Promise<string | null> {
  const earliest = await db.oPSPData.findFirst({
    where: { orgId },
    // Deterministic: the first plan ever created in the org. `id` breaks any
    // createdAt tie so the owner is stable across requests.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { userId: true },
  });
  return earliest?.userId ?? null;
}

/**
 * Convenience: the effective OPSP owner for a request — the canonical owner if
 * the org already has a plan, else the acting user (who becomes the owner on
 * first create). Centralises the `?? userId` fallback so every route resolves
 * identically.
 */
export async function resolveOpspOwnerOrSelf(orgId: string, userId: string): Promise<string> {
  return (await resolveOpspOwnerId(orgId)) ?? userId;
}
