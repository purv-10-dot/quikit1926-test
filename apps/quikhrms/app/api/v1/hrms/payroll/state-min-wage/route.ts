import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { upsertStateMinWageSchema } from "@/lib/validations/payroll";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const list = await prisma.stateMinimumWage.findMany({
      where: { orgId },
      orderBy: [{ state: "asc" }, { effectiveFrom: "desc" }],
    });
    return successResponse(list);
  } catch (e) {
    console.error("GET /payroll/state-min-wage error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertStateMinWageSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;
    const record = await prisma.stateMinimumWage.upsert({
      where: {
        orgId_state_scheduledEmployment_skillLevel_zone_effectiveFrom: {
          orgId,
          state: data.state,
          scheduledEmployment: data.scheduledEmployment ?? "",
          skillLevel: data.skillLevel ?? "",
          zone: data.zone ?? "",
          effectiveFrom: new Date(data.effectiveFrom),
        },
      },
      update: {
        monthlyWage: data.monthlyWage,
        notes: data.notes ?? null,
        updatedBy: userId,
      },
      create: {
        orgId,
        state: data.state,
        scheduledEmployment: data.scheduledEmployment ?? "",
        skillLevel: data.skillLevel ?? "",
        zone: data.zone ?? "",
        monthlyWage: data.monthlyWage,
        effectiveFrom: new Date(data.effectiveFrom),
        notes: data.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/state-min-wage error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
