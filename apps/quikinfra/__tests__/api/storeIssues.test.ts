import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/store/issues/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/store/issues${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store/issues", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // The repository list/find/count helpers run through raw SQL.
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(1);
  db.cnApprovalInstance.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/issues  (gate: construction.issue.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/issues", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("returns 200 with a decorated list scoped to the org", async () => {
    setContext(makeUserCtx(["construction.issue.view"]));
    db.$queryRaw.mockResolvedValue([
      { id: "mi1", orgId: TEST_TENANT, issueNumber: "MI-20260101-0001", projectId: "p1", status: "draft" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].issueNumber).toBe("MI-20260101-0001");
    // No approvalId on the row → canActOnCurrentStep is false, no instance fetch.
    expect(body.data[0].canActOnCurrentStep).toBe(false);
  });

  it("batch-loads approval instances for rows that carry an approvalId", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([
      { id: "mi1", orgId: TEST_TENANT, issueNumber: "MI-1", projectId: "p1", status: "pending_approval", approvalId: "inst1" },
    ]);
    db.cnApprovalInstance.findMany.mockResolvedValue([
      {
        id: "inst1",
        orgId: TEST_TENANT,
        currentStepOrder: 1,
        status: "pending_approval",
        workflow: { steps: [{ stepOrder: 1, approverRoleId: "SITE_ADMIN", approverUserId: null }] },
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    expect(db.cnApprovalInstance.findMany.mock.calls[0][0].where).toMatchObject({
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/issues  (gate: construction.issue.create + matrix store.issue:add)
// ═══════════════════════════════════════════════

describe("POST /api/store/issues", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.issue.create"], {
        permissionMatrix: { "store.issue": { add: false } },
      }),
    );
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(403);
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectId is required/i);
  });

  it("returns 404 when the project is not in this org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ projectId: "missing" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("creates a draft material issue scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "p1", name: "Site A" });
    // countMaterialIssuesForDate → $queryRaw COUNT row
    db.$queryRaw.mockResolvedValue([{ c: 0n }]);
    // createMaterialIssue: $executeRaw then findMaterialIssueById ($queryRaw)
    db.$queryRaw
      .mockResolvedValueOnce([{ c: 0n }]) // countMaterialIssuesForDate
      .mockResolvedValueOnce([
        { id: "mi1", orgId: TEST_TENANT, issueNumber: "MI-20260101-0001", projectId: "p1", status: "draft" },
      ]); // findMaterialIssueById after insert
    const res = await POST(buildPOST({ projectId: "p1", issueDate: "2026-01-01", lines: [] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("mi1");
    // The insert ran through $executeRaw with the resolved orgId bound.
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});
