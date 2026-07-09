import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

// Seeding is a best-effort side effect — stub it so the test is deterministic.
vi.mock("@/lib/api/seedAppRoles", () => ({
  seedAllDefaultRoles: vi.fn(async () => ({ adminRoleId: "admin-role", memberRoleId: "member-role" })),
  ensureUserOnRole: vi.fn(async () => {}),
}));

import { GET } from "@/app/api/me/permissions/route";

describe("GET /api/me/permissions", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/me/permissions"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns the caller's effective permission set", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member" });
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      {
        role: {
          id: "r1",
          name: "Member",
          isSystem: false,
          permissions: [{ resource: "Asset", action: "view" }],
        },
      },
    ] as never);
    mockDb.astUserPermissionExtra.findMany.mockResolvedValue([] as never);
    mockDb.astUserAppRole.findFirst.mockResolvedValue({ id: "ur1" } as never);

    const res = await GET(makeReq("/api/me/permissions"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.permissions).toContain("Asset:view");
    expect(json.data.isAdmin).toBe(false);
  });

  it("scopes the permission lookup to the caller's org", async () => {
    setSession({ id: "u1", orgId: "org-A", role: "member" });
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.astUserPermissionExtra.findMany.mockResolvedValue([] as never);
    mockDb.astUserAppRole.findFirst.mockResolvedValue({ id: "ur1" } as never);

    await GET(makeReq("/api/me/permissions"), { params: {} });

    const call = mockDb.astUserAppRole.findMany.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org-A");
  });
});
