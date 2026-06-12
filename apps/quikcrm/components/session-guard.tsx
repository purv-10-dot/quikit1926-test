"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

/**
 * Shared session-liveness guard, mirroring apps/admin and apps/quikscale.
 *
 * Wraps the dashboard so the client revalidates the session on tab-focus, on
 * a jittered ~24h background poll, and re-checks membership via session
 * update — logging the user out when their membership or app access is
 * revoked. The validation endpoint lives at /api/session/validate.
 */
export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});
