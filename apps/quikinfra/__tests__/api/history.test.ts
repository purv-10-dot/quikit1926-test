import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/history/route";

const db = mockDb as any;

// listHistoryForEntity merges:
//   - cnApprovalInstance.findMany (workflow timeline)
//   - cnAuditLog.findMany         (field-level changes)
//   - a master-row fallback (cnXxx.findFirst, keyed by MASTER_MODEL_MAP)
//   - db.user.findMany (central) to resolve actor names (via findCnUsersByIds)
function stubEmptyHistory() {
  db.cnApprovalInstance.findMany.mockResolvedValue([]);
  db.cnAuditLog.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]); // central auth.User name resolution
}

function reqGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/history${qs ? "?" + qs : ""}`, { method: "GET" });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  stubEmptyHistory();
});

describe("GET /api/history — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(reqGET("entityType=po&entityId=po1"));
    expect(res.status).toBe(401);
  });

  it("allows any authenticated org user", async () => {
    setContext(makeUserCtx([]));
    const res = await GET(reqGET("entityType=po&entityId=po1"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/history — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when entityType is missing", async () => {
    const res = await GET(reqGET("entityId=po1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when entityId is missing", async () => {
    const res = await GET(reqGET("entityType=po"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/history — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("scopes the approval + audit queries to the caller's org and entity", async () => {
    const res = await GET(reqGET("entityType=po&entityId=po1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);

    const apprWhere = db.cnApprovalInstance.findMany.mock.calls[0][0].where;
    expect(apprWhere.orgId).toBe(TEST_TENANT);
    expect(apprWhere.entityType).toEqual({ in: ["po"] });
    expect(apprWhere.entityId).toBe("po1");

    const auditWhere = db.cnAuditLog.findMany.mock.calls[0][0].where;
    expect(auditWhere.orgId).toBe(TEST_TENANT);
    expect(auditWhere.entityType).toEqual({ in: ["po"] });
    expect(auditWhere.entityId).toBe("po1");
  });

  it("unions comma-separated entityType values into the IN filter", async () => {
    await GET(reqGET("entityType=material_issues,issue&entityId=mi1"));
    const apprWhere = db.cnApprovalInstance.findMany.mock.calls[0][0].where;
    expect(apprWhere.entityType).toEqual({ in: ["material_issues", "issue"] });
  });

  it("emits a Requested event for an approval instance and resolves the actor name", async () => {
    db.cnApprovalInstance.findMany.mockResolvedValue([
      {
        id: "inst1",
        orgId: TEST_TENANT,
        status: "approved",
        requestedById: "u-req",
        requestedAt: new Date("2026-06-01T10:00:00Z"),
        currentStepOrder: 1,
        history: [],
        workflow: { steps: [] },
      },
    ]);
    db.user.findMany.mockResolvedValue([
      { id: "u-req", email: "req@test.io", firstName: "Riya", lastName: "Patel" },
    ]);

    const res = await GET(reqGET("entityType=po&entityId=po1"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      kind: "submit",
      label: "Requested",
      byId: "u-req",
      byName: "Riya Patel",
    });
  });

  it("synthesizes create/update events for a labour rate from its master row", async () => {
    // Labour rates don't write CnAuditLog or go through the approval engine,
    // so the timeline relies on the master-row fallback (MASTER_MODEL_MAP →
    // cnLabourRate). Before this mapping existed the drawer showed
    // "No activity yet".
    db.cnLabourRate.findFirst.mockResolvedValue({
      createdAt: new Date("2026-07-14T09:00:00Z"),
      updatedAt: new Date("2026-07-22T16:00:00Z"),
      createdBy: "u-admin",
      updatedBy: "u-admin",
    });
    db.user.findMany.mockResolvedValue([
      { id: "u-admin", email: "admin@test.io", firstName: "Ash", lastName: "Singone" },
    ]);

    const res = await GET(reqGET("entityType=labour-rate&entityId=lr1"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ kind: "create", label: "Record created", byName: "Ash Singone" });
    expect(body.data[1]).toMatchObject({ kind: "update", label: "Last updated", byName: "Ash Singone" });

    // fallback query is org- and entity-scoped
    const where = db.cnLabourRate.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: "lr1", orgId: TEST_TENANT });
  });

  it("merges audit-log events with a field-level change diff", async () => {
    db.cnAuditLog.findMany.mockResolvedValue([
      {
        id: "aud1",
        orgId: TEST_TENANT,
        action: "update",
        userId: "u-edit",
        timestamp: new Date("2026-06-02T12:00:00Z"),
        changes: { status: { from: "draft", to: "approved" } },
      },
    ]);
    db.user.findMany.mockResolvedValue([
      { id: "u-edit", email: "edit@test.io", firstName: "Sam", lastName: "Roy" },
    ]);

    const res = await GET(reqGET("entityType=po&entityId=po1"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ kind: "update", label: "Updated", byName: "Sam Roy" });
    expect(body.data[0].changes).toEqual([{ field: "status", from: "draft", to: "approved" }]);
  });
});
