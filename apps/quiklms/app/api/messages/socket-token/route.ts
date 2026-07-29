import { SignJWT } from 'jose';
import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { env } from '@/lib/env';

/**
 * GET /api/messages/socket-token — mint a short-lived token for the Socket.IO
 * handshake. Any authenticated LMS actor may mint one for THEMSELVES.
 *
 * WHY THIS EXISTS. The worker's `/messages` namespace verifies an HS256 JWT on
 * the handshake (`worker/src/jwt.ts`), exactly as the legacy `MessagesGateway`
 * did (`messages.gateway.ts:78-95`). But the browser had no way to obtain one —
 * `lib/socket.ts` connected with no token at all, so the worker rejected every
 * handshake and the entire realtime layer was dead (GAP_REPORT §3.2 messages,
 * break #3).
 *
 * AUTH: this route CONSUMES the centralized session (`requireAuth` →
 * NextAuth/QuikIT SSO) and does not touch, extend or re-implement it. The token
 * is derived from an already-established session; it grants no authority the
 * caller does not already hold, and mints only for `user.id` — never an id
 * supplied by the caller.
 *
 * `tenantId` is the claim name because that is what the worker and the legacy
 * gateway read (`messages.gateway.ts:87`). Its VALUE is the orgId — the
 * org-wide rename kept the claim name for wire compatibility with the worker.
 */

/** Short TTL: the socket only needs it for the handshake, and the client
 *  re-mints on every (re)connect. Matches the legacy's disposable-token use. */
const TOKEN_TTL = '15m';

export const GET = route(async (req) => {
  const user = await requireAuth(req);

  // The worker requires BOTH sub and tenantId and disconnects without them
  // (`messages.gateway.ts:95-99`). Fail here with a real status rather than
  // handing out a token that can only produce a silent handshake rejection.
  if (!user.orgId) {
    return json({ success: false, message: 'No organization on the current session' }, 403);
  }

  const token = await new SignJWT({ tenantId: user.orgId, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(new TextEncoder().encode(env.JWT_SECRET));

  return json({ success: true, data: { token } });
});
