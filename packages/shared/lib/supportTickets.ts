/**
 * Platform support tickets — the server-side core, shared by every app.
 *
 * Every app exposes the SAME two endpoints:
 *
 *   GET  /api/support/tickets       — the caller's own tickets
 *   POST /api/support/tickets       — raise a new ticket
 *   GET  /api/support/tickets/[id]  — one ticket + its response thread
 *
 * but each app reaches them through its own auth wrapper (`withOrgAuth`,
 * `withTenantAuth`, `withMemberAuth`, HRMS's `withAuth`, …). Rather than
 * reimplement the query in thirteen route files, the route files resolve
 * `{ orgId, userId }` with whatever guard they already use and delegate the
 * body to the three functions below.
 *
 * Deliberately framework-agnostic — no `next/server` import. Handlers return a
 * plain discriminated result and the caller maps it onto `NextResponse.json`.
 * That keeps this module usable from a route handler, a server action or a
 * test without pulling Next into @quikit/shared.
 *
 * This module imports `db` from @quikit/database and must ONLY be imported
 * from server-side code. It is NOT re-exported from packages/shared/index.ts —
 * it stays on the `@quikit/shared/supportTickets` subpath so client bundles
 * never pull it in. Same rule as `apiLogging.ts`.
 */

import { db } from "@quikit/database";
import {
  createSupportTicketSchema,
  listSupportTicketsSchema,
  type ListSupportTicketsInput,
} from "./supportSchema";
import { rateLimitAsync } from "./rateLimit";
import type { SupportRequestType, SupportTicketStatus } from "./constants";

/* ─── Result envelope ────────────────────────────────────────────────────── */

export type SupportResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

function fail(error: string, status: number): { ok: false; error: string; status: number } {
  return { ok: false, error, status };
}

/* ─── Row shapes ─────────────────────────────────────────────────────────── */

/** A row in the user's own Support Status table. */
export interface SupportTicketRow {
  id: string;
  ticketNo: number;
  appSlug: string;
  subject: string;
  description: string;
  requestType: SupportRequestType;
  status: SupportTicketStatus;
  priority: string;
  adminResponse: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface SupportTicketMessageRow {
  id: string;
  authorId: string;
  authorRole: string;
  authorName: string;
  body: string;
  statusFrom: string | null;
  statusTo: string | null;
  createdAt: Date;
}

/** Columns the client may sort the Support Status table by. */
export const SUPPORT_SORTABLE_COLUMNS = [
  "ticketNo",
  "status",
  "requestType",
  "appSlug",
  "createdAt",
  "updatedAt",
] as const;

const SELECT_ROW = {
  id: true,
  ticketNo: true,
  appSlug: true,
  subject: true,
  description: true,
  requestType: true,
  status: true,
  priority: true,
  adminResponse: true,
  respondedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/* ─── LIST ───────────────────────────────────────────────────────────────── */

export interface ListSupportTicketsArgs {
  orgId: string;
  userId: string;
  page?: number;
  limit?: number;
  sortBy?: string | null;
  sortOrder?: "asc" | "desc";
  /** Raw, unvalidated filters straight off the query string. */
  filters?: Partial<Record<keyof ListSupportTicketsInput, string | null | undefined>>;
}

/**
 * The caller's OWN tickets, newest first.
 *
 * NOT scoped to the calling app by default. A user who raised a ticket from
 * QuikCRM and then opens QuikScale's Support Status should still see it — one
 * queue, one place to check, and the `appSlug` column says where each came
 * from. Pass `filters.appSlug` to narrow it.
 *
 * Isolation lives in the `where`, never in a post-fetch check: a user sees only
 * the tickets they raised, and only within their active org.
 */
export async function listSupportTickets(
  args: ListSupportTicketsArgs,
): Promise<SupportResult<{ tickets: SupportTicketRow[]; meta: SupportListMeta }>> {
  const parsed = listSupportTicketsSchema.safeParse({
    status: args.filters?.status ?? undefined,
    requestType: args.filters?.requestType ?? undefined,
    appSlug: args.filters?.appSlug ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.errors[0]?.message ?? "Invalid filters", 400);
  }

  const page = Number.isFinite(args.page) && (args.page ?? 0) >= 1 ? Math.floor(args.page!) : 1;
  const limit = Number.isFinite(args.limit)
    ? Math.min(100, Math.max(1, Math.floor(args.limit!)))
    : 20;

  const sortBy = (SUPPORT_SORTABLE_COLUMNS as readonly string[]).includes(args.sortBy ?? "")
    ? args.sortBy!
    : null;
  const sortOrder = args.sortOrder === "asc" ? "asc" : "desc";

  const where = {
    orgId: args.orgId,
    userId: args.userId,
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.requestType ? { requestType: parsed.data.requestType } : {}),
    ...(parsed.data.appSlug ? { appSlug: parsed.data.appSlug } : {}),
  };

  const [tickets, total] = await Promise.all([
    db.supportTicket.findMany({
      where,
      select: SELECT_ROW,
      // `id` tie-breaker keeps paging stable when sort values collide.
      orderBy: sortBy
        ? [{ [sortBy]: sortOrder }, { id: "desc" as const }]
        : [{ createdAt: "desc" as const }, { id: "desc" as const }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.supportTicket.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    ok: true,
    status: 200,
    data: {
      tickets: tickets as SupportTicketRow[],
      meta: { page, limit, total, totalPages, hasMore: page < totalPages },
    },
  };
}

/* ─── CREATE ─────────────────────────────────────────────────────────────── */

/** Nobody legitimately files 10+ tickets an hour. */
export const SUPPORT_CREATE_RATE_LIMIT = 10;
export const SUPPORT_CREATE_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface CreateSupportTicketArgs {
  orgId: string;
  userId: string;
  /** Slug of the app the ticket was raised from, e.g. "quikcrm". */
  appSlug: string;
  /** Raw request body — validated here so no route has to repeat it. */
  body: unknown;
}

export interface CreatedSupportTicket {
  id: string;
  ticketNo: number;
  subject: string;
  requestType: SupportRequestType;
  status: SupportTicketStatus;
  createdAt: Date;
}

/**
 * Raise a ticket. Attribution (`orgId`, `userId`, `appId`, `appSlug`,
 * `roleName`) is resolved server-side so the client can never spoof it.
 *
 * `roleName` is a SNAPSHOT of the membership role at submit time — triage needs
 * to know what the user could see when they hit the problem, and roles change.
 *
 * `appId` falls back to `""` when the slug isn't in the App registry (QuikHRMS
 * is not registered today). The column has no FK precisely so a missing or
 * retired app never blocks a user from reporting a problem; `appSlug` is what
 * the triage queue actually filters on.
 */
export async function createSupportTicket(
  args: CreateSupportTicketArgs,
): Promise<SupportResult<CreatedSupportTicket>> {
  // Throttled HERE rather than in each app's auth wrapper: only QuikScale's
  // `withOrgAuth` accepts a `rateLimit` option, and a support form is a spam
  // magnet everywhere. Redis-backed, so the bucket holds across serverless
  // instances AND across apps — one user, one budget, not one per product.
  //
  // Runs BEFORE validation on purpose: throttling only well-formed bodies
  // would let a spammer burn the endpoint for free by posting garbage.
  const rl = await rateLimitAsync({
    routeKey: "support:create",
    clientKey: `${args.orgId}:${args.userId}`,
    limit: SUPPORT_CREATE_RATE_LIMIT,
    windowMs: SUPPORT_CREATE_RATE_WINDOW_MS,
  });
  if (!rl.ok) {
    return fail("Too many support requests. Please try again shortly.", 429);
  }

  const parsed = createSupportTicketSchema.safeParse(args.body);
  if (!parsed.success) {
    return fail(parsed.error.errors[0]?.message ?? "Invalid support request", 400);
  }

  const [app, membership] = await Promise.all([
    db.app.findUnique({ where: { slug: args.appSlug }, select: { id: true } }),
    db.orgMember.findFirst({
      where: { orgId: args.orgId, userId: args.userId },
      select: { role: true },
    }),
  ]);

  const ticket = await db.supportTicket.create({
    data: {
      orgId: args.orgId,
      userId: args.userId,
      appId: app?.id ?? "",
      appSlug: args.appSlug,
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

  return { ok: true, status: 201, data: ticket as CreatedSupportTicket };
}

/* ─── DETAIL ─────────────────────────────────────────────────────────────── */

export interface SupportTicketDetail extends SupportTicketRow {
  respondedById: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  messages: SupportTicketMessageRow[];
}

/** Display name for a message author. Mirrors `toAuditInfo` in the apps. */
function displayName(firstName: string | null, lastName: string | null): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

/**
 * Detail + response thread for ONE ticket the caller raised.
 *
 * Ownership (`orgId` + `userId`) is part of the Prisma `where`, so a ticket
 * belonging to another user or org is indistinguishable from a ticket that does
 * not exist (404) — no existence oracle.
 */
export async function getSupportTicketDetail(args: {
  orgId: string;
  userId: string;
  id: string;
}): Promise<SupportResult<SupportTicketDetail>> {
  const ticket = await db.supportTicket.findFirst({
    where: { id: args.id, orgId: args.orgId, userId: args.userId },
    select: {
      ...SELECT_ROW,
      respondedById: true,
      resolvedAt: true,
      closedAt: true,
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
        orderBy: { createdAt: "asc" as const },
      },
    },
  });

  if (!ticket) return fail("Ticket not found", 404);

  // Neither model FKs to User (matching Notification.userId / AuditLog.actorId),
  // so resolve every author in ONE batched query rather than per message.
  const authorIds = [...new Set(ticket.messages.map((m) => m.authorId).filter(Boolean))];
  const authors = authorIds.length
    ? await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameById = new Map(authors.map((u) => [u.id, displayName(u.firstName, u.lastName)]));

  return {
    ok: true,
    status: 200,
    data: {
      ...ticket,
      messages: ticket.messages.map((m) => ({
        ...m,
        authorName:
          m.authorRole === "super_admin" ? "QuikIT Support" : nameById.get(m.authorId) ?? "—",
      })),
    } as SupportTicketDetail,
  };
}

/* ─── Query-string adapter ───────────────────────────────────────────────── */

/**
 * Pull the list params off a URL's search params. Every app's GET route reads
 * the same five keys, so parse them once here.
 */
export function parseSupportListQuery(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  sortBy: string | null;
  sortOrder: "asc" | "desc";
  filters: { status?: string; requestType?: string; appSlug?: string };
} {
  const num = (raw: string | null, fallback: number) => {
    const n = parseInt(raw ?? "", 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    page: num(searchParams.get("page"), 1),
    limit: num(searchParams.get("limit") ?? searchParams.get("pageSize"), 20),
    sortBy: searchParams.get("sortBy"),
    sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
    filters: {
      status: searchParams.get("status") ?? undefined,
      requestType: searchParams.get("requestType") ?? undefined,
      appSlug: searchParams.get("appSlug") ?? undefined,
    },
  };
}
