import { describe, it, expect } from "vitest";
import { buildCsp, generateNonce } from "@/lib/csp";

// SEC-06 regression: the CSP must no longer allow inline script execution
// (the SEC-01 stored-XSS backstop). script-src is nonce + strict-dynamic only.

function directive(csp: string, name: string): string {
  const part = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " "));
  return part ?? "";
}

describe("buildCsp (SEC-06)", () => {
  const csp = buildCsp("TESTNONCE");

  it("puts the nonce and strict-dynamic in script-src", () => {
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).toContain("'nonce-TESTNONCE'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("does NOT allow 'unsafe-inline' in script-src", () => {
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("locks down default-src, frame-ancestors, base-uri and form-action", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});

describe("generateNonce (SEC-06)", () => {
  it("returns a non-empty base64 string", () => {
    const nonce = generateNonce();
    expect(nonce.length).toBeGreaterThan(0);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("is unique per call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
