import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { updateAccountabilityFunctionSchema } from "@/lib/schemas/accountabilitySchema";
import { validationError } from "@/lib/api/validationError";

export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId }, request, { params }) => {
    const existing = await db.accountabilityFunction.findFirst({
      where: { id: params.id, orgId, chartType: "pace", deletedAt: null },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const parsed = updateAccountabilityFunctionSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const updated = await db.accountabilityFunction.update({
      where: { id: params.id },
      data: {
        ...(input.name             !== undefined && { name: input.name }),
        ...(input.description      !== undefined && { description: input.description }),
        ...(input.leadingIndicators !== undefined && { leadingIndicators: input.leadingIndicators }),
        ...(input.expectedOutcomes !== undefined && { expectedOutcomes: input.expectedOutcomes }),
        ...(input.assignedToUserId !== undefined && { assignedToUserId: input.assignedToUserId }),
        ...(input.teamId           !== undefined && { teamId: input.teamId }),
        ...(input.sortOrder        !== undefined && { sortOrder: input.sortOrder }),
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { moduleKey: "pace", fallbackErrorMessage: "Failed to update PACe process" },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const existing = await db.accountabilityFunction.findFirst({
      where: { id: params.id, orgId, chartType: "pace", deletedAt: null },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const now = new Date();
    await db.accountabilityFunction.updateMany({
      where: {
        orgId,
        chartType: "pace",
        deletedAt: null,
        OR: [{ id: params.id }, { parentFunctionId: params.id }],
      },
      data: { deletedAt: now },
    });
    return NextResponse.json({ success: true });
  },
  { moduleKey: "pace", fallbackErrorMessage: "Failed to delete PACe process" },
);
