import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";

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
