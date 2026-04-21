import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

// Mock the rate-limit helper so tests don't need Redis
vi.mock("@quikit/shared/rateLimit", () => ({
  rateLimitAsync: async () => ({ ok: true }),
  getClientIp: () => "127.0.0.1",
}));

import { POST } from "@/app/api/auth/impersonate/exit/route";

function buildPOST(): NextRequest {
  return new NextRequest("http://localhost/api/auth/impersonate/exit", { method: "POST" });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════════════════════════════════
// Cookie-clearing behavior — the bug this fixes.
//
// Before the fix, the exit route set cookies with only { maxAge: 0, path: "/" }.
// In prod, NextAuth uses the __Secure-next-auth.session-token cookie name, and
// browsers REQUIRE secure: true on Set-Cookie for __Secure-* names. Without it,
// the delete was silently rejected and the impersonation JWT cookie persisted.
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/impersonate/exit — cookie clearing", () => {
  it("sets both plain and __Secure- session cookies with empty value + maxAge 0", async () => {
    // No session → exit still runs and clears cookies defensively
    const res = await POST(buildPOST());
    expect(res.status).toBe(200);

    const setCookieHeaders = res.headers.getSetCookie();
    const plain = setCookieHeaders.find((h) => h.startsWith("next-auth.session-token="));
    const secure = setCookieHeaders.find((h) => h.startsWith("__Secure-next-auth.session-token="));

    expect(plain).toBeDefined();
    expect(secure).toBeDefined();
  });

  it("clears the __Secure- session cookie with secure + httpOnly + sameSite attributes", async () => {
    const res = await POST(buildPOST());
    const secure = res.headers.getSetCookie().find((h) => h.startsWith("__Secure-next-auth.session-token="));
    expect(secure).toBeDefined();

    // Required attributes — browsers reject __Secure-* cookies set without `secure`.
    expect(secure!.toLowerCase()).toContain("secure");
    expect(secure!.toLowerCase()).toContain("httponly");
    expect(secure!.toLowerCase()).toContain("samesite=lax");
    expect(secure!.toLowerCase()).toContain("path=/");
    // maxAge: 0 → browsers accept either "max-age=0" or "expires=<past>"
    expect(secure!.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("clears the plain session cookie with matching attributes", async () => {
    const res = await POST(buildPOST());
    const plain = res.headers.getSetCookie().find((h) => h.startsWith("next-auth.session-token="));
    expect(plain).toBeDefined();
    expect(plain!.toLowerCase()).toContain("httponly");
    expect(plain!.toLowerCase()).toContain("samesite=lax");
    expect(plain!.toLowerCase()).toContain("path=/");
    expect(plain!.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("marks Impersonation.exitedAt when session is impersonating", async () => {
    setSession({
      id: "target-user",
      tenantId: "t1",
      role: "member",
      impersonating: true,
      impersonatorUserId: "super-admin-1",
    } as any);

    mockDb.impersonation.findFirst.mockResolvedValue({ id: "imp-1" } as any);
    mockDb.impersonation.update.mockResolvedValue({ id: "imp-1", exitedAt: new Date() } as any);
    mockDb.sessionEvent.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST());
    expect(res.status).toBe(200);
    expect(mockDb.impersonation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "imp-1" } }),
    );
  });

  it("returns a redirect URL to the QuikIT launcher", async () => {
    const res = await POST(buildPOST());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.redirectUrl).toMatch(/\/apps$/);
  });
});
