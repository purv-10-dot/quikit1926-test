import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function adminSession() {
  setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@b.co", name: "Alice" });
}

const base = {
  id: "wf1",
  tenantId: "t1",
  name: "Flow",
  triggerType: "trigger_lead_created",
  triggerSummary: null,
  graphNodes: [],
  graphEdges: [],
  deletedAt: null,
  createdAt: new Date("2026-07-01"),
  updatedAt: new Date("2026-07-01"),
};

function mockDef(status: string) {
  db.crmWorkflowDefinition.findFirst.mockResolvedValue({ ...base, status } as never);
  db.crmWorkflowDefinition.update.mockImplementation(
    ((args: { data: Record<string, unknown> }) => ({ ...base, status, ...args.data })) as never,
  );
}

beforeEach(() => {
  db.crmWorkflowDefinition.findFirst.mockReset();
  db.crmWorkflowDefinition.update.mockReset();
  setSession(null);
});

describe("POST /api/automations/workflows/[id]/publish", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/automations/workflows/[id]/publish/route");
    const res = await POST(new Request("http://t/x", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 for a cross-tenant / missing definition", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/automations/workflows/[id]/publish/route");
    const res = await POST(new Request("http://t/x", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(404);
    expect((db.crmWorkflowDefinition.findFirst.mock.calls[0]![0]!.where as { tenantId: string }).tenantId).toBe("t1");
  });

  it("publishes a Draft → Active (happy path, stamps lastPublishedOn)", async () => {
    adminSession();
    mockDef("Draft");
    const { POST } = await import("@/app/api/automations/workflows/[id]/publish/route");
    const res = await POST(new Request("http://t/x", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(200);
    const data = db.crmWorkflowDefinition.update.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(data.status).toBe("Active");
    expect(data.lastPublishedOn).toBeInstanceOf(Date);
  });

  it("400 on an illegal transition (publishing a non-Draft)", async () => {
    adminSession();
    mockDef("Active");
    const { POST } = await import("@/app/api/automations/workflows/[id]/publish/route");
    const res = await POST(new Request("http://t/x", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(400);
    expect(db.crmWorkflowDefinition.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/automations/workflows/[id]/unpublish", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/automations/workflows/[id]/unpublish/route");
    const res = await POST(
      new Request("http://t/x", { method: "POST", body: JSON.stringify({ mode: "delayed" }) }) as never,
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("400 on an invalid mode", async () => {
    adminSession();
    mockDef("Active");
    const { POST } = await import("@/app/api/automations/workflows/[id]/unpublish/route");
    const res = await POST(
      new Request("http://t/x", { method: "POST", body: JSON.stringify({ mode: "bogus" }) }) as never,
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("delayed unpublish drives Active → Draining", async () => {
    adminSession();
    mockDef("Active");
    const { POST } = await import("@/app/api/automations/workflows/[id]/unpublish/route");
    const res = await POST(
      new Request("http://t/x", { method: "POST", body: JSON.stringify({ mode: "delayed" }) }) as never,
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(200);
    expect((db.crmWorkflowDefinition.update.mock.calls[0]![0]!.data as { status: string }).status).toBe("Draining");
  });

  it("immediate unpublish drives Active → Stopped", async () => {
    adminSession();
    mockDef("Active");
    const { POST } = await import("@/app/api/automations/workflows/[id]/unpublish/route");
    const res = await POST(
      new Request("http://t/x", { method: "POST", body: JSON.stringify({ mode: "immediate" }) }) as never,
      { params: Promise.resolve({ id: "wf1" }) },
    );
    expect(res.status).toBe(200);
    expect((db.crmWorkflowDefinition.update.mock.calls[0]![0]!.data as { status: string }).status).toBe("Stopped");
  });
});

describe("DELETE /api/automations/workflows/[id] (soft-delete)", () => {
  it("401 when unauthenticated", async () => {
    const { DELETE } = await import("@/app/api/automations/workflows/[id]/route");
    const res = await DELETE(new Request("http://t/x", { method: "DELETE" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 for a cross-tenant / missing definition", async () => {
    adminSession();
    db.crmWorkflowDefinition.findFirst.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/automations/workflows/[id]/route");
    const res = await DELETE(new Request("http://t/x", { method: "DELETE" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(404);
  });

  it("soft-deletes a Draft (sets Deleted + deletedAt, never a hard delete)", async () => {
    adminSession();
    mockDef("Draft");
    const { DELETE } = await import("@/app/api/automations/workflows/[id]/route");
    const res = await DELETE(new Request("http://t/x", { method: "DELETE" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(200);
    const data = db.crmWorkflowDefinition.update.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(data.status).toBe("Deleted");
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(db.crmWorkflowDefinition.delete).not.toHaveBeenCalled();
  });

  it("400 when deleting a Draining automation (must Stop first)", async () => {
    adminSession();
    mockDef("Draining");
    const { DELETE } = await import("@/app/api/automations/workflows/[id]/route");
    const res = await DELETE(new Request("http://t/x", { method: "DELETE" }) as never, {
      params: Promise.resolve({ id: "wf1" }),
    });
    expect(res.status).toBe(400);
    expect(db.crmWorkflowDefinition.update).not.toHaveBeenCalled();
  });
});
