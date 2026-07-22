import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { extraAdminCheck } from "./requireAdmin";

beforeEach(() => {
  resetMockDb();
  mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
});

describe("extraAdminCheck (RBAC v2 admin bridge)", () => {
  it("recognizes a user holding the system lowercase-admin QcAppRole", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue({ id: "uar-admin" } as never);
    expect(await extraAdminCheck({ userId: "u1", orgId: "org-1" })).toBe(true);
    // Confirms it queries the isSystem + name:"admin" grant.
    const where = mockDb.qcUserAppRole.findFirst.mock.calls[0][0]!.where as {
      role: { isSystem: boolean; name: string };
    };
    expect(where.role.isSystem).toBe(true);
    expect(where.role.name).toBe("admin");
  });

  it("returns false when the user holds no admin role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    expect(await extraAdminCheck({ userId: "u2", orgId: "org-1" })).toBe(false);
  });
});
