import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";

/**
 * GET /api/extension-auth/organizations
 *
 * Lists the organizations the authenticated extension user can access.
 *
 * The LinkedIn extension authenticates its API calls with a Bearer token — the
 * NextAuth-compatible JWT minted by /api/extension-auth/callback. Token
 * verification is centralised in verifyExtensionToken (see that file for why
 * this bypasses the cookie-session guards).
 *
 * The org query is the standard active-membership / active-org lookup used
 * elsewhere in the app (e.g. app/api/apps/switcher/route.ts) — no new business
 * logic. Returns only orgs the user is an active member of.
 */
export async function GET(request: NextRequest) {
  try {
    const nextAuthSecret = process.env.NEXTAUTH_SECRET;
    if (!nextAuthSecret) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const extUser = await verifyExtensionToken(request);
    if (!extUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const memberships = await db.orgMember.findMany({
      where: { userId: extUser.userId, status: "active", org: { status: "active" } },
      select: { org: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const organizations = memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
    }));

    return NextResponse.json({ success: true, data: { organizations } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
