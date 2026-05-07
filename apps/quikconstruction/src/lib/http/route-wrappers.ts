/**
 * Route handler wrappers — a small toolkit so every API route follows the
 * same shape without each one re-implementing auth, pagination, and error
 * mapping.
 *
 * Two wrappers, one for each kind of route:
 *
 *   - `withListRoute`     — GET endpoints that return paginated lists
 *   - `withMutationRoute` — POST/PUT/PATCH/DELETE endpoints that change state
 *
 * Both wrappers:
 *   1. Resolve the tenant context (401 if absent)
 *   2. Run the handler
 *   3. Map any thrown Prisma error to a friendly DomainError via mapPrismaError
 *   4. Funnel everything through `toHttpResponse` for a canonical envelope
 *
 * `withListRoute` additionally parses pagination from the URL.
 *
 * Existing routes that have hand-rolled all of this can keep working — the
 * wrappers are opt-in. New routes (and any route being touched anyway)
 * should adopt them.
 *
 * Example usage at the bottom of this file.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/auth/context";
import { err as envelopeErr } from "./envelope";
import { toHttpResponse } from "./errors";
import { mapPrismaError } from "./prisma-errors";
import { parsePagination, type PaginationParams } from "./pagination";

// ─── Shared error / unauth handling ──────────────────────────────────

function unauthorized(): NextResponse {
  return envelopeErr("UNAUTHORIZED", "Authentication required", 401);
}

/**
 * Run `fn` and translate any thrown Prisma / DomainError / unknown error
 * to the canonical envelope. Pass `entityLabel` so the duplicate /
 * FK-violation messages name the right thing.
 */
async function safeRun(
  fn: () => Promise<NextResponse>,
  entityLabel: string,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: unknown) {
    return toHttpResponse(mapPrismaError(e, entityLabel));
  }
}

// ─── List route wrapper ──────────────────────────────────────────────

export interface ListRouteContext {
  ctx: TenantContext;
  req: NextRequest;
  searchParams: URLSearchParams;
  pagination: PaginationParams;
}

export interface ListRouteOptions {
  /**
   * Short label used in error messages (e.g. "vendor", "purchase order").
   * Singular form reads best in 409 / 404 messages.
   */
  entityLabel: string;
}

/**
 * Wrap a GET handler that returns a paginated list. The handler receives
 * an already-resolved tenant context, parsed search params, and parsed
 * pagination — and returns either a `NextResponse` (full control) or a
 * plain object that gets wrapped via `ok()`.
 *
 *   export const GET = (req: NextRequest) =>
 *     withListRoute(req, { entityLabel: "vendor" }, async ({ ctx, pagination }) => {
 *       const baseOpts = { tenantId: ctx.tenantId, orgId: ctx.orgId };
 *       return paginateDb(
 *         pagination,
 *         (paging) => listVendors({ ...baseOpts, ...paging }),
 *         () => countVendors(baseOpts),
 *       );
 *     });
 */
export async function withListRoute<T>(
  req: NextRequest,
  opts: ListRouteOptions,
  handler: (rc: ListRouteContext) => Promise<T | NextResponse>,
): Promise<NextResponse> {
  return safeRun(async () => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();

    const url = new URL(req.url);
    const result = await handler({
      ctx,
      req,
      searchParams: url.searchParams,
      pagination: parsePagination(req),
    });

    if (result instanceof NextResponse) return result;
    // Plain payload → pass through as JSON. We deliberately do NOT
    // wrap in the `ok()` canonical envelope here: the existing UI
    // consumers expect the raw `{ data, total, page, ... }` shape that
    // `paginateDb` produces. Routes that want the canonical envelope
    // can return `ok(result)` from the handler directly.
    return NextResponse.json(result);
  }, opts.entityLabel);
}

// ─── Mutation route wrapper ──────────────────────────────────────────

export interface MutationRouteContext<TBody = any> {
  ctx: TenantContext;
  req: NextRequest;
  body: TBody;
  searchParams: URLSearchParams;
}

export interface MutationRouteOptions<TBody = any> {
  /** Short label used in error messages — see ListRouteOptions. */
  entityLabel: string;
  /**
   * Optional validator/parser. Throw a `DomainError` on validation failure
   * and `withMutationRoute` will map it to the canonical envelope. If
   * omitted, `body` is whatever JSON the client sent (typed as `any`).
   */
  parseBody?: (raw: unknown) => TBody | Promise<TBody>;
  /**
   * HTTP status for successful responses when the handler returns a plain
   * payload (not a NextResponse). Defaults to 200; use 201 for "created".
   */
  successStatus?: number;
}

/**
 * Wrap a POST/PUT/PATCH/DELETE handler. The wrapper:
 *   - parses the JSON body (calling `parseBody` if provided)
 *   - resolves the tenant context (401 if absent)
 *   - runs the handler
 *   - maps Prisma P2002/P2003/P2025 to friendly responses
 *   - funnels other errors through `toHttpResponse`
 *
 *   export const POST = (req: NextRequest) =>
 *     withMutationRoute(req, {
 *       entityLabel: "company",
 *       successStatus: 201,
 *       parseBody: (raw) => {
 *         if (!raw || typeof raw !== "object") throw new DomainError("INVALID_BODY", "JSON body required", 400);
 *         const r = raw as any;
 *         if (!r.name) throw new DomainError("VALIDATION", "Company name is required", 400);
 *         return r;
 *       },
 *     }, async ({ ctx, body }) => {
 *       return createCompany({ ...body, tenantId: ctx.tenantId, orgId: ctx.orgId, createdBy: ctx.userId });
 *     });
 */
export async function withMutationRoute<TBody = any, TResult = any>(
  req: NextRequest,
  opts: MutationRouteOptions<TBody>,
  handler: (rc: MutationRouteContext<TBody>) => Promise<TResult | NextResponse>,
): Promise<NextResponse> {
  return safeRun(async () => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();

    let raw: unknown = undefined;
    // GET / DELETE may not carry a body — `req.json()` throws on empty
    // body, so guard against it. Most mutations DO have a body, so we
    // only swallow the parse failure when the body is empty.
    try {
      raw = await req.json();
    } catch {
      raw = undefined;
    }

    const body = opts.parseBody
      ? await opts.parseBody(raw)
      : ((raw as TBody) ?? ({} as TBody));

    const result = await handler({
      ctx,
      req,
      body,
      searchParams: new URL(req.url).searchParams,
    });

    if (result instanceof NextResponse) return result;
    // Same rationale as withListRoute: pass through as JSON so existing
    // clients continue to read `record.id` instead of `response.data.id`.
    return NextResponse.json(result, { status: opts.successStatus ?? 200 });
  }, opts.entityLabel);
}
