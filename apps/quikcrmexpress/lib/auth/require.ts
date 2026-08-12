/**
 * Auth guards — NextAuth-backed shims that match the legacy require.ts API.
 *
 * The standalone QuikCRM had its own JWT-cookie auth in @/lib/auth/session +
 * @/lib/auth/jwt. The monorepo replaces all of that with NextAuth + the
 * QuikIT OAuth flow (createOAuthClientOptions). This shim adapts the new
 * NextAuth session into the legacy SessionUser shape so the ported code
 * (~70 API route files + ~40 page components) keeps working unchanged.
 *
 * SessionUser is `{ userId, orgId, role, email, name }` — matches
 * types/permission.ts. The standalone port briefly called this field
 * `tenantId`; it was converted back to the platform-standard `orgId`.
 */
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { getOrSet } from "@quikit/auth/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SessionUser } from "@/types/permission";

/**
 * Map QuikIT/Membership role strings to the legacy CRM role enum the ported
 * code reasons about (`Administrator`, `SalesManager`, `SalesUser`,
 * `MarketingUser`, `FinanceUser`). Anything admin-shaped at the platform
 * level becomes `Administrator` in CRM so existing role checks work.
 */
function mapRole(membershipRole: string | undefined): string {
  if (!membershipRole) return "SalesUser";
  const r = membershipRole.toLowerCase();
  // Admin tier mirrors ADMIN_TIER_ROLES in @quikit/shared
  // ({super_admin, org_admin, admin}) plus the two local synonyms.
  //
  // `app_admin` is deliberately NOT here. The platform ranks it BELOW admin in
  // ROLE_HIERARCHY and excludes it from ADMIN_TIER_ROLES, but this map used to
  // promote it to "Administrator" — which grants every (module, action) pair
  // and short-circuits assertModule entirely. That let an app_admin who is not
  // an org admin reach admin-only surfaces, including permission-template
  // management. It now falls through to the SalesUser default like any other
  // non-admin role.
  if (
    r === "admin" ||
    r === "owner" ||
    r === "super_admin" ||
    r === "administrator" ||
    r === "org_admin"
  ) {
    return "Administrator";
  }
  if (r === "manager" || r === "sales_manager" || r === "salesmanager") return "SalesManager";
  if (r === "marketing" || r === "marketing_user" || r === "marketinguser") return "MarketingUser";
  if (r === "finance" || r === "finance_user" || r === "financeuser") return "FinanceUser";
  // member / user / anything else → SalesUser (the broad CRM default).
  return "SalesUser";
}

async function readSession(): Promise<SessionUser | null> {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id || !s.user.orgId) return null;

  // Re-validate the membership against the DB instead of trusting the JWT. The
  // token only stamps role/status at login and lasts 30 days, so without this a
  // demoted Administrator would keep admin access — and a deactivated user
  // would keep all access — until the token expired.
  //
  // Routed through the shared @quikit/auth/cache so this app joins the same
  // hot-read fabric the platform guards use (in-memory LRU → Redis → the
  // `quikit:cache-invalidate` pub/sub channel), instead of paying an uncached
  // DB round-trip on every single request as it did before.
  //
  // The key is namespaced deliberately. The platform caches a BOOLEAN under
  // `membership:${userId}:${orgId}` (packages/auth/get-tenant-id.ts). Writing
  // this richer {role,status} object under that key would hand every other app
  // an object where it expects a boolean — and `!!membership` on an object is
  // true even when status is "inactive", silently granting a deactivated user
  // access across the whole platform. Hence a distinct namespace.
  //
  // 60s TTL matches the platform's own tolerance for membership staleness.
  const membership = await getOrSet<{ role: string; status: string } | null>(
    `crmexpress:membership:${s.user.id}:${s.user.orgId}`,
    60,
    async () =>
      db.orgMember.findUnique({
        where: { orgId_userId: { orgId: s.user.orgId!, userId: s.user.id! } },
        select: { role: true, status: true },
      }),
  );
  if (!membership || membership.status !== "active") return null;

  return {
    userId: s.user.id,
    orgId: s.user.orgId,
    role: mapRole(membership.role),
    email: s.user.email ?? "",
    name: s.user.name ?? "",
    // Carry the platform values through unmapped. requireAppAccess and the
    // shared ADMIN_TIER_ROLES set are defined against these, not the CRM role.
    membershipRole: membership.role,
    isSuperAdmin: s.user.isSuperAdmin === true,
  };
}

/** Server Component / page guard. Throws redirect("/login") if unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const u = await readSession();
  if (!u) redirect("/login");
  return u;
}

/** Route handler guard. Returns the user OR a 401 NextResponse to be returned directly. */
export async function requireApiUser(): Promise<SessionUser | NextResponse> {
  const u = await readSession();
  // `{ success: false, error }` is the house envelope (root CLAUDE.md). `error`
  // is kept at the top level alongside it so the ~66 existing call sites that
  // read `json.error` keep working — this is additive, not a breaking change.
  if (!u) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  return u;
}

/** Alias kept for callers that import the original name. */
export const mapMembershipToCrmRole = mapRole;

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

/** Convert a thrown error (with optional .statusCode) into a NextResponse. */
export function errorResponse(err: unknown): NextResponse {
  const e = err as { statusCode?: number; message?: string };
  const status = e?.statusCode && Number.isInteger(e.statusCode) ? e.statusCode : 500;
  const message = e?.message || "Internal Server Error";
  if (status >= 500) console.error("[api]", err);
  return NextResponse.json({ success: false, error: message }, { status });
}
