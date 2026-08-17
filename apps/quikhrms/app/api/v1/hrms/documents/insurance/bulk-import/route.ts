import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

const MAX_ROWS = 200;

const rowSchema = z.object({
  title: z.string().trim().min(1, "Policy name required"),
  vendorName: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  expiryDate: z.string().trim().min(1, "Expiry date required"),
  notifyDaysBefore: z.number().int().min(0).max(365).optional(),
  notifyEmails: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1, "No rows found").max(MAX_ROWS, `Cannot import more than ${MAX_ROWS} policies at once`),
});

/**
 * POST /api/v1/hrms/documents/insurance/bulk-import
 *
 * Bulk-creates Insurance Document records from a spreadsheet. The actual
 * policy PDF/file can't come from a spreadsheet cell, so imported rows are
 * created without an attachment (fileUrl left empty) — HR opens each one
 * afterward (Documents → Insurance) and attaches the scanned policy, same
 * "finish manually" pattern used by the other bulk-import flows.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const errors: { row: number; error: string }[] = [];
    let created = 0;

    for (let i = 0; i < parsed.data.rows.length; i++) {
      const row = parsed.data.rows[i];
      const rowNum = i + 1;

      const expiry = new Date(row.expiryDate);
      if (Number.isNaN(expiry.getTime())) {
        errors.push({ row: rowNum, error: `Invalid expiry date: "${row.expiryDate}"` });
        continue;
      }
      let start: Date | undefined;
      if (row.startDate) {
        start = new Date(row.startDate);
        if (Number.isNaN(start.getTime())) {
          errors.push({ row: rowNum, error: `Invalid start date: "${row.startDate}"` });
          continue;
        }
      }

      // Notify emails are optional and best-effort — an unmatched address is
      // just skipped (not a row failure), same tolerance as other importers.
      let notifyEmployeeIds: string[] | undefined;
      if (row.notifyEmails) {
        const emails = row.notifyEmails.split(/[,;]/).map((e) => e.trim().toLowerCase()).filter(Boolean);
        if (emails.length) {
          const matched = await prisma.employee.findMany({
            where: { orgId, deletedAt: null, workEmail: { in: emails, mode: "insensitive" } },
            select: { id: true },
          });
          if (matched.length) notifyEmployeeIds = matched.map((e) => e.id);
        }
      }

      try {
        await prisma.document.create({
          data: {
            orgId,
            title: row.title,
            description: row.description || undefined,
            category: "Insurance",
            fileUrl: "",
            fileType: "application/octet-stream",
            fileSize: 0,
            status: "Active",
            expiryDate: expiry,
            uploadedBy: userId,
            metadata: {
              vendorName: row.vendorName || undefined,
              startDate: start ? row.startDate : undefined,
              notifyDaysBefore: row.notifyDaysBefore ?? 30,
              notifyEmployeeIds,
            },
            createdBy: userId,
            updatedBy: userId,
          },
        });
        created++;
      } catch (e) {
        errors.push({ row: rowNum, error: e instanceof Error ? e.message : "Failed to create" });
      }
    }

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Document", metadata: { bulkImport: "Insurance", created, failed: errors.length } });

    return successResponse({ created, failed: errors.length, errors });
  } catch (error) {
    console.error("POST /documents/insurance/bulk-import error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.document.write", "hrms.document.write_self"],
  anyPermission: true,
});
