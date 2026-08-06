import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { getScope } from "@/lib/auth/account-acl";

const db = mockDb();

function adminSession() {
  setSession({
    userId: "u1",
    orgId: "t1",
    role: "Administrator",
    email: "a@b.co",
    name: "Alice",
  });
}

function post(body: unknown) {
  return new Request("http://test/api/activities/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const EMPTY_FILTER = { matchMode: "ALL", conditions: [] };

// Stands in for the org's CrmActivityType rows (labels + ordering).
const CONFIGURED = [
  { code: "call", label: "Call", sortOrder: 0 },
  { code: "email", label: "Email", sortOrder: 2 },
];

describe("POST /api/activities/summary", () => {
  beforeEach(() => {
    vi.mocked(db.crmActivity.groupBy).mockReset();
    vi.mocked(db.crmActivityType.findMany).mockReset();
    vi.mocked(db.crmActivityType.findMany).mockResolvedValue(CONFIGURED as never);
    // Unrestricted by default → buildActivityAclWhere returns null, so the
    // where-clause is just orgId + filter + lead-init exclusion.
    vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);
    setSession(null);
  });

  it("401s when unauthenticated", async () => {
    const { POST } = await import("@/app/api/activities/summary/route");
    const res = await POST(post({ filter: EMPTY_FILTER }));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid filter payload", async () => {
    adminSession();
    const { POST } = await import("@/app/api/activities/summary/route");
    const res = await POST(post({ filter: { matchMode: "SOMETIMES" } }));
    expect(res.status).toBe(400);
  });

  it("scopes the query to the caller's org", async () => {
    adminSession();
    vi.mocked(db.crmActivity.groupBy).mockResolvedValue([] as never);
    const { POST } = await import("@/app/api/activities/summary/route");
    await POST(post({ filter: EMPTY_FILTER }));

    const arg = vi.mocked(db.crmActivity.groupBy).mock.calls[0][0];
    expect(arg.by).toEqual(["type"]);
    expect(JSON.stringify(arg.where)).toContain('"orgId":"t1"');
  });

  it("returns type counts labelled from config, ordered by sortOrder", async () => {
    adminSession();
    vi.mocked(db.crmActivity.groupBy).mockResolvedValue([
      { type: "email", _count: { _all: 48 } },
      { type: "call", _count: { _all: 12 } },
    ] as never);
    const { POST } = await import("@/app/api/activities/summary/route");
    const res = await POST(post({ filter: EMPTY_FILTER }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.groups).toEqual([
      { key: "call", label: "Call", count: 12 },
      { key: "email", label: "Email", count: 48 },
    ]);
    expect(body.data.total).toBe(60);
  });

  it("reads activity types for the caller's org only", async () => {
    adminSession();
    vi.mocked(db.crmActivity.groupBy).mockResolvedValue([] as never);
    const { POST } = await import("@/app/api/activities/summary/route");
    await POST(post({ filter: EMPTY_FILTER }));

    const arg = vi.mocked(db.crmActivityType.findMany).mock.calls[0][0];
    expect(arg?.where).toEqual({ orgId: "t1" });
  });

  it("surfaces a custom type from config without any code change", async () => {
    adminSession();
    vi.mocked(db.crmActivityType.findMany).mockResolvedValue([
      { code: "bidding", label: "Bidding", sortOrder: 7 },
    ] as never);
    vi.mocked(db.crmActivity.groupBy).mockResolvedValue([
      { type: "bidding", _count: { _all: 5 } },
    ] as never);
    const { POST } = await import("@/app/api/activities/summary/route");
    const res = await POST(post({ filter: EMPTY_FILTER }));
    const body = await res.json();
    expect(body.data.groups).toEqual([
      { key: "bidding", label: "Bidding", count: 5 },
    ]);
  });

  it("excludes lead-init events, matching the list route's where-clause", async () => {
    adminSession();
    vi.mocked(db.crmActivity.groupBy).mockResolvedValue([] as never);
    const { POST } = await import("@/app/api/activities/summary/route");
    await POST(post({ filter: EMPTY_FILTER }));

    // The summary must apply the same exclusion as /api/activities/filter,
    // otherwise the chips would count rows the table never shows.
    const where = JSON.stringify(vi.mocked(db.crmActivity.groupBy).mock.calls[0][0].where);
    expect(where).toContain("NOT");
  });

  it("applies the activity ACL for a restricted user", async () => {
    adminSession();
    // Restricted with no allowed accounts → ACL narrows to own-owned rows only.
    vi.mocked(getScope).mockResolvedValue({
      unrestricted: false,
      allowedAccountIds: [],
    } as never);
    vi.mocked(db.crmActivity.groupBy).mockResolvedValue([] as never);
    const { POST } = await import("@/app/api/activities/summary/route");
    await POST(post({ filter: EMPTY_FILTER }));

    const where = JSON.stringify(vi.mocked(db.crmActivity.groupBy).mock.calls[0][0].where);
    expect(where).toContain('"ownerId":"u1"');
  });

  it("returns an empty group list when nothing matches", async () => {
    adminSession();
    vi.mocked(db.crmActivity.groupBy).mockResolvedValue([] as never);
    const { POST } = await import("@/app/api/activities/summary/route");
    const res = await POST(post({ filter: EMPTY_FILTER }));
    const body = await res.json();
    expect(body.data.groups).toEqual([]);
    expect(body.data.total).toBe(0);
  });
});
