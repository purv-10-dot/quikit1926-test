import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { apiDocsEnabled, OPENAPI_YAML, SPEC_PATH } from "./api-docs";

interface OpenApiDoc {
  openapi: string;
  servers: Array<{ url: string }>;
  components?: { securitySchemes?: Record<string, { in?: string; name?: string }> };
}

describe("apiDocsEnabled", () => {
  it("defaults to enabled when the var is unset", () => {
    expect(apiDocsEnabled({})).toBe(true);
  });

  it("is disabled by off / 0 / false, case- and space-insensitively", () => {
    for (const raw of ["off", "OFF", " off ", "0", "false", "False"]) {
      expect(apiDocsEnabled({ QUIKCHAT_API_DOCS: raw })).toBe(false);
    }
  });

  it("stays enabled for any other value", () => {
    for (const raw of ["on", "1", "true", "yes", ""]) {
      expect(apiDocsEnabled({ QUIKCHAT_API_DOCS: raw })).toBe(true);
    }
  });
});

describe("docs/openapi.yaml contract", () => {
  const doc = load(OPENAPI_YAML) as OpenApiDoc;

  it("is inlined as parseable YAML at build time", () => {
    expect(doc.openapi).toBe("3.0.3");
    expect(Array.isArray(doc.servers)).toBe(true);
  });

  /**
   * The whole point of hosting the viewer in-app: "Try it out" must issue
   * SAME-ORIGIN requests so the browser attaches the NextAuth session cookie.
   * Swagger UI targets `servers[0]` by default, so an absolute origin in that
   * slot silently sends every request cross-origin — cookie dropped, and the
   * CSP `connect-src` blocks it. This is a spec-level constraint, not a UI one.
   */
  it("declares a relative server FIRST so Try-it-out stays same-origin", () => {
    expect(doc.servers[0]?.url).toBe("/");
  });

  it("still documents the absolute origin for non-browser clients", () => {
    expect(doc.servers.some((s) => s.url.startsWith("https://"))).toBe(true);
  });

  it("documents cookie auth — the constraint the page's banner warns about", () => {
    expect(doc.components?.securitySchemes?.sessionCookie?.in).toBe("cookie");
  });

  it("points the viewer at a same-origin spec path", () => {
    expect(SPEC_PATH.startsWith("/")).toBe(true);
    expect(SPEC_PATH).not.toMatch(/^https?:/);
  });
});
