import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

const TTL_SECONDS = 60;

/**
 * Short-lived handshake credential for the realtime gateway. The NextAuth
 * session cookie is httpOnly and on a different origin, so the browser can't
 * put it in the Socket.IO handshake — instead it fetches this ~60s JWT and
 * passes it as `io(url, { auth: { token } })`. The client re-fetches on every
 * (re)connect (see createRealtimeClient).
 */
export const GET = withOrgAuth(async (_req, ctx) => {
  const secret = process.env.REALTIME_TOKEN_SECRET;
  if (!secret) throw new HttpError(500, "REALTIME_TOKEN_SECRET is not configured");
  const token = jwt.sign({ userId: ctx.userId, orgId: ctx.orgId }, secret, {
    expiresIn: TTL_SECONDS,
  });
  return Response.json({ token, expiresIn: TTL_SECONDS });
});
