import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import {
  assertReconcileLeavesAdminPopulated,
  assertRoleDeletable,
  AdminLockoutError,
} from "./preventAdminLockout";

const ORG = "org-1";

beforeEach(() => {
  resetMockDb();
  mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
  // getAdminRoleId resolves the isSystem admin role.
  mockDb.qcAppRole.findFirst.mockResolvedValue({ id: "role-admin" } as never);
});

describe("assertReconcileLeavesAdminPopulated", () => {
  it("throws when the admin role would be reconciled to zero members", async () => {
    await expect(
      assertReconcileLeavesAdminPopulated({ orgId: ORG, roleId: "role-admin", nextUserIds: [] }),
    ).rejects.toBeInstanceOf(AdminLockoutError);
  });

  it("allows a non-empty admin reconcile", async () => {
    await expect(
      assertReconcileLeavesAdminPopulated({ orgId: ORG, roleId: "role-admin", nextUserIds: ["u1"] }),
    ).resolves.toBeUndefined();
  });

  it("is a no-op for a non-admin role even when emptied", async () => {
    await expect(
      assertReconcileLeavesAdminPopulated({ orgId: ORG, roleId: "role-member", nextUserIds: [] }),
    ).resolves.toBeUndefined();
  });
});

describe("assertRoleDeletable", () => {
  it("blocks deleting a system role", async () => {
    mockDb.qcAppRole.findUnique.mockResolvedValue({
      isSystem: true,
      name: "admin",
      orgId: ORG,
    } as never);
    await expect(assertRoleDeletable({ orgId: ORG, roleId: "role-admin" })).rejects.toBeInstanceOf(
      AdminLockoutError,
    );
  });

  it("returns the affected member count for a deletable role", async () => {
    mockDb.qcAppRole.findUnique.mockResolvedValue({
      isSystem: false,
      name: "Coach",
      orgId: ORG,
    } as never);
    mockDb.qcUserAppRole.count.mockResolvedValue(3 as never);
    const { memberCount } = await assertRoleDeletable({ orgId: ORG, roleId: "role-coach" });
    expect(memberCount).toBe(3);
  });

  it("throws when the role is missing or from another org", async () => {
    mockDb.qcAppRole.findUnique.mockResolvedValue(null as never);
    await expect(assertRoleDeletable({ orgId: ORG, roleId: "nope" })).rejects.toBeInstanceOf(
      AdminLockoutError,
    );
  });
});
