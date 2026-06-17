import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound, conflict } from "@/lib/api-response";
import { updateSalaryComponentSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const record = await prisma.salaryComponent.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!record) return notFound();
    return successResponse(record);
  } catch (e) {
    console.error("GET /payroll/salary-components/[id] error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = updateSalaryComponentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const existing = await prisma.salaryComponent.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();

    const record = await prisma.salaryComponent.update({
      where: { id },
      data: { ...parsed.data, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Update", entityType: "SalaryComponent", entityId: id, changes: parsed.data });
    return successResponse(record);
  } catch (e) {
    console.error("PUT /payroll/salary-components/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.salaryComponent.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    if (existing.isSystem) return validationError("Cannot delete system component");

    const [usedInTemplates, usedInReimb, usedInOneTime, usedInPayslips] = await Promise.all([
      prisma.salaryStructureComponent.findMany({
        where: { orgId, componentId: id, structure: { deletedAt: null } },
        select: { structure: { select: { name: true } } },
      }),
      prisma.reimbursementClaim.count({
        where: {
          orgId,
          componentId: id,
          deletedAt: null,
          status: { in: ["Draft", "Submitted", "Approved"] },
        },
      }),
      prisma.oneTimeEarning.count({
        where: {
          orgId,
          componentCode: existing.code,
          deletedAt: null,
          status: { in: ["Pending", "Approved"] },
        },
      }),
      prisma.payslipLine.count({
        where: { orgId, OR: [{ componentId: id }, { componentCode: existing.code }] },
      }),
    ]);

    const blockers: string[] = [];
    if (usedInTemplates.length > 0) {
      const names = Array.from(new Set(usedInTemplates.map((u) => u.structure.name)));
      const preview = names.slice(0, 3).join(", ");
      const more = names.length > 3 ? ` +${names.length - 3} more` : "";
      blockers.push(`${names.length} salary template${names.length > 1 ? "s" : ""} (${preview}${more})`);
    }
    if (usedInReimb > 0) blockers.push(`${usedInReimb} pending reimbursement claim${usedInReimb > 1 ? "s" : ""}`);
    if (usedInOneTime > 0) blockers.push(`${usedInOneTime} pending one-time earning${usedInOneTime > 1 ? "s" : ""}`);
    if (usedInPayslips > 0) blockers.push(`${usedInPayslips} payslip line${usedInPayslips > 1 ? "s" : ""} (history)`);

    if (blockers.length > 0) {
      return conflict(`Cannot delete: in use by ${blockers.join(", ")}. Remove or settle those first.`);
    }

    await prisma.salaryComponent.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "SalaryComponent", entityId: id });
    return successResponse({ id });
  } catch (e) {
    console.error("DELETE /payroll/salary-components/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
