import { positionBetween, needsRenumber, POSITION_STEP } from "@/lib/utils/rowOrder";

/**
 * Minimal Prisma-delegate shape the reorder util needs. All 7 orderable models
 * (KPI, Priority, WWWItem, Client, ClientMember, ClientDailyHuddle,
 * ClientWeeklyMeeting) expose these methods with a `position Float?` column, so
 * a single generic util backs every per-module reorder route.
 */
export interface OrderableDelegate {
  findFirst: (args: unknown) => Promise<{ id: string; position: number | null } | null>;
  findMany: (args: unknown) => Promise<Array<{ id: string; position: number | null }>>;
  update: (args: unknown) => Promise<unknown>;
}

export interface ReorderInput {
  orgId: string;
  id: string;
  beforeId: string | null;
  afterId: string | null;
}

/** Thrown when the moved row doesn't exist in the caller's org (tenant guard). */
export class ReorderNotFoundError extends Error {
  constructor(message = "Row not found") {
    super(message);
    this.name = "ReorderNotFoundError";
  }
}

/**
 * Move a row to sit between `beforeId` and `afterId` by assigning it the
 * midpoint of their `position` values (org-shared order). On float-precision
 * collapse (many inserts in one gap) it renumbers that org's list and re-places
 * the row — the rare, self-healing path. Returns the row's new position.
 *
 * Tenant safety: the moved row is verified against `orgId`, and neighbor lookups
 * + the renumber query are all org-scoped, so a cross-tenant id can't move a row.
 */
export async function reorderRow(
  delegate: OrderableDelegate,
  { orgId, id, beforeId, afterId }: ReorderInput,
): Promise<number> {
  const moved = await delegate.findFirst({ where: { id, orgId }, select: { id: true, position: true } });
  if (!moved) throw new ReorderNotFoundError();

  const beforePos = beforeId
    ? (await delegate.findFirst({ where: { id: beforeId, orgId }, select: { position: true } }))?.position ?? null
    : null;
  const afterPos = afterId
    ? (await delegate.findFirst({ where: { id: afterId, orgId }, select: { position: true } }))?.position ?? null
    : null;

  // Fast path — a distinct midpoint exists.
  if (!needsRenumber(beforePos, afterPos)) {
    const newPos = positionBetween(beforePos, afterPos);
    await delegate.update({ where: { id }, data: { position: newPos } });
    return newPos;
  }

  // Collapse path — renumber the whole org list, placing the moved row right
  // after `beforeId` (or at the top when there's no `beforeId`).
  const rows = await delegate.findMany({
    where: { orgId },
    select: { id: true, position: true },
    orderBy: { position: "asc" },
  });
  const ids = rows.map((r) => r.id).filter((rid) => rid !== id);
  const insertIdx = beforeId ? ids.indexOf(beforeId) + 1 : 0;
  ids.splice(insertIdx, 0, id);

  let movedPos = POSITION_STEP;
  for (let i = 0; i < ids.length; i++) {
    const pos = (i + 1) * POSITION_STEP;
    if (ids[i] === id) movedPos = pos;
    await delegate.update({ where: { id: ids[i] }, data: { position: pos } });
  }
  return movedPos;
}
