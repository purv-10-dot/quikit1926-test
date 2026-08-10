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

/** Where fragment for `tenantId` + optional ownerId on a model that has an
 * `ownerId` column (CrmLead, CrmOpportunity, CrmActivity-after-migration). */
export function tenantOwnerWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { tenantId: user.tenantId };
  if (ownerId) w.ownerId = ownerId;
  return w;
}

/** CrmTask uses `assignedToUserId` instead of `ownerId`. */
export function tenantAssigneeWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { tenantId: user.tenantId };
  if (ownerId) w.assignedToUserId = ownerId;
  return w;
}

/** CrmCallLog uses `agentUserId` instead of `ownerId`. */
export function tenantAgentWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { tenantId: user.tenantId };
  if (ownerId) w.agentUserId = ownerId;
  return w;
}
