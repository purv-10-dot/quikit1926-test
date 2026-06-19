import { SignJWT, jwtVerify } from "jose";

/** Claims carried inside the session JWT. */
export interface SessionClaims {
  userId: string;
  orgId: string;
  email: string;
  /** Session id — must match Employee.activeSessionId for the token to be valid. */
  jti: string;
}

export const SESSION_COOKIE = "hrms_session";
const ALG = "HS256";
// Short-lived access token. Sessions stay alive across this expiry via the
// refresh-token flow (POST /api/v1/hrms/auth/refresh).
const MAX_AGE_SEC = 60 * 10; // 10 minutes

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secret());
}

/** Returns claims when the token is valid & unexpired, else null. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (!payload.userId || !payload.orgId || !payload.jti) return null;
    return {
      userId: String(payload.userId),
      orgId: String(payload.orgId),
      email: String(payload.email ?? ""),
      jti: String(payload.jti),
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SEC = MAX_AGE_SEC;
