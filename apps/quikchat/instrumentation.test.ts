import { afterEach, describe, expect, it, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted) so the boot
// assertion's App lookup is controllable without a database.
import { mockDb } from "./__tests__/helpers/mockDb";
import {
  assertProductionSecrets,
  assertQuikChatAppRegistered,
  register,
} from "./instrumentation";

const ENV_KEYS = [
  "NODE_ENV",
  "NEXT_RUNTIME",
  "DATABASE_URL",
  "UPLOAD_TOKEN_SECRET",
  "AGENT_JWT_SECRET",
] as const;
type EnvKey = (typeof ENV_KEYS)[number];

// Next's ProcessEnv augmentation marks NODE_ENV readonly; cast once so tests can
// still set it directly rather than routing through a defineProperty dance.
const env = process.env as unknown as Record<EnvKey, string | undefined>;

function snapshot(): Record<EnvKey, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, env[k]])) as Record<EnvKey, string | undefined>;
}

function restore(saved: Record<EnvKey, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
}

describe("assertProductionSecrets", () => {
  let saved: Record<EnvKey, string | undefined>;
  afterEach(() => restore(saved));

  it("is a no-op outside production, even with both secrets missing", () => {
    saved = snapshot();
    env.NODE_ENV = "development";
    delete env.UPLOAD_TOKEN_SECRET;
    delete env.AGENT_JWT_SECRET;
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it("does not throw in production once both secrets are set", () => {
    saved = snapshot();
    env.NODE_ENV = "production";
    env.UPLOAD_TOKEN_SECRET = "real-upload-secret";
    env.AGENT_JWT_SECRET = "real-agent-secret";
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it("throws naming the single missing var in production", () => {
    saved = snapshot();
    env.NODE_ENV = "production";
    env.UPLOAD_TOKEN_SECRET = "real-upload-secret";
    delete env.AGENT_JWT_SECRET;
    expect(() => assertProductionSecrets()).toThrow(/AGENT_JWT_SECRET/);
  });

  it("throws once naming BOTH missing vars, not just the first", () => {
    saved = snapshot();
    env.NODE_ENV = "production";
    delete env.UPLOAD_TOKEN_SECRET;
    delete env.AGENT_JWT_SECRET;
    try {
      assertProductionSecrets();
      throw new Error("expected assertProductionSecrets to throw");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).toMatch(/UPLOAD_TOKEN_SECRET/);
      expect(message).toMatch(/AGENT_JWT_SECRET/);
    }
  });
});

describe("register", () => {
  let saved: Record<EnvKey, string | undefined>;
  afterEach(() => restore(saved));

  it("rejects on boot when NEXT_RUNTIME=nodejs, NODE_ENV=production, and a secret is missing", async () => {
    saved = snapshot();
    env.NEXT_RUNTIME = "nodejs";
    env.NODE_ENV = "production";
    delete env.DATABASE_URL;
    env.UPLOAD_TOKEN_SECRET = "real-upload-secret";
    delete env.AGENT_JWT_SECRET;
    await expect(register()).rejects.toThrow(/AGENT_JWT_SECRET/);
  });

  it("does not reject outside the nodejs runtime, even if secrets are missing in production", async () => {
    saved = snapshot();
    env.NEXT_RUNTIME = "edge";
    env.NODE_ENV = "production";
    delete env.UPLOAD_TOKEN_SECRET;
    delete env.AGENT_JWT_SECRET;
    await expect(register()).resolves.toBeUndefined();
  });

  it("resolves when nodejs + production + both secrets set, with no DATABASE_URL", async () => {
    saved = snapshot();
    env.NEXT_RUNTIME = "nodejs";
    env.NODE_ENV = "production";
    delete env.DATABASE_URL;
    env.UPLOAD_TOKEN_SECRET = "real-upload-secret";
    env.AGENT_JWT_SECRET = "real-agent-secret";
    await expect(register()).resolves.toBeUndefined();
  });
});

/**
 * The App-row boot assertion.
 *
 * The failure it exists for is SILENCE: with no `App` row for slug `quikchat`,
 * `getQuikChatAppId()` returns null, so `userCan()` is false for everything and
 * no role can be seeded — yet the app serves chat happily, because most routes
 * are not userCan-gated and `requireAdmin` never consults appId. A crash would
 * be noticed; this is not.
 *
 * Three-way behaviour, and the split is the point: unlike
 * `assertProductionSecrets` (pure env reads), this makes boot depend on the
 * DATABASE. `register()` runs per cold start, so an unconditional throw would
 * turn a transient DB blip into a crash loop across every one of them. We only
 * hard-fail when we actually KNOW the row is absent.
 */
describe("assertQuikChatAppRegistered", () => {
  let saved: Record<EnvKey, string | undefined>;
  afterEach(() => {
    restore(saved);
    vi.restoreAllMocks();
  });

  it("throws in production when the row is definitively absent", async () => {
    saved = snapshot();
    env.NODE_ENV = "production";
    mockDb.app.findUnique.mockResolvedValue(null as never);

    await expect(assertQuikChatAppRegistered()).rejects.toThrow(/slug "quikchat"/);
  });

  it("does not throw in production when the row exists", async () => {
    saved = snapshot();
    env.NODE_ENV = "production";
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);

    await expect(assertQuikChatAppRegistered()).resolves.toBeUndefined();
  });

  // The distinction that keeps a DB hiccup from becoming an outage: a failed
  // QUERY is not evidence of misconfiguration, so it must never fail the boot —
  // not even in production.
  it("does NOT throw in production when the query itself fails", async () => {
    saved = snapshot();
    env.NODE_ENV = "production";
    mockDb.app.findUnique.mockRejectedValue(new Error("ECONNREFUSED") as never);

    await expect(assertQuikChatAppRegistered()).resolves.toBeUndefined();
  });

  // Never hard-fail a local boot: a freshly-cloned DB without the row is a
  // normal state, and an assertion that breaks `npm run dev` gets deleted rather
  // than fixed.
  it("does not throw in development when the row is absent", async () => {
    saved = snapshot();
    env.NODE_ENV = "development";
    mockDb.app.findUnique.mockResolvedValue(null as never);

    await expect(assertQuikChatAppRegistered()).resolves.toBeUndefined();
  });
});
