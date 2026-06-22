/**
 * Short-lived handshake token for the Socket.io connection.
 *
 * NextAuth's session JWT lives in an httpOnly cookie the browser JS cannot read,
 * and the socket server runs on a different origin (so the cookie isn't sent
 * cross-site by default). Instead, the app mints a short-lived token from the
 * authenticated session via `/api/realtime/token`, the client passes it in the
 * Socket.io handshake, and the socket server verifies it with the shared secret.
 *
 * Node-only (uses `jsonwebtoken`). Do not import from client components.
 */
import jwt from "jsonwebtoken";

/** Falls back to NEXTAUTH_SECRET so no new secret is strictly required. */
function secret(): string {
  const s = process.env.REALTIME_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error(
      "[realtime] REALTIME_JWT_SECRET (or NEXTAUTH_SECRET) must be set to sign/verify handshake tokens.",
    );
  }
  return s;
}

export interface RealtimeTokenClaims {
  userId: string;
  orgId: string;
  teamId: string | null;
}

/** Sign a handshake token (default TTL 10 minutes — clients reconnect with a fresh one). */
export function signRealtimeToken(
  claims: RealtimeTokenClaims,
  ttlSeconds = 600,
): string {
  return jwt.sign(claims, secret(), { expiresIn: ttlSeconds, algorithm: "HS256" });
}

/** Verify + decode a handshake token. Returns null on any failure. */
export function verifyRealtimeToken(token: string | undefined): RealtimeTokenClaims | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret(), { algorithms: ["HS256"] });
    if (typeof decoded !== "object" || decoded === null) return null;
    const { userId, orgId, teamId } = decoded as Record<string, unknown>;
    if (typeof userId !== "string" || typeof orgId !== "string") return null;
    return { userId, orgId, teamId: typeof teamId === "string" ? teamId : null };
  } catch {
    return null;
  }
}
