/**
 * Upwork Connects Sales Cost routes — authorization, org isolation, validation.
 *
 * Same contract as the other Sales Cost routes (see sales-cost-route.test.ts):
 * only admin / administrator / org_admin may read or write, because both
 * endpoints expose or change cost data. `isCrmAdminUser` runs for real.
 *
 * Org isolation is asserted by checking that the orgId reaching the service is
 * the SESSION's, never one supplied by the caller.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

// Only the two DB-touching functions are stubbed. `upworkConnectsConfigSchema`
// is re-exported from the real module via importActual, so the validation
// assertions below exercise the actual Zod rules rather than a stub of them.
vi.mock("@/lib/services/sales-cost/connects-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/sales-cost/connects-config")>();
  return {
    ...actual,
    getUpworkConnectsConfig: vi.fn(async () => ({
      packageConnects: 100,
      packagePriceUsd: 15,
      currency: "USD",
      usdToInr: 95,
    })),
    setUpworkConnectsConfig: vi.fn(async (_orgId: string, patch: unknown) => ({
      packageConnects: 100,
      packagePriceUsd: 15,
      currency: "USD",
      usdToInr: 95,
      ...(patch as object),
    })),
  };
});

vi.mock("@/lib/services/sales-cost/connects-usage", () => ({
  getConnectsUsage: vi.fn(async (orgId: string, userId: string) => ({
    period: "2026-08",
    userId,
    orgId,
    proposalCount: 2,
    baseConnects: 19,
    boostConnects: 10,
    totalConnectsUsed: 29,
    config: { packageConnects: 100, packagePriceUsd: 15, currency: "USD", usdToInr: 95 },
    costUsd: 4.35,
    costInr: 413.25,
  })),
}));

const CONFIG = "@/app/api/settings/sales-cost/connects-config/route";
const USAGE = "@/app/api/settings/sales-cost/connects-usage/route";

function req(url: string, method = "GET", body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const DENIED_ROLES = ["SalesManager", "SalesUser", "MarketingUser", "FinanceUser", "member"];

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
});

describe("GET /api/settings/sales-cost/connects-config", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(CONFIG);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it.each(DENIED_ROLES)("403 for %s", async (role) => {
    setSession({ userId: "u1", orgId: "org-1", role });
    const { GET } = await import(CONFIG);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the configured pricing for an admin", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { GET } = await import(CONFIG);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.packageConnects).toBe(100);
    expect(json.data.packagePriceUsd).toBe(15);
  });
});

describe("GET /api/settings/sales-cost/connects-usage", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(USAGE);
    const res = await GET(req("http://test/api/settings/sales-cost/connects-usage"));
    expect(res.status).toBe(401);
  });

  it.each(DENIED_ROLES)("403 for %s", async (role) => {
    setSession({ userId: "u1", orgId: "org-1", role });
    const { GET } = await import(USAGE);
    const res = await GET(
      req("http://test/api/settings/sales-cost/connects-usage?userId=rep-1&period=2026-08"),
    );
    expect(res.status).toBe(403);
  });

  it("400 when userId is missing", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { GET } = await import(USAGE);
    const res = await GET(
      req("http://test/api/settings/sales-cost/connects-usage?period=2026-08"),
    );
    expect(res.status).toBe(400);
  });

  it("400 on a malformed period rather than defaulting to a month", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { GET } = await import(USAGE);
    const res = await GET(
      req("http://test/api/settings/sales-cost/connects-usage?userId=rep-1&period=August"),
    );
    expect(res.status).toBe(400);
  });

  it("returns base + boost as the total, and scopes to the session org", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { getConnectsUsage } = await import(
      "@/lib/services/sales-cost/connects-usage"
    );
    const { GET } = await import(USAGE);
    const res = await GET(
      req("http://test/api/settings/sales-cost/connects-usage?userId=rep-1&period=2026-08"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // 19 base + 10 boost = 29, priced at the configured rate.
    expect(json.data.totalConnectsUsed).toBe(29);
    expect(json.data.costInr).toBe(413.25);
    // Org comes from the session, never the query string.
    expect(getConnectsUsage).toHaveBeenCalledWith(
      "org-1",
      "rep-1",
      expect.objectContaining({ key: "2026-08" }),
    );
  });
});

describe("PATCH /api/settings/sales-cost/connects-config", () => {
  it("401 when unauthenticated", async () => {
    const { PATCH } = await import(CONFIG);
    const res = await PATCH(
      req("http://test/api/settings/sales-cost/connects-config", "PATCH", {
        packagePriceUsd: 20,
      }),
    );
    expect(res.status).toBe(401);
  });

  it.each(DENIED_ROLES)("403 for %s and nothing is written", async (role) => {
    setSession({ userId: "u1", orgId: "org-1", role });
    const { setUpworkConnectsConfig } = await import(
      "@/lib/services/sales-cost/connects-config"
    );
    const { PATCH } = await import(CONFIG);
    const res = await PATCH(
      req("http://test/api/settings/sales-cost/connects-config", "PATCH", {
        packagePriceUsd: 20,
      }),
    );
    expect(res.status).toBe(403);
    expect(setUpworkConnectsConfig).not.toHaveBeenCalled();
  });

  it("persists a changed package price against the session org", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { setUpworkConnectsConfig } = await import(
      "@/lib/services/sales-cost/connects-config"
    );
    const { PATCH } = await import(CONFIG);
    const res = await PATCH(
      req("http://test/api/settings/sales-cost/connects-config", "PATCH", {
        packagePriceUsd: 20,
      }),
    );
    expect(res.status).toBe(200);
    expect(setUpworkConnectsConfig).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ packagePriceUsd: 20 }),
    );
  });

  it("rejects a zero package size — it is a divisor", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { setUpworkConnectsConfig } = await import(
      "@/lib/services/sales-cost/connects-config"
    );
    const { PATCH } = await import(CONFIG);
    const res = await PATCH(
      req("http://test/api/settings/sales-cost/connects-config", "PATCH", {
        packageConnects: 0,
      }),
    );
    expect(res.status).toBe(400);
    expect(setUpworkConnectsConfig).not.toHaveBeenCalled();
  });

  it("rejects a non-positive conversion rate", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { PATCH } = await import(CONFIG);
    const res = await PATCH(
      req("http://test/api/settings/sales-cost/connects-config", "PATCH", {
        usdToInr: 0,
      }),
    );
    expect(res.status).toBe(400);
  });
});
