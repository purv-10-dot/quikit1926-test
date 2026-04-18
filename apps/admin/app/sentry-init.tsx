"use client";

/**
 * Side-effect import of the Sentry client config. Mounts in the root layout
 * so Sentry.init() runs once on first client render.
 */
import "../sentry.client.config";

export function SentryInit() {
  return null;
}
