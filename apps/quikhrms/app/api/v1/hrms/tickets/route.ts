import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import {
  successResponse,
  validationError,
  internalError,
  notFound,
} from "@/lib/api-response";
import { createTicketSchema } from "@/lib/validations/tickets";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { generateTicketNumber } from "@/lib/utils/ticket-number";
import { notifyTicketCreated } from "@/lib/services/ticket-notifications";
import { scheduleSlaCheck } from "@/lib/services/ticket-sla-scheduler";
import { computeSlaDates } from "@/lib/utils/ticket-sla";

export const GET = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const categoryId = searchParams.get("categoryId");
    const departmentId = searchParams.get("departmentId");
    const assignedToId = searchParams.get("assignedToId");
    const raisedById = searchParams.get("raisedById");

    // Scope guard: if user lacks broad read, narrow to own raised + assigned.
    const hasFullRead = permissions.includes("*") || permissions.includes("hrms.ticket.read");
    const canReadAssigned = permissions.includes("hrms.ticket.read_assigned");
    const canReadSelf = permissions.includes("hrms.ticket.read_self");

    const scopeFilter = hasFullRead
      ? {}
      : {
          OR: [
            ...(canReadSelf ? [{ raisedById: userId }] : []),
            ...(canReadAssigned ? [{ assignedToId: userId }] : []),
          ],
        };

    const where = {
      orgId,
      deletedAt: null,
      ...scopeFilter,
      ...(status && { status: status as never }),
      ...(priority && { priority: priority as never }),
      ...(categoryId && { categoryId }),
      ...(departmentId && { departmentId }),
      ...(assignedToId && { assignedToId }),
      ...(raisedById && { raisedById }),
      ...(search && {
        AND: [
          {
            OR: [
              { ticketNo: { contains: search, mode: "insensitive" as const } },
              { title: { contains: search, mode: "insensitive" as const } },
            ],
          },
        ],
      }),
    };

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          ticketNo: true,
          title: true,
          priority: true,
          status: true,
          source: true,
          createdAt: true,
          slaResolveDueAt: true,
          resolvedAt: true,
          closedAt: true,
          resolveBreachedAt: true,
          escalationLevel: true,
          category: { select: { id: true, name: true, slug: true } },
          department: { select: { id: true, name: true, code: true } },
          raisedBy: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          _count: { select: { comments: true, attachments: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return successResponse(tickets, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /tickets error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.read_assigned"],
  anyPermission: true,
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createTicketSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // Resolve the target department (tickets are raised against a department).
    const department = await prisma.department.findFirst({
      where: {
        id: parsed.data.departmentId,
        orgId,
        deletedAt: null,
        status: "Active",
      },
      select: { id: true, headId: true },
    });
    if (!department) return notFound("Department not found or inactive");

    const raiser = await prisma.employee.findFirst({
      where: { id: userId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!raiser) return notFound("Raiser employee not found");

    const ticketNo = await generateTicketNumber(orgId);

    const now = new Date();
    // No category → fall back to the default SLA (DEFAULT_SLA inside computeSlaDates).
    const { slaResponseDueAt, slaResolveDueAt } = computeSlaDates(null, parsed.data.priority, now);

    // The raiser may route the ticket to a teammate in the chosen department, but
    // never to themselves.
    if (parsed.data.assignedToId && parsed.data.assignedToId === raiser.id) {
      return validationError("You cannot assign a ticket to yourself", {
        assignedToId: ["Cannot self-assign a ticket you raise"],
      });
    }

    // An explicitly chosen assignee must belong to the selected department.
    if (parsed.data.assignedToId) {
      const assignee = await prisma.employee.findFirst({
        where: { id: parsed.data.assignedToId, orgId, deletedAt: null },
        select: { departmentId: true },
      });
      if (!assignee) return notFound("Assignee not found");
      if (assignee.departmentId !== department.id) {
        return validationError(
          "Assignee must belong to the selected department",
          { assignedToId: ["Employee is not in the selected department"] },
        );
      }
    }

    // Auto-route when nothing was picked: department head first, otherwise a
    // random active member of the department (never the raiser). Stays unassigned
    // only if the department has no other active members.
    let assignedToId = parsed.data.assignedToId ?? null;
    if (!assignedToId) {
      assignedToId =
        department.headId && department.headId !== raiser.id ? department.headId : null;
      if (!assignedToId) {
        const pool = await prisma.employee.findMany({
          where: {
            orgId,
            deletedAt: null,
            status: "Active",
            departmentId: department.id,
            id: { not: raiser.id },
          },
          select: { id: true },
        });
        assignedToId = pool.length
          ? pool[Math.floor(Math.random() * pool.length)].id
          : null;
      }
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          orgId,
          ticketNo,
          title: parsed.data.title,
          description: parsed.data.description,
          departmentId: department.id,
          priority: parsed.data.priority,
          source: parsed.data.source,
          raisedById: userId,
          assignedToId,
          slaResponseDueAt,
          slaResolveDueAt,
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          raisedBy: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      });

      await tx.ticketActivity.create({
        data: {
          orgId,
          ticketId: created.id,
          actorId: userId,
          action: "Created",
          toVal: created.status,
        },
      });

      if (assignedToId) {
        await tx.ticketActivity.create({
          data: {
            orgId,
            ticketId: created.id,
            actorId: userId,
            action: "Assigned",
            toVal: assignedToId,
          },
        });
      }

      return created;
    });

    await notifyTicketCreated(
      orgId,
      {
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        title: ticket.title,
        raisedById: ticket.raisedById,
        assignedToId: ticket.assignedToId,
      },
      userId
    );

    // Schedule precise SLA breach checks (delayed jobs fire at exact due time).
    // Hourly sweep remains as safety net.
    await Promise.all([
      scheduleSlaCheck(orgId, ticket.id, "response", slaResponseDueAt),
      scheduleSlaCheck(orgId, ticket.id, "resolve", slaResolveDueAt),
    ]).catch((err) => console.error("[sla-schedule] create failed:", err));

    return successResponse(ticket, undefined, 201);
  } catch (error) {
    console.error("POST /tickets error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.ticket.raise"] });
