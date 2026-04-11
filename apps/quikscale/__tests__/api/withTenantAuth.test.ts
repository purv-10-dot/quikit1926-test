import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

const USER = "user-1";
const TENANT = "tenant-1";

function buildRequest(path = "http://localhost/api/test"): NextRequest {
  return new NextRequest(path);
}

function asAuthed() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("withTenantAuth", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const handler = withTenantAuth(async () =>
      NextResponse.json({ success: true, data: "never" })
    );
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 403 when authenticated but no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);

    const handler = withTenantAuth(async () =>
      NextResponse.json({ success: true, data: "never" })
    );
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/membership/i);
  });

  it("passes tenantId and userId to the inner handler on success", async () => {
    asAuthed();
    const seen: { tenantId?: string; userId?: string } = {};
    const handler = withTenantAuth(async ({ tenantId, userId }) => {
      seen.tenantId = tenantId;
      seen.userId = userId;
      return NextResponse.json({ success: true, data: "ok" });
    });
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(200);
    expect(seen.tenantId).toBe(TENANT);
    expect(seen.userId).toBe(USER);
  });

  it("forwards route params to the inner handler", async () => {
    asAuthed();
    const handler = withTenantAuth<{ id: string }>(async (_ctx, _req, { params }) =>
      NextResponse.json({ success: true, data: params.id })
    );
    const res = await handler(buildRequest(), { params: { id: "kpi-42" } });
    const body = await res.json();
    expect(body.data).toBe("kpi-42");
  });

  it("catches thrown errors and returns 500 with toErrorMessage", async () => {
    asAuthed();
    const handler = withTenantAuth(
      async () => {
        throw new Error("inner failure");
      },
      { fallbackErrorMessage: "should not be used" }
    );
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "inner failure" });
  });

  it("uses the fallback error message for non-Error throws", async () => {
    asAuthed();
    const handler = withTenantAuth(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw { not: "an Error" };
      },
      { fallbackErrorMessage: "My custom fallback" }
    );
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("My custom fallback");
  });
});
