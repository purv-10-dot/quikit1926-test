import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { setupApprovalChainSchema, actApprovalSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { resolveEmployeeId } from "@/lib/resolve-employee";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const list = await prisma.payRunApproval.findMany({
      where: { orgId, payRunId: id },
      orderBy: { level: "asc" },
    });
    const empIds = [...new Set(list.map((r) => r.approverId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: empIds }, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : [];
    const map = new Map(employees.map((e) => [e.id, e]));
    return successResponse(list.map((r) => ({ ...r, approver: map.get(r.approverId) ?? null })));
  } catch (e) {
    console.error("GET /payroll/runs/[id]/approval-chain error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!run) return notFound();
    if (run.status === "Paid" || run.status === "Cancelled") {
      return validationError("Cannot setup approval chain for paid/cancelled run");
    }

    const body = await req.json();
    const parsed = setupApprovalChainSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // Wipe existing pending approvals & rebuild
    await prisma.payRunApproval.deleteMany({ where: { orgId, payRunId: id, status: "Pending" } });

    const created = await prisma.$transaction(parsed.data.approvers.map((a) =>
      prisma.payRunApproval.create({
        data: {
          orgId, payRunId: id,
          level: a.level,
          approverId: a.approverId,
          approverRole: a.approverRole ?? null,
          status: "Pending",
          createdBy: userId,
          updatedBy: userId,
        },
      }),
    ));
    await createAuditLog({
      orgId, userId, action: "Create", entityType: "PayRunApprovalChain", entityId: id,
      changes: { levels: parsed.data.approvers.length }, request: req,
    });
    return successResponse(created, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/runs/[id]/approval-chain error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const body = await req.json();
    const parsed = actApprovalSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // Find the lowest pending level
    const approvals = await prisma.payRunApproval.findMany({
      where: { orgId, payRunId: id }, orderBy: { level: "asc" },
    });
    const nextPending = approvals.find((a) => a.status === "Pending");
    if (!nextPending) return validationError("No pending approval");
    if (nextPending.approverId !== employeeId) {
      return validationError("Not your turn to approve");
    }

    const updated = await prisma.payRunApproval.update({
      where: { id: nextPending.id },
      data: {
        status: parsed.data.status,
        comments: parsed.data.comments ?? null,
        actedAt: new Date(),
        updatedBy: userId,
      },
    });

    if (parsed.data.status === "Rejected") {
      // Cascade: mark remaining as Skipped
      await prisma.payRunApproval.updateMany({
        where: { orgId, payRunId: id, status: "Pending" },
        data: { status: "Skipped", updatedBy: userId },
      });
      await prisma.payRun.update({ where: { id }, data: { status: "Cancelled", updatedBy: userId } });
    } else {
      // If all approvals done, advance pay run status to Approved
      const remaining = await prisma.payRunApproval.count({ where: { orgId, payRunId: id, status: "Pending" } });
      if (remaining === 0) {
        await prisma.payRun.update({
          where: { id },
          data: { status: "Approved", approvedBy: employeeId, approvedAt: new Date(), updatedBy: userId },
        });
      }
    }

    await createAuditLog({
      orgId, userId,
      action: parsed.data.status === "Approved" ? "Approve" : "Reject",
      entityType: "PayRunApproval", entityId: nextPending.id,
      changes: { ...parsed.data, level: nextPending.level }, request: req,
    });
    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /payroll/runs/[id]/approval-chain error:", e);
    return internalError();
  }
});
