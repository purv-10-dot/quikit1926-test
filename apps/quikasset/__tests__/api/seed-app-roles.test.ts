import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";

// Isolate the central-mirror side effect — we're testing the gate, not the sync.
vi.mock("@quikit/auth/assign-app-roles", () => ({
  mirrorAppRoleToCentral: vi.fn(async () => {}),
}));

import { ensureDefaultRoleIfNone } from "@/lib/api/seedAppRoles";

describe("ensureDefaultRoleIfNone — first-time-only default role (Bug 1)", () => {
  beforeEach(() => {
    resetMockDb();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never); // getQuikAssetAppId
  });

  it("does NOT assign (or duplicate) a role when the user already holds a QuikAsset role", async () => {
    // The user was explicitly promoted to a non-Member role — it must be left alone.
    mockDb.astUserAppRole.findFirst.mockResolvedValue({ id: "existing-asset-mgr" } as never);

    await ensureDefaultRoleIfNone("u1", "org1", "member-role");

    expect(mockDb.astUserAppRole.create).not.toHaveBeenCalled();
    // The gate is scoped to the QuikAsset app (not "any role anywhere").
    const gate = mockDb.astUserAppRole.findFirst.mock.calls[0]?.[0] as {
      where: { userId: string; orgId: string; role: { appId: string } };
    };
    expect(gate.where).toMatchObject({ userId: "u1", orgId: "org1", role: { appId: "app" } });
  });

  it("assigns the default role only when the user has NO QuikAsset role yet", async () => {
    mockDb.astUserAppRole.findFirst.mockResolvedValue(null as never); // no role (gate + ensureUserOnRole)
    mockDb.astUserAppRole.create.mockResolvedValue({ id: "new" } as never);
    mockDb.astAppRole.findUnique.mockResolvedValue({ name: "Member" } as never);

    await ensureDefaultRoleIfNone("u1", "org1", "member-role");

    expect(mockDb.astUserAppRole.create).toHaveBeenCalledOnce();
    const arg = mockDb.astUserAppRole.create.mock.calls[0]?.[0] as {
      data: { userId: string; orgId: string; roleId: string };
    };
    expect(arg.data).toMatchObject({ userId: "u1", orgId: "org1", roleId: "member-role" });
  });
});
