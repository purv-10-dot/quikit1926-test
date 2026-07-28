import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/** POST /api/v1/hrms/data/export — export entity data */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const entityType = body.entityType as string;
    if (!entityType) return validationError("entityType required");

    let data: unknown[] = [];

    switch (entityType) {
      case "employees":
        // Explicit column allow-list — never dump the full Employee model
        // (which would include auth secrets like passwordHash/authUserId and
        // bank details) via a bare `include`.
        data = await prisma.employee.findMany({
          where: { orgId, deletedAt: null },
          select: {
            id: true, employeeCode: true,
            firstName: true, middleName: true, lastName: true, displayName: true,
            gender: true, dateOfBirth: true, maritalStatus: true, nationality: true,
            workEmail: true, personalEmail: true, personalPhone: true, workPhone: true,
            jobTitle: true, employmentType: true, workerType: true, workLocation: true, status: true,
            dateOfJoining: true, confirmationDate: true, probationEndDate: true, lastWorkingDate: true,
            panNumber: true, aadhaarNumber: true, uanNumber: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
            officeLocation: { select: { name: true, city: true } },
          },
        });
        break;
      case "departments":
        data = await prisma.department.findMany({ where: { orgId, deletedAt: null } });
        break;
      case "designations":
        data = await prisma.designation.findMany({ where: { orgId, deletedAt: null } });
        break;
      case "leave-balances":
        data = await prisma.leaveBalance.findMany({
          where: { orgId, deletedAt: null },
          include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, leaveType: { select: { name: true, code: true } } },
        });
        break;
      default:
        return validationError(`Export not supported for ${entityType}`);
    }

    await createAuditLog({ orgId, userId, action: "Export", entityType, metadata: { recordCount: data.length } });

    return successResponse({ entityType, data, totalRows: data.length, exportedAt: new Date() });
  } catch (error) { console.error("POST /data/export error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.settings.write"] });
