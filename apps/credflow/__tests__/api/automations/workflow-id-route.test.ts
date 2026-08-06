import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function adminSession() {
  setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@b.co", name: "Alice" });
}

const draftDef = {
  id: "wf1",
  tenantId: "t1",
  name: "Welcome flow",
  status: "Draft",
  triggerType: "trigger_lead_created",
  triggerSummary: null,
  graphNodes: [
    { id: "n_trigger", kind: "trigger_lead_created", config: {} },
    { id: "n_field", kind: "update_lead_field", config: { field: "status", value: "New" } },
  ],
  graphEdges: [{ from: "n_trigger", to: "n_field" }],
  deletedAt: null,
  createdAt: new Date("2026-07-01"),
  updatedAt: new Date("2026-07-01"),
};

describe("GET /api/automations/workflows/[id]", () => {
  beforeEach(() => {
    db.crmWorkflowDefinition.findFirst.mockReset();
    db.crmWorkflowDefinition.update.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/automations/workflows/[id]/route");
    const req = new Request("http://test/api/automations/workflows/wf1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a definition outside the tenant (cross-tenant isolation)", async () => {
    adminSession();
    // Tenant scoping: the scoped findFirst returns null for a foreign-tenant row.
    db.crmWorkflowDefinition.findFirst.mockResolvedValue(null);
    const { GET } = await import("@/app/api/automations/workflows/[id]/route");
    const req = new Request("http://test/api/automations/workflows/wf1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(404);
    const where = db.crmWorkflowDefinition.findFirst.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.tenantId).toBe("t1");
    expect(where.deletedAt).toBeNull();
  });

  it("returns the definition for the owning tenant", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue(draftDef as never);
    const { GET } = await import("@/app/api/automations/workflows/[id]/route");
    const req = new Request("http://test/api/automations/workflows/wf1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Welcome flow");
  });
});

describe("PATCH /api/automations/workflows/[id]", () => {
  beforeEach(() => {
    db.crmWorkflowDefinition.findFirst.mockReset();
    db.crmWorkflowDefinition.update.mockReset();
    db.crmWorkflowDefinition.update.mockImplementation(
      ((args: { data: Record<string, unknown> }) => ({ ...draftDef, ...args.data })) as never,
    );
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { PATCH } = await import("@/app/api/automations/workflows/[id]/route");
    const req = new Request("http://test/api/automations/workflows/wf1", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(401);
  });

  it("rejects a cross-tenant PATCH with 404", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/automations/workflows/[id]/route");
    const req = new Request("http://test/api/automations/workflows/wf1", {
      method: "PATCH",
      body: JSON.stringify({ name: "renamed" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(404);
    expect(db.crmWorkflowDefinition.update).not.toHaveBeenCalled();
    const where = db.crmWorkflowDefinition.findFirst.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.tenantId).toBe("t1");
  });

  it("persists structural edits on a Draft (happy path)", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue(draftDef as never);
    const { PATCH } = await import("@/app/api/automations/workflows/[id]/route");
    const nextNodes = [
      ...draftDef.graphNodes,
      { id: "n_wait", kind: "wait", config: { durationMinutes: 30 } },
    ];
    const req = new Request("http://test/api/automations/workflows/wf1", {
      method: "PATCH",
      body: JSON.stringify({
        graphNodes: nextNodes,
        graphEdges: [...draftDef.graphEdges, { from: "n_field", to: "n_wait" }],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(200);
    expect(db.crmWorkflowDefinition.update).toHaveBeenCalledOnce();
  });

  it("rejects a STRUCTURAL edit on a published (Active) definition with 409", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue({ ...draftDef, status: "Active" } as never);
    const { PATCH } = await import("@/app/api/automations/workflows/[id]/route");
    const req = new Request("http://test/api/automations/workflows/wf1", {
      method: "PATCH",
      body: JSON.stringify({
        graphNodes: [...draftDef.graphNodes, { id: "n_new", kind: "wait", config: {} }],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(409);
    expect(db.crmWorkflowDefinition.update).not.toHaveBeenCalled();
  });

  it("allows a CONTENT-only edit on a published (Active) definition", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue({ ...draftDef, status: "Active" } as never);
    const { PATCH } = await import("@/app/api/automations/workflows/[id]/route");
    // Same node ids/kinds + same edges → config-only change is not structural.
    const req = new Request("http://test/api/automations/workflows/wf1", {
      method: "PATCH",
      body: JSON.stringify({
        graphNodes: [
          { id: "n_trigger", kind: "trigger_lead_created", config: {} },
          { id: "n_field", kind: "update_lead_field", config: { field: "status", value: "Contacted" } },
        ],
        graphEdges: draftDef.graphEdges,
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(200);
    expect(db.crmWorkflowDefinition.update).toHaveBeenCalledOnce();
  });

  it("allows rename on a published definition (name-only is never structural)", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue({ ...draftDef, status: "Active" } as never);
    const { PATCH } = await import("@/app/api/automations/workflows/[id]/route");
    const req = new Request("http://test/api/automations/workflows/wf1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed while live" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "wf1" }) });
    expect(res.status).toBe(200);
    expect(db.crmWorkflowDefinition.update).toHaveBeenCalledOnce();
  });
});
