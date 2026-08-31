/**
 * Caller resolution for the Upwork routes.
 *
 * The Upwork module is reachable two ways:
 *   - the CRM UI, with a normal NextAuth cookie session
 *   - the Upwork browser extension, with the Bearer token minted by
 *     /api/extension-auth/callback (the same token the LinkedIn extension uses)
 *
 * Cookie callers fall through to requireApiUser(). Bearer callers are resolved
 * here, and the resolution deliberately mirrors readSession() in
 * lib/auth/require.ts: membership role + the QuikCRM UserAppAccess override, run
 * through resolveCrmRole(). If it did not, an org admin using the extension
 * would be seen as a SalesUser and silently get owner-scoped results that
 * disagree with what the same person sees in the web UI.
 *
 * The extension's token carries a user but NO org — a user can belong to
 * several — so the org comes from the request and is only trusted after an
 * ACTIVE membership is confirmed. Without that check a valid token for org A
 * could write into org B.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/require";
import { verifyExtensionToken } from "@/lib/auth/extension-token";
import { resolveCrmRole } from "@/lib/auth/role-resolution";
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";

const ADMIN_ROLE = "Administrator";

/**
 * Owner scope for Upwork list/read.
 *
 * Non-admins see only the jobs they captured; Administrators see the whole org.
 * `undefined` means "no owner filter". Always derived from the resolved session
 * so no query parameter can widen a caller's own scope.
 */
export function upworkOwnerScope(user: SessionUser): string | undefined {
  return user.role === ADMIN_ROLE ? undefined : user.userId;
}

export async function resolveUpworkUser(
  req: NextRequest,
  requestedOrgId?: string,
): Promise<SessionUser | NextResponse> {
  const ext = await verifyExtensionToken(req);
  if (!ext) {
    // No Bearer token — normal cookie-session guard (returns a 401 response
    // itself when there is no session).
    return requireApiUser();
  }

  const membership = await prisma.orgMember.findFirst({
    where: {
      userId: ext.userId,
      status: "active",
      org: { status: "active" },
      ...(requestedOrgId ? { orgId: requestedOrgId } : {}),
    },
    select: { orgId: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return NextResponse.json(
      {
        success: false,
        error: requestedOrgId
          ? "You are not an active member of the selected organization."
          : "No active organization membership.",
      },
      { status: 403 },
    );
  }

  // Same per-app override readSession() applies, so extension and web UI agree
  // on whether this user is an Administrator.
  let appAccessRole: string | null = null;
  try {
    const appId = await getQuikCrmAppId();
    if (appId) {
      const access = await prisma.userAppAccess.findFirst({
        where: { userId: ext.userId, orgId: membership.orgId, appId },
        select: { role: true },
      });
      appAccessRole = access?.role ?? null;
    }
  } catch {
    // DB lookup failed — fall back to the membership role, exactly as
    // readSession() does.
  }

  return {
    userId: ext.userId,
    orgId: membership.orgId,
    role: resolveCrmRole({ membershipRole: membership.role, appAccessRole }),
    email: ext.email,
    name: ext.name || ext.email,
  };
}
