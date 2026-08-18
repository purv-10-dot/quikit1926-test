import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

/**
 * Regression: signing in from the QuikTrack landing page (or returning from a
 * deep link) dropped the user on the launcher `/apps` grid instead of QuikTrack.
 *
 * Two issuers mint tokens for this endpoint, and only one binds to an app:
 *   - the launcher's /api/launch-token stamps `slug` (tile click / ?handoff=)
 *   - the auth host's /api/post-login bridge mints a user-session token for a
 *     target ORIGIN with no app claim at all
 *
 * The SEC-03 binding check required `slug` unconditionally, so every bridge
 * token was rejected as `wrong_app_handoff`. No sibling app (quikscale,
 * quikinfra, quikcrm, quikasset) enforces the claim, which is why the identical
 * flow worked there. The binding must still reject a token minted for a
 * DIFFERENT app.
 */

// Redis-backed single-use guard — always allow so the tests exercise the
// binding check, not the replay store.
vi.mock("@/lib/handoff-replay", () => ({
  consumeHandoffJti: vi.fn(async () => true),
}));

const INTERNAL_SECRET = "test-internal-secret-value-32-chars";
const NEXTAUTH_SECRET = "test-nextauth-secret-value-32-chars";

process.env.INTERNAL_SECRET = INTERNAL_SECRET;
process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;
process.env.NEXTAUTH_URL = "http://localhost:3004";

const { GET } = await import("@/app/auth-handoff/route");

const DEEP_LINK = "/browse/QUIKTR-76";

/** Mint a handoff token the way a given issuer would. */
async function mintToken(extra: Record<string, unknown>, to = DEEP_LINK) {
  return new SignJWT({
    sub: "user_1",
    orgId: "org_1",
    to,
    isSuperAdmin: false,
    membershipRole: "member",
    email: "pravin@quikit.ai",
    sessionId: "sess_1",
    ...extra,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("120s")
    .setJti(`jti-${Math.random().toString(36).slice(2)}`)
    .sign(new TextEncoder().encode(INTERNAL_SECRET));
}

function req(token: string) {
  return new NextRequest(
    `http://localhost:3004/auth-handoff?token=${encodeURIComponent(token)}`,
  );
}

/** Path + query of the route's redirect. */
function redirectPath(res: Response): string {
  const loc = res.headers.get("location") ?? "";
  const url = new URL(loc, "http://localhost:3004");
  return `${url.pathname}${url.search}`;
}

describe("GET /auth-handoff — app binding (SEC-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the auth host's post-login bridge token (no slug claim)", async () => {
    // Exactly what apps/auth/app/api/post-login/route.ts mints: no `slug`.
    const res = await GET(req(await mintToken({}, "/dashboard")));
    expect(redirectPath(res)).toBe("/dashboard");
    expect(res.headers.get("location")).not.toContain("wrong_app_handoff");
  });

  it("lands the user on the work item a deep link asked for", async () => {
    const res = await GET(req(await mintToken({})));
    expect(redirectPath(res)).toBe(DEEP_LINK);
  });

  it("accepts a launcher token bound to this app", async () => {
    const res = await GET(req(await mintToken({ slug: "quiktrack" })));
    expect(redirectPath(res)).toBe(DEEP_LINK);
  });

  it("still rejects a token minted for a different app", async () => {
    const res = await GET(req(await mintToken({ slug: "quikscale" })));
    expect(redirectPath(res)).toBe("/login?reason=wrong_app_handoff");
  });

  it("sets a session cookie on the accepted bridge token", async () => {
    const res = await GET(req(await mintToken({})));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("next-auth.session-token");
  });

  it("rejects a token signed with the wrong secret", async () => {
    const forged = await new SignJWT({ sub: "user_1", to: DEEP_LINK })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("120s")
      .setJti("jti-forged")
      .sign(new TextEncoder().encode("a-totally-different-secret-value-x"));
    const res = await GET(req(forged));
    expect(redirectPath(res)).toContain("_handoff");
    expect(redirectPath(res)).toContain("/login");
  });
});
