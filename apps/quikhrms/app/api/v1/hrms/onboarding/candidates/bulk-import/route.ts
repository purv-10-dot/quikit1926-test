import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkImportOnboardingSchema } from "@/lib/validations/boarding";
import { runBackground } from "@/lib/run-background";
import { runBulkOnboardingImport, markOnboardingImportFailed } from "@/lib/jobs/run-bulk-onboarding-import";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkImportOnboardingSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const importRec = await prisma.dataImport.create({
      data: {
        orgId,
        entityType: "onboarding-candidates",
        fileName: parsed.data.fileName,
        totalRows: parsed.data.rows.length,
        status: "ImportPending",
        createdBy: userId,
      },
    });

    // Runs in-process; the UI polls GET /onboarding/candidates/bulk-import/[importId].
    runBackground(
      `bulk-onboarding-import:${importRec.id}`,
      () =>
        runBulkOnboardingImport({
          orgId,
          userId,
          importId: importRec.id,
          rows: parsed.data.rows,
          dryRun: parsed.data.dryRun,
        }),
      (err) => markOnboardingImportFailed(importRec.id, err),
    );

    return successResponse(
      { importId: importRec.id, status: "processing", totalRows: parsed.data.rows.length },
      undefined,
      202,
    );
  } catch (error) {
    console.error("POST /onboarding/candidates/bulk-import error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.onboarding.write"],
  rateLimit: { max: 3, windowSec: 60, by: "tenant", scope: "onboarding.bulk-import" },
});
