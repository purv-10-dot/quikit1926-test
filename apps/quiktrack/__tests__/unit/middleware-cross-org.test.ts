import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cross-org deep links (`?org=<orgId>`).
 *
 * The session carries ONE active org, so an emailed work-item link clicked by a
 * user who belongs to several orgs resolves against whichever org they last
 * used — and 404s when that isn't the org the work item lives in. Middleware
 * has to notice the mismatch and route the request through
 * /api/session/switch-org BEFORE the page (or the dashboard layout's app-access
 * gate) runs.
 *
 * Ordering matters: the auth factory runs first, so a signed-out click still
 * goes to login/hand-off, with `?org=` preserved on the way back.
 */

const factory = vi.fn(async () => NextResponse.next());
vi.mock("@quikit/auth/middleware", () => ({
  createMiddleware: () => factory,
}));

const getToken = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: (params: unknown) => getToken(params),
}));

process.env.NEXT_PUBLIC_AUTH_URL = "https://authn.quikit.ai";
process.env.NEXT_PUBLIC_QUIKIT_URL = "https://apps.quikit.ai";
process.env.NEXTAUTH_SECRET = "test-nextauth-secret-value-32-chars";

const { middleware } = await import("../../middleware");

const ORG_A = "org_a"; // the session's org
const ORG_B = "org_b"; // the org that owns the linked work item

function req(path: string) {
  return new NextRequest(`https://track.quikit.ai${path}`);
}

function location(res: Response): URL {
  return new URL(res.headers.get("location") ?? "", "https://track.quikit.ai");
}

describe("quiktrack middleware — cross-org deep links", () => {
  beforeEach(() => {
    factory.mockReset();
    factory.mockResolvedValue(NextResponse.next());
    getToken.mockReset();
    getToken.mockResolvedValue({ id: "user_1", orgId: ORG_A });
  });

  it("routes a signed-in user through the switch endpoint when orgs differ", async () => {
    const res = await middleware(req(`/browse/TRACK-1?org=${ORG_B}`));

    const url = location(res);
    expect(url.pathname).toBe("/api/session/switch-org");
    expect(url.searchParams.get("orgId")).toBe(ORG_B);
    // `org` is stripped from the return path — otherwise the trip back here
    // would bounce into the switch endpoint again.
    expect(url.searchParams.get("to")).toBe("/browse/TRACK-1");
  });

  it("keeps other query params on the return path", async () => {
    const res = await middleware(req(`/browse/TRACK-1?org=${ORG_B}&tab=comments`));

    expect(location(res).searchParams.get("to")).toBe("/browse/TRACK-1?tab=comments");
  });

  it("passes through when the session is already on the linked org", async () => {
    const res = await middleware(req(`/browse/TRACK-1?org=${ORG_A}`));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when there is no org hint", async () => {
    const res = await middleware(req("/browse/TRACK-1"));

    expect(res.headers.get("location")).toBeNull();
    expect(getToken).not.toHaveBeenCalled();
  });

  it("lets the auth factory redirect a signed-out click first, keeping ?org=", async () => {
    factory.mockResolvedValue(
      NextResponse.redirect(
        "https://authn.quikit.ai/login?callbackUrl=" +
          encodeURIComponent(`https://track.quikit.ai/browse/TRACK-1?org=${ORG_B}`),
      ),
    );

    const res = await middleware(req(`/browse/TRACK-1?org=${ORG_B}`));

    // Rewritten to the launcher hand-off, carrying both the deep link and the
    // org to select before the hand-off token is minted.
    const url = location(res);
    expect(url.origin).toBe("https://apps.quikit.ai");
    expect(url.pathname).toBe("/apps");
    expect(url.searchParams.get("handoff")).toBe("quiktrack");
    expect(url.searchParams.get("to")).toBe(`/browse/TRACK-1?org=${ORG_B}`);
    expect(url.searchParams.get("org")).toBe(ORG_B);
  });
});
