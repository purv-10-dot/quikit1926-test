import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/projects/[id]/workflow-scheme/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/workflow-scheme`);
}

/** withProjectAccess: project exists + caller is a member (or admin). */
function asMember() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never); // admin bypass
}

describe("GET /api/projects/:id/workflow-scheme", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(req(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the project is not in the caller's org", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(404);
  });

  it("returns scheme + issue types for a member", async () => {
    asMember();
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({
      id: "sch1",
      name: "Default Workflow Scheme",
      hasDraft: false,
      items: [
        {
          id: "it1",
          isDefault: true,
          issueTypeId: null,
          issueType: null,
          workflow: {
            id: "wf1",
            name: "classic default workflow",
            description: null,
            isActive: true,
            _count: { workflowStatuses: 4, transitions: 5 },
          },
        },
      ],
    } as never);
    mockDb.qtIssueType.findMany.mockResolvedValue([
      { id: "t1", name: "Task", color: "#000", icon: null },
    ] as never);

    const res = await GET(req(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.scheme.items).toHaveLength(1);
    expect(body.data.issueTypes[0].name).toBe("Task");
  });
});
