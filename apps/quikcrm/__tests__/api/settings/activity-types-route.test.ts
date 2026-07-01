/**
 * T1 — RED contract-lock test for the (not-yet-built) activity-type config route.
 *
 * Phase 1 of the activity-logging feature. This file is written FIRST, before
 * the route exists, so it is RED for exactly one reason: the module
 * `@/app/api/settings/activity-types/route` does not exist yet, so every
 * dynamic `import()` of it rejects and every test fails at that line.
 *
 * The decisive assertion is the 403 case (decision #4 in
 * ACTIVITY-FEATURE-DECISIONS.md): a config route must use
 * `requirePermission(user, "settings", "edit")`, NOT the looser
 * `requireApiUser()` that the lead/product/disposition routes inherit. That
 * assertion's real value lands when this test goes GREEN against the real
 * route — a non-admin lacking `settings:edit` getting 403 is the proof the
 * admin gate is wired. While RED (route missing) it proves nothing about the
 * gate yet; it only fixes the contract the route must satisfy.
 *
 * Seam notes (verified against helpers/mockDb.ts):
 *  - mockDb() mocks @/lib/auth/require (requireApiUser/isResponse/errorResponse)
 *    and @/lib/auth/permissions (assertModule), but NOT
 *    @/lib/auth/require-permission. So the route's real `requirePermission`
 *    runs: it returns early for role "Administrator" and otherwise awaits the
 *    MOCKED `assertModule`. We drive the 403 path by making assertModule reject
 *    with a { statusCode: 403 } error, which the mocked errorResponse maps to 403.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();

const ROUTE = "@/app/api/settings/activity-types/route";

function adminSession() {
  setSession({
    userId: "u1",
    orgId: "t1",
    role: "Administrator",
    email: "admin@x.co",
    name: "Admin",
  });
}

function nonAdminSession() {
  setSession({
    userId: "u2",
    orgId: "t1",
    role: "SalesUser",
    email: "rep@x.co",
    name: "Rep",
  });
}

function postReq(body: unknown) {
  return new Request("http://test/api/settings/activity-types", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/settings/activity-types (admin-gated config route)", () => {
  beforeEach(() => {
    setSession(null);
    vi.mocked(assertModule).mockReset();
    // Default: permission granted. The 403 test overrides this to reject.
    vi.mocked(assertModule).mockResolvedValue(undefined);
    db.crmActivityType.create.mockReset();
    db.crmActivityType.findMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import(ROUTE);
    const res = await POST(postReq({ code: "upwork_connect", label: "Upwork Connect" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-admin WITHOUT settings:edit", async () => {
    // CRITICAL: this locks decision #4 — the route must call
    // requirePermission(user, "settings", "edit"), not just requireApiUser().
    // A non-admin whose settings:edit check fails (assertModule rejects) must
    // be turned away with 403, never reach the create.
    nonAdminSession();
    vi.mocked(assertModule).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );

    const { POST } = await import(ROUTE);
    const res = await POST(postReq({ code: "upwork_connect", label: "Upwork Connect" }));

    expect(res.status).toBe(403);
    expect(db.crmActivityType.create).not.toHaveBeenCalled();
  });

  it("returns 201 with { success, data } scoped to the session orgId for an admin", async () => {
    adminSession();
    db.crmActivityType.create.mockResolvedValue({
      id: "at1",
      orgId: "t1",
      code: "upwork_connect",
      label: "Upwork Connect",
      category: null,
      config: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { POST } = await import(ROUTE);
    const res = await POST(postReq({ code: "upwork_connect", label: "Upwork Connect" }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("upwork_connect");

    // Tenant isolation: the created row is stamped with the session orgId,
    // never a client-supplied one.
    expect(db.crmActivityType.create).toHaveBeenCalled();
    const args = db.crmActivityType.create.mock.calls[0]?.[0] as {
      data: { orgId: string };
    };
    expect(args.data.orgId).toBe("t1");
  });

  it("rejects a duplicate code within the same org (4xx, proves @@unique([orgId, code]))", async () => {
    adminSession();
    // Simulate Prisma's unique-constraint violation (P2002) on (orgId, code).
    db.crmActivityType.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["orgId", "code"] },
      }),
    );

    const { POST } = await import(ROUTE);
    const res = await POST(postReq({ code: "upwork_connect", label: "Upwork Connect" }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
