"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

/**
 * Live-revocation guard. Polls `/api/session/validate` on mount, route change,
 * window focus, and an interval; bounces the user if their session / org / app
 * access is revoked while they are inside QuikChat. Standard across all apps.
 */
export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});
