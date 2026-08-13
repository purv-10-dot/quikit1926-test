import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/store/gate-passes/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/store/gate-passes${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store/gate-passes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** A raw `Gate_passes` row as the repository's $queryRaw would return it. */
function rawRow(over: Record<string, unknown> = {}) {
  return {
    id: "gp1",
    orgId: TEST_TENANT,
    gatePassNumber: "GP-OUT-26-001",
    type: "outward",
    projectId: "proj1",
    projectName: "Acme Tower",
    status: "draft",
    materials: [],
    lineCount: 0,
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

/**
 * Resolve the repository's two parallel raw queries: the row page first, then
 * the `COUNT(*)` used for `total`.
 */
function mockList(rows: Array<Record<string, unknown>>, total = rows.length) {
  db.$queryRaw
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([{ count: total }]);
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/store/gate-passes  (gate: construction.gatepass.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/gate-passes", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("lists gate passes scoped to the org and returns {data,total}", async () => {
    setContext(makeAdminCtx());
    // listGatePasses issues TWO raw queries in parallel — the page of rows and
    // a COUNT(*) — so each needs its own resolution.
    mockList([rawRow(), rawRow({ id: "gp2", gatePassNumber: "GP-OUT-26-002" })], 2);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.data[0].gatePassNumber).toBe("GP-OUT-26-001");
    // org scoping is enforced inside the raw query — the tenant id is bound
    expect(JSON.stringify(db.$queryRaw.mock.calls[0])).toContain(TEST_TENANT);
  });

  it("applies a search filter on gatePassNumber", async () => {
    setContext(makeAdminCtx());
    // Search is applied SQL-side, so the mock returns the already-filtered
    // page; the assertion is that the term was bound into the query.
    mockList([rawRow()], 1);
    const res = await GET(buildGET("search=001"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].gatePassNumber).toBe("GP-OUT-26-001");
    expect(JSON.stringify(db.$queryRaw.mock.calls[0])).toContain("001");
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/gate-passes  (gate: construction.gatepass.create + matrix store.gate_pass:add)
// ═══════════════════════════════════════════════

describe("POST /api/store/gate-passes", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ type: "outward" }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({ type: "outward" }))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.gatepass.create"], {
        permissionMatrix: { "store.gate_pass": { add: false } },
      }),
    );
    expect((await POST(buildPOST({ type: "outward" }))).status).toBe(403);
  });

  it("creates a gate pass scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    // nextGatePassSequence COUNT(*) → 0, createGatePass INSERT, then findGatePassById SELECT
    db.$queryRaw
      .mockResolvedValueOnce([{ c: 0 }]) // nextGatePassSequence
      .mockResolvedValueOnce([rawRow({ status: "draft" })]); // findGatePassById after insert
    db.$executeRaw.mockResolvedValue(1);

    const res = await POST(
      buildPOST({ type: "outward", gatePassDate: "2026-01-15", lines: [] }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("gp1");
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});
