/**
 * Super-admin support ticket queue — every ticket raised from every app, with
 * app / org / request-type / status filters.
 *
 * This is one of the sanctioned cross-org read surfaces (docs/04-db-patterns.md):
 * `withSuperAdminAuth` is the gate, and there is deliberately no `orgId` in the
 * base `where` — org is a user-selectable FILTER here, not an isolation
 * boundary.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";
import {
  SUPPORT_REQUEST_TYPES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_PRIORITIES,
} from "@quikit/shared";

/** Narrow a raw query param to an allowed value, else undefined (= no filter). */
function oneOf<T extends readonly string[]>(
  raw: string | null,
  allowed: T,
): T[number] | undefined {
  return raw && (allowed as readonly string[]).includes(raw)
    ? (raw as T[number])
    : undefined;
}

export const GET = withSuperAdminAuth(async (_auth, request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const pagination = parsePaginationParams(searchParams);

    const appSlug = searchParams.get("appSlug")?.trim() || undefined;
    const orgId = searchParams.get("orgId")?.trim() || undefined;
    const requestType = oneOf(searchParams.get("requestType"), SUPPORT_REQUEST_TYPES);
    const status = oneOf(searchParams.get("status"), SUPPORT_TICKET_STATUSES);
    const priority = oneOf(searchParams.get("priority"), SUPPORT_TICKET_PRIORITIES);
    const search = searchParams.get("search")?.trim() || searchParams.get("q")?.trim() || "";

    const where = {
      ...(appSlug ? { appSlug } : {}),
      ...(orgId ? { orgId } : {}),
      ...(requestType ? { requestType } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        select: {
          id: true,
          ticketNo: true,
          orgId: true,
          userId: true,
          appSlug: true,
          roleName: true,
          subject: true,
          description: true,
          requestType: true,
          status: true,
          priority: true,
          adminResponse: true,
          respondedAt: true,
          createdAt: true,
          updatedAt: true,
          org: { select: { name: true, slug: true } },
          // Selected in the LIST, not just the detail route: the triage drawer
          // renders from the row it was opened with, so fetching them here is
          // what lets a super-admin open a screenshot without a second request.
          attachments: {
            select: {
              id: true,
              fileName: true,
              objectKey: true,
              mimeType: true,
              sizeBytes: true,
            },
            orderBy: { createdAt: "asc" as const },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...paginationToSkipTake(pagination),
      }),
      db.supportTicket.count({ where }),
    ]);

    // Requester names in one batched query — never inside a .map().
    const userIds = [...new Set(tickets.map((t) => t.userId).filter(Boolean))];
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const data = tickets.map((t) => {
      const u = userById.get(t.userId);
      return {
        ...t,
        orgName: t.org?.name ?? "—",
        // Object keys are swapped for the SUPER-ADMIN viewer route — the tenant
        // one would refuse these, since they belong to the raising org.
        attachments: t.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: `/api/super/support-tickets/attachments/${a.objectKey}`,
        })),
        requesterName:
          u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : "—",
        requesterEmail: u?.email ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        respondedAt: t.respondedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      ...buildPaginationResponse(data, total, pagination),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load support tickets";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
