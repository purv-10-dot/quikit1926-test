/**
 * GET /api/upwork/picker — dropdown source for the Log Activity composer's
 * Upwork selector ("Link to" → Upwork).
 *
 * The load-bearing case here is OWNER SCOPING: Upwork jobs are visible org-wide
 * to admins but only own-rows to everyone else (CrmUpworkJob.createdByUserId).
 * The picker must not become a hole that lists another rep's jobs, so it reuses
 * listUpworkJobs + upworkOwnerScope rather than querying the table directly.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(role: string, orgId = "t1", userId = "u1") {
  setSession({ userId, orgId, role, email: "a@b.co", name: "Alice" });
}

function req(qs = "") {
  return new Request(
    `http://test/api/upwork/picker${qs}`,
  ) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
  db.crmUpworkJob.findMany.mockResolvedValue([]);
  db.crmUpworkJob.count.mockResolvedValue(0);
});

describe("GET /api/upwork/picker", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/upwork/picker/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("scopes to the caller's org and excludes trashed jobs", async () => {
    session("Administrator", "t1");
    const { GET } = await import("@/app/api/upwork/picker/route");
    await GET(req());

    const where = db.crmUpworkJob.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ orgId: "t1", deletedAt: null });
  });

  it("restricts a non-admin to the jobs they added", async () => {
    session("Sales Executive", "t1", "u-rep");
    const { GET } = await import("@/app/api/upwork/picker/route");
    await GET(req());

    const where = db.crmUpworkJob.findMany.mock.calls[0]?.[0]?.where as {
      createdByUserId?: string;
    };
    expect(where.createdByUserId).toBe("u-rep");
  });

  it("does NOT restrict an admin by owner", async () => {
    session("Administrator", "t1", "u-admin");
    const { GET } = await import("@/app/api/upwork/picker/route");
    await GET(req());

    const where = db.crmUpworkJob.findMany.mock.calls[0]?.[0]?.where as {
      createdByUserId?: string;
    };
    expect(where.createdByUserId).toBeUndefined();
  });

  it("maps jobTitle to `name` so the shape matches every other picker", async () => {
    session("Administrator");
    db.crmUpworkJob.findMany.mockResolvedValue([
      { id: "j1", jobTitle: "Build a Next.js dashboard" },
    ]);
    const { GET } = await import("@/app/api/upwork/picker/route");
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([{ id: "j1", name: "Build a Next.js dashboard" }]);
  });
});
