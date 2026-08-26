/**
 * Shared org resolution for extension (Bearer-authed) routes.
 *
 * Every extension endpoint needs the same thing: honour a caller-supplied orgId
 * only when the caller is an active member of it, otherwise fall back to their
 * first active membership. That block was copy-pasted across
 * /api/extension-auth/{icp,prospects,prospects/[id]} and
 * /api/leads/from-linkedin; this is the single definition.
 *
 * Returning a discriminated union rather than throwing keeps the status code
 * (403 vs 200) a decision of the route, matching how the existing handlers read.
 */
import { db } from "@/lib/db";

export type OrgResolution =
  | { ok: true; orgId: string }
  | { ok: false; error: string };

export async function resolveExtensionOrgId(
  userId: string,
  requestedOrgId?: string | null,
): Promise<OrgResolution> {
  const requested = (requestedOrgId || "").trim();

  if (requested) {
    const membership = await db.orgMember.findFirst({
      where: { userId, orgId: requested, status: "active", org: { status: "active" } },
      select: { orgId: true },
    });
    if (!membership) {
      return { ok: false, error: "Not a member of the selected organization" };
    }
    return { ok: true, orgId: requested };
  }

  const first = await db.orgMember.findFirst({
    where: { userId, status: "active", org: { status: "active" } },
    select: { orgId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!first) {
    return { ok: false, error: "No active organization for this user" };
  }
  return { ok: true, orgId: first.orgId };
}
