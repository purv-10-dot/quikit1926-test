import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createExpenseClaimSchema } from "@/lib/validations/expenses";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { forbidden } from "@/lib/api-response";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const employeeId = searchParams.get("employeeId");
    const category = searchParams.get("category");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const scope = resolveScope(ctx, {
      all: "hrms.expense.read",
      team: "hrms.expense.read_team",
      self: "hrms.expense.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No expense read permission");

    // Draft claims are private to their owner — approvers/admins viewing
    // beyond their own records must never see someone else's unsubmitted draft.
    const callerId = await getCallerEmployeeId(ctx);

    const where: Prisma.ExpenseClaimWhereInput = {
      orgId, deletedAt: null,
      ...(status && { status: status as Prisma.EnumExpenseClaimStatusFilter["equals"] }),
      ...(employeeId && { employeeId }),
      ...(category && { category: category as Prisma.EnumExpenseCategoryFilter["equals"] }),
      ...(scopeFilter.employeeIds && { employeeId: { in: scopeFilter.employeeIds } }),
      ...(from || to ? {
        expenseDate: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      } : {}),
      OR: [
        { status: { not: "Draft" } },
        ...(callerId ? [{ employeeId: callerId }] : []),
      ],
    };

    const [claims, total] = await Promise.all([
      prisma.expenseClaim.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          policy: { select: { id: true, name: true } },
          _count: { select: { approvals: true } },
        },
      }),
      prisma.expenseClaim.count({ where }),
    ]);

    return successResponse(claims, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /expenses/claims error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createExpenseClaimSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const { expenseDate, ...rest } = parsed.data;

    const policy = await prisma.expensePolicy.findFirst({
      where: { id: rest.policyId, orgId, deletedAt: null, isActive: true },
    });
    if (!policy) return validationError("Selected policy is invalid or inactive");
    if (policy.category !== rest.category) {
      return validationError(`Category "${rest.category}" does not match policy category "${policy.category}"`);
    }
    if (policy.maxPerTransaction != null && Number(rest.totalAmount) > Number(policy.maxPerTransaction)) {
      return validationError(`Amount exceeds policy limit of ${policy.maxPerTransaction} per transaction`);
    }
    if (policy.requiresReceipt && Number(rest.totalAmount) > Number(policy.receiptThreshold) && !rest.receiptUrl) {
      return validationError(`Receipt required for amounts above ${policy.receiptThreshold}`);
    }

    const claim = await prisma.expenseClaim.create({
      data: {
        orgId,
        employeeId: userId,
        ...rest,
        expenseDate: expenseDate ? new Date(expenseDate) : null,
        status: "Draft",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "ExpenseClaim", entityId: claim.id });
    return successResponse(claim, undefined, 201);
  } catch (error) {
    console.error("POST /expenses/claims error:", error);
    return internalError();
  }
});
