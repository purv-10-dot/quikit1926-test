import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createImportSchema } from "@/lib/validations/system";
import { createAuditLog } from "@/lib/utils/audit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

/** GET — list imports */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const where = { orgId };

    const [imports, total] = await Promise.all([
      prisma.dataImport.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.dataImport.count({ where }),
    ]);
    return successResponse(imports, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /data/import error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.settings.read"] });

/** POST — import data */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createImportSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { entityType, fileName, data } = parsed.data;

    const importRecord = await prisma.dataImport.create({
      data: { orgId, entityType, fileName, totalRows: data.length, status: "ImportProcessing", createdBy: userId },
    });

    let successCount = 0;
    let failCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i];
        switch (entityType) {
          case "departments":
            await prisma.department.create({
              data: { orgId, name: row.name as string, code: row.code as string, createdBy: userId, updatedBy: userId },
            });
            break;
          case "designations":
            await prisma.designation.create({
              data: { orgId, title: row.title as string, level: (row.level as number) ?? 0, createdBy: userId, updatedBy: userId },
            });
            break;
          default:
            throw new Error(`Import not supported for ${entityType}`);
        }
        successCount++;
      } catch (err) {
        failCount++;
        errors.push({ row: i + 1, error: (err as Error).message });
      }
    }

    const status = failCount === 0 ? "ImportCompleted" : successCount === 0 ? "ImportFailed" : "ImportPartial";

    const updated = await prisma.dataImport.update({
      where: { id: importRecord.id },
      data: {
        processedRows: data.length,
        successRows: successCount,
        failedRows: failCount,
        errors: errors.length > 0 ? JSON.parse(JSON.stringify(errors)) : undefined,
        status,
      },
    });

    await createAuditLog({ orgId, userId, action: "Import", entityType, metadata: { importId: importRecord.id, total: data.length, success: successCount, failed: failCount } });

    return successResponse(updated, undefined, 201);
  } catch (error) { console.error("POST /data/import error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.settings.write"] });
