/**
 * Super-admin ticket detail + triage.
 *
 *   GET   — full ticket, requester/org context and the response thread
 *   PATCH — change status / priority and/or add an admin response
 *
 * PATCH is transactional: the ticket update and the SupportTicketMessage that
 * records it either both land or neither does, so the thread can never drift
 * from the ticket's current status.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import {
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_PRIORITIES,
  canTransitionSupportStatus,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from "@quikit/shared";

const TICKET_SELECT = {
  id: true,
  ticketNo: true,
  orgId: true,
  userId: true,
  appId: true,
  appSlug: true,
  roleName: true,
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
  org: { select: { name: true, slug: true } },
} as const;

/** Batched name lookup shared by GET and PATCH responses. */
async function hydrateNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(
    users.map((u) => [
      u.id,
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
    ]),
  );
}

export const GET = withSuperAdminAuth<{ id: string }>(async (_auth, _req, { params }) => {
  try {
    const ticket = await db.supportTicket.findUnique({
      where: { id: params.id },
      select: {
        ...TICKET_SELECT,
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
        attachments: {
          select: {
            id: true,
            fileName: true,
            objectKey: true,
            mimeType: true,
            sizeBytes: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const nameById = await hydrateNames([
      ticket.userId,
      ...(ticket.respondedById ? [ticket.respondedById] : []),
      ...ticket.messages.map((m) => m.authorId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...ticket,
        orgName: ticket.org?.name ?? "—",
        requesterName: nameById.get(ticket.userId) ?? "—",
        messages: ticket.messages.map((m) => ({
          ...m,
          authorName: nameById.get(m.authorId) ?? "QuikIT Support",
        })),
        // The SUPER-ADMIN viewer, not the tenant one: these objects belong to
        // the raising org, and reading across orgs is the whole point of the
        // triage queue. The route it points at is gated by withSuperAdminAuth.
        attachments: ticket.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: `/api/super/support-tickets/attachments/${a.objectKey}`,
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load ticket";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const PATCH = withSuperAdminAuth<{ id: string }>(async (auth, req: NextRequest, { params }) => {
  try {
    const body = await req.json();

    const nextStatus =
      typeof body.status === "string" ? (body.status as SupportTicketStatus) : undefined;
    const nextPriority =
      typeof body.priority === "string" ? (body.priority as SupportTicketPriority) : undefined;
    const response = typeof body.adminResponse === "string" ? body.adminResponse.trim() : "";

    if (nextStatus && !SUPPORT_TICKET_STATUSES.includes(nextStatus)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }
    if (nextPriority && !SUPPORT_TICKET_PRIORITIES.includes(nextPriority)) {
      return NextResponse.json({ success: false, error: "Invalid priority" }, { status: 400 });
    }
    if (!nextStatus && !nextPriority && !response) {
      return NextResponse.json(
        { success: false, error: "Provide a status, priority or response to update" },
        { status: 400 },
      );
    }
    if (response.length > 5000) {
      return NextResponse.json(
        { success: false, error: "Response must be 5000 characters or fewer" },
        { status: 400 },
      );
    }

    const existing = await db.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const fromStatus = existing.status as SupportTicketStatus;
    const toStatus = nextStatus ?? fromStatus;
    // Server-side transition gate — the client <select> is a convenience,
    // never the authority.
    if (!canTransitionSupportStatus(fromStatus, toStatus)) {
      return NextResponse.json(
        { success: false, error: `Cannot move a ticket from ${fromStatus} to ${toStatus}` },
        { status: 400 },
      );
    }

    const now = new Date();
    const statusChanged = toStatus !== fromStatus;

    const updated = await db.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.update({
        where: { id: params.id },
        data: {
          ...(nextStatus ? { status: toStatus } : {}),
          ...(nextPriority ? { priority: nextPriority } : {}),
          ...(response
            ? { adminResponse: response, respondedById: auth.userId, respondedAt: now }
            : {}),
          // Stamped on ENTRY to the state; cleared when a ticket is reopened so
          // the timestamps always describe the current lifecycle pass.
          ...(statusChanged && toStatus === "resolved" ? { resolvedAt: now } : {}),
          ...(statusChanged && toStatus === "closed" ? { closedAt: now } : {}),
          ...(statusChanged && toStatus === "reopened"
            ? { resolvedAt: null, closedAt: null }
            : {}),
        },
        select: TICKET_SELECT,
      });

      // One message per triage action — this row IS the status-history record.
      if (response || statusChanged) {
        await tx.supportTicketMessage.create({
          data: {
            ticketId: ticket.id,
            authorId: auth.userId,
            authorRole: "super_admin",
            body: response || `Status changed to ${toStatus}.`,
            statusFrom: statusChanged ? fromStatus : null,
            statusTo: statusChanged ? toStatus : null,
          },
        });
      }

      return ticket;
    });

    // Field NAMES and the status transition only — `description`/`adminResponse`
    // are free text and must not be copied into the audit trail.
    logAudit({
      action: "UPDATE",
      entityType: "SupportTicket",
      entityId: updated.id,
      actorId: auth.userId,
      orgId: existing.orgId,
      newValues: JSON.stringify({
        changed: [
          ...(statusChanged ? ["status"] : []),
          ...(nextPriority ? ["priority"] : []),
          ...(response ? ["adminResponse"] : []),
        ],
        statusFrom: statusChanged ? fromStatus : undefined,
        statusTo: statusChanged ? toStatus : undefined,
      }),
    });

    return NextResponse.json({
      success: true,
      data: { ...updated, orgName: updated.org?.name ?? "—" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update ticket";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
