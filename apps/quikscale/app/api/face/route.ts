import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createAccountabilityFunctionSchema } from "@/lib/schemas/accountabilitySchema";
import { validationError } from "@/lib/api/validationError";
import { computeAccountabilityInsights } from "@/lib/api/accountabilityInsights";

export const GET = withOrgAuth(
  async ({ orgId }) => {
    const functions = await db.accountabilityFunction.findMany({
      where: { orgId, chartType: "face", deletedAt: null },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        childFunctions: {
          where: { deletedAt: null },
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
    const roots = functions.filter((f) => !f.parentFunctionId);
    const insights = computeAccountabilityInsights(functions);
    return NextResponse.json({ success: true, data: { functions: roots, insights } });
  },
  { moduleKey: "face", fallbackErrorMessage: "Failed to fetch FACe functions" },
);

export const POST = withOrgAuth(
  async ({ orgId }, request) => {
    const parsed = createAccountabilityFunctionSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const fn = await db.accountabilityFunction.create({
      data: {
        orgId,
        chartType:        "face",
        name:             input.name,
        description:      input.description ?? null,
        leadingIndicators: input.leadingIndicators ?? null,
        expectedOutcomes: input.expectedOutcomes ?? null,
        assignedToUserId: input.assignedToUserId ?? null,
        teamId:           input.teamId ?? null,
        parentFunctionId: input.parentFunctionId ?? null,
        sortOrder:        input.sortOrder ?? 0,
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return NextResponse.json({ success: true, data: fn }, { status: 201 });
  },
  { moduleKey: "face", fallbackErrorMessage: "Failed to create FACe function" },
);
