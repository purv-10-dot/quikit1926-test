/**
 * Parse the dashboard query string into a normalized {range, ownerId, tz}
 * tuple, plus produce the Prisma `where` fragments each domain query needs.
 */
import { parseAndClampRange, safeTz, type DateRange } from "./period";
import type { SessionUser } from "@/types/permission";

export type DashboardFilters = {
  range: DateRange;
  ownerId: string | null;
  /** Resolved (`me` substituted) — what to send to Prisma. */
  resolvedOwnerId: string | null;
  tz: string;
};

const TZ_HEADER = "x-client-tz";
const TZ_COOKIE_NAME = "tz";

export function readTzFromHeaders(headers: Headers): string {
  const fromHeader = headers.get(TZ_HEADER);
  if (fromHeader) return safeTz(fromHeader);
  // Cookie fallback — set by client on first page load.
  const cookieHeader = headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === TZ_COOKIE_NAME && v) return safeTz(decodeURIComponent(v));
  }
  return safeTz(undefined);
}

export function parseFilters(req: Request, user: SessionUser): DashboardFilters {
  const url = new URL(req.url);
  const tz = readTzFromHeaders(req.headers);
  const range = parseAndClampRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
    tz,
  );

  const rawOwner = url.searchParams.get("ownerId");
  const ownerId = rawOwner && rawOwner !== "all" && rawOwner !== "" ? rawOwner : null;
  const resolvedOwnerId = ownerId === "me" ? user.userId : ownerId;
  return { range, ownerId, resolvedOwnerId, tz };
}

/**
 * Owner-restriction override for the dashboard. When the caller's role is
 * restricted to owned leads, the dashboard MUST report only their own numbers
 * regardless of any `?ownerId=` the client sends — otherwise a restricted rep
 * would see org-wide aggregates on the dashboard even though their lead list is
 * scoped. Callers that gate on owner-restriction pass the result through this
 * to force `resolvedOwnerId` (and `ownerId`) to the user themselves.
 *
 * Kept separate from parseFilters (which is sync) because the restriction check
 * is async (reads role config). Dashboard routes: after parseFilters, call
 * `applyOwnerRestriction(filters, user)` before building queries.
 */
export async function applyOwnerRestriction(
  filters: DashboardFilters,
  user: SessionUser,
): Promise<DashboardFilters> {
  const { isOwnerRestricted } = await import("@/lib/auth/owner-scope");
  if (await isOwnerRestricted(user)) {
    return { ...filters, ownerId: user.userId, resolvedOwnerId: user.userId };
  }
  return filters;
}

/** Where fragment for `tenantId` + optional ownerId on a model that has an
 * `ownerId` column (QceLead, QceOpportunity, QceActivity-after-migration). */
export function tenantOwnerWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { orgId: user.orgId };
  if (ownerId) w.ownerId = ownerId;
  return w;
}

/** QceTask uses `assignedToUserId` instead of `ownerId`. */
export function tenantAssigneeWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { orgId: user.orgId };
  if (ownerId) w.assignedToUserId = ownerId;
  return w;
}

/** QceCallLog uses `agentUserId` instead of `ownerId`. */
export function tenantAgentWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { orgId: user.orgId };
  if (ownerId) w.agentUserId = ownerId;
  return w;
}
