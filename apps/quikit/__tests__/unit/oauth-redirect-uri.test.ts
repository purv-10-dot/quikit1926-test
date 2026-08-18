import { describe, it, expect, afterEach } from "vitest";
import { redirectUriMatches, resolveAppOrigin } from "@/lib/oauth";

describe("redirectUriMatches", () => {
  it("matches an exact registered URI", () => {
    expect(redirectUriMatches("https://quikscale.vercel.app/api/auth/callback/quikit", "https://quikscale.vercel.app/api/auth/callback/quikit")).toBe(true);
  });

  it("rejects a non-matching exact URI", () => {
    expect(redirectUriMatches("https://quikscale.vercel.app/callback", "https://evil.example.com/callback")).toBe(false);
  });

  it("matches any port on localhost against a registered wildcard-port pattern", () => {
    expect(redirectUriMatches("http://localhost:*/callback", "http://localhost:53219/callback")).toBe(true);
    expect(redirectUriMatches("http://localhost:*/callback", "http://localhost:9999/callback")).toBe(true);
  });

  it("matches any port on 127.0.0.1 against a registered wildcard-port pattern", () => {
    expect(redirectUriMatches("http://127.0.0.1:*/callback", "http://127.0.0.1:41000/callback")).toBe(true);
  });

  it("rejects a wildcard pattern when the path differs", () => {
    expect(redirectUriMatches("http://localhost:*/callback", "http://localhost:53219/other")).toBe(false);
  });

  it("rejects a wildcard pattern when the host differs", () => {
    expect(redirectUriMatches("http://localhost:*/callback", "http://127.0.0.1:53219/callback")).toBe(false);
  });

  it("does not honor a wildcard for a non-loopback host", () => {
    // Only localhost/127.0.0.1 are eligible for the wildcard pattern at all —
    // a registration for another host with a literal ":*" is just malformed
    // and must not match anything.
    expect(redirectUriMatches("http://example.com:*/callback", "http://example.com:8080/callback")).toBe(false);
  });

  it("rejects a malformed actual URI rather than throwing", () => {
    expect(redirectUriMatches("http://localhost:*/callback", "not-a-url")).toBe(false);
  });
});

describe("resolveAppOrigin", () => {
  const ENV_KEY = "QUIKSCALE_URL";
  const ORIGINAL = process.env[ENV_KEY];

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = ORIGINAL;
  });

  it("falls back to the DB baseUrl when no env override is set", () => {
    delete process.env[ENV_KEY];
    expect(resolveAppOrigin({ slug: "quikscale", baseUrl: "https://quikscale.example.com" })).toBe(
      "https://quikscale.example.com",
    );
  });

  it("prefers a per-app env override over the DB baseUrl", () => {
    process.env[ENV_KEY] = "http://localhost:3010";
    expect(resolveAppOrigin({ slug: "quikscale", baseUrl: "https://quikscale.example.com" })).toBe(
      "http://localhost:3010",
    );
  });
});
