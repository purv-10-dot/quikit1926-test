/**
 * Platform support tickets raised from QuikScale.
 *
 *   GET  — the caller's OWN tickets (Settings → Support Status)
 *   POST — raise a new ticket (header Support panel)
 *
 * Deliberately NOT gated by a `moduleKey` or an RBAC `permission`: a user who
 * has been locked out of a module must still be able to report that they are
 * locked out. `withOrgAuth` still enforces session + active org membership +
 * QuikScale app access, so this is not an open endpoint.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { parseListParams, paginatedResponse } from "@/lib/api/pagination";
import {
  createSupportTicketSchema,
  listSupportTicketsSchema,
} from "@/lib/schemas/supportSchema";

const APP_SLUG = "quikscale";

/** Columns the client may sort the Support Status table by. */
const SORTABLE = ["ticketNo", "status", "requestType", "createdAt", "updatedAt"] as const;

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const { skip, take, page, limit, sortBy, sortOrder } = parseListParams(req, {
    sortable: SORTABLE,
    defaultLimit: 20,
    maxLimit: 100,
  });

  const parsedFilters = listSupportTicketsSchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    requestType: req.nextUrl.searchParams.get("requestType") ?? undefined,
  });
  if (!parsedFilters.success) {
    return NextResponse.json(
      { success: false, error: parsedFilters.error.errors[0].message },
      { status: 400 },
    );
  }

  // Isolation lives in the `where`, never in a post-fetch check: a user sees
  // only the tickets they raised, and only within their active org.
  const where = {
    orgId,
    userId,
    ...(parsedFilters.data.status ? { status: parsedFilters.data.status } : {}),
    ...(parsedFilters.data.requestType
      ? { requestType: parsedFilters.data.requestType }
      : {}),
  };

  const [tickets, total] = await Promise.all([
    db.supportTicket.findMany({
      where,
      select: {
        id: true,
        ticketNo: true,
        subject: true,
        description: true,
        requestType: true,
        status: true,
        priority: true,
        adminResponse: true,
        respondedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: sortBy
        ? [{ [sortBy]: sortOrder }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    db.supportTicket.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(tickets, total, page, limit));
}, { fallbackErrorMessage: "Failed to load support tickets" });

export const POST = withOrgAuth(
  async ({ orgId, userId }, req: NextRequest) => {
    const body = await req.json();
    const parsed = createSupportTicketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    // Attribution is resolved server-side so the client can never spoof it.
    // `roleName` is a SNAPSHOT of the membership role at submit time — triage
    // needs to know what the user could see when they hit the problem.
    const [app, membership] = await Promise.all([
      db.app.findUnique({ where: { slug: APP_SLUG }, select: { id: true } }),
      db.orgMember.findFirst({
        where: { orgId, userId },
        select: { role: true },
      }),
    ]);

    const ticket = await db.supportTicket.create({
      data: {
        orgId,
        userId,
        appId: app?.id ?? "",
        appSlug: APP_SLUG,
        roleName: membership?.role ?? null,
        subject: parsed.data.subject,
        description: parsed.data.description,
        requestType: parsed.data.requestType,
        status: "open",
      },
      select: {
        id: true,
        ticketNo: true,
        subject: true,
        requestType: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  },
  {
    fallbackErrorMessage: "Failed to submit support request",
    // Tighter than the shared mutation bucket — a support form is a spam
    // magnet and nobody legitimately files 10+ tickets an hour.
    rateLimit: { limit: 10, windowMs: 60 * 60 * 1000, routeKey: "support:create" },
  },
);
