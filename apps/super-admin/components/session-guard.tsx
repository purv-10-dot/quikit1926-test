"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});
