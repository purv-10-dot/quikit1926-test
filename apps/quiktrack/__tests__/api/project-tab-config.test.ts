import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { PATCH } from "@/app/api/projects/[id]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

const ROUTE_CTX = { params: { id: PROJECT } } as never;

function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Org owner → withProjectAccess fullAccess bypass (a Space-Admin-equivalent). */
function asOrgOwner() {
  setSession({ id: USER, orgId: TENANT, role: "owner" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

describe("PATCH /api/projects/[id] — tabConfig", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(patchReq({ tabConfig: ["summary"] }), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  // Only Space Admins / org admins (Project:update) may customize tabs. A
  // Contributor is a project member but lacks that grant.
  it("403 when a Contributor (no Project:update) sets tabConfig", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await PATCH(patchReq({ tabConfig: ["summary"] }), ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("400 on an unknown tab path", async () => {
    asOrgOwner();
    const res = await PATCH(patchReq({ tabConfig: ["summary", "not-a-tab"] }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("400 on an empty tabConfig (at least one tab required)", async () => {
    asOrgOwner();
    const res = await PATCH(patchReq({ tabConfig: [] }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("400 on duplicate tab paths", async () => {
    asOrgOwner();
    const res = await PATCH(patchReq({ tabConfig: ["summary", "summary"] }), ROUTE_CTX);
    expect(res.status).toBe(400);
  });

  it("admin saves a valid tabConfig (persists via raw SQL, returns it)", async () => {
    asOrgOwner();
    mockDb.qtProject.update.mockResolvedValue({ id: PROJECT, name: "P" } as never);
    mockDb.$executeRaw.mockResolvedValue(1 as never);
    mockDb.$queryRaw.mockResolvedValue([
      { tabConfig: ["summary", "board", "docs"] },
    ] as never);

    const res = await PATCH(
      patchReq({ tabConfig: ["summary", "board", "docs"] }),
      ROUTE_CTX,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.tabConfig).toEqual(["summary", "board", "docs"]);
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});
