import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { validationError } from "@/lib/api/validationError";
import { createCriticalNumberUpdateSchema } from "@/lib/schemas/criticalNumberSchema";

const auth = withOrgAuthForResource("criticalNumbers", "CriticalNumber");

/**
 * Append-only value history for one Critical Number.
 *
 * This is the ONLY path allowed to move `currentValue`. Neither POST nor PATCH
 * on the parent resource accepts it, so the gauge can never disagree with the
 * history behind it.
 */

/**
 * GET /api/critical-numbers/[id]/updates
 *
 * Full history, oldest first — the order a trend line wants to plot.
 */
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const parent = await db.criticalNumber.findFirst({
    where: { id: params.id, orgId },
    select: { id: true },
  });
  if (!parent) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const updates = await db.criticalNumberUpdate.findMany({
    where: { orgId, criticalNumberId: params.id },
    select: { id: true, date: true, value: true, comment: true, createdBy: true, createdAt: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ success: true, data: updates });
});

/**
 * POST /api/critical-numbers/[id]/updates
 *
 * Append one reading and re-derive the parent's `currentValue`.
 *
 * `currentValue` is recomputed as the value of the LATEST row BY DATE, not
 * simply set to whatever was just posted. Updates can be backdated ("we forgot
 * to log last Tuesday"), and blindly assigning the incoming value would let a
 * backdated entry overwrite the gauge with a stale number. Ties on the same
 * date fall back to insert order, so a same-day correction wins.
 *
 * Both writes run in one transaction: a history row that didn't move the cache,
 * or a cache that moved without a history row, would each be a silent
 * inconsistency in the append-only record.
 */
export const POST = auth.update<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const parent = await db.criticalNumber.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const parsed = createCriticalNumberUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const [created] = await db.$transaction(async (tx) => {
      const row = await tx.criticalNumberUpdate.create({
        data: {
          orgId,
          criticalNumberId: params.id,
          date: new Date(input.date),
          value: input.value,
          comment: input.comment ?? null,
          createdBy: userId,
        },
        select: {
          id: true, date: true, value: true, comment: true, createdBy: true, createdAt: true,
        },
      });

      const latest = await tx.criticalNumberUpdate.findFirst({
        where: { orgId, criticalNumberId: params.id },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: { value: true },
      });

      await tx.criticalNumber.update({
        where: { id: params.id },
        data: { currentValue: latest?.value ?? null },
      });

      return [row];
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  },
);
