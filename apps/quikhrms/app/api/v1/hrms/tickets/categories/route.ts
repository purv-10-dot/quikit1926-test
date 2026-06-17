import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import {
  successResponse,
  validationError,
  internalError,
  conflict,
} from "@/lib/api-response";
import { createTicketCategorySchema } from "@/lib/validations/tickets";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");

    const where = {
      orgId,
      deletedAt: null,
      ...(search && { name: { contains: search, mode: "insensitive" as const } }),
      ...(isActive !== null && { isActive: isActive === "true" }),
    };

    const [categories, total] = await Promise.all([
      prisma.ticketCategory.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: { select: { id: true, name: true, code: true } },
          _count: { select: { tickets: { where: { deletedAt: null } } } },
        },
      }),
      prisma.ticketCategory.count({ where }),
    ]);

    return successResponse(categories, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /tickets/categories error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.read_assigned", "hrms.ticket.raise", "hrms.ticket.manage"],
  anyPermission: true,
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createTicketCategorySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.ticketCategory.findFirst({
      where: { orgId, slug: parsed.data.slug, deletedAt: null },
    });
    if (existing) return conflict("Category slug already exists");

    const { slaMatrix, ...rest } = parsed.data;
    const category = await prisma.ticketCategory.create({
      data: {
        orgId,
        ...rest,
        slaMatrix: (slaMatrix ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return successResponse(category, undefined, 201);
  } catch (error) {
    console.error("POST /tickets/categories error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.ticket.manage"] });
