/**
 * Sentry client-side configuration for the Admin app.
 *
 * DSN is loaded from NEXT_PUBLIC_SENTRY_DSN. If unset, Sentry silently
 * no-ops — the app runs identically without it.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  enabled: process.env.NODE_ENV !== "development",

  environment: process.env.NODE_ENV ?? "development",
});
