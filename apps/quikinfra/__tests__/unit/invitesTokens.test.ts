import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateInviteToken,
  isTokenValid,
  formatExpiryHint,
} from "@/lib/invites/tokens";

describe("generateInviteToken", () => {
  const original = process.env.INVITE_TTL_HOURS;
  afterEach(() => {
    if (original === undefined) delete process.env.INVITE_TTL_HOURS;
    else process.env.INVITE_TTL_HOURS = original;
  });

  it("returns a 64-char hex token (32 random bytes)", () => {
    const { token } = generateInviteToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a unique token each call", () => {
    const a = generateInviteToken().token;
    const b = generateInviteToken().token;
    expect(a).not.toBe(b);
  });

  it("expiresAt is a valid ISO timestamp in the future (~72h default)", () => {
    delete process.env.INVITE_TTL_HOURS;
    const before = Date.now();
    const { expiresAt } = generateInviteToken();
    const ms = new Date(expiresAt).getTime();
    expect(Number.isNaN(ms)).toBe(false);
    const hoursAhead = (ms - before) / (60 * 60 * 1000);
    expect(hoursAhead).toBeGreaterThan(71);
    expect(hoursAhead).toBeLessThan(73);
  });

  it("honours INVITE_TTL_HOURS override", () => {
    process.env.INVITE_TTL_HOURS = "1";
    const before = Date.now();
    const { expiresAt } = generateInviteToken();
    const hoursAhead = (new Date(expiresAt).getTime() - before) / (60 * 60 * 1000);
    expect(hoursAhead).toBeGreaterThan(0.9);
    expect(hoursAhead).toBeLessThan(1.1);
  });

  it("falls back to 72h when INVITE_TTL_HOURS is non-numeric", () => {
    process.env.INVITE_TTL_HOURS = "not-a-number";
    const before = Date.now();
    const { expiresAt } = generateInviteToken();
    const hoursAhead = (new Date(expiresAt).getTime() - before) / (60 * 60 * 1000);
    expect(hoursAhead).toBeGreaterThan(71);
    expect(hoursAhead).toBeLessThan(73);
  });
});

describe("isTokenValid", () => {
  it("is true for a token expiring in the future", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(isTokenValid({ inviteToken: "abc", inviteTokenExpires: future })).toBe(true);
  });

  it("is false for an expired token", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isTokenValid({ inviteToken: "abc", inviteTokenExpires: past })).toBe(false);
  });

  it("is false when token or expiry is missing/null", () => {
    expect(isTokenValid({ inviteToken: null, inviteTokenExpires: "x" })).toBe(false);
    expect(isTokenValid({ inviteToken: "abc", inviteTokenExpires: null })).toBe(false);
    expect(isTokenValid({})).toBe(false);
  });

  it("is false when the expiry timestamp is unparseable", () => {
    expect(
      isTokenValid({ inviteToken: "abc", inviteTokenExpires: "garbage" }),
    ).toBe(false);
  });

  it("round-trips a freshly generated token as valid", () => {
    const { token, expiresAt } = generateInviteToken();
    expect(
      isTokenValid({ inviteToken: token, inviteTokenExpires: expiresAt }),
    ).toBe(true);
  });
});

describe("formatExpiryHint", () => {
  it("says 'already expired' for past timestamps", () => {
    expect(formatExpiryHint(new Date(Date.now() - 1000).toISOString())).toBe(
      "already expired",
    );
  });

  it("says 'less than an hour' when it rounds to under 1h away", () => {
    // 20 min rounds to 0 hours → "less than an hour".
    const soon = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    expect(formatExpiryHint(soon)).toBe("less than an hour");
  });

  it("reports hours when under 48h", () => {
    const t = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    expect(formatExpiryHint(t)).toBe("5 hours");
  });

  it("reports days when 48h or more away", () => {
    const t = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    expect(formatExpiryHint(t)).toBe("3 days");
  });
});
