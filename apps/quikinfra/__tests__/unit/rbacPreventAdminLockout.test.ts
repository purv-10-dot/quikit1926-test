import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";

// preventAdminLockout transitively imports userCan, whose module body calls
// React's `cache()` — unavailable in node test env. Stub to passthrough.
vi.mock("react", async () => {
  const actual = await vi.importActual<any>("react");
  return { ...actual, cache: (fn: any) => fn };
});

import {
  assertWouldNotEmptyAdmin,
  assertReconcileLeavesAdminPopulated,
  assertRoleDeletable,
  AdminLockoutError,
} from "@/lib/rbac/preventAdminLockout";

const db = mockDb as any;

beforeEach(() => {
  resetMockDb();
  // getQuikInfraAppId() caches across calls; the app row is found once.
  db.app.findUnique.mockResolvedValue({ id: "app-1" });
});

describe("assertWouldNotEmptyAdmin", () => {
  it("throws LAST_ADMIN when the target is the only admin", async () => {
    db.cnAppRole.findFirst.mockResolvedValue({ id: "role-admin" });
    db.cnUserAppRole.findFirst.mockResolvedValue({ id: "uar-1" }); // target IS admin
    db.cnUserAppRole.count.mockResolvedValue(0); // no other admins

    await expect(
      assertWouldNotEmptyAdmin({ orgId: "org-1", userId: "u1" }),
    ).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("does not throw when other admins remain", async () => {
    db.cnAppRole.findFirst.mockResolvedValue({ id: "role-admin" });
    db.cnUserAppRole.findFirst.mockResolvedValue({ id: "uar-1" });
    db.cnUserAppRole.count.mockResolvedValue(3);

    await expect(
      assertWouldNotEmptyAdmin({ orgId: "org-1", userId: "u1" }),
    ).resolves.toBeUndefined();
  });

  it("no-op when the target user is not currently an admin", async () => {
    db.cnAppRole.findFirst.mockResolvedValue({ id: "role-admin" });
    db.cnUserAppRole.findFirst.mockResolvedValue(null); // not an admin
    await expect(
      assertWouldNotEmptyAdmin({ orgId: "org-1", userId: "u1" }),
    ).resolves.toBeUndefined();
    expect(db.cnUserAppRole.count).not.toHaveBeenCalled();
  });

  it("no-op when there is no admin role for the org", async () => {
    db.cnAppRole.findFirst.mockResolvedValue(null);
    await expect(
      assertWouldNotEmptyAdmin({ orgId: "org-1", userId: "u1" }),
    ).resolves.toBeUndefined();
    expect(db.cnUserAppRole.findFirst).not.toHaveBeenCalled();
  });
});

describe("assertReconcileLeavesAdminPopulated", () => {
  it("throws EMPTY_ADMIN_RECONCILE when reconciling the admin role to []", async () => {
    db.cnAppRole.findUnique.mockResolvedValue({ isSystem: true, name: "admin", orgId: "org-1" });
    await expect(
      assertReconcileLeavesAdminPopulated({ orgId: "org-1", roleId: "r1", nextUserIds: [] }),
    ).rejects.toMatchObject({ code: "EMPTY_ADMIN_RECONCILE" });
  });

  it("allows a non-empty next set on the admin role", async () => {
    db.cnAppRole.findUnique.mockResolvedValue({ isSystem: true, name: "admin", orgId: "org-1" });
    await expect(
      assertReconcileLeavesAdminPopulated({ orgId: "org-1", roleId: "r1", nextUserIds: ["u1"] }),
    ).resolves.toBeUndefined();
  });

  it("no-op for a non-admin role even when emptied", async () => {
    db.cnAppRole.findUnique.mockResolvedValue({ isSystem: false, name: "user", orgId: "org-1" });
    await expect(
      assertReconcileLeavesAdminPopulated({ orgId: "org-1", roleId: "r1", nextUserIds: [] }),
    ).resolves.toBeUndefined();
  });

  it("no-op when the role belongs to another org", async () => {
    db.cnAppRole.findUnique.mockResolvedValue({ isSystem: true, name: "admin", orgId: "other-org" });
    await expect(
      assertReconcileLeavesAdminPopulated({ orgId: "org-1", roleId: "r1", nextUserIds: [] }),
    ).resolves.toBeUndefined();
  });
});

describe("assertRoleDeletable", () => {
  it("throws NOT_FOUND when the role is missing", async () => {
    db.cnAppRole.findUnique.mockResolvedValue(null);
    await expect(
      assertRoleDeletable({ orgId: "org-1", roleId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when the role belongs to another org", async () => {
    db.cnAppRole.findUnique.mockResolvedValue({ isSystem: false, orgId: "other" });
    await expect(
      assertRoleDeletable({ orgId: "org-1", roleId: "r1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws SYSTEM_ROLE_PROTECTED for a system role", async () => {
    db.cnAppRole.findUnique.mockResolvedValue({ isSystem: true, orgId: "org-1" });
    await expect(
      assertRoleDeletable({ orgId: "org-1", roleId: "r1" }),
    ).rejects.toMatchObject({ code: "SYSTEM_ROLE_PROTECTED" });
  });

  it("returns the member count for a deletable custom role", async () => {
    db.cnAppRole.findUnique.mockResolvedValue({ isSystem: false, orgId: "org-1" });
    db.cnUserAppRole.count.mockResolvedValue(7);
    await expect(
      assertRoleDeletable({ orgId: "org-1", roleId: "r1" }),
    ).resolves.toEqual({ memberCount: 7 });
  });
});

describe("AdminLockoutError", () => {
  it("is an Error carrying the code and name", () => {
    const e = new AdminLockoutError("boom", "LAST_ADMIN");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("LAST_ADMIN");
    expect(e.name).toBe("AdminLockoutError");
  });
});
