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
import { mapRole } from "@/lib/auth/role-resolution";
import type { SessionUser } from "@/types/permission";

// mapRole moved to lib/auth/role-resolution.ts (shared with Settings→Users digest
// eligibility so request-time session.role and UI eligibility resolve identically).

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
