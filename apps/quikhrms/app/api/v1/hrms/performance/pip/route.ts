import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createPIPSchema } from "@/lib/validations/performance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    const where = {
      orgId, deletedAt: null,
      ...(employeeId && { employeeId }),
      ...(status && { status: status as "PIPActive" | "PIPExtended" | "PIPCompletedSuccess" | "PIPFailed" | "PIPWithdrawn" }),
    };

    const [pips, total] = await Promise.all([
      prisma.pIP.findMany({
        where, orderBy: { startDate: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } } },
          initiatedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.pIP.count({ where }),
    ]);
    return successResponse(pips, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /performance/pip error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createPIPSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const pip = await prisma.pIP.create({
      data: {
        orgId, employeeId: data.employeeId, initiatedById: userId,
        reason: data.reason, startDate: new Date(data.startDate), endDate: new Date(data.endDate),
        objectives: data.objectives ? JSON.parse(JSON.stringify(data.objectives)) : undefined,
        supportProvided: data.supportProvided ? JSON.parse(JSON.stringify(data.supportProvided)) : undefined,
        createdBy: userId, updatedBy: userId,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });

    void fireWorkflow({
      orgId, event: "performance.pip.initiated",
      payload: { employeeId: pip.employeeId, pipId: pip.id, startDate: pip.startDate, endDate: pip.endDate },
    });

    // In-app notification to employee on PIP initiation.
    await prisma.hrmsNotification.create({
      data: {
        orgId,
        employeeId: pip.employeeId,
        type: "Warning",
        channel: "InApp",
        title: "You have been placed on a PIP",
        message: `Period: ${pip.startDate.toISOString().slice(0, 10)} → ${pip.endDate.toISOString().slice(0, 10)}. Reason: ${pip.reason.slice(0, 100)}`,
        link: "/performance/pip",
        entityType: "PIP",
        entityId: pip.id,
      },
    });

    return successResponse(pip, undefined, 201);
  } catch (error) { console.error("POST /performance/pip error:", error); return internalError(); }
});
