import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { generateReportSchema } from "@/lib/validations/notifications-reports";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const where: Prisma.ReportWhereInput = {
      orgId, deletedAt: null,
      ...(type && { type }),
      ...(status && { status: status as Prisma.EnumReportStatusFilter["equals"] }),
    };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.report.count({ where }),
    ]);

    return successResponse(reports, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /reports error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = generateReportSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const report = await prisma.report.create({
      data: {
        orgId,
        name: parsed.data.name,
        type: parsed.data.type,
        parameters: parsed.data.parameters ? JSON.parse(JSON.stringify(parsed.data.parameters)) : undefined,
        format: parsed.data.format,
        generatedBy: userId,
        status: "ReportProcessing",
        lastRunAt: new Date(),
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Report", entityId: report.id });
    return successResponse(report, undefined, 201);
  } catch (error) {
    console.error("POST /reports error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.reports.read"] });
