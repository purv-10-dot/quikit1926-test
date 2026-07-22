/**
 * CalendarProvider selection (S15a + S15b). `CALENDAR_MODE` picks the active
 * provider for the deployment (a single provider for now — a per-user composite
 * router is out of scope). Misconfig (incomplete env) → stub fallback + a boot
 * warning; never crash. The active mode is logged once.
 *
 *   stub       (default)  — hermetic, deterministic
 *   google     single-account via GMAIL_REFRESH_TOKEN (+ client id/secret)
 *   microsoft  per-user OAuth connect (needs client/secret/redirect + enc key)
 */
import { logger } from "@/lib/shared";
import { GoogleCalendarProvider, googleConfigFromEnv } from "./google";
import { MicrosoftCalendarProvider, microsoftConfigFromEnv } from "./microsoft";
import { StubCalendarProvider } from "./stub";
import type { CalendarMode, CalendarProvider } from "./types";

/** Pure mode selection from an env-like object (for tests). */
export function selectCalendarMode(env: Record<string, string | undefined> = process.env): {
  mode: CalendarMode;
  warning?: string;
} {
  const requested = env.CALENDAR_MODE;
  if (requested === "google") {
    if (googleConfigFromEnv(env)) return { mode: "google" };
    return {
      mode: "stub",
      warning: "CALENDAR_MODE=google but GOOGLE_CLIENT_ID/SECRET/GMAIL_REFRESH_TOKEN are unset",
    };
  }
  if (requested === "microsoft") {
    if (microsoftConfigFromEnv(env)) return { mode: "microsoft" };
    return {
      mode: "stub",
      warning:
        "CALENDAR_MODE=microsoft but MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI/CALENDAR_TOKEN_ENC_KEY are unset",
    };
  }
  return { mode: "stub" };
}

// Cache is keyed by the REQUESTED mode (not the effective one) so a Google
// provider that failed its boot health check and fell back to the stub isn't
// re-probed on every request.
let cached: { requestedMode: CalendarMode; provider: CalendarProvider } | null = null;

function build(mode: CalendarMode): CalendarProvider {
  if (mode === "google") return new GoogleCalendarProvider(googleConfigFromEnv()!);
  if (mode === "microsoft") return new MicrosoftCalendarProvider(microsoftConfigFromEnv()!);
  return new StubCalendarProvider();
}

/**
 * Resolve the active provider. For providers with a health/scope probe (Google),
 * run `verify()` once at construction and FALL BACK TO STUB if unhealthy (e.g. a
 * Gmail-only token), logging the actionable message — so a bad token can't 500
 * every request (parity with Microsoft's env-misconfig fallback). Async because
 * the probe is a network call.
 */
export async function getCalendarProvider(): Promise<CalendarProvider> {
  const { mode, warning } = selectCalendarMode();
  if (cached && cached.requestedMode === mode) return cached.provider;
  if (warning) logger.warn({ warning }, "calendar provider misconfigured — falling back to stub");

  let provider = build(mode);
  if (mode !== "stub" && provider.verify) {
    const health = await provider.verify().catch((e: unknown) => ({
      healthy: false,
      message: e instanceof Error ? e.message : "calendar probe failed",
    }));
    if (!health.healthy) {
      logger.warn(
        { mode, message: health.message },
        "calendar provider unhealthy — falling back to stub",
      );
      provider = new StubCalendarProvider();
    }
  }
  logger.info({ mode }, "calendar provider active");
  cached = { requestedMode: mode, provider };
  return provider;
}

/** The active provider id (for the client connection/status DTO). */
export function getActiveProviderId(): CalendarMode {
  return selectCalendarMode().mode;
}

/** Test hook: drop the cached provider so a new env selection takes effect. */
export function __resetCalendarForTest(): void {
  cached = null;
}

export * from "./types";
