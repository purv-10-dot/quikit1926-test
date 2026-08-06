import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  signOAuthState,
  verifyOAuthState,
  OAUTH_STATE_TTL_SECONDS,
} from "@/lib/services/github/oauth-state";

const CLAIMS = { userId: "user_123", orgId: "org_abc", nonce: "nonce-xyz" };

describe("github oauth-state", () => {
  beforeEach(() => {
    process.env.GITHUB_OAUTH_STATE_SECRET = "test-secret-do-not-use-in-prod";
  });
  afterEach(() => {
    delete process.env.GITHUB_OAUTH_STATE_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  it("round-trips a signed state", async () => {
    const state = await signOAuthState(CLAIMS);
    const out = await verifyOAuthState(state);
    expect(out).toEqual(CLAIMS);
  });

  it("rejects a tampered state", async () => {
    const state = await signOAuthState(CLAIMS);
    // Corrupt the payload segment.
    const parts = state.split(".");
    parts[1] = parts[1].slice(0, -2) + (parts[1].endsWith("AA") ? "BB" : "AA");
    expect(await verifyOAuthState(parts.join("."))).toBeNull();
  });

  it("rejects a state signed with a different secret", async () => {
    const state = await signOAuthState(CLAIMS);
    process.env.GITHUB_OAUTH_STATE_SECRET = "a-totally-different-secret";
    expect(await verifyOAuthState(state)).toBeNull();
  });

  it("rejects an expired state", async () => {
    const state = await signOAuthState(CLAIMS, -1); // already expired
    expect(await verifyOAuthState(state)).toBeNull();
  });

  it("rejects empty / malformed input", async () => {
    expect(await verifyOAuthState("")).toBeNull();
    expect(await verifyOAuthState("not.a.jwt")).toBeNull();
  });

  it("falls back to NEXTAUTH_SECRET when the dedicated secret is absent", async () => {
    delete process.env.GITHUB_OAUTH_STATE_SECRET;
    process.env.NEXTAUTH_SECRET = "nextauth-fallback-secret";
    const state = await signOAuthState(CLAIMS);
    expect(await verifyOAuthState(state)).toEqual(CLAIMS);
  });

  it("throws when no secret is configured", async () => {
    delete process.env.GITHUB_OAUTH_STATE_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    await expect(signOAuthState(CLAIMS)).rejects.toThrow(/state secret missing/);
  });

  it("exposes a sane default TTL", () => {
    expect(OAUTH_STATE_TTL_SECONDS).toBeGreaterThan(0);
  });
});
