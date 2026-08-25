import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * Regression coverage for the landing-page rollout: `/` must be reachable by
 * an unauthenticated visitor (200, not a redirect to central login), while
 * every other route stays protected. Mirrors the equivalent quikscale
 * behaviour — see apps/quikscale/middleware.ts's publicRoutes comment.
 */
function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3014"));
}

describe("quikflow middleware — publicRoutes", () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_URL;
    delete process.env.NEXT_PUBLIC_QUIKIT_URL;
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it("lets an unauthenticated visitor through to `/` (the marketing landing page)", async () => {
    const res = await middleware(makeRequest("/"));
    // NextResponse.next() carries no redirect Location and a 2xx-equivalent
    // "middleware ok" response (Next represents this as status 200 with the
    // x-middleware-next header, not a 307/308 redirect).
    expect(res?.headers.get("location")).toBeNull();
    expect([200, 307, 308]).toContain(res?.status ?? 200);
    expect(res?.status).not.toBe(307);
    expect(res?.status).not.toBe(308);
  });

  it("still redirects an unauthenticated visitor away from a protected route (/dashboard)", async () => {
    // No NEXT_PUBLIC_AUTH_URL configured (local-dev fallback): the factory's
    // same-host bounce to /login gets rewritten to "/" — the new marketing
    // landing page — by this app's middleware.ts wrapper, mirroring
    // apps/quikscale/middleware.ts's local-dev fallback. In production,
    // NEXT_PUBLIC_AUTH_URL is set and this instead redirects cross-host to
    // the central login (see the next test).
    const res = await middleware(makeRequest("/dashboard"));
    expect(res?.status).toBe(307);
    const location = res?.headers.get("location") ?? "";
    expect(location).toBe("http://localhost:3014/");
  });

  it("redirects to the central login host when NEXT_PUBLIC_AUTH_URL is configured (production)", async () => {
    process.env.NEXT_PUBLIC_AUTH_URL = "http://localhost:3001";
    vi.resetModules();
    const { middleware: prodMiddleware } = await import("@/middleware");
    const res = await prodMiddleware(makeRequest("/dashboard"));
    expect(res?.status).toBe(307);
    const location = res?.headers.get("location") ?? "";
    expect(location.startsWith("http://localhost:3001/login")).toBe(true);
  });

  it("keeps /login itself public", async () => {
    const res = await middleware(makeRequest("/login"));
    expect(res?.status).not.toBe(307);
    expect(res?.status).not.toBe(308);
  });

  it("only matches the exact root, not every path as a prefix (`/dashboard` isn't accidentally public)", async () => {
    // Regression guard: `pathname.startsWith("/")` would make EVERY route
    // public. @quikit/auth/middleware special-cases the literal "/" entry
    // for exact-match — this test fails loudly if that special-casing
    // regresses upstream.
    const res = await middleware(makeRequest("/dashboard/settings"));
    expect(res?.status).toBe(307);
  });
});
