import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";
import { touchAuthSession } from "@quikit/auth/session-store";

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
 * Returns: { valid, userId, email, activeOrgId, orgRole, isSuperAdmin }
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
  return NextResponse.json({
    valid: true,
    userId: token.id,
    email: token.email,
    activeOrgId,
    orgRole: token.membershipRole ?? null,
    isSuperAdmin: token.isSuperAdmin ?? false,
  });
}
