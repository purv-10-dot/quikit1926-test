import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/workflows/route";

const USER = "user_1";
const TENANT = "tenant_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function listReq() {
  return new NextRequest("http://localhost/api/workflows");
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/workflows (list org templates)", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(listReq(), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("lists only org-level (projectId null) templates for the caller's org", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtWorkflow.findMany.mockResolvedValue([
      {
        id: "wf_t1",
        name: "Bug workflow",
        description: "classic",
        updatedAt: new Date("2026-08-04T10:00:00Z"),
        templateJson: { description: "classic", statuses: [], transitions: [] },
      },
    ] as never);

    const res = await GET(listReq(), { params: {} } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // The built-in classic template is always first; saved org templates follow.
    expect(body.data[0].builtIn).toBe(true);
    expect(body.data[0].name).toBe("Classic default workflow");
    const saved = body.data.filter((w: { builtIn: boolean }) => !w.builtIn);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("wf_t1");
    // Query is scoped to org + projectId null.
    const where = mockDb.qtWorkflow.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ orgId: TENANT, projectId: null, isDeleted: false });
  });
});

describe("POST /api/workflows (save as new template)", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq({ sourceWorkflowId: "wf1", name: "X" }), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("400 on invalid input", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(postReq({ name: "" }), { params: {} } as never);
    expect(res.status).toBe(400);
  });

  it("404 when the source workflow is not in the caller's org", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtWorkflow.findFirst.mockResolvedValue(null);
    const res = await POST(postReq({ sourceWorkflowId: "ghost", name: "X" }), { params: {} } as never);
    expect(res.status).toBe(404);
  });

  it("creates an org template snapshot from an admin-owned source workflow", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    // Admin access → hasAdminAccess true via orgMember owner.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    // findFirst #1 = source workflow; #2 = duplicate-name check (none).
    mockDb.qtWorkflow.findFirst
      .mockResolvedValueOnce({
        projectId: "proj_1",
        workflowStatuses: [
          { statusId: "s_open", isInitial: true, status: { name: "Open", category: "BACKLOG", color: "#111" } },
          { statusId: "s_done", isInitial: false, status: { name: "Done", category: "DONE", color: "#222" } },
        ],
        transitions: [
          { name: "Create", type: "INITIAL", toStatusId: "s_open", fromStatuses: [], rules: [] },
          { name: "Finish", type: "NORMAL", toStatusId: "s_done", fromStatuses: [{ statusId: "s_open" }], rules: [] },
        ],
      } as never)
      .mockResolvedValueOnce(null as never); // no dupe
    mockDb.qtWorkflow.create.mockResolvedValue({ id: "wf_new", name: "Bug workflow" } as never);

    const res = await POST(postReq({ sourceWorkflowId: "wf1", name: "Bug workflow" }), { params: {} } as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("wf_new");
    // Created as an org template (projectId null, inactive) with a name-based snapshot.
    const data = mockDb.qtWorkflow.create.mock.calls[0]?.[0]?.data as unknown as {
      projectId: string | null;
      isActive: boolean;
      templateJson: {
        statuses: Array<{ name: string; isInitial: boolean }>;
        transitions: Array<{ name: string; toName: string; fromNames: string[] }>;
      };
    };
    expect(data.projectId).toBeNull();
    expect(data.isActive).toBe(false);
    expect(data.templateJson.statuses).toHaveLength(2);
    expect(data.templateJson.statuses[0]).toMatchObject({ name: "Open", isInitial: true });
    expect(data.templateJson.transitions[1]).toMatchObject({ name: "Finish", toName: "Done", fromNames: ["Open"] });
  });
});
