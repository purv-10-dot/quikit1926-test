import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";

/**
 * GET /api/session/switch-org — the cross-org deep-link hop.
 *
 * A QuikTrack session carries ONE active org. A user in two orgs who clicks an
 * emailed work-item link (`/browse/TRACK-1?org=<orgId>`) arrives on whichever
 * org they last used, so the org-scoped lookup misses and the page 404s
 * ("Something went wrong"). Middleware routes those requests here first; this
 * endpoint re-mints the session cookie on the named org and redirects back.
 *
 * The guards matter as much as the happy path: a refused switch must forward
 * WITHOUT touching the cookie, and must never send the user back to a URL that
 * still carries `?org=` (that would bounce straight back here — a loop).
 */

const NEXTAUTH_SECRET = "test-nextauth-secret-value-32-chars";
process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;
process.env.QUIKIT_URL = "https://apps.quikit.ai";

const getToken = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => getToken(...args),
  encode: vi.fn(async () => "encoded-session-jwt"),
}));

const getAppAccess = vi.fn(async (_params: unknown) => ({ hasAccess: true, otherAppsCount: 2 }));
vi.mock("@quikit/auth/app-access", () => ({
  getAppAccess: (params: unknown) => getAppAccess(params),
}));

const { GET } = await import("@/app/api/session/switch-org/route");

const USER = "user_1";
const ORG_A = "org_a"; // session's current org
const ORG_B = "org_b"; // org that owns the linked work item

function req(query: string) {
  return new NextRequest(`http://localhost:3004/api/session/switch-org${query}`);
}

/** Path + query of the response's redirect target. */
function redirectPath(res: Response): string {
  const url = new URL(res.headers.get("location") ?? "", "http://localhost:3004");
  return `${url.pathname}${url.search}`;
}

function sessionCookie(res: Response): string | undefined {
  return (res as unknown as { cookies: { get(name: string): { value: string } | undefined } })
    .cookies.get("next-auth.session-token")?.value;
}

describe("GET /api/session/switch-org", () => {
  beforeEach(() => {
    resetMockDb();
    getToken.mockReset();
    getAppAccess.mockClear();
    // Re-establish the default EXPLICITLY rather than relying on mockClear:
    // the "isn't granted in the target org" test installs a persistent
    // `mockResolvedValue({ hasAccess: false })`, and mockClear only wipes call
    // records, not the implementation. Without this line that false leaks into
    // every later test — which is what made the open-redirect test below
    // assert `/` (the no-app-access denial page) instead of `/dashboard` (the
    // safeInternalPath fallback it is actually there to check).
    getAppAccess.mockResolvedValue({ hasAccess: true, otherAppsCount: 2 });
    getToken.mockResolvedValue({ id: USER, sub: USER, orgId: ORG_A, sessionId: "sess_1" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  });

  it("switches the session onto the org that owns the deep link", async () => {
    const res = await GET(req(`?orgId=${ORG_B}&to=%2Fbrowse%2FTRACK-1`));

    expect(res.status).toBe(307);
    expect(redirectPath(res)).toBe("/browse/TRACK-1");
    expect(sessionCookie(res)).toBe("encoded-session-jwt");
    // Only an active membership in an active org qualifies.
    expect(mockDb.orgMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER,
          orgId: ORG_B,
          status: "active",
          org: { status: "active" },
        }),
      }),
    );
  });

  it("strips `org` from the destination so the return trip can't loop", async () => {
    const res = await GET(
      req(`?orgId=${ORG_B}&to=${encodeURIComponent(`/browse/TRACK-1?org=${ORG_B}&x=1`)}`),
    );

    expect(redirectPath(res)).toBe("/browse/TRACK-1?x=1");
  });

  it("sends an unauthenticated caller to login, keeping the destination", async () => {
    getToken.mockResolvedValue(null);

    const res = await GET(req(`?orgId=${ORG_B}&to=%2Fbrowse%2FTRACK-1`));

    expect(redirectPath(res)).toBe("/login?callbackUrl=%2Fbrowse%2FTRACK-1");
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("forwards without switching when the caller isn't a member of the target org", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);

    const res = await GET(req(`?orgId=${ORG_B}&to=%2Fbrowse%2FTRACK-1`));

    expect(redirectPath(res)).toBe("/browse/TRACK-1");
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("refuses the switch when QuikTrack isn't granted in the target org", async () => {
    getAppAccess.mockResolvedValue({ hasAccess: false, otherAppsCount: 3 });

    const res = await GET(req(`?orgId=${ORG_B}&to=%2Fbrowse%2FTRACK-1`));

    const url = new URL(res.headers.get("location") ?? "", "http://localhost:3004");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("reason")).toBe("no_app_access");
    expect(url.searchParams.get("others")).toBe("3");
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("no-ops when the session is already on the requested org", async () => {
    const res = await GET(req(`?orgId=${ORG_A}&to=%2Fbrowse%2FTRACK-1`));

    expect(redirectPath(res)).toBe("/browse/TRACK-1");
    expect(sessionCookie(res)).toBeUndefined();
    expect(mockDb.orgMember.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an off-origin destination (open redirect)", async () => {
    const res = await GET(
      req(`?orgId=${ORG_B}&to=${encodeURIComponent("https://evil.test/steal")}`),
    );

    const url = new URL(res.headers.get("location") ?? "", "http://localhost:3004");
    expect(url.origin).toBe("http://localhost:3004");
    expect(url.pathname).toBe("/dashboard");
  });
});
