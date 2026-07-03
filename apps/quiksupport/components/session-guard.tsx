"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

/**
 * Client-side live-revocation backstop — same as every QuikIT app. Polls
 * `/api/session/validate` on mount / focus / interval and bounces the user out
 * when the session, org, or app access is revoked while they're inside the app.
 * The server-side `requireAppAccess` gate in (dashboard)/layout.tsx is the
 * first line; this catches access lost mid-session.
 */
export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});
