import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.goals");
import { validationError } from "@/lib/api/validationError";
import { updateGoalSchema } from "@/lib/schemas/goalSchema";

type Params = { id: string };

export const GET = withTenantAuth<Params>(
  async ({ tenantId }, _req, { params }) => {
    const goal = await db.goal.findFirst({
      where: { id: params.id, tenantId },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        parentGoal: { select: { id: true, title: true } },
        childGoals: {
          select: { id: true, title: true, status: true, progressPercent: true },
        },
      },
    });
    if (!goal) {
      return NextResponse.json(
        { success: false, error: "Goal not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: goal });
  },
  { fallbackErrorMessage: "Failed to fetch goal" },
);

export const PUT = withTenantAuth<Params>(
  async ({ tenantId }, request, { params }) => {
    const existing = await db.goal.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true, targetValue: true, currentValue: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Goal not found" },
        { status: 404 },
      );
    }

    const parsed = updateGoalSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.targetValue !== undefined) data.targetValue = input.targetValue;
    if (input.currentValue !== undefined) data.currentValue = input.currentValue;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.quarter !== undefined) data.quarter = input.quarter;
    if (input.year !== undefined) data.year = input.year;
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "completed") data.completedAt = new Date();
    }
    if (input.parentGoalId !== undefined) data.parentGoalId = input.parentGoalId;

    // Recompute progressPercent if target or current changed
    const newTarget =
      input.targetValue !== undefined ? input.targetValue : existing.targetValue;
    const newCurrent =
      input.currentValue !== undefined
        ? input.currentValue
        : existing.currentValue;
    if (
      typeof newTarget === "number" &&
      typeof newCurrent === "number" &&
      newTarget > 0
    ) {
      data.progressPercent = Math.round((newCurrent / newTarget) * 100);
    }

    const goal = await db.goal.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        progressPercent: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: goal });
  },
  { fallbackErrorMessage: "Failed to update goal" },
);

export const DELETE = withTenantAuth<Params>(
  async ({ tenantId }, _req, { params }) => {
    const existing = await db.goal.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Goal not found" },
        { status: 404 },
      );
    }

    await db.goal.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, message: "Goal deleted" });
  },
  { fallbackErrorMessage: "Failed to delete goal" },
);
