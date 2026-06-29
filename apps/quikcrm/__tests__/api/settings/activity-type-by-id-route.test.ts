/**
 * T3b — Verification test (NOT contract-first) for the type-level destructive
 * handlers:
 *   PATCH/DELETE /api/settings/activity-types/[id]
 *
 * This is the HIGHEST blast-radius surface in Phase 1: a cross-tenant hole in
 * type-level DELETE would cascade-wipe another org's activity type AND every
 * field definition under it (onDelete: Cascade) in a single call. The route
 * already exists, so this checks built code — straight-GREEN if the handlers
 * are gated + tenant-scoped, RED if there's a gap. Reported honestly either way.
 *
 * The cross-tenant lever is the ownership check findOwned(orgId, id) →
 * findFirst({ id, orgId }); when it returns null (type belongs to another org)
 * the handler must 404 BEFORE reaching update/delete — so the cascade never
 * fires on data the caller doesn't own. The 404 IS the cascade-delete guard.
 *
 * Seam: requirePermission is NOT mocked by mockDb; the route's real
 * requirePermission runs and awaits the MOCKED assertModule.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();

const ROUTE = "@/app/api/settings/activity-types/[id]/route";
const TYPE_ID = "at1";

function params() {
  return { params: Promise.resolve({ id: TYPE_ID }) };
}

function adminSession() {
  setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "admin@x.co", name: "Admin" });
}

function nonAdminSession() {
  setSession({ userId: "u2", orgId: "t1", role: "SalesUser", email: "rep@x.co", name: "Rep" });
}

function patchReq(body: unknown) {
  return new Request(`http://test/api/settings/activity-types/${TYPE_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function deleteReq() {
  return new Request(`http://test/api/settings/activity-types/${TYPE_ID}`, {
    method: "DELETE",
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
  db.crmActivityType.findFirst.mockReset();
  db.crmActivityType.update.mockReset();
  db.crmActivityType.delete.mockReset();
});

describe("PATCH /api/settings/activity-types/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "Renamed" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin without settings:edit, and never updates", async () => {
    nonAdminSession();
    vi.mocked(assertModule).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );

    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "Renamed" }), params());

    expect(res.status).toBe(403);
    expect(db.crmActivityType.update).not.toHaveBeenCalled();
  });

  it("edits a type that belongs to the caller's org (admin happy path)", async () => {
    adminSession();
    db.crmActivityType.findFirst.mockResolvedValue({ id: TYPE_ID, orgId: "t1" } as never);
    db.crmActivityType.update.mockResolvedValue({
      id: TYPE_ID,
      orgId: "t1",
      code: "upwork_connect",
      label: "Upwork Connect (Outbound)",
      category: null,
      config: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "Upwork Connect (Outbound)" }), params());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.label).toBe("Upwork Connect (Outbound)");
    expect(db.crmActivityType.update).toHaveBeenCalled();
  });

  it("returns 404 and does NOT update when the type is outside the caller's org", async () => {
    adminSession();
    // findFirst scoped to { id, orgId: t1 } → null for a type owned by another org.
    db.crmActivityType.findFirst.mockResolvedValue(null);

    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ label: "Hijack" }), params());

    expect(res.status).toBe(404);
    expect(db.crmActivityType.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/settings/activity-types/[id] (highest blast radius — cascade)", () => {
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
    expect(db.crmActivityType.delete).not.toHaveBeenCalled();
  });

  it("deletes a type that belongs to the caller's org (admin happy path)", async () => {
    adminSession();
    db.crmActivityType.findFirst.mockResolvedValue({ id: TYPE_ID, orgId: "t1" } as never);
    db.crmActivityType.delete.mockResolvedValue({ id: TYPE_ID } as never);

    const { DELETE } = await import(ROUTE);
    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(db.crmActivityType.delete).toHaveBeenCalled();
  });

  it("returns 404 and does NOT delete a type outside the caller's org (cascade-delete guard)", async () => {
    adminSession();
    // The lever: a cross-tenant id resolves to null under { id, orgId: t1 },
    // so DELETE must bail with 404 and never fire the cascade on another org's
    // type + its field definitions.
    db.crmActivityType.findFirst.mockResolvedValue(null);

    const { DELETE } = await import(ROUTE);
    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(404);
    expect(db.crmActivityType.delete).not.toHaveBeenCalled();
  });
});
