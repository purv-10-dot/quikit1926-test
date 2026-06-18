import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound, forbidden } from "@/lib/api-response";
import { employeeSubmitClaimSchema } from "@/lib/validations/payroll";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createAuditLog } from "@/lib/utils/audit";
import { Prisma } from "@quikit/database";

type ClaimKind = "FBP" | "Reimbursement";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const url = new URL(req.url);
    const kind = (url.searchParams.get("type") as ClaimKind | null) ?? null;
    const status = url.searchParams.get("status");

    const claims = await prisma.reimbursementClaim.findMany({
      where: {
        orgId,
        deletedAt: null,
        employeeId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (!kind) {
      return successResponse(claims);
    }

    const componentIds = [...new Set(claims.map((c) => c.componentId).filter((v): v is string => !!v))];
    const components = componentIds.length
      ? await prisma.salaryComponent.findMany({
          where: { orgId, id: { in: componentIds } },
          select: { id: true, isFBP: true },
        })
      : [];
    const fbpMap = new Map(components.map((c) => [c.id, c.isFBP]));

    const filtered = claims.filter((c) => {
      const isFbp = c.componentId ? fbpMap.get(c.componentId) ?? false : false;
      return kind === "FBP" ? isFbp : !isFbp;
    });
    return successResponse(filtered);
  } catch (e) {
    console.error("GET /payroll/my-claims error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const body = await req.json();
    const parsed = employeeSubmitClaimSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const url = new URL(req.url);
    const kind = (url.searchParams.get("type") as ClaimKind | null) ?? "Reimbursement";

    // Two paths into this endpoint:
    //   (a) Reimbursement — form sends `category: "Fuel"` (no componentId).
    //       We save the string straight onto componentName, no lookup. HR
    //       controls disbursed amount at approval time via amountApproved.
    //   (b) FBP — form sends `componentId` pointing to a Reimbursement-type
    //       SalaryComponent with isFBP=true (legacy path, unchanged).
    let componentIdToSave: string | null = null;
    let componentNameToSave: string;

    if (parsed.data.category && !parsed.data.componentId) {
      // Path (a): free-form Reimbursement category.
      if (kind === "FBP") return forbidden("FBP requires a configured component, not a free category");
      componentNameToSave = parsed.data.category.trim();
    } else {
      // Path (b): legacy component-backed claim (still used by FBP).
      const component = await prisma.salaryComponent.findFirst({
        where: {
          orgId,
          id: parsed.data.componentId!,
          deletedAt: null,
          isActive: true,
          type: "Reimbursement",
        },
        select: { id: true, name: true, isFBP: true },
      });
      if (!component) return notFound("Component not found");
      if (kind === "FBP" && !component.isFBP) return forbidden("Component is not an FBP component");
      if (kind === "Reimbursement" && component.isFBP) return forbidden("Component is FBP — submit under FBP tab");
      componentIdToSave = component.id;
      componentNameToSave = component.name;
    }

    // Attachments handling — Prisma JsonNull sentinel for null, array for
    // non-empty. fileUrl mirrors attachments[0].url for backward compat
    // (UI displays + Form 24Q legacy consumers still read fileUrl).
    const attachments = parsed.data.attachments ?? [];
    const attachmentsValue =
      attachments.length > 0
        ? (attachments as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    const primaryFileUrl =
      parsed.data.fileUrl ?? attachments[0]?.url ?? null;

    const record = await prisma.reimbursementClaim.create({
      data: {
        orgId,
        employeeId,
        componentId: componentIdToSave,
        componentName: componentNameToSave,
        title: parsed.data.title ?? null,
        billDate: new Date(parsed.data.billDate),
        billDateTo: parsed.data.billDateTo ? new Date(parsed.data.billDateTo) : null,
        billNumber: parsed.data.billNumber ?? null,
        merchantName: parsed.data.merchantName ?? null,
        currency: parsed.data.currency ?? "INR",
        isProject: parsed.data.isProject ?? false,
        amountClaimed: parsed.data.amountClaimed,
        fileUrl: primaryFileUrl,
        attachments: attachmentsValue,
        description: parsed.data.description ?? null,
        status: "Submitted",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId,
      userId,
      action: "Create",
      entityType: "ReimbursementClaim",
      entityId: record.id,
      changes: { ...parsed.data, kind, employeeId },
    });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/my-claims error:", e);
    return internalError();
  }
});
