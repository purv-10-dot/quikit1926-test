/**
 * GET /api/dashboard/metrics — filter plumbing.
 *
 * ROOT CAUSE this pins: the route used to be `GET(_req)` and called
 * buildRoleMetrics(user) with NO range and NO ownerId, so every KPI card showed
 * all-time data and "Total Leads" read the same on Today / 7d / 30d.
 *
 * The route must now:
 *   - parse from/to via the shared parseFilters (IST-clamped, X-Client-TZ)
 *   - parse ownerId (with `me` resolved)
 *   - pass windowAllMetrics: true so EVERY metric windows (dashboard mode),
 *     while the daily digest keeps the default partial-windowing contract
 *   - keep the 401 + assertModule guards intact
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

const buildRoleMetrics = vi.fn();
const requireApiUser = vi.fn();
const assertModule = vi.fn();

vi.mock("@/lib/services/dashboard/role-metrics", () => ({ buildRoleMetrics }));
vi.mock("@/lib/auth/require", () => ({
  requireApiUser: () => requireApiUser(),
  isResponse: (v: unknown) => v instanceof Response,
  errorResponse: (e: unknown) =>
    Response.json({ success: false, error: String(e) }, { status: 500 }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  assertModule: (...a: unknown[]) => assertModule(...a),
}));

const USER = { userId: "u1", orgId: "t1", role: "Administrator" };

async function callGet(url: string) {
  const { GET } = await import("@/app/api/dashboard/metrics/route");
  const req = new Request(url, { headers: { "X-Client-TZ": "Asia/Kolkata" } });
  return GET(req as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireApiUser.mockResolvedValue(USER);
  assertModule.mockResolvedValue(undefined);
  buildRoleMetrics.mockResolvedValue({ role: "Administrator", metrics: {} });
});

describe("GET /api/dashboard/metrics — date + owner filters reach the query", () => {
  it("forwards the parsed range to buildRoleMetrics", async () => {
    await callGet("http://x/api/dashboard/metrics?from=2026-08-01&to=2026-08-17");
    expect(buildRoleMetrics).toHaveBeenCalledTimes(1);
    const [, range] = buildRoleMetrics.mock.calls[0];
    expect(range).toBeDefined();
    expect(range.from).toBeInstanceOf(Date);
    expect(range.to).toBeInstanceOf(Date);
    // 2026-08-01 00:00 IST === 2026-07-31T18:30Z
    expect(range.from.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("requests FULL windowing (windowAllMetrics) — the dashboard contract", async () => {
    await callGet("http://x/api/dashboard/metrics?from=2026-08-01&to=2026-08-17");
    const [, , opts] = buildRoleMetrics.mock.calls[0];
    expect(opts?.windowAllMetrics).toBe(true);
  });

  it("forwards ownerId", async () => {
    await callGet("http://x/api/dashboard/metrics?from=2026-08-01&to=2026-08-17&ownerId=rep-7");
    const [, , opts] = buildRoleMetrics.mock.calls[0];
    expect(opts?.ownerId).toBe("rep-7");
  });

  it("resolves ownerId=me to the caller", async () => {
    await callGet("http://x/api/dashboard/metrics?ownerId=me");
    const [, , opts] = buildRoleMetrics.mock.calls[0];
    expect(opts?.ownerId).toBe("u1");
  });

  it("ownerId=all → no owner narrowing", async () => {
    await callGet("http://x/api/dashboard/metrics?ownerId=all");
    const [, , opts] = buildRoleMetrics.mock.calls[0];
    expect(opts?.ownerId).toBeNull();
  });

  it("a DIFFERENT range produces a different window (the original bug)", async () => {
    await callGet("http://x/api/dashboard/metrics?from=2026-08-17&to=2026-08-17");
    const todayFrom = buildRoleMetrics.mock.calls[0][1].from.getTime();
    vi.clearAllMocks();
    buildRoleMetrics.mockResolvedValue({ role: "Administrator", metrics: {} });
    await callGet("http://x/api/dashboard/metrics?from=2026-07-19&to=2026-08-17");
    const monthFrom = buildRoleMetrics.mock.calls[0][1].from.getTime();
    expect(todayFrom).not.toBe(monthFrom);
  });

  it("still enforces the dashboard:view permission", async () => {
    await callGet("http://x/api/dashboard/metrics");
    expect(assertModule).toHaveBeenCalledWith(USER, "dashboard", "view");
  });

  it("unauthenticated → the guard's response is returned untouched", async () => {
    requireApiUser.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await callGet("http://x/api/dashboard/metrics");
    expect(res.status).toBe(401);
    expect(buildRoleMetrics).not.toHaveBeenCalled();
  });
});
