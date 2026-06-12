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
 * porter renamed `orgId → orgId` everywhere, so this shim returns
 * `{ userId, orgId, role, email, name }` — matches types/permission.ts.
 */
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";
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
  // TeamManager sits above SalesManager in the hierarchy:
  //   Administrator > TeamManager > SalesManager > SalesUser
  // Handles both underscore (OrgMember.role) and hyphen (AppRole.name) variants.
  if (
    r === "team_manager" || r === "team-manager" ||
    r === "teammanager" || r === "team manager" ||
    r === "regional_director"
  ) return "TeamManager";
  // AppRole.name uses "sales-manager"; OrgMember.role uses "sales_manager" / "manager".
  if (r === "manager" || r === "sales_manager" || r === "salesmanager" || r === "sales-manager")
    return "SalesManager";
  // AppRole.name uses "marketing-user"; OrgMember.role uses "marketing_user" / "marketing".
  if (r === "marketing" || r === "marketing_user" || r === "marketinguser" || r === "marketing-user")
    return "MarketingUser";
  // AppRole.name uses "finance-user"; OrgMember.role uses "finance_user" / "finance".
  if (r === "finance" || r === "finance_user" || r === "financeuser" || r === "finance-user")
    return "FinanceUser";
  // member / user / "sales-user" / anything else → SalesUser (the broad CRM default).
  return "SalesUser";
}

async function readSession(): Promise<SessionUser | null> {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id || !s.user.orgId) return null;

  // s.user.membershipRole comes from OrgMember.role (org-wide).
  // An org admin can grant a higher app-specific role via UserAppAccess.role
  // (e.g. Admin Portal → QuikCRM → "admin") while OrgMember.role stays "member".
  // We read UserAppAccess.role for this app and use it when it is set to
  // something other than the default "member" — overriding the org-level role.
  let effectiveRole = s.user.membershipRole;
  try {
    const appId = await getQuikCrmAppId();
    if (appId) {
      const access = await prisma.userAppAccess.findFirst({
        where: { userId: s.user.id, orgId: s.user.orgId, appId },
        select: { role: true },
      });
      if (access?.role && access.role !== "member") {
        effectiveRole = access.role;
      }
    }
  } catch {
    // DB lookup failed — fall back to OrgMember.role from session
  }

  return {
    userId: s.user.id,
    orgId: s.user.orgId,
    role: mapRole(effectiveRole),
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
