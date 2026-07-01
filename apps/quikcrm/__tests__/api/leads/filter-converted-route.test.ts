/**
 * "Show Converted Leads" backend behavior on POST /api/leads/filter.
 *
 * Converted leads (status = "Converted") are hidden from the active list by
 * default. The "Show Converted Leads" toggle sets ?includeConverted=true to
 * reveal them. Administrators always see converted leads regardless of the param.
 *
 *   default (non-admin)        → AND contains NOT status="Converted"
 *   ?includeConverted=true     → no such clause
 *   admin (any param)          → no such clause
 *   ?onlyDeleted=true          → trash view never applies the converted filter
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

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

/** The AND[] fragments of the top-level `where` passed to findMany. */
function whereAnd(): Record<string, unknown>[] {
  const call = db.crmLead.findMany.mock.calls[0]?.[0] as {
    where?: { AND?: Record<string, unknown>[] };
  };
  return call?.where?.AND ?? [];
}

/** True when the where excludes converted leads. */
function excludesConverted(): boolean {
  return whereAnd().some((frag) => {
    const not = (frag as { NOT?: { status?: { equals?: string } } }).NOT;
    return not?.status?.equals === "Converted";
  });
}

describe("POST /api/leads/filter — Show Converted Leads", () => {
  beforeEach(() => {
    db.crmLead.findMany.mockReset();
    db.crmLead.count.mockReset();
    db.crmLead.findMany.mockResolvedValue([]);
    db.crmLead.count.mockResolvedValue(0);
    setSession(null);
  });

  it("non-admin default: excludes converted leads", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    await callFilter();
    expect(excludesConverted()).toBe(true);
  });

  it("non-admin with ?includeConverted=true: includes converted leads", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    await callFilter("?includeConverted=true");
    expect(excludesConverted()).toBe(false);
  });

  it("Sales Manager + Marketing User also hide converted by default", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesManager" });
    await callFilter();
    expect(excludesConverted()).toBe(true);

    db.crmLead.findMany.mockReset();
    db.crmLead.findMany.mockResolvedValue([]);
    setSession({ userId: "u2", orgId: "t1", role: "MarketingUser" });
    await callFilter();
    expect(excludesConverted()).toBe(true);
  });

  it("admin always sees converted leads (default, no param)", async () => {
    setSession({ userId: "a1", orgId: "t1", role: "Administrator" });
    await callFilter();
    expect(excludesConverted()).toBe(false);
  });

  it("admin ignores includeConverted=false and still sees converted", async () => {
    setSession({ userId: "a1", orgId: "t1", role: "Administrator" });
    await callFilter("?includeConverted=false");
    expect(excludesConverted()).toBe(false);
  });

  it("trash view never applies the converted filter", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    await callFilter("?onlyDeleted=true");
    expect(excludesConverted()).toBe(false);
  });

  it("default still excludes trashed leads alongside the converted filter", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    await callFilter();
    const call = db.crmLead.findMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };
    expect(call?.where).toHaveProperty("deletedAt", null);
    expect(excludesConverted()).toBe(true);
  });
});
