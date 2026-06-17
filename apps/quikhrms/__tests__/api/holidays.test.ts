import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Coverage for GET /api/v1/hrms/holidays after consolidating the
 * HolidayCalendar + Holiday tables into the single flat CompanyHoliday model.
 * The endpoint must read ONLY companyHoliday (no calendar/Holiday merge) and
 * expose `isFloater` as an alias of `isOptional` for the view.
 */

const companyHolidayFindMany = vi.fn();
const companyHolidayCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyHoliday: {
      findMany: (...a: unknown[]) => companyHolidayFindMany(...a),
      count: (...a: unknown[]) => companyHolidayCount(...a),
    },
    // Guard: any access to the dropped models should blow up loudly.
    holiday: undefined,
    holidayCalendar: undefined,
  },
}));
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, params: unknown) => Promise<unknown>) =>
    async (req: unknown, context?: { params?: Promise<unknown> }) =>
      handler(
        req,
        { orgId: "tenant-1", userId: "emp-1", roles: ["admin"], permissions: ["*"], roleCode: "admin", mustChangePassword: false },
        context?.params ? await context.params : {},
      ),
}));

type RouteResponse = { status: number; json: () => Promise<{ success: boolean; data: unknown[] }> };
type GetFn = (req: unknown) => Promise<RouteResponse>;

async function loadGet(): Promise<GetFn> {
  const mod = await import("@/app/api/v1/hrms/holidays/route");
  return mod.GET as unknown as GetFn;
}

function makeReq(url: string) {
  return { url, method: "GET", nextUrl: new URL(url) };
}

describe("GET /holidays — CompanyHoliday-only after merge", () => {
  beforeEach(() => {
    companyHolidayCount.mockResolvedValue(2);
    companyHolidayFindMany.mockResolvedValue([
      { id: "h1", name: "Diwali", date: new Date("2026-11-08"), type: "National", isOptional: false, description: null },
      { id: "h2", name: "Floater Day", date: new Date("2026-12-24"), type: "Optional", isOptional: true, description: "pick one" },
    ]);
  });

  it("returns companyHoliday rows with isFloater aliased to isOptional", async () => {
    const GET = await loadGet();
    const res = await GET(makeReq("http://localhost:3009/api/v1/hrms/holidays?year=2026&limit=200"));
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(companyHolidayFindMany).toHaveBeenCalledTimes(1);
    // NextResponse.json serialises Date -> ISO string on the way out.
    expect(data).toEqual([
      { id: "h1", name: "Diwali", date: expect.any(String), type: "National", isOptional: false, isFloater: false, description: null },
      { id: "h2", name: "Floater Day", date: expect.any(String), type: "Optional", isOptional: true, isFloater: true, description: "pick one" },
    ]);
  });

  it("filters by year when provided", async () => {
    const GET = await loadGet();
    await GET(makeReq("http://localhost:3009/api/v1/hrms/holidays?year=2026"));

    const whereArg = (companyHolidayFindMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(whereArg).toMatchObject({ orgId: "tenant-1", deletedAt: null, year: 2026 });
  });
});
