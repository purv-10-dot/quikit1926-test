import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/projects/[id]/issue-fields/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/issue-fields`);
}

const ROUTE_CTX = { params: { id: PROJECT } } as never;

// A space-scoped custom field belonging to this project.
const FIELD_ROW = {
  id: "cf_1",
  orgId: TENANT,
  scope: "space",
  projectId: PROJECT,
  name: "Customer Name",
  key: "customer_name",
  type: "text",
  description: null,
  status: "active",
  isRequired: false,
  defaultValue: null,
  placeholder: null,
  helpText: null,
  position: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  options: [],
};

/** Wire up the mocks for a non-admin project member (org member, not app admin). */
function asProjectMember(role: "VIEWER" | "MEMBER") {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ role } as never);
}

describe("GET /api/projects/[id]/issue-fields", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  // Regression: space custom fields were invisible to non-admin members because
  // the route gated on Issue:view — a grant that doesn't exist (issue visibility
  // is membership-based, see permissionsRegistry). Only Space/app admins could
  // satisfy it, so every Contributor/Viewer got an empty create form. A project
  // member must see the field catalog.
  it("returns project custom fields to a non-admin member (Viewer)", async () => {
    asProjectMember("VIEWER");
    mockDb.qtCustomField.findMany.mockResolvedValue([FIELD_ROW] as never);

    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toMatchObject({
      id: "cf_1",
      name: "Customer Name",
      scope: "space",
    });
  });

  it("404 when the caller is not a project member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);

    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(404);
  });
});
