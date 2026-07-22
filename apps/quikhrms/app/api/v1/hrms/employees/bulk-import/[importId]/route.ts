import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";

export const GET = withServiceAuth(async (
  _req: NextRequest,
  { orgId },
  params,
) => {
  try {
    const { importId } = params;
    if (!importId) return validationError("importId required");

    const rec = await prisma.dataImport.findFirst({
      where: { id: importId, orgId },
      select: {
        id: true,
        status: true,
        totalRows: true,
        processedRows: true,
        successRows: true,
        failedRows: true,
        errors: true,
        fileName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!rec) return notFound("Import not found");

    return successResponse(rec);
  } catch (error) {
    console.error("GET /employees/bulk-import/[importId] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read"] });
