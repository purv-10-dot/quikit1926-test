import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const updateSchema = z.object({
  hours: z.number().min(0).max(24).optional(),
  description: z.string().max(2000).nullable().optional(),
});

/**
 * Inline-edit entry update. Only the row's owner may edit its hours; this
 * matches Tempo/Jira behaviour and keeps the audit trail honest.
 */
export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const entry = await db.qtTimesheetEntry.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: { id: true, userId: true },
    });
    if (!entry) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (entry.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    // Treat hours = 0 as a soft-delete so the inline grid can wipe a cell
    // by submitting an empty value without juggling two endpoints.
    if (parsed.data.hours === 0) {
      await db.qtTimesheetEntry.update({
        where: { id: entry.id },
        data: { isDeleted: true, updatedBy: userId },
      });
      return NextResponse.json({ success: true, data: { id: entry.id, deleted: true } });
    }
    const updated = await db.qtTimesheetEntry.update({
      where: { id: entry.id },
      data: {
        ...(parsed.data.hours !== undefined ? { hours: parsed.data.hours } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        updatedBy: userId,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const entry = await db.qtTimesheetEntry.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: { id: true, userId: true },
    });
    if (!entry) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (entry.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    await db.qtTimesheetEntry.update({
      where: { id: entry.id },
      data: { isDeleted: true, updatedBy: userId },
    });
    return NextResponse.json({ success: true, data: { id: entry.id } });
  },
);
