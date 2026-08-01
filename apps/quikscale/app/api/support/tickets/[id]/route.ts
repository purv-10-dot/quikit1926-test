/**
 * GET /api/support/tickets/[id] — detail + response thread for ONE ticket the
 * caller raised. Ownership (`orgId` + `userId`) is part of the Prisma `where`,
 * so a ticket belonging to another user or org is indistinguishable from a
 * ticket that does not exist (404) — no existence oracle.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { toAuditInfo } from "@/lib/api/auditUsers";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const ticket = await db.supportTicket.findFirst({
      where: { id: params.id, orgId, userId },
      select: {
        id: true,
        ticketNo: true,
        subject: true,
        description: true,
        requestType: true,
        status: true,
        priority: true,
        adminResponse: true,
        respondedById: true,
        respondedAt: true,
        resolvedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            authorId: true,
            authorRole: true,
            body: true,
            statusFrom: true,
            statusTo: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 },
      );
    }

    // Neither model FKs to User (matching Notification.userId / AuditLog.actorId),
    // so resolve every author in ONE batched query rather than per message.
    const authorIds = [
      ...new Set(ticket.messages.map((m) => m.authorId).filter(Boolean)),
    ];
    const authors = authorIds.length
      ? await db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(
      authors.map((u) => [u.id, toAuditInfo(u.firstName, u.lastName).name]),
    );

    return NextResponse.json({
      success: true,
      data: {
        ...ticket,
        messages: ticket.messages.map((m) => ({
          ...m,
          authorName:
            m.authorRole === "super_admin"
              ? "QuikIT Support"
              : nameById.get(m.authorId) ?? "—",
        })),
      },
    });
  },
  { fallbackErrorMessage: "Failed to load support ticket" },
);
