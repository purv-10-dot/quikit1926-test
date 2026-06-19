import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Regression coverage for central session synchronization (fix/hrms-session-management).
 *
 * Before the fix, apps/quikhrms/lib/auth.ts dropped the IdP's `sessionId`
 * claim, so:
 *  - central logout / admin force-logout NEVER propagated to HRMS (a revoked
 *    user kept a working session for up to 7 days), and
 *  - HRMS sign-out could not revoke the shared Redis session, so /login's
 *    auto-SSO silently signed the user straight back in.
 *
 * The SSE stream route additionally trusted client-supplied orgId/employeeId
 * query params in production, letting anyone subscribe to any tenant's events.
 */

const isAuthSessionActive = vi.fn();
const revokeAuthSession = vi.fn();
const invalidateUserAuthCaches = vi.fn();

vi.mock("@quikit/auth/session-store", () => ({
  isAuthSessionActive: (...a: unknown[]) => isAuthSessionActive(...a),
  revokeAuthSession: (...a: unknown[]) => revokeAuthSession(...a),
}));
// auth.ts dynamically imports @/lib/with-auth in the signOut event; mock it so
// the test never touches prisma.
vi.mock("@/lib/with-auth", () => ({
  invalidateUserAuthCaches: (...a: unknown[]) => invalidateUserAuthCaches(...a),
  resolveIdentity: vi.fn(),
}));

type JwtCallback = (args: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown>>;
type SignOutEvent = (args: { token: Record<string, unknown> | null }) => Promise<void>;

async function loadAuthOptions() {
  const mod = await import("@/lib/auth");
  return mod.authOptions as unknown as {
    providers: Array<{ profile: (p: Record<string, unknown>) => Record<string, unknown> }>;
    callbacks: { jwt: JwtCallback };
    events: { signOut: SignOutEvent };
  };
}

describe("auth.ts — central session synchronization", () => {
  beforeEach(() => {
    isAuthSessionActive.mockResolvedValue(true);
    revokeAuthSession.mockResolvedValue(undefined);
    invalidateUserAuthCaches.mockResolvedValue(undefined);
  });

  it("profile() carries the IdP's sessionId claim onto the user", async () => {
    const { providers } = await loadAuthOptions();
    const user = providers[0].profile({
      sub: "u1",
      email: "a@b.c",
      org_id: "org-1",
      role: "member",
      sessionId: "sess-123",
    });
    expect(user.sessionId).toBe("sess-123");
  });

  it("jwt callback copies sessionId to the token on initial sign-in", async () => {
    const { callbacks } = await loadAuthOptions();
    const token = await callbacks.jwt({
      token: {},
      user: { id: "u1", email: "a@b.c", orgId: "org-1", sessionId: "sess-123" },
    });
    expect(token.sessionId).toBe("sess-123");
    expect(token.sessionCheckedAt).toBeTypeOf("number");
  });

  it("drops all claims when the shared Redis session was revoked (central logout propagates)", async () => {
    isAuthSessionActive.mockResolvedValue(false);
    const { callbacks } = await loadAuthOptions();
    const token = await callbacks.jwt({
      token: { id: "u1", orgId: "org-1", sessionId: "sess-123", sessionCheckedAt: 0 },
    });
    expect(isAuthSessionActive).toHaveBeenCalledWith("sess-123");
    expect(token).toEqual({});
  });

  it("keeps the token when the shared session is still active", async () => {
    const { callbacks } = await loadAuthOptions();
    const token = await callbacks.jwt({
      token: { id: "u1", orgId: "org-1", sessionId: "sess-123", sessionCheckedAt: 0 },
    });
    expect(token.id).toBe("u1");
    expect(token.sessionCheckedAt as number).toBeGreaterThan(0);
  });

  it("throttles the Redis liveness check (no re-check within the interval)", async () => {
    const { callbacks } = await loadAuthOptions();
    const token = await callbacks.jwt({
      token: { id: "u1", sessionId: "sess-123", sessionCheckedAt: Date.now() },
    });
    expect(isAuthSessionActive).not.toHaveBeenCalled();
    expect(token.id).toBe("u1");
  });

  it("fails open for legacy tokens without a sessionId", async () => {
    const { callbacks } = await loadAuthOptions();
    const token = await callbacks.jwt({ token: { id: "u1", orgId: "org-1" } });
    expect(isAuthSessionActive).not.toHaveBeenCalled();
    expect(token.id).toBe("u1");
  });

  it("signOut revokes the shared Redis session AND busts per-user auth caches", async () => {
    const { events } = await loadAuthOptions();
    await events.signOut({ token: { id: "u1", orgId: "org-1", sessionId: "sess-123" } });
    expect(revokeAuthSession).toHaveBeenCalledWith("sess-123");
    expect(invalidateUserAuthCaches).toHaveBeenCalledWith("u1", "org-1");
  });

  it("signOut still busts caches when the token has no sessionId", async () => {
    const { events } = await loadAuthOptions();
    await events.signOut({ token: { id: "u1", orgId: "org-1" } });
    expect(revokeAuthSession).not.toHaveBeenCalled();
    expect(invalidateUserAuthCaches).toHaveBeenCalledWith("u1", "org-1");
  });

  it("signOut survives a Redis revocation failure (cache bust still runs)", async () => {
    revokeAuthSession.mockRejectedValue(new Error("redis down"));
    const { events } = await loadAuthOptions();
    await events.signOut({ token: { id: "u1", orgId: "org-1", sessionId: "sess-123" } });
    expect(invalidateUserAuthCaches).toHaveBeenCalledWith("u1", "org-1");
  });
});
