import jwt from "jsonwebtoken";

export interface HandshakeIdentity {
  userId: string;
  orgId: string;
}

/**
 * The ONLY algorithm the gateway accepts. The minting side
 * (`apps/quikchat/app/api/realtime/token/route.ts`) signs with a string secret,
 * which jsonwebtoken defaults to HS256 — pinning it here means a token signed
 * with any other algorithm is rejected outright rather than being verified on
 * whatever `alg` its own header claims.
 */
const ALLOWED_ALGORITHMS = ["HS256"] as const;

/**
 * Verify the short-lived handshake JWT minted by the app's
 * `GET /api/realtime/token`. Throws on missing/invalid/expired tokens, and on
 * any token whose `alg` is not HS256.
 */
export function verifyToken(token: string, secret: string): HandshakeIdentity {
  const decoded = jwt.verify(token, secret, { algorithms: [...ALLOWED_ALGORITHMS] });
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token payload");
  }
  const { userId, orgId } = decoded as Record<string, unknown>;
  if (typeof userId !== "string" || typeof orgId !== "string") {
    throw new Error("Token missing userId/orgId");
  }
  return { userId, orgId };
}
