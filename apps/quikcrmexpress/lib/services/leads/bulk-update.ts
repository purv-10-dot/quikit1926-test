import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import type { FilterPayloadInput } from "@/lib/validators/lead-filter";
import { resolveLeadWhere } from "@/lib/services/leads/resolve-lead-where";

/**
 * Bulk-update engine for leads.
 *
 * v1 scope: tagging — writes a single custom field (e.g. lead_tagging) onto
 * every lead matching an advanced filter, or an explicit id set. Built as a
 * general field-writer underneath (accepts any dynamicFields key) but the API
 * layer guards which fields are allowed for v1.
 *
 * SET RESOLUTION
 *   - scope "matching": rebuild the SAME where the list uses (resolveLeadWhere,
 *     which applies tenant + account ACL + owner-scope), so "what you bulk-update"
 *     equals "what you can see". A restricted user cannot tag leads they can't see.
 *   - scope "ids": explicit ids (checkbox selection), still tenant + (implicitly)
 *     visibility-guarded because we intersect with the caller's resolvable set is
 *     NOT done here — ids are trusted to come from a prior visible listing, but we
 *     STILL scope every write by orgId and re-filter ids through the same
 *     visibility where to prevent tampering.
 *
 * WRITE SEMANTICS (dynamicFields is JSON — must read-merge-write per row):
 *   - "replace": set the field to the value (single-tag / overwrite model).
 *   - "append":  add the value to the field's array (multi-tag model), de-duped.
 *     The replace-vs-append choice is CrmExpress's pending product decision; both
 *     are supported so the endpoint can switch without an engine change.
 *
 * SCALE: processes in batches. This is the SYNCHRONOUS path — safe for the sets
 * CrmExpress bulk-tags interactively. A background-worker path (BullMQ, mirroring
 * import-queue) is layered on separately for very large sets; it is required
 * because UAT Redis may be down, so the sync path must stand alone.
 */

const BATCH_SIZE = 300;

export type BulkUpdateMode = "replace" | "append";

export interface BulkFieldUpdate {
  /** dynamicFields key to write (e.g. "lead_tagging"). */
  field: string;
  value: string;
  mode: BulkUpdateMode;
}

export type BulkScope =
  | { kind: "matching"; filter: FilterPayloadInput }
  | { kind: "ids"; ids: string[] }
  | { kind: "count"; filter: FilterPayloadInput; count: number };

export interface BulkUpdateResult {
  matched: number;
  updated: number;
}

/** Merge one field update into a lead's existing dynamicFields blob. */
function applyUpdate(
  dyn: Record<string, unknown>,
  update: BulkFieldUpdate,
): Record<string, unknown> {
  const next = { ...dyn };
  if (update.mode === "replace") {
    next[update.field] = update.value;
    return next;
  }
  // append: ensure an array, add value if not present
  const existing = next[update.field];
  const arr: string[] = Array.isArray(existing)
    ? (existing as unknown[]).map((v) => String(v))
    : existing != null && existing !== ""
      ? [String(existing)]
      : [];
  if (!arr.includes(update.value)) arr.push(update.value);
  next[update.field] = arr;
  return next;
}

/**
 * Resolve the target lead ids for a scope, always constrained to what the user
 * can see (tenant + ACL + owner-scope via resolveLeadWhere). Returns ids only,
 * so the write phase can batch by id.
 */
async function resolveTargetIds(
  user: SessionUser,
  scope: BulkScope,
): Promise<string[]> {
  if (scope.kind === "ids") {
    // Re-scope the supplied ids through the visibility where so a tampered
    // client can't write ids outside its scope. Uses an empty filter (all
    // visible) AND id IN (...).
    const visibleWhere = await resolveLeadWhere(user, { matchMode: "ALL", conditions: [] });
    const rows = await prisma.qceLead.findMany({
      where: { AND: [visibleWhere, { id: { in: scope.ids } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  const where = await resolveLeadWhere(user, scope.filter);
  const take = scope.kind === "count" ? Math.max(0, Math.floor(scope.count)) : undefined;
  const rows = await prisma.qceLead.findMany({
    where,
    select: { id: true },
    ...(take !== undefined ? { take } : {}),
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.id);
}

export async function bulkUpdateLeads(opts: {
  user: SessionUser;
  scope: BulkScope;
  updates: BulkFieldUpdate[];
}): Promise<BulkUpdateResult> {
  const { user, scope, updates } = opts;
  if (updates.length === 0) return { matched: 0, updated: 0 };

  const ids = await resolveTargetIds(user, scope);
  if (ids.length === 0) return { matched: 0, updated: 0 };

  let updated = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);
    // Read the current dynamicFields for this batch, merge, write back.
    const rows = await prisma.qceLead.findMany({
      where: { id: { in: batchIds }, orgId: user.orgId },
      select: { id: true, dynamicFields: true },
    });
    await prisma.$transaction(
      rows.map((row) => {
        const dyn = (row.dynamicFields as Record<string, unknown> | null) ?? {};
        let nextDyn = dyn;
        for (const u of updates) nextDyn = applyUpdate(nextDyn, u);
        return prisma.qceLead.update({
          where: { id: row.id },
          data: { dynamicFields: nextDyn as Prisma.InputJsonValue },
        });
      }),
    );
    updated += rows.length;
  }

  return { matched: ids.length, updated };
}