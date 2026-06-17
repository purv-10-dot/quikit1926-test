import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import {
  successResponse,
  notFound,
  validationError,
  internalError,
} from "@/lib/api-response";
import { createTicketAttachmentSchema } from "@/lib/validations/tickets";
import { canReadTicket, canWriteTicket } from "@/lib/utils/ticket-scope";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, raisedById: true, assignedToId: true },
    });
    if (!ticket) return notFound("Ticket not found");
    if (!canReadTicket(ticket, userId, permissions)) {
      return notFound("Ticket not found");
    }

    const attachments = await prisma.ticketAttachment.findMany({
      where: { orgId, ticketId: params.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(attachments);
  } catch (error) {
    console.error("GET /tickets/:id/attachments error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.read_assigned"],
  anyPermission: true,
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, raisedById: true, assignedToId: true },
    });
    if (!ticket) return notFound("Ticket not found");
    if (!canWriteTicket(ticket, userId, permissions)) {
      return notFound("Ticket not found");
    }

    const body = await req.json();
    const parsed = createTicketAttachmentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.ticketAttachment.create({
        data: {
          orgId,
          ticketId: params.id,
          uploadedById: userId,
          ...parsed.data,
        },
      });

      await tx.ticketActivity.create({
        data: {
          orgId,
          ticketId: params.id,
          actorId: userId,
          action: "AttachmentAdded",
          toVal: created.fileName,
        },
      });

      return created;
    });

    return successResponse(attachment, undefined, 201);
  } catch (error) {
    console.error("POST /tickets/:id/attachments error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.write", "hrms.ticket.raise"],
  anyPermission: true,
});
