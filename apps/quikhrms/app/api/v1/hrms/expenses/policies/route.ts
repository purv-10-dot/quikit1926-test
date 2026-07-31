import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createExpensePolicySchema } from "@/lib/validations/expenses";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const category = searchParams.get("category");
    const isActive = searchParams.get("isActive");

    const where = {
      orgId, deletedAt: null,
      ...(category && { category }),
      ...(isActive && { isActive: isActive === "true" }),
    };

    const [policies, total] = await Promise.all([
      prisma.expensePolicy.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.expensePolicy.count({ where }),
    ]);

    return successResponse(policies, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /expenses/policies error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.expense.read", "hrms.expense.manage"],
  anyPermission: true,
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createExpensePolicySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const { approvalChain, applicableTo, ...rest } = parsed.data;

    const policy = await prisma.expensePolicy.create({
      data: {
        orgId,
        ...rest,
        approvalChain: approvalChain ? JSON.parse(JSON.stringify(approvalChain)) : undefined,
        applicableTo: applicableTo ? JSON.parse(JSON.stringify(applicableTo)) : undefined,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "ExpensePolicy", entityId: policy.id });
    return successResponse(policy, undefined, 201);
  } catch (error) {
    console.error("POST /expenses/policies error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.expense.manage"] });
