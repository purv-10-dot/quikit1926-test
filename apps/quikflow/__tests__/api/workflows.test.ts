import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/workflows/route";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init as ConstructorParameters<typeof NextRequest>[1]);
}

const ADMIN = { id: "u_admin", orgId: "org_A", membershipRole: "org_admin" };
const MEMBER = { id: "u_member", orgId: "org_A", membershipRole: "employee" };

beforeEach(() => resetMockDb());

describe("GET /api/workflows", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req("/api/workflows"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("scopes the query to the caller's org (tenant isolation)", async () => {
    setSession(MEMBER);
    mockDb.wfWorkflow.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    await GET(req("/api/workflows"), { params: {} });

    const where = mockDb.wfWorkflow.findMany.mock.calls[0][0]?.where;
    expect(where?.orgId).toBe("org_A");
    // members only see org-wide + their own personal workflows
    expect(where?.OR).toEqual([{ scope: "org" }, { scope: "personal", ownerId: "u_member" }]);
  });

  it("excludes soft-deleted workflows from the list", async () => {
    setSession(MEMBER);
    mockDb.wfWorkflow.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    await GET(req("/api/workflows"), { params: {} });

    const where = mockDb.wfWorkflow.findMany.mock.calls[0][0]?.where;
    expect(where?.deletedAt).toBeNull();
  });

  it("returns mapped workflows on the happy path", async () => {
    setSession(ADMIN);
    mockDb.wfWorkflow.findMany.mockResolvedValue([
      {
        id: "wf1",
        name: "Alert on slipping KPI",
        app: "quikscale",
        scope: "org",
        status: "Active",
        ownerId: "u_admin",
        trigger: { label: "KPI below target" },
        graphNodes: [{ kind: "action", label: "Notify owner" }],
        lastRunAt: new Date("2026-07-14T09:00:00Z"),
        updatedAt: new Date("2026-07-14T09:00:00Z"),
        // deep-mock tolerates extra/missing fields
      } as never,
    ]);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u_admin", firstName: "Dhwani", lastName: "S", email: "d@x.com" } as never,
    ]);

    const res = await GET(req("/api/workflows"), { params: {} });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Alert on slipping KPI");
    expect(body.data[0].ownerName).toBe("Dhwani S");
    expect(body.data[0].triggerLabel).toBe("KPI below target");
  });
});

describe("POST /api/workflows", () => {
  it("rejects a member creating an org-wide workflow with 403", async () => {
    setSession(MEMBER);
    const res = await POST(
      req("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Org flow", app: "quikscale", scope: "org" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(403);
    expect(mockDb.wfWorkflow.create).not.toHaveBeenCalled();
  });

  it("creates a personal workflow (201) scoped to the org + owner", async () => {
    setSession(MEMBER);
    mockDb.wfWorkflow.create.mockResolvedValue({ id: "wf_new" } as never);

    const res = await POST(
      req("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "My flow", app: "quikscale", scope: "personal" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(201);
    const data = mockDb.wfWorkflow.create.mock.calls[0][0].data;
    expect(data.orgId).toBe("org_A");
    expect(data.ownerId).toBe("u_member");
    expect(data.status).toBe("Draft");
  });
});
