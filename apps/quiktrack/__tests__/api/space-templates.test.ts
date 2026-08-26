import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/projects/[id]/save-as-template/route";
import { GET } from "@/app/api/space-templates/route";

const USER = "user_1";
const ORG = "org_1";
const OTHER_ORG = "org_2";
const PROJECT = "proj_1";

const CTX = { params: { id: PROJECT } } as never;

function saveReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/save-as-template`, {
    method: "POST",
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
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
  mockDb.qtProject.findFirst.mockResolvedValue({
    id: PROJECT,
    projectKey: "SPAC",
    name: "SpaceTrack",
    projectType: "software",
    managementStyle: "team-managed",
    templateKey: "scrum",
    backlogName: null,
    icon: null,
    color: "#2563eb",
  } as never);
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

/** Stub every collection the snapshot reads. */
function stubSnapshotSources() {
  mockDb.qtIssueType.findMany.mockResolvedValue([
    { name: "Task", color: "#64748b", icon: null, orderIndex: 0 },
  ] as never);
  mockDb.qtIssueStatus.findMany.mockResolvedValue([
    { name: "To Do", color: "#94a3b8", category: "BACKLOG", orderIndex: 0, isHidden: false },
    { name: "Done", color: "#22c55e", category: "DONE", orderIndex: 1, isHidden: false },
  ] as never);
  mockDb.qtBoardColumn.findMany.mockResolvedValue([
    { name: "To Do", orderIndex: 0, statuses: [{ status: { name: "To Do" } }] },
  ] as never);
  mockDb.qtCustomField.findMany.mockResolvedValue([] as never);
  mockDb.qtProjectRole.findMany.mockResolvedValue([
    {
      name: "Space Admin",
      description: null,
      isDefault: false,
      permissions: [{ resource: "Project", action: "update" }],
    },
  ] as never);
  // background read + tabConfig read (both raw SQL)
  mockDb.$queryRaw.mockResolvedValue([] as never);
  mockDb.$executeRaw.mockResolvedValue(1 as never);
}

describe("POST /api/projects/[id]/save-as-template", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(saveReq({ name: "T" }), CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the project belongs to another org (isolation)", async () => {
    setSession({ id: USER, orgId: OTHER_ORG, role: "owner" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const res = await POST(saveReq({ name: "T" }), CTX);
    expect(res.status).toBe(404);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("403 for a member without Project:update", async () => {
    asContributor();
    const res = await POST(saveReq({ name: "T" }), CTX);
    expect(res.status).toBe(403);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("400 on an empty name", async () => {
    asOrgOwner();
    const res = await POST(saveReq({ name: "   " }), CTX);
    expect(res.status).toBe(400);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("201 snapshots the space config and reports what it captured", async () => {
    asOrgOwner();
    stubSnapshotSources();

    const res = await POST(saveReq({ name: "Scrum baseline" }), CTX);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Scrum baseline");
    expect(json.data.summary).toMatchObject({
      issueTypes: 1,
      statuses: 2,
      boardColumns: 1,
      customFields: 0,
      projectRoles: 1,
      sprintsEnabled: true,
    });
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });

  it("409 when the org already has a template with that name", async () => {
    asOrgOwner();
    stubSnapshotSources();
    // The name-clash probe is the only $queryRaw that returns rows here; the
    // background/tabConfig reads happen before it and tolerate [].
    mockDb.$queryRaw.mockResolvedValue([{ id: "spt_existing" }] as never);

    const res = await POST(saveReq({ name: "Scrum baseline" }), CTX);
    expect(res.status).toBe(409);
  });

  it("copies configuration only — never work items or members", async () => {
    asOrgOwner();
    stubSnapshotSources();

    await POST(saveReq({ name: "Scrum baseline" }), CTX);
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
    expect(mockDb.qtSprint.findMany).not.toHaveBeenCalled();
    expect(mockDb.qtProjectMember.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/space-templates", () => {
  function listReq() {
    return new NextRequest("http://localhost/api/space-templates");
  }

  it("401 when unauthenticated", async () => {
    const res = await GET(listReq());
    expect(res.status).toBe(401);
  });

  it("403 without Project:create", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await GET(listReq());
    expect(res.status).toBe(403);
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns summarised templates for a caller with Project:create", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtRolePermission.findFirst.mockResolvedValue({ id: "grant" } as never);
    mockDb.$queryRaw.mockResolvedValue([
      {
        id: "spt_1",
        orgId: ORG,
        name: "Scrum baseline",
        description: null,
        sourceProjectId: PROJECT,
        templateKey: "scrum",
        icon: null,
        color: "#2563eb",
        createdAt: new Date("2026-08-25"),
        createdBy: USER,
        config: {
          version: 1,
          issueTypes: [{}, {}],
          statuses: [{}, {}, {}],
          boardColumns: [{}],
          customFields: [],
          projectRoles: [{}],
          sprints: { enabled: true },
        },
      },
    ] as never);

    const res = await GET(listReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].summary).toMatchObject({
      issueTypes: 2,
      statuses: 3,
      boardColumns: 1,
      customFields: 0,
      projectRoles: 1,
      sprintsEnabled: true,
    });
    // The heavy snapshot itself is never sent to the picker.
    expect(json.data[0].config).toBeUndefined();
  });
});
