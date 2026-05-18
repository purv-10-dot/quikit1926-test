import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/priority/[id]/summary/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-prio-1";
const OTHER_TENANT = "tenant-prio-other";
const PRIORITY_ID = "ckprio0000000000000000000001";

function buildRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/priority/${PRIORITY_ID}/summary`, {
    method: "GET",
  });
}

function asAuthedAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

function makePriorityFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PRIORITY_ID,
    orgId: TENANT,
    name: "Launch new pricing page",
    overallStatus: "on-track",
    quarter: "Q1",
    year: 2026,
    startWeek: 1,
    endWeek: 12,
    notes: "Cross-team initiative; design review next week.",
    owner_user: { id: USER, firstName: "Test", lastName: "User" },
    weeklyStatuses: [
      { id: "ws8", priorityId: PRIORITY_ID, weekNumber: 8, status: "on-track", notes: null },
      { id: "ws7", priorityId: PRIORITY_ID, weekNumber: 7, status: "on-track", notes: null },
      { id: "ws6", priorityId: PRIORITY_ID, weekNumber: 6, status: "behind", notes: "blocker" },
      { id: "ws5", priorityId: PRIORITY_ID, weekNumber: 5, status: "on-track", notes: null },
      { id: "ws4", priorityId: PRIORITY_ID, weekNumber: 4, status: "on-track", notes: null },
      { id: "ws3", priorityId: PRIORITY_ID, weekNumber: 3, status: "on-track", notes: null },
      { id: "ws2", priorityId: PRIORITY_ID, weekNumber: 2, status: "on-track", notes: null },
      { id: "ws1", priorityId: PRIORITY_ID, weekNumber: 1, status: "on-track", notes: null },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/priority/[id]/summary — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest(), { params: { id: PRIORITY_ID } } as any);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/priority/[id]/summary — tenant isolation", () => {
  beforeEach(asAuthedAdmin);

  it("returns 403 when Priority belongs to a different org", async () => {
    mockDb.priority.findFirst.mockResolvedValue(
      makePriorityFixture({ orgId: OTHER_TENANT }) as any,
    );
    const res = await GET(buildRequest(), { params: { id: PRIORITY_ID } } as any);
    expect(res.status).toBe(403);
  });

  it("does not request email on the owner_user select (PII guard)", async () => {
    mockDb.priority.findFirst.mockResolvedValue(makePriorityFixture() as any);
    await GET(buildRequest(), { params: { id: PRIORITY_ID } } as any);
    const call = mockDb.priority.findFirst.mock.calls[0]?.[0] as any;
    const ownerSelect = call.select.owner_user.select;
    expect(ownerSelect.email).toBeUndefined();
    expect(ownerSelect.firstName).toBe(true);
    expect(ownerSelect.lastName).toBe(true);
  });
});

describe("GET /api/priority/[id]/summary — happy path", () => {
  beforeEach(asAuthedAdmin);

  it("returns the compact Priority projection — status renamed from overallStatus, owner nested, url + weeklyStatuses", async () => {
    mockDb.priority.findFirst.mockResolvedValue(makePriorityFixture() as any);

    const res = await GET(buildRequest(), { params: { id: PRIORITY_ID } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.id).toBe(PRIORITY_ID);
    expect(data.name).toBe("Launch new pricing page");
    // overallStatus column → response field "status"
    expect(data.status).toBe("on-track");
    expect(data.overallStatus).toBeUndefined();
    expect(data.quarter).toBe("Q1");
    expect(data.year).toBe(2026);
    expect(data.startWeek).toBe(1);
    expect(data.endWeek).toBe(12);
    expect(data.weeklyStatuses).toHaveLength(8);
    // Note: ordering of weeklyStatuses is whatever Prisma returned (we mock
    // them in descending weekNumber order to mirror the route's `orderBy`).
    expect(data.weeklyStatuses[0].weekNumber).toBe(8);
    expect(data.owner_user).toEqual({ id: USER, firstName: "Test", lastName: "User" });
    expect(data.url).toBe(`/quikscale/priority/${PRIORITY_ID}`);

    // No email leakage in the response.
    expect(JSON.stringify(body).toLowerCase()).not.toContain("email");
  });

  it("returns 404 when Priority not found", async () => {
    mockDb.priority.findFirst.mockResolvedValue(null);
    const res = await GET(buildRequest(), { params: { id: PRIORITY_ID } } as any);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/priority/[id]/summary — notes truncation", () => {
  beforeEach(asAuthedAdmin);

  it("renames notes column to lastNotes and truncates to 300 chars", async () => {
    const longNotes = "p".repeat(500);
    mockDb.priority.findFirst.mockResolvedValue(
      makePriorityFixture({ notes: longNotes }) as any,
    );

    const res = await GET(buildRequest(), { params: { id: PRIORITY_ID } } as any);
    const body = await res.json();
    expect(body.data.lastNotes).toHaveLength(300);
    expect(body.data.lastNotes).toBe("p".repeat(300));
    // Original column name does not leak into response.
    expect(body.data.notes).toBeUndefined();
  });
});
