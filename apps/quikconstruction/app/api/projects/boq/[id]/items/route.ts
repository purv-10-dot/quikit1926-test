import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

const patchSchema = z.object({
  updates: z.array(z.object({
    itemId: z.string().min(1),
    scheduledStart: z.string().optional().nullable(),
    scheduledEnd: z.string().optional().nullable(),
    percentComplete: z.number().min(0).max(100).optional().nullable(),
  })),
});

/**
 * PATCH /api/projects/boq/[id]/items — bulk-update schedule/progress for
 * BOQ items. Owner BOQ must belong to the tenant. Fields are orthogonal to
 * the BOQ's locked status — schedules can be revised post-lock.
 */
export const PATCH = withTenantAuth<{ id: string }>(async ({ tenantId }, req, { params }) => {
  const input = patchSchema.parse(await req.json());
  const boq = await db.cnBOQ.findFirst({ where: { id: params.id, tenantId, deletedAt: null }, select: { id: true, items: { select: { id: true } } } });
  if (!boq) return NextResponse.json({ success: false, error: "BOQ not found" }, { status: 404 });
  const validIds = new Set(boq.items.map(i => i.id));
  await db.$transaction(input.updates.filter(u => validIds.has(u.itemId)).map(u =>
    db.cnBOQItem.update({
      where: { id: u.itemId },
      data: {
        scheduledStart: u.scheduledStart ? new Date(u.scheduledStart) : u.scheduledStart === null ? null : undefined,
        scheduledEnd: u.scheduledEnd ? new Date(u.scheduledEnd) : u.scheduledEnd === null ? null : undefined,
        percentComplete: u.percentComplete ?? undefined,
      },
    })
  ));
  return NextResponse.json({ success: true, data: { updated: input.updates.length } });
});
