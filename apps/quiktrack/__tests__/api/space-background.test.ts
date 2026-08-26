import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PUT } from "@/app/api/projects/[id]/background/route";
import { MAX_BACKGROUND_IMAGE_BYTES } from "@/lib/spaceBackgrounds";

const USER = "user_1";
const ORG = "org_1";
const OTHER_ORG = "org_2";
const PROJECT = "proj_1";

const CTX = { params: { id: PROJECT } } as never;

function getReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/background`);
}
function putReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/background`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function asOrgOwner() {
  setSession({ id: USER, orgId: ORG, role: "owner" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

function asContributor() {
  setSession({ id: USER, orgId: ORG, role: "member" });
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
}

describe("GET /api/projects/[id]/background", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the project belongs to another org (isolation)", async () => {
    setSession({ id: USER, orgId: OTHER_ORG, role: "owner" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const res = await GET(getReq(), CTX);
    expect(res.status).toBe(404);
  });

  it("returns the stored background to any member", async () => {
    asContributor();
    mockDb.$queryRaw.mockResolvedValue([
      { background: { type: "gradient", value: "ocean" } },
    ] as never);

    const res = await GET(getReq(), CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.background).toEqual({ type: "gradient", value: "ocean" });
  });

  it("normalises an unrecognised stored value to null instead of surfacing it", async () => {
    // A hand-edited or pre-registry row must not reach a style attribute.
    asContributor();
    mockDb.$queryRaw.mockResolvedValue([
      { background: { type: "color", value: "red; position:fixed" } },
    ] as never);

    const res = await GET(getReq(), CTX);
    const json = await res.json();
    expect(json.data.background).toBeNull();
  });
});

describe("PUT /api/projects/[id]/background", () => {
  it("401 when unauthenticated", async () => {
    const res = await PUT(putReq({ background: { type: "color", value: "blue" } }), CTX);
    expect(res.status).toBe(401);
  });

  it("403 for a member without Project:update", async () => {
    asContributor();
    const res = await PUT(putReq({ background: { type: "color", value: "blue" } }), CTX);
    expect(res.status).toBe(403);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("200 saves a known preset", async () => {
    asOrgOwner();
    mockDb.$executeRaw.mockResolvedValue(1 as never);

    const res = await PUT(putReq({ background: { type: "gradient", value: "nebula" } }), CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.background).toEqual({ type: "gradient", value: "nebula" });
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });

  it("200 clears the background with null", async () => {
    asOrgOwner();
    mockDb.$executeRaw.mockResolvedValue(1 as never);

    const res = await PUT(putReq({ background: null }), CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.background).toBeNull();
  });

  it("400 rejects raw CSS smuggled in as a preset value", async () => {
    asOrgOwner();
    const res = await PUT(
      putReq({ background: { type: "color", value: "red;position:fixed;top:0" } }),
      CTX,
    );
    expect(res.status).toBe(400);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("400 rejects an image value that could break out of url()", async () => {
    asOrgOwner();
    const res = await PUT(
      putReq({ background: { type: "image", value: "https://x/a.png)no-repeat,url(evil" } }),
      CTX,
    );
    expect(res.status).toBe(400);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("400 rejects an unknown background type", async () => {
    asOrgOwner();
    const res = await PUT(putReq({ background: { type: "video", value: "x" } }), CTX);
    expect(res.status).toBe(400);
  });

  it("400 rejects an oversized inline image", async () => {
    asOrgOwner();
    const huge = `data:image/png;base64,${"A".repeat(MAX_BACKGROUND_IMAGE_BYTES)}`;
    const res = await PUT(putReq({ background: { type: "image", value: huge } }), CTX);
    expect(res.status).toBe(400);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("404 when the UPDATE matches no row (project vanished mid-request)", async () => {
    asOrgOwner();
    mockDb.$executeRaw.mockResolvedValue(0 as never);

    const res = await PUT(putReq({ background: { type: "color", value: "blue" } }), CTX);
    expect(res.status).toBe(404);
  });
});
