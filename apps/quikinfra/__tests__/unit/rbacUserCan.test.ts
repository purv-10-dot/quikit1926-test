import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";

// React's `cache()` isn't available in this node test env — stub it to a
// passthrough so the module-level `cache(async ...)` in userCan loads.
vi.mock("react", async () => {
  const actual = await vi.importActual<any>("react");
  return { ...actual, cache: (fn: any) => fn };
});

import { userCan, getQuikInfraAppId, isAdminRole } from "@/lib/rbac/userCan";

const db = mockDb as any;

// construction.boq + view is a valid permission pair (per the registry).
const RES = "construction.boq";
const ACT = "view";

beforeEach(() => {
  resetMockDb();
  db.app.findUnique.mockResolvedValue({ id: "app-1" });
});

describe("getQuikInfraAppId", () => {
  it("resolves the app id from the slug lookup", async () => {
    await expect(getQuikInfraAppId()).resolves.toBe("app-1");
  });
});

describe("userCan — invalid input", () => {
  it("returns false for an invalid (resource, action) pair without hitting role tables", async () => {
    // construction.stock only exposes "view" — delete is invalid.
    const allowed = await userCan("u1", "org-1", "construction.stock", "delete");
    expect(allowed).toBe(false);
    expect(db.cnRolePermissionV2.findFirst).not.toHaveBeenCalled();
  });
});

describe("userCan — revoke wins", () => {
  it("denies immediately when a revoke entry exists, even if a role grant would match", async () => {
    db.cnUserPermissionExtra.findFirst.mockResolvedValue({ id: "revoke-1" });
    db.cnRolePermissionV2.findFirst.mockResolvedValue({ id: "grant-1" }); // would allow

    const allowed = await userCan("rev-user", "org-1", RES, ACT);
    expect(allowed).toBe(false);
    // role grant must not be consulted once revoke hit
    expect(db.cnRolePermissionV2.findFirst).not.toHaveBeenCalled();
  });
});

describe("userCan — role grant (allow)", () => {
  it("allows when the user's role has the matching RolePermission row", async () => {
    db.cnUserPermissionExtra.findFirst.mockResolvedValue(null); // no revoke
    db.cnRolePermissionV2.findFirst.mockResolvedValue({ id: "grant-1" });

    const allowed = await userCan("role-user", "org-1", RES, ACT);
    expect(allowed).toBe(true);
  });
});

describe("userCan — additive extra grant", () => {
  it("allows via a UserPermissionExtra(revoke=false) when no role grant matches", async () => {
    // first findFirst (revoke=true) → null, second findFirst (revoke=false) → hit
    db.cnUserPermissionExtra.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "extra-1" });
    db.cnRolePermissionV2.findFirst.mockResolvedValue(null);

    const allowed = await userCan("extra-user", "org-1", RES, ACT);
    expect(allowed).toBe(true);
  });
});

describe("userCan — deny", () => {
  it("returns false when nothing grants the pair", async () => {
    db.cnUserPermissionExtra.findFirst.mockResolvedValue(null);
    db.cnRolePermissionV2.findFirst.mockResolvedValue(null);

    const allowed = await userCan("no-grant-user", "org-1", RES, ACT);
    expect(allowed).toBe(false);
  });
});

describe("isAdminRole", () => {
  it("true only for an isSystem role named 'admin'", () => {
    expect(isAdminRole({ isSystem: true, name: "admin" })).toBe(true);
    expect(isAdminRole({ isSystem: false, name: "admin" })).toBe(false);
    expect(isAdminRole({ isSystem: true, name: "ho_user" })).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
