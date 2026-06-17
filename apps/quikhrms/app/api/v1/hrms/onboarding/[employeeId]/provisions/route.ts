import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { createEmployeeProvisionSchema, applyCatalogueSchema } from "@/lib/validations/provisions";
import { createAuditLog } from "@/lib/utils/audit";

interface CatalogueScope {
  departmentIds?: string[];
  roleIds?: string[];
  designationIds?: string[];
}

/** GET — list provisions for an employee */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return notFound("Employee not found");

    const provisions = await prisma.employeeProvision.findMany({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { item: { select: { id: true, name: true, category: true } } },
    });
    return successResponse(provisions);
  } catch (error) {
    console.error("GET /onboarding/[employeeId]/provisions error:", error);
    return internalError();
  }
});

/** POST — add a single provision to an employee */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.employeeId, orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) return notFound("Employee not found");

    const body = await req.json();
    const parsed = createEmployeeProvisionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const provision = await prisma.employeeProvision.create({
      data: {
        orgId,
        employeeId: params.employeeId,
        provisionItemId: data.provisionItemId ?? null,
        name: data.name,
        category: data.category,
        status: data.status,
        assignedTo: data.assignedTo ?? null,
        notes: data.notes ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        meta: data.meta ? JSON.parse(JSON.stringify(data.meta)) : undefined,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "EmployeeProvision", entityId: provision.id,
      changes: { employeeId: params.employeeId, name: provision.name, category: provision.category },
    });

    return successResponse(provision, undefined, 201);
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/provisions error:", error);
    return internalError();
  }
});

/** PUT — bulk-apply catalogue items to an employee based on scope + role/dept/designation */
export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.employeeId, orgId, deletedAt: null },
      select: {
        id: true,
        departmentId: true,
        designationId: true,
        appRoles: { select: { roleId: true }, take: 1 },
      },
    });
    if (!employee) return notFound("Employee not found");
    const employeeRoleId = employee.appRoles[0]?.roleId ?? null;

    const body = await req.json();
    const parsed = applyCatalogueSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { onlyDefaults, itemIds } = parsed.data;

    const catalogue = await prisma.provisionItem.findMany({
      where: {
        orgId, deletedAt: null, isActive: true,
        ...(itemIds?.length ? { id: { in: itemIds } } : onlyDefaults ? { isDefault: true } : {}),
      },
    });

    // Filter by scope (empty scope = applies everywhere)
    const applicable = catalogue.filter((item) => {
      const scope = {
        departmentIds: (item.departmentIds as string[] | null) ?? [],
        roleIds: (item.roleIds as string[] | null) ?? [],
        designationIds: (item.designationIds as string[] | null) ?? [],
      } as CatalogueScope;
      if (scope.departmentIds!.length && !scope.departmentIds!.includes(employee.departmentId ?? "")) return false;
      if (scope.roleIds!.length && !scope.roleIds!.includes(employeeRoleId ?? "")) return false;
      if (scope.designationIds!.length && !scope.designationIds!.includes(employee.designationId ?? "")) return false;
      return true;
    });

    // Avoid duplicates — skip items already provisioned to this employee
    const existingLinks = await prisma.employeeProvision.findMany({
      where: { orgId, employeeId: params.employeeId, deletedAt: null, provisionItemId: { in: applicable.map((i) => i.id) } },
      select: { provisionItemId: true },
    });
    const existingIds = new Set(existingLinks.map((l) => l.provisionItemId));
    const toCreate = applicable.filter((i) => !existingIds.has(i.id));

    if (toCreate.length === 0) {
      return successResponse({ added: 0, skipped: applicable.length });
    }

    await prisma.employeeProvision.createMany({
      data: toCreate.map((item) => ({
        orgId,
        employeeId: params.employeeId,
        provisionItemId: item.id,
        name: item.name,
        category: item.category,
        status: "ProvPending",
        createdBy: userId,
        updatedBy: userId,
      })),
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "EmployeeProvision", entityId: params.employeeId,
      changes: { action: "BulkApplyCatalogue", added: toCreate.length, fromIds: toCreate.map((i) => i.id) },
    });

    return successResponse({ added: toCreate.length, skipped: applicable.length - toCreate.length });
  } catch (error) {
    console.error("PUT /onboarding/[employeeId]/provisions error:", error);
    return internalError();
  }
});
