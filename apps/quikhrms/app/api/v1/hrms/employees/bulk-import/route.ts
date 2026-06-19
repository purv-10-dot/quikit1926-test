import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkImportEmployeesSchema } from "@/lib/validations/gap-fill";
import { runBackground } from "@/lib/run-background";
import { runBulkEmployeeImport, markBulkImportFailed } from "@/lib/jobs/run-bulk-import";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkImportEmployeesSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const importRec = await prisma.dataImport.create({
      data: {
        orgId,
        entityType: "employees",
        fileName: parsed.data.fileName,
        totalRows: parsed.data.rows.length,
        status: "ImportPending",
        createdBy: userId,
      },
    });

    // Process in-process (no queue/worker). Returns immediately; the import runs
    // in the background and updates the DataImport record — the UI polls
    // GET /employees/bulk-import/[importId] for progress.
    runBackground(
      `bulk-import:${importRec.id}`,
      () =>
        runBulkEmployeeImport({
          orgId,
          userId,
          importId: importRec.id,
          rows: parsed.data.rows,
          dryRun: parsed.data.dryRun,
          markActive: parsed.data.markActive,
        }),
      (err) => markBulkImportFailed(importRec.id, err),
    );

    return successResponse(
      { importId: importRec.id, status: "processing", totalRows: parsed.data.rows.length },
      undefined,
      202,
    );
  } catch (error) {
    console.error("POST /employees/bulk-import error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.employee.write"],
  rateLimit: { max: 3, windowSec: 60, by: "tenant", scope: "employees.bulk-import" },
});
