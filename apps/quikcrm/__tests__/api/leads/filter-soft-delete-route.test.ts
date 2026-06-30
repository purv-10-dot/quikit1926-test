/**
 * Regression: trashed leads must not leak into the active list.
 *
 * CrmLead is NOT registered in the package-level soft-delete middleware, so
 * POST /api/leads/filter must exclude `deletedAt` itself. Before the fix the
 * default branch added no deletedAt clause and trashed leads showed up in
 * "All Leads" (and were double-counted against the Trash view).
 *
 *   default              → where carries top-level deletedAt: null
 *   ?onlyDeleted=true     → deletedAt: { not: null }
 *   ?includeDeleted=true  → no deletedAt clause
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function adminSession() {
  setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@b.co", name: "Alice" });
}

async function callFilter(query = "") {
  const { POST } = await import("@/app/api/leads/filter/route");
  const req = new Request(`http://test/api/leads/filter${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filter: { matchMode: "ALL", conditions: [] },
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    }),
  });
  return POST(req as unknown as import("next/server").NextRequest);
}

/** The top-level `where` passed to the first findMany call. */
function whereArg(): Record<string, unknown> {
  const call = db.crmLead.findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
  return call?.where ?? {};
}

describe("POST /api/leads/filter — soft-delete exclusion", () => {
  beforeEach(() => {
    db.crmLead.findMany.mockReset();
    db.crmLead.count.mockReset();
    db.crmLead.findMany.mockResolvedValue([]);
    db.crmLead.count.mockResolvedValue(0);
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await callFilter();
    expect(res.status).toBe(401);
  });

  it("default list excludes trashed leads (top-level deletedAt: null)", async () => {
    adminSession();
    await callFilter();
    expect(whereArg()).toHaveProperty("deletedAt", null);
  });

  it("?onlyDeleted=true returns only trashed leads", async () => {
    adminSession();
    await callFilter("?onlyDeleted=true");
    expect(whereArg()).toMatchObject({ deletedAt: { not: null } });
  });

  it("?includeDeleted=true does not constrain deletedAt", async () => {
    adminSession();
    await callFilter("?includeDeleted=true");
    expect(whereArg().deletedAt).toBeUndefined();
  });
});
