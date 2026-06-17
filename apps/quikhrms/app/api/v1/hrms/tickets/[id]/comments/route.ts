import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import {
  successResponse,
  notFound,
  validationError,
  internalError,
} from "@/lib/api-response";
import { createTicketCommentSchema } from "@/lib/validations/tickets";
import { canReadTicket, canSeeInternalComments, canWriteTicket } from "@/lib/utils/ticket-scope";
import { notifyTicketComment } from "@/lib/services/ticket-notifications";
import { cancelSlaCheck } from "@/lib/services/ticket-sla-scheduler";

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

    const comments = await prisma.ticketComment.findMany({
      where: {
        orgId,
        ticketId: params.id,
        deletedAt: null,
        ...(canSeeInternalComments(permissions) ? {} : { isInternal: false }),
      },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    });

    return successResponse(comments);
  } catch (error) {
    console.error("GET /tickets/:id/comments error:", error);
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
    });
    if (!ticket) return notFound("Ticket not found");
    if (!canWriteTicket(ticket, userId, permissions)) {
      return notFound("Ticket not found");
    }

    const body = await req.json();
    const parsed = createTicketCommentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // Block internal-note flag from raiser without write perm
    if (parsed.data.isInternal && !canSeeInternalComments(permissions)) {
      return validationError("Internal notes require ticket write permission");
    }

    const now = new Date();
    const willBeFirstAgentResponse =
      !ticket.firstResponseAt && userId !== ticket.raisedById && !parsed.data.isInternal;

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          orgId,
          ticketId: params.id,
          userId,
          message: parsed.data.message,
          isInternal: parsed.data.isInternal,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      });

      const isFirstAgentResponse =
        !ticket.firstResponseAt && userId !== ticket.raisedById && !parsed.data.isInternal;

      if (isFirstAgentResponse) {
        await tx.ticket.update({
          where: { id: params.id },
          data: { firstResponseAt: now },
        });
      }

      await tx.ticketActivity.create({
        data: {
          orgId,
          ticketId: params.id,
          actorId: userId,
          action: parsed.data.isInternal ? "InternalNoteAdded" : "CommentAdded",
        },
      });

      return created;
    });

    await notifyTicketComment(
      orgId,
      {
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        title: ticket.title,
        raisedById: ticket.raisedById,
        assignedToId: ticket.assignedToId,
      },
      userId,
      parsed.data.isInternal
    );

    if (willBeFirstAgentResponse) {
      await cancelSlaCheck(ticket.id, "response").catch((err) =>
        console.error("[sla-schedule] cancel response failed:", err),
      );
    }

    return successResponse(comment, undefined, 201);
  } catch (error) {
    console.error("POST /tickets/:id/comments error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.write", "hrms.ticket.raise"],
  anyPermission: true,
});
