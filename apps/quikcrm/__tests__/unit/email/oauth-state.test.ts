import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OAuthStateError,
  signState,
  verifyState,
} from "@/lib/services/email/oauth-state";

const PAYLOAD = { userId: "u1", orgId: "org1", provider: "gmail" as const, nonce: "n1" };

describe("oauth-state", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret-value";
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NEXTAUTH_SECRET;
  });

  it("round-trips a signed state", () => {
    const state = signState(PAYLOAD);
    const out = verifyState(state);
    expect(out.userId).toBe("u1");
    expect(out.orgId).toBe("org1");
    expect(out.provider).toBe("gmail");
    expect(typeof out.iat).toBe("number");
  });

  it("rejects a tampered payload", () => {
    const state = signState(PAYLOAD);
    const [data, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...PAYLOAD, orgId: "attacker-org", iat: Date.now() }),
    ).toString("base64url");
    expect(() => verifyState(`${forged}.${sig}`)).toThrow(OAuthStateError);
    // sanity: original data still verifies
    expect(() => verifyState(`${data}.${sig}`)).not.toThrow();
  });

  it("rejects an invalid signature", () => {
    const state = signState(PAYLOAD);
    const [data] = state.split(".");
    expect(() => verifyState(`${data}.deadbeef`)).toThrow(OAuthStateError);
  });

  it("rejects a state signed with a different secret", () => {
    const state = signState(PAYLOAD);
    process.env.NEXTAUTH_SECRET = "a-completely-different-secret";
    expect(() => verifyState(state)).toThrow(OAuthStateError);
  });

  it("rejects malformed input", () => {
    expect(() => verifyState("nodot")).toThrow(OAuthStateError);
    expect(() => verifyState("a.b.c")).toThrow(OAuthStateError);
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const state = signState(PAYLOAD);
    // advance 11 minutes (> 10 min max age)
    vi.setSystemTime(new Date("2026-01-01T00:11:00Z"));
    expect(() => verifyState(state)).toThrow(/expired/i);
  });
});
