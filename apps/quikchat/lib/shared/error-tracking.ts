import { redactSecrets } from "./logger";

/**
 * Error-tracking seam. Lazily initializes `@sentry/node` ONLY when `SENTRY_DSN`
 * is set; a complete no-op otherwise (tests need no DSN). Never throws — a
 * failure in the seam must not change the request's outcome.
 */
type SentryModule = typeof import("@sentry/node");

let sentryPromise: Promise<SentryModule> | null = null;

async function getSentry(): Promise<SentryModule | null> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  if (!sentryPromise) {
    sentryPromise = import("@sentry/node").then((s) => {
      s.init({ dsn, tracesSampleRate: 0 });
      return s;
    });
  }
  return sentryPromise;
}

export async function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const sentry = await getSentry();
    if (!sentry) return;
    sentry.captureException(err, { extra: redactSecrets(context) as Record<string, unknown> });
  } catch {
    // The seam must never throw.
  }
}

export function __resetErrorTrackingForTest(): void {
  sentryPromise = null;
}
