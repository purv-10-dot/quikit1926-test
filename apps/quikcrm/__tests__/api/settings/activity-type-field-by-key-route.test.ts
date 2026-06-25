/**
 * T4b — Verification test (NOT contract-first) for the destructive
 * field-definition handlers:
 *   PATCH/DELETE /api/settings/activity-types/[id]/fields/[key]
 *
 * The route already exists, so this is a check against built code: it goes
 * GREEN if the handlers are correctly gated + tenant-scoped, RED if there's a
 * real gap in the edit/delete (destructive) surface. Either outcome is
 * reported honestly. The test describes CORRECT behavior, not whatever the
 * route happens to do.
 *
 * For BOTH PATCH and DELETE:
 *   - 401 unauthenticated
 *   - 403 non-admin without settings:edit — and the mutation is never called
 *   - happy path (admin edits/deletes a field in their own org)
 *   - 404 + no mutation when the field's (org, parent type) doesn't match the
 *     caller (cross-tenant lever: can't PATCH/DELETE a field outside your org)
 *
 * Seam: requirePermission is NOT mocked by mockDb; the route's real
 * requirePermission runs and awaits the MOCKED assertModule.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();

const ROUTE = "@/app/api/settings/activity-types/[id]/fields/[key]/route";
const TYPE_ID = "at1";
const FIELD_KEY = "bid_amount";

function params() {
  return { params: Promise.resolve({ id: TYPE_ID, key: FIELD_KEY }) };
}

function adminSession() {
  setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "admin@x.co", name: "Admin" });
}

function nonAdminSession() {
  setSession({ userId: "u2", orgId: "t1", role: "SalesUser", email: "rep@x.co", name: "Rep" });
}

function patchReq(body: unknown) {
  return new Request(`http://test/api/settings/activity-types/${TYPE_ID}/fields/${FIELD_KEY}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function deleteReq() {
  return new Request(`http://test/api/settings/activity-types/${TYPE_ID}/fields/${FIELD_KEY}`, {
    method: "DELETE",
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
  db.crmActivityFieldDefinition.findFirst.mockReset();
  db.crmActivityFieldDefinition.update.mockReset();
  db.crmActivityFieldDefinition.delete.mockReset();
});

describe("PATCH /api/settings/activity-types/[id]/fields/[key]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "New Label" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin without settings:edit, and never updates", async () => {
    nonAdminSession();
    vi.mocked(assertModule).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );

    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "New Label" }), params());

    expect(res.status).toBe(403);
    expect(db.crmActivityFieldDefinition.update).not.toHaveBeenCalled();
  });

  it("edits a field that belongs to the caller's org (admin happy path)", async () => {
    adminSession();
    db.crmActivityFieldDefinition.findFirst.mockResolvedValue({ id: "fd1" } as never);
    db.crmActivityFieldDefinition.update.mockResolvedValue({
      id: "fd1",
      orgId: "t1",
      activityTypeId: TYPE_ID,
      key: FIELD_KEY,
      label: "Bid (USD)",
      fieldType: "Number",
      requirement: "Optional",
      options: null,
      visible: true,
      helpText: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "Bid (USD)" }), params());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.label).toBe("Bid (USD)");
    expect(db.crmActivityFieldDefinition.update).toHaveBeenCalled();
  });

  it("returns 404 and does NOT update when the field is outside the caller's org/type", async () => {
    adminSession();
    // findFirst is scoped to { orgId: t1, activityTypeId, key } → null for a
    // field that lives in another org or under another type.
    db.crmActivityFieldDefinition.findFirst.mockResolvedValue(null);

    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "Hijack" }), params());

    expect(res.status).toBe(404);
    expect(db.crmActivityFieldDefinition.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/settings/activity-types/[id]/fields/[key]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { DELETE } = await import(ROUTE);
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin without settings:edit, and never deletes", async () => {
    nonAdminSession();
    vi.mocked(assertModule).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );

    const { DELETE } = await import(ROUTE);
    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(403);
    expect(db.crmActivityFieldDefinition.delete).not.toHaveBeenCalled();
  });

  it("deletes a field that belongs to the caller's org (admin happy path)", async () => {
    adminSession();
    db.crmActivityFieldDefinition.findFirst.mockResolvedValue({ id: "fd1" } as never);
    db.crmActivityFieldDefinition.delete.mockResolvedValue({ id: "fd1" } as never);

    const { DELETE } = await import(ROUTE);
    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(db.crmActivityFieldDefinition.delete).toHaveBeenCalled();
  });

  it("returns 404 and does NOT delete when the field is outside the caller's org/type", async () => {
    adminSession();
    db.crmActivityFieldDefinition.findFirst.mockResolvedValue(null);

    const { DELETE } = await import(ROUTE);
    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(404);
    expect(db.crmActivityFieldDefinition.delete).not.toHaveBeenCalled();
  });
});
