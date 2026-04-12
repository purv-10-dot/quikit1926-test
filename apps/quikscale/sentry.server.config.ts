/**
 * Sentry server-side configuration.
 *
 * This runs on the Node.js server (API routes, SSR, middleware).
 * Captures unhandled exceptions, promise rejections, and performance
 * traces from database queries and API handlers.
 *
 * DSN is loaded from SENTRY_DSN (server env, NOT public).
 * If unset, Sentry silently no-ops.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  enabled: process.env.NODE_ENV !== "development",

  environment: process.env.NODE_ENV ?? "development",
});
