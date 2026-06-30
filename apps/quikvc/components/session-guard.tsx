"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

/**
 * Runtime app-access guard. Polls /api/session/validate on mount, route change,
 * and tab focus; signs the user out (→ /login → launcher /apps) when this
 * org/user no longer has QuikVC access. Mirrors quikscale / quiktrack.
 */
export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});
