import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { updateSWTEntrySchema } from "@/lib/schemas/swtSchema";
import { validationError } from "@/lib/api/validationError";

export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId }, request, { params }) => {
    const existing = await db.sWTEntry.findFirst({ where: { id: params.id, orgId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const parsed = updateSWTEntrySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const updated = await db.sWTEntry.update({
      where: { id: params.id },
      data: {
        ...(input.content        !== undefined && { content: input.content }),
        ...(input.impact         !== undefined && { impact: input.impact }),
        ...(input.category       !== undefined && { category: input.category }),
        ...(input.trendDirection !== undefined && { trendDirection: input.trendDirection }),
        ...(input.sortOrder      !== undefined && { sortOrder: input.sortOrder }),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { moduleKey: "swt", fallbackErrorMessage: "Failed to update SWT entry" },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const existing = await db.sWTEntry.findFirst({ where: { id: params.id, orgId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    await db.sWTEntry.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  },
  { moduleKey: "swt", fallbackErrorMessage: "Failed to delete SWT entry" },
);
