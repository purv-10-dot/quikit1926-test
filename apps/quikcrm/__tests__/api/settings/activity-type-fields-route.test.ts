/**
 * T4 — RED-first contract test for the (not-yet-built) field-definition CRUD
 * route nested under an activity type:
 *   POST/GET /api/settings/activity-types/[id]/fields
 *
 * Mirrors the T1 matrix (401 / 403-without-settings:edit / admin-happy-path /
 * tenant-isolation) for the nested route. Written BEFORE the route exists, so
 * it is RED for one reason: the module
 * `@/app/api/settings/activity-types/[id]/fields/route` does not resolve, so
 * every dynamic import() rejects and every test fails at that line.
 *
 * Gating (decision #4 / #10): requireApiUser (401) → requirePermission
 * "settings","edit" (403). The 403 case is the proof the admin gate is wired —
 * its value lands when this goes GREEN: a non-admin lacking settings:edit gets
 * 403 and crmActivityFieldDefinition.create is never called.
 *
 * Tenant isolation here is enforced at the PARENT: the route must confirm the
 * activity type id belongs to the caller's org before touching its fields. A
 * parent that isn't found in the caller's org → 404, and no field row is
 * created. (Seam: requirePermission is NOT mocked by mockDb; the route's real
 * requirePermission runs and awaits the MOCKED assertModule.)
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();

const ROUTE = "@/app/api/settings/activity-types/[id]/fields/route";
const PARENT_ID = "at1";

function params() {
  return { params: Promise.resolve({ id: PARENT_ID }) };
}

function adminSession() {
  setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "admin@x.co", name: "Admin" });
}

function nonAdminSession() {
  setSession({ userId: "u2", orgId: "t1", role: "SalesUser", email: "rep@x.co", name: "Rep" });
}

function postReq(body: unknown) {
  return new Request(`http://test/api/settings/activity-types/${PARENT_ID}/fields`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const VALID_FIELD = { key: "bid_amount", label: "Bid Amount", fieldType: "Number" };

describe("POST /api/settings/activity-types/[id]/fields (admin-gated)", () => {
  beforeEach(() => {
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
    db.crmActivityType.findFirst.mockReset();
    db.crmActivityFieldDefinition.create.mockReset();
    db.crmActivityFieldDefinition.findMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import(ROUTE);
    const res = await POST(postReq(VALID_FIELD), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-admin WITHOUT settings:edit", async () => {
    // Locks decision #4/#10: the nested fields route is admin-gated too.
    nonAdminSession();
    vi.mocked(assertModule).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );

    const { POST } = await import(ROUTE);
    const res = await POST(postReq(VALID_FIELD), params());

    expect(res.status).toBe(403);
    expect(db.crmActivityFieldDefinition.create).not.toHaveBeenCalled();
  });

  it("returns 201 with { success, data } for an admin, scoped to the parent type + org", async () => {
    adminSession();
    // Parent type exists and belongs to the caller's org.
    db.crmActivityType.findFirst.mockResolvedValue({ id: PARENT_ID, orgId: "t1" } as never);
    db.crmActivityFieldDefinition.create.mockResolvedValue({
      id: "fd1",
      orgId: "t1",
      activityTypeId: PARENT_ID,
      key: "bid_amount",
      label: "Bid Amount",
      fieldType: "Number",
      requirement: "Optional",
      options: null,
      visible: true,
      helpText: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { POST } = await import(ROUTE);
    const res = await POST(postReq(VALID_FIELD), params());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.key).toBe("bid_amount");

    // The created field is stamped with the session orgId and the parent type id.
    const args = db.crmActivityFieldDefinition.create.mock.calls[0]?.[0] as {
      data: { orgId: string; activityTypeId: string };
    };
    expect(args.data.orgId).toBe("t1");
    expect(args.data.activityTypeId).toBe(PARENT_ID);
  });

  it("returns 404 (no field created) when the parent type is not in the caller's org — tenant isolation", async () => {
    adminSession();
    // Parent type id exists for some OTHER org → findFirst scoped to (id, orgId=t1) returns null.
    db.crmActivityType.findFirst.mockResolvedValue(null);

    const { POST } = await import(ROUTE);
    const res = await POST(postReq(VALID_FIELD), params());

    expect(res.status).toBe(404);
    expect(db.crmActivityFieldDefinition.create).not.toHaveBeenCalled();
  });
});
