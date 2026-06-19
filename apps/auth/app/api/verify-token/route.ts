import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";
import { touchAuthSession } from "@quikit/auth/session-store";
import { db } from "@quikit/database";

// Keep the shared Redis session alive on activity. Matches the 30-day TTL the
// central jwt callback mints with, so a user active only inside a consumer app
// (which validates here on every protected navigation) doesn't lapse.
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * GET /api/verify-token
 *
 * Called server-to-server by child apps that want to validate a JWT without
 * duplicating the NextAuth decoding logic. Accepts the token via:
 *   - Authorization: Bearer <jwt>
 *   - Cookie "next-auth.session-token"
 *
 * Returns: { valid, userId, email, activeOrgId, orgRole, isSuperAdmin, orgActive }
 *
 * `orgActive` reflects the live status of the token's selected org: false
 * once a super-admin suspends it. Consumer-app middleware reads this to bounce
 * users out of a suspended org on their very next protected navigation (reload
 * or module click), without waiting for the 5-minute JWT recheck.
 *
 * Access is gated by INTERNAL_SECRET — only trusted services can call it.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ valid: false, error: "Forbidden" }, { status: 403 });
  }
  const token = await verifyJWT(req);
  if (!token?.id) {
    return NextResponse.json({ valid: false });
  }
  // Session is valid → extend its TTL so active consumer-app users stay logged
  // in. No-op when the token carries no sessionId or Redis is unavailable.
  const sessionId = token.sessionId as string | undefined;
  if (sessionId) {
    await touchAuthSession(sessionId, SESSION_TTL_SECONDS);
  }
  const activeOrgId = (token.orgId as string | undefined) ?? null;
  // Live org-status check: a suspended (or archived) org is no longer usable
  // even though the JWT still carries its id. No org selected → nothing to
  // gate, so treat as active. One indexed PK lookup per protected navigation.
  let orgActive = true;
  if (activeOrgId) {
    const org = await db.org.findUnique({
      where: { id: activeOrgId },
      select: { status: true },
    });
    orgActive = org?.status === "active";
  }
  return NextResponse.json({
    valid: true,
    userId: token.id,
    email: token.email,
    activeOrgId,
    orgRole: token.membershipRole ?? null,
    isSuperAdmin: token.isSuperAdmin ?? false,
    orgActive,
  });
}
