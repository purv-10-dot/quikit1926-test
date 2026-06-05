import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/habits/[id]/export/route";
import { HABIT_KEYS } from "@/lib/schemas/habitSchema";

/**
 * Route guards + happy path for GET /api/habits/[id]/export.
 *
 *   unauth → 401 · non-admin → 403 · legacy → 400 · missing → 404 ·
 *   admin happy path → 200 xlsx attachment with BOTH worksheets.
 *
 * Auth chain mirrors the other quikscale route tests (talentBenchmark): the
 * export uses `withOrgAuth({moduleKey:"habits"})` + an `isOrgAdmin` guard, so
 * a system-admin needs a matching `userAppRole`.
 */

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-habits-1";
const params = { params: { id: "camp1" } };

function buildGET(): NextRequest {
  return new NextRequest("http://localhost/api/habits/camp1/export", { method: "GET" });
}

function seedAuth(opts: { role: string; admin: boolean }) {
  setSession({ id: USER, orgId: TENANT, role: opts.role as never } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: opts.role,
    status: "active",
  } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app1", slug: "quikscale" } as never);
  mockDb.userAppAccess.findUnique.mockResolvedValue({ id: "access1" } as never);
  // isOrgAdmin → userAppRole.findFirst hit only when admin.
  mockDb.userAppRole.findFirst.mockResolvedValue(opts.admin ? ({ id: "uar1" } as never) : null);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/habits/[id]/export — guards", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin member", async () => {
    seedAuth({ role: "member", admin: false });
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the campaign does not exist (or is cross-tenant)", async () => {
    seedAuth({ role: "admin", admin: true });
    mockDb.habitAssessment.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a legacy single-user assessment", async () => {
    seedAuth({ role: "admin", admin: true });
    mockDb.habitAssessment.findFirst.mockResolvedValue({
      id: "camp1",
      orgId: TENANT,
      quarter: "Q1",
      year: 2026,
      isLegacy: true,
    } as never);
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/legacy/i);
  });
});

describe("GET /api/habits/[id]/export — happy path", () => {
  beforeEach(() => {
    seedAuth({ role: "admin", admin: true });
    mockDb.habitAssessment.findFirst.mockResolvedValue({
      id: "camp1",
      orgId: TENANT,
      quarter: "Q1",
      year: 2026,
      isLegacy: false,
    } as never);
    mockDb.habitAssessment.findMany.mockResolvedValue([] as never); // no sibling rounds
    // Same array satisfies both the aggregate (subItemBits) and the
    // participation (respondentUserId / submittedAt) queries.
    mockDb.habitAssessmentResponse.findMany.mockResolvedValue([
      {
        subItemBits: Object.fromEntries(HABIT_KEYS.map((k) => [k, [true, false, false, false]])),
        respondentUserId: USER,
        submittedAt: new Date("2026-06-05T10:00:00.000Z"),
      },
    ] as never);
    mockDb.orgMember.findMany.mockResolvedValue([
      { role: "member", user: { id: USER, firstName: "Alok", lastName: "Shukla", email: "alok@x.com" } },
      { role: "member", user: { id: "u2", firstName: null, lastName: null, email: "b@x.com" } },
    ] as never);
  });

  it("streams an xlsx attachment with the right headers", async () => {
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toContain("Rockefeller_Habits_Q1_2026.xlsx");
  });

  it("produces a workbook with both the Checklist and Participation sheets", async () => {
    const res = await GET(buildGET(), params);
    const buf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Habits Checklist", "Participation"]);

    // Participation reflects the roster: 2 members, 1 submitted (USER), 1 pending.
    const part = wb.getWorksheet("Participation")!;
    expect(part.getRow(5).getCell(1).value).toBe("Alok Shukla");
    expect(part.getRow(5).getCell(4).value).toBe("Submitted");
    expect(part.getRow(6).getCell(4).value).toBe("Pending");
  });
});
