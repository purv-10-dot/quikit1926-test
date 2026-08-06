/**
 * Auth guards — NextAuth-backed shims that match the legacy require.ts API.
 *
 * The standalone QuikCRM had its own JWT-cookie auth in @/lib/auth/session +
 * @/lib/auth/jwt. The monorepo replaces all of that with NextAuth + the
 * QuikIT OAuth flow (createOAuthClientOptions). This shim adapts the new
 * NextAuth session into the legacy SessionUser shape so the ported code
 * (~70 API route files + ~40 page components) keeps working unchanged.
 *
 * Legacy SessionUser was `{ userId, orgId, role, email, name }`. The bulk
 * porter renamed `orgId → tenantId` everywhere, so this shim returns
 * `{ userId, tenantId, role, email, name }` — matches types/permission.ts.
 */
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
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
  if (
    r === "admin" ||
    r === "owner" ||
    r === "super_admin" ||
    r === "administrator" ||
    r === "org_admin" ||
    r === "app_admin"
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

  // Re-validate the membership on every request against the live DB instead of
  // trusting the JWT. The token only stamps role/status at login and lasts 30
  // days, so without this a demoted Administrator would keep admin access — and
  // a deactivated user would keep all access — until the token expired. Reading
  // the current row makes role changes and deactivations take effect at once.
  const membership = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId: s.user.orgId, userId: s.user.id } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== "active") return null;

  return {
    userId: s.user.id,
    tenantId: s.user.orgId,
    role: mapRole(membership.role),
    email: s.user.email ?? "",
    name: s.user.name ?? "",
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
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  return NextResponse.json({ error: message }, { status });
}
