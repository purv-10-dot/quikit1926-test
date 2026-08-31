import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/teams/route";

const USER = "user_1";
const ORG = "org_1";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/teams", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetMockDb();
  setSession({ id: USER, orgId: ORG, role: "member" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  // userCan resolves the QuikTrack app id unconditionally (before even
  // checking role grants) — without this, appId is falsy and every call
  // short-circuits to false regardless of the role/extra-grant mocks below.
  mockDb.app.findUnique.mockResolvedValue({ id: "app_quiktrack" } as never);
});

describe("POST /api/teams — Team:create via userCan, not the old inline hasAdminAccess check", () => {
  it("returns 403 for a member with no Team:create grant", async () => {
    mockDb.qtRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    const res = await POST(req({ name: "Platform" }));
    expect(res.status).toBe(403);
    expect(mockDb.qtTeam.create).not.toHaveBeenCalled();
  });

  it("allows a caller whose role holds the Team:create grant (registry-driven, not an admin-tier bypass)", async () => {
    mockDb.qtRolePermission.findFirst.mockResolvedValue({ id: "grant_1" } as never);
    mockDb.qtTeam.create.mockResolvedValue({ id: "team_1", name: "Platform" } as never);
    const res = await POST(req({ name: "Platform" }));
    expect(res.status).toBe(201);
    expect(mockDb.qtTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Platform" }) }),
    );
  });

  it("falls back to the qtUserPermissionExtra one-off grant when no role grant exists", async () => {
    mockDb.qtRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue({ id: "extra_1" } as never);
    mockDb.qtTeam.create.mockResolvedValue({ id: "team_1", name: "Platform" } as never);
    const res = await POST(req({ name: "Platform" }));
    expect(res.status).toBe(201);
  });
});
