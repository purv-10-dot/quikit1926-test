/**
 * lib/auth.ts — SSO configuration guard.
 *
 * This pins the fix for a production outage on insights.quikit.ai. The module
 * used to fall back to a credentials provider whenever a QUIKIT_* var was
 * missing, so a misconfigured pod served a different auth system than the app
 * expected: app/login/page.tsx calls signIn("quikit"), the provider was absent,
 * NextAuth bounced back to /login, and the page re-fired sign-in forever. An
 * infinite redirect loop, with no error logged anywhere.
 *
 * The three cases below are the whole contract:
 *   deployed + configured   → the quikit OAuth provider
 *   deployed + unconfigured → throw, naming the missing variables
 *   local dev unconfigured  → credentials fallback still works
 */
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";

const OAUTH_ENV = {
  QUIKIT_URL: "https://apps.quikit.ai",
  QUIKIT_CLIENT_ID: "quikinsight",
  QUIKIT_CLIENT_SECRET: "s3cret",
};

/**
 * Keys this suite owns. Only these are cleared between cases — process.env is
 * never wholesale-replaced, because the global setup puts DATABASE_URL there
 * for the Prisma client that @quikit/auth constructs at import time.
 */
const OWNED_KEYS = [
  "NODE_ENV",
  "NEXT_PHASE",
  "QUIKIT_URL",
  "QUIKIT_ISSUER_URL",
  "QUIKIT_CLIENT_ID",
  "QUIKIT_CLIENT_SECRET",
] as const;

const saved: Record<string, string | undefined> = {};

/** Import lib/auth fresh under a specific environment. */
async function loadAuth(env: Record<string, string | undefined>) {
  vi.resetModules();
  const mutable = process.env as Record<string, string | undefined>;
  for (const key of OWNED_KEYS) delete mutable[key];
  Object.assign(process.env, env);
  return import("@/lib/auth");
}

beforeEach(() => {
  const mutable = process.env as Record<string, string | undefined>;
  for (const key of OWNED_KEYS) saved[key] = mutable[key];
});

afterEach(() => {
  const mutable = process.env as Record<string, string | undefined>;
  for (const key of OWNED_KEYS) {
    if (saved[key] === undefined) delete mutable[key];
    else mutable[key] = saved[key];
  }
});

describe("lib/auth SSO guard", () => {
  it("registers the quikit provider when fully configured", async () => {
    const { authOptions } = await loadAuth({ NODE_ENV: "production", ...OAUTH_ENV });
    expect(authOptions.providers.map((p) => p.id)).toContain("quikit");
  });

  it("throws on a deployed environment when the QUIKIT_* vars are missing", async () => {
    await expect(loadAuth({ NODE_ENV: "production" })).rejects.toThrow(/QuikIT SSO is not configured/);
  });

  it("names every missing variable so the pod log identifies the fix", async () => {
    // Partial config is the dangerous case — it looks configured at a glance.
    await expect(
      loadAuth({ NODE_ENV: "production", QUIKIT_URL: OAUTH_ENV.QUIKIT_URL }),
    ).rejects.toThrow(/QUIKIT_CLIENT_ID.*QUIKIT_CLIENT_SECRET/s);
  });

  it("does NOT fall back to credentials on a deployed environment", async () => {
    // The regression itself: a credentials provider here is what /login cannot
    // use, and is therefore what produced the redirect loop.
    await expect(loadAuth({ NODE_ENV: "production" })).rejects.toThrow();
  });

  it("still falls back to credentials for local development", async () => {
    const { authOptions } = await loadAuth({ NODE_ENV: "development" });
    expect(authOptions.providers.length).toBeGreaterThan(0);
    expect(authOptions.providers.map((p) => p.id)).not.toContain("quikit");
  });

  it("stays silent during `next build`, which runs without runtime secrets", async () => {
    // Throwing here would break the Docker image build instead of catching a
    // misconfiguration — the env vars are injected by the deployment, later.
    await expect(
      loadAuth({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).resolves.toBeDefined();
  });

  it("accepts QUIKIT_ISSUER_URL as an alias for QUIKIT_URL", async () => {
    const { authOptions } = await loadAuth({
      NODE_ENV: "production",
      QUIKIT_ISSUER_URL: OAUTH_ENV.QUIKIT_URL,
      QUIKIT_CLIENT_ID: OAUTH_ENV.QUIKIT_CLIENT_ID,
      QUIKIT_CLIENT_SECRET: OAUTH_ENV.QUIKIT_CLIENT_SECRET,
    });
    expect(authOptions.providers.map((p) => p.id)).toContain("quikit");
  });
});
