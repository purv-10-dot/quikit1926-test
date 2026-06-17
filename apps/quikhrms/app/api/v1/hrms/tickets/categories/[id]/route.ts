import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import {
  successResponse,
  notFound,
  validationError,
  internalError,
  conflict,
} from "@/lib/api-response";
import { updateTicketCategorySchema } from "@/lib/validations/tickets";
import { Prisma } from "@quikit/database";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const category = await prisma.ticketCategory.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        _count: { select: { tickets: { where: { deletedAt: null } } } },
      },
    });
    if (!category) return notFound("Category not found");
    return successResponse(category);
  } catch (error) {
    console.error("GET /tickets/categories/:id error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.read_assigned", "hrms.ticket.raise", "hrms.ticket.manage"],
  anyPermission: true,
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.ticketCategory.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Category not found");

    const body = await req.json();
    const parsed = updateTicketCategorySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const dup = await prisma.ticketCategory.findFirst({
        where: { orgId, slug: parsed.data.slug, deletedAt: null, NOT: { id: params.id } },
      });
      if (dup) return conflict("Category slug already exists");
    }

    const { slaMatrix, ...rest } = parsed.data;
    const data: Prisma.TicketCategoryUpdateInput = { ...rest, updatedBy: userId };
    if (slaMatrix !== undefined) {
      data.slaMatrix = (slaMatrix ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;
    }
    const category = await prisma.ticketCategory.update({
      where: { id: params.id },
      data,
    });
    return successResponse(category);
  } catch (error) {
    console.error("PATCH /tickets/categories/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.ticket.manage"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.ticketCategory.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Category not found");

    const inUse = await prisma.ticket.count({
      where: { orgId, categoryId: params.id, deletedAt: null },
    });
    if (inUse > 0) return conflict(`Category in use by ${inUse} ticket(s)`);

    await prisma.ticketCategory.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /tickets/categories/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.ticket.manage"] });
