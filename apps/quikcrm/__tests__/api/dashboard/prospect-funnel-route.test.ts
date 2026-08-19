/**
 * GET /api/dashboard/prospect-funnel — Prospect Funnel widget data.
 *
 * Covers the contract the widget depends on:
 * - 401 unauthenticated.
 * - Tenant isolation: every query is orgId-scoped.
 * - Non-admins are pinned to their OWN prospects (savedById = self), and an
 *   ?ownerId naming somebody else can never widen that.
 * - Admins are org-wide and CAN narrow to a single user.
 * - Counts come from the groupBy result (nothing hardcoded), null/blank status
 *   buckets into "New", and stage order follows the known funnel order.
 */
import { describe, expect, it, beforeEach, type Mock } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

// `groupBy` is heavily overloaded in the generated Prisma client, so the deep
// mock proxy does not surface the Vitest mock methods through its type. Narrow
// it once here instead of casting at every call site.
const groupBy = db.crmProspect.groupBy as unknown as Mock;

const ROUTE = "@/app/api/dashboard/prospect-funnel/route";

function req(qs = "") {
  return new Request(`http://test/api/dashboard/prospect-funnel${qs}`, {
    headers: { "x-client-tz": "Asia/Kolkata" },
  }) as unknown as import("next/server").NextRequest;
}

/** Shape returned by `groupBy({ by:["status"], _count:{_all:true} })`. */
function group(rows: Array<{ status: string | null; n: number }>) {
  return rows.map((r) => ({ status: r.status, _count: { _all: r.n } }));
}

/** The `where` the route handed to Prisma on the most recent call. */
function lastWhere(): Record<string, unknown> {
  const call = groupBy.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
  return call.where;
}

beforeEach(() => {
  setSession(null);
  groupBy.mockReset();
  groupBy.mockResolvedValue(group([{ status: "New", n: 1 }]) as never);
});

describe("GET /api/dashboard/prospect-funnel", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    expect((await GET(req())).status).toBe(401);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("scopes a non-admin to their own prospects within their org", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "SalesUser" });
    const { GET } = await import(ROUTE);
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(lastWhere()).toMatchObject({ orgId: "org-1", savedById: "u1" });

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.scope).toBe("own");
    // A normal user gets no user dropdown.
    expect(json.data.canFilterByUser).toBe(false);
  });

  it("does not let a non-admin widen to another user via ?ownerId", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "SalesUser" });
    const { GET } = await import(ROUTE);
    await GET(req("?ownerId=someone-else"));

    // Intersected to nothing rather than honored — never u1 -> someone-else.
    expect(lastWhere().savedById).toBe("__none__");
    expect(lastWhere().orgId).toBe("org-1");
  });

  it("resolves ownerId=me to the caller for a non-admin", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "SalesUser" });
    const { GET } = await import(ROUTE);
    await GET(req("?ownerId=me"));

    expect(lastWhere().savedById).toBe("u1");
  });

  it("gives an Administrator the whole org and no savedById pin", async () => {
    setSession({ userId: "admin-1", orgId: "org-1", role: "Administrator" });
    const { GET } = await import(ROUTE);
    const res = await GET(req());

    expect(lastWhere()).toEqual({ orgId: "org-1" });
    const body = (await res.json()).data;
    expect(body.scope).toBe("org");
    expect(body.canFilterByUser).toBe(true);
  });

  it("lets an Administrator narrow to one user", async () => {
    setSession({ userId: "admin-1", orgId: "org-1", role: "Administrator" });
    const { GET } = await import(ROUTE);
    await GET(req("?ownerId=u7"));

    expect(lastWhere()).toMatchObject({ orgId: "org-1", savedById: "u7" });
  });

  it("returns counts from the DB, ordered New -> Converted, with a total", async () => {
    setSession({ userId: "admin-1", orgId: "org-1", role: "Administrator" });
    groupBy.mockResolvedValue(
      group([
        { status: "Converted", n: 3 },
        { status: "New", n: 20 },
      ]) as never,
    );

    const { GET } = await import(ROUTE);
    const body = (await (await GET(req())).json()).data;

    expect(body.steps).toEqual([
      { stage: "New", count: 20, pct: 87 },
      { stage: "Converted", count: 3, pct: 13 },
    ]);
    expect(body.total).toBe(23);
  });

  it("buckets null / blank status into New and always shows both funnel ends", async () => {
    setSession({ userId: "admin-1", orgId: "org-1", role: "Administrator" });
    groupBy.mockResolvedValue(
      group([
        { status: null, n: 2 },
        { status: "  ", n: 1 },
        { status: "New", n: 4 },
      ]) as never,
    );

    const { GET } = await import(ROUTE);
    const body = (await (await GET(req())).json()).data;

    expect(body.steps).toEqual([
      { stage: "New", count: 7, pct: 100 },
      // No converted prospects yet, but the stage is still shown as a zero.
      { stage: "Converted", count: 0, pct: 0 },
    ]);
    expect(body.total).toBe(7);
  });

  it("reports zeros (not an error) when the org has no prospects", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "SalesUser" });
    groupBy.mockResolvedValue([] as never);

    const { GET } = await import(ROUTE);
    const body = (await (await GET(req())).json()).data;

    expect(body.total).toBe(0);
    expect(body.steps).toEqual([
      { stage: "New", count: 0, pct: 0 },
      { stage: "Converted", count: 0, pct: 0 },
    ]);
  });

  it("only applies the dashboard date range when ?applyRange=1", async () => {
    setSession({ userId: "admin-1", orgId: "org-1", role: "Administrator" });
    const { GET } = await import(ROUTE);

    await GET(req());
    expect(lastWhere().createdAt).toBeUndefined();

    await GET(req("?applyRange=1&from=2026-01-01&to=2026-01-31"));
    expect(lastWhere().createdAt).toBeDefined();
  });
});
