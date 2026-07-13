import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { signApiToken } from "@/lib/api/apiToken";

// A trivial handler that echoes the resolved identity so we can assert the
// wrapper passed the right userId/orgId through.
const echo = withOrgAuth(async (ctx) =>
  NextResponse.json({ success: true, userId: ctx.userId, orgId: ctx.orgId }),
);

const USER = "usr_token_1";
const ORG = "org_token_1";

function reqWithBearer(token: string | null) {
  return new NextRequest("http://localhost/api/echo", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}
const ROUTE_CTX = { params: {} } as never;

beforeAll(() => {
  process.env.API_TOKEN_SECRET = "unit-test-api-token-secret";
});

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("withOrgAuth — Bearer API token path", () => {
  it("authenticates a valid token and passes userId + orgId to the handler", async () => {
    const token = await signApiToken({ userId: USER, orgId: ORG, email: "u@x.com" });
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m1" } as never);

    const res = await echo(reqWithBearer(token), ROUTE_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, userId: USER, orgId: ORG });
  });

  it("401 for a malformed / forged token (no membership lookup attempted)", async () => {
    const res = await echo(reqWithBearer("not-a-real-token"), ROUTE_CTX);
    expect(res.status).toBe(401);
    expect(mockDb.orgMember.findFirst).not.toHaveBeenCalled();
  });

  it("403 when the token is valid but the membership is no longer active", async () => {
    const token = await signApiToken({ userId: USER, orgId: ORG, email: "u@x.com" });
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);

    const res = await echo(reqWithBearer(token), ROUTE_CTX);
    expect(res.status).toBe(403);
  });

  it("re-checks membership scoped to the token's user + org and an active org", async () => {
    const token = await signApiToken({ userId: USER, orgId: ORG, email: "u@x.com" });
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m1" } as never);

    await echo(reqWithBearer(token), ROUTE_CTX);
    expect(mockDb.orgMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER,
          orgId: ORG,
          status: "active",
          org: { status: "active" },
        }),
      }),
    );
  });

  it("falls back to the cookie session when no Authorization header is present", async () => {
    // No bearer header → cookie path. getOrgId is mocked in setup.ts to return
    // the session user's orgId, so a set session authenticates.
    setSession({ id: "cookie_user", orgId: "cookie_org", role: "member" });
    const res = await echo(reqWithBearer(null), ROUTE_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ userId: "cookie_user", orgId: "cookie_org" });
    // Bearer path never ran, so no membership lookup happened here.
    expect(mockDb.orgMember.findFirst).not.toHaveBeenCalled();
  });

  it("401 when neither a token nor a session is present", async () => {
    const res = await echo(reqWithBearer(null), ROUTE_CTX);
    expect(res.status).toBe(401);
  });
});
