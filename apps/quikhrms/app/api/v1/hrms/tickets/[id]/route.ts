import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import {
  successResponse,
  notFound,
  forbidden,
  validationError,
  internalError,
} from "@/lib/api-response";
import { updateTicketSchema } from "@/lib/validations/tickets";
import { canReadTicket, canSeeInternalComments } from "@/lib/utils/ticket-scope";
import {
  notifyTicketAssigned,
  notifyTicketStatusChange,
} from "@/lib/services/ticket-notifications";
import { scheduleSlaCheck, cancelSlaCheck } from "@/lib/services/ticket-sla-scheduler";
import { computeSlaDates } from "@/lib/utils/ticket-sla";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        department: { select: { id: true, name: true, code: true } },
        raisedBy: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, employeeCode: true },
            },
          },
        },
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
        activities: {
          orderBy: { createdAt: "asc" },
          include: {
            actor: {
              select: { id: true, firstName: true, lastName: true, employeeCode: true },
            },
          },
        },
      },
    });
    if (!ticket) return notFound("Ticket not found");
    if (!canReadTicket(ticket, userId, permissions)) {
      return notFound("Ticket not found");
    }

    if (!canSeeInternalComments(permissions)) {
      ticket.comments = ticket.comments.filter((c) => !c.isInternal);
    }

    return successResponse(ticket);
  } catch (error) {
    console.error("GET /tickets/:id error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.read_assigned"],
  anyPermission: true,
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.ticket.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Ticket not found");

    if (existing.assignedToId !== userId) {
      return forbidden("Only the assignee can edit this ticket");
    }

    const body = await req.json();
    const parsed = updateTicketSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;
    const now = new Date();

    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      // A new assignee must belong to the ticket's department (falls back to the
      // category's department for legacy category-based tickets).
      const deptId =
        data.departmentId ??
        existing.departmentId ??
        (existing.categoryId
          ? (await prisma.ticketCategory.findFirst({
              where: { id: existing.categoryId, orgId, deletedAt: null },
              select: { departmentId: true },
            }))?.departmentId ?? null
          : null);
      if (deptId) {
        const assignee = await prisma.employee.findFirst({
          where: { id: data.assignedToId, orgId, deletedAt: null },
          select: { departmentId: true },
        });
        if (!assignee) return notFound("Assignee not found");
        if (assignee.departmentId !== deptId) {
          return validationError(
            "Assignee must belong to the ticket's department",
            { assignedToId: ["Employee is not in the ticket's department"] },
          );
        }
      }
    }

    const updateData: Record<string, unknown> = { ...data, updatedBy: userId };

    if (data.status && data.status !== existing.status) {
      if (data.status === "Resolved" && !existing.resolvedAt) {
        updateData.resolvedAt = now;
      }
      if (data.status === "Closed" && !existing.closedAt) {
        updateData.closedAt = now;
      }
      if (data.status === "Reopened") {
        updateData.reopenedAt = now;
        updateData.reopenCount = existing.reopenCount + 1;
        updateData.resolvedAt = null;
        updateData.closedAt = null;

        // Reset SLA timers + clear breach state. Use the category's SLA when the
        // ticket is category-based; otherwise fall back to the default SLA.
        const category = existing.categoryId
          ? await prisma.ticketCategory.findFirst({
              where: { id: existing.categoryId, orgId, deletedAt: null },
              select: { slaResponseHours: true, slaResolveHours: true, slaMatrix: true },
            })
          : null;
        const due = computeSlaDates(category, data.priority ?? existing.priority, now);
        updateData.slaResponseDueAt = due.slaResponseDueAt;
        updateData.slaResolveDueAt = due.slaResolveDueAt;
        updateData.firstResponseAt = null;
        updateData.responseBreachedAt = null;
        updateData.resolveBreachedAt = null;
        updateData.escalationLevel = 0;
      }
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const activities: { action: string; fromVal?: string; toVal?: string }[] = [];

      if (data.status && data.status !== existing.status) {
        activities.push({
          action: "StatusChanged",
          fromVal: existing.status,
          toVal: data.status,
        });
      }
      if (data.priority && data.priority !== existing.priority) {
        activities.push({
          action: "PriorityChanged",
          fromVal: existing.priority,
          toVal: data.priority,
        });
      }
      if (
        data.assignedToId !== undefined &&
        data.assignedToId !== existing.assignedToId
      ) {
        activities.push({
          action: data.assignedToId ? "Assigned" : "Unassigned",
          fromVal: existing.assignedToId ?? undefined,
          toVal: data.assignedToId ?? undefined,
        });
      }
      if (data.categoryId && data.categoryId !== existing.categoryId) {
        activities.push({
          action: "CategoryChanged",
          fromVal: existing.categoryId ?? undefined,
          toVal: data.categoryId,
        });
      }

      const updated = await tx.ticket.update({
        where: { id: params.id },
        data: updateData,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          department: { select: { id: true, name: true, code: true } },
          raisedBy: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      });

      if (activities.length > 0) {
        await tx.ticketActivity.createMany({
          data: activities.map((a) => ({
            orgId,
            ticketId: params.id,
            actorId: userId,
            action: a.action,
            fromVal: a.fromVal,
            toVal: a.toVal,
          })),
        });
      }

      return updated;
    });

    const ticketLite = {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      title: ticket.title,
      raisedById: ticket.raisedById,
      assignedToId: ticket.assignedToId,
    };

    if (data.status && data.status !== existing.status) {
      await notifyTicketStatusChange(
        orgId,
        ticketLite,
        existing.status,
        data.status,
        userId
      );
    }

    if (
      data.assignedToId !== undefined &&
      data.assignedToId !== existing.assignedToId &&
      data.assignedToId
    ) {
      await notifyTicketAssigned(orgId, ticketLite, data.assignedToId, userId);
    }

    // SLA scheduling side-effects.
    if (data.status && data.status !== existing.status) {
      const closedSet = new Set(["Resolved", "Closed", "Cancelled"]);
      if (data.status === "Reopened") {
        // Re-schedule with refreshed due dates set in updateData above.
        const newResponseDue = updateData.slaResponseDueAt as Date | undefined;
        const newResolveDue = updateData.slaResolveDueAt as Date | undefined;
        await Promise.all([
          scheduleSlaCheck(orgId, ticket.id, "response", newResponseDue ?? null),
          scheduleSlaCheck(orgId, ticket.id, "resolve", newResolveDue ?? null),
        ]).catch((err) => console.error("[sla-schedule] reopen failed:", err));
      } else if (closedSet.has(data.status)) {
        await Promise.all([
          cancelSlaCheck(ticket.id, "response"),
          cancelSlaCheck(ticket.id, "resolve"),
        ]).catch((err) => console.error("[sla-schedule] cancel failed:", err));
      }
    }

    return successResponse(ticket);
  } catch (error) {
    console.error("PATCH /tickets/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.ticket.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.ticket.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Ticket not found");

    await prisma.ticket.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /tickets/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.ticket.delete"] });
