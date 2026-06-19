import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createOneTimeEarningSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { defaultsForKindForTenant, type OneTimeKind } from "@/lib/services/one-time-defaults";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const employeeId = url.searchParams.get("employeeId");
    const periodStart = url.searchParams.get("periodStart");
    const periodEnd = url.searchParams.get("periodEnd");

    const where: Record<string, unknown> = { orgId, deletedAt: null };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (periodStart && periodEnd) {
      where.payPeriod = { gte: new Date(periodStart), lte: new Date(periodEnd) };
    }

    const items = await prisma.oneTimeEarning.findMany({
      where,
      orderBy: [{ payPeriod: "desc" }, { createdAt: "desc" }],
    });

    const empIds = [...new Set(items.map((i) => i.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: empIds }, deletedAt: null },
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const rows = items.map((it) => ({ ...it, employee: empMap.get(it.employeeId) ?? null }));
    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/one-time-earnings error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createOneTimeEarningSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return validationError("Employee not found");

    // Statutory flags are server-authoritative — derived from Kind so the
    // same kind is treated identically across all entries (Form 16 / 24Q
    // consistency). Client-supplied flags are ignored. Tenant can override
    // the global defaults via Settings; falls back to hardcoded if not set.
    const flags = await defaultsForKindForTenant(orgId, parsed.data.kind as OneTimeKind);

    const record = await prisma.oneTimeEarning.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        kind: parsed.data.kind,
        category: parsed.data.category,
        componentCode: parsed.data.componentCode.toUpperCase(),
        componentName: parsed.data.componentName,
        amount: parsed.data.amount,
        payPeriod: new Date(parsed.data.payPeriod),
        taxable: flags.taxable,
        considerForEPF: flags.considerForEPF,
        considerForESI: flags.considerForESI,
        considerForPT: flags.considerForPT,
        reason: parsed.data.reason ?? null,
        status: "Pending",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId, action: "Create",
      entityType: "OneTimeEarning", entityId: record.id, changes: parsed.data,
      request: req,
    });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/one-time-earnings error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
