import { afterEach, describe, expect, it } from "vitest";
import { assertProductionSecrets, register } from "./instrumentation";

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
