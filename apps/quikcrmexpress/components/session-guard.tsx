"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

/**
 * Runtime app-access guard. Polls /api/session/validate on mount, on route
 * change, and on tab focus (plus a jittered ~24h interval), so revocation
 * takes effect while the user is already inside the app rather than at the
 * next full page load.
 *
 * The server-side requireAppAccess() call in (dashboard)/layout.tsx is the
 * gate for ENTERING the app; this is the live backstop for access lost while
 * the user is in it. Mirrors quikinfra / quikscale / quiktrack.
 */
export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});
