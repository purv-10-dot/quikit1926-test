/**
 * Annotated reference: detail queries (single record + mutations).
 *
 * Every detail-shape query in the codebase looks like one of these.
 *
 * ⚠ Reference only. Not buildable from this directory.
 */
import { db } from "@/lib/db";

/* ─── Pattern A — fetch single record by composite key ──────────────────────
 * findUnique is the right choice when you have a true uniqueness constraint
 * (here: tenantId + id). Faster than findFirst and the type system enforces
 * presence of the unique fields.
 */
export async function getWidget(tenantId: string, id: string) {
  return db.widget.findUnique({
    where: {
      // Composite key requires `@@unique([tenantId, id])` in schema.prisma OR
      // use findFirst with a composite where.
      tenantId_id: { tenantId, id },
    },
    include: {
      // Detail views can use `include` since the consumer wants full models.
      owner: true,
      comments: {
        select: { id: true, body: true, createdAt: true, author: { select: { id: true, firstName: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,    // even on detail, cap related lists
      },
    },
  });
}

/* ─── Pattern B — alternative when no composite unique index ────────────────
 * If you don't have @@unique([tenantId, id]), use findFirst instead. The
 * tenantId filter is still mandatory.
 */
export async function getWidgetFallback(tenantId: string, id: string) {
  return db.widget.findFirst({
    where: { id, tenantId },     // tenantId STILL required
    include: { owner: true },
  });
}

/* ─── Pattern C — update with optimistic concurrency check ──────────────────
 * `update` throws if no row matches. The `tenantId` clause guarantees you
 * can't mutate another tenant's data even if you somehow get their `id`.
 */
export async function updateWidget(
  tenantId: string,
  id: string,
  userId: string,
  data: { name?: string; status?: string },
) {
  return db.widget.update({
    where: { tenantId_id: { tenantId, id } },
    data: { ...data, updatedBy: userId },
    select: { id: true, name: true, status: true, updatedAt: true },
  });
}

/* ─── Pattern D — soft delete ───────────────────────────────────────────────
 * Prefer soft delete (set deletedAt) over hard delete. Lets users undo and
 * preserves audit trail. Add `deletedAt: null` to every read-side query.
 */
export async function softDeleteWidget(tenantId: string, id: string, userId: string) {
  return db.widget.update({
    where: { tenantId_id: { tenantId, id } },
    data: { deletedAt: new Date(), updatedBy: userId },
    select: { id: true, deletedAt: true },
  });
}

/* ─── Pattern E — transactional mutation + audit ────────────────────────────
 * Atomic: either both the update and the audit log succeed, or neither does.
 */
export async function updateWidgetWithAudit(
  tenantId: string,
  id: string,
  userId: string,
  changes: { name?: string; status?: string },
) {
  return db.$transaction(async (tx) => {
    const updated = await tx.widget.update({
      where: { tenantId_id: { tenantId, id } },
      data: { ...changes, updatedBy: userId },
      select: { id: true, name: true, status: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: "UPDATE",
        entityType: "Widget",
        entityId: id,
        changes: Object.keys(changes),
        reason: `Updated widget`,
      },
    });
    return updated;
  });
}

/* ─── Pattern F — guarded existence check before operation ─────────────────
 * Sometimes you need to verify the row exists in your tenant *before* doing
 * something else (e.g., checking a quota). Use `select: { id: true }` —
 * fastest possible "does this exist for me?" query.
 */
export async function ensureWidgetExists(tenantId: string, id: string) {
  const exists = await db.widget.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!exists) throw new Error("Widget not found");
}

/* ─── Anti-patterns ─────────────────────────────────────────────────────────
 *
 * ❌ findUnique without tenantId:
 *      db.widget.findUnique({ where: { id } })
 *      // Returns the row regardless of tenant. Cross-tenant leak.
 *
 * ❌ Update with `where: { id }`:
 *      db.widget.update({ where: { id }, data: { ... } })
 *      // No tenant scoping — could mutate another tenant's data.
 *
 * ❌ Mutation without audit log:
 *      db.widget.update({ ... })  // and no auditLog write afterwards
 *      // Mutations need a who/when/what trail. Use a transaction.
 *
 * ❌ Hard delete without confirmation:
 *      db.widget.delete({ ... })
 *      // Prefer soft delete (deletedAt). Hard delete loses history forever.
 */
