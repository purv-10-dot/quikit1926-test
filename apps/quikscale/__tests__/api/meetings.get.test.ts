import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import { GET } from "@/app/api/meetings/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-meet-1";

function req(url = "http://localhost/api/meetings"): NextRequest {
  return new NextRequest(url);
}

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/meetings — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(req(), { params: {} as any });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/meetings — query validation", () => {
  beforeEach(asAdmin);

  it("returns 400 for an invalid cadence", async () => {
    mockDb.meeting.count.mockResolvedValue(0);
    mockDb.meeting.findMany.mockResolvedValue([]);
    const res = await GET(
      req("http://localhost/api/meetings?cadence=biweekly"),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid datetime in `from`", async () => {
    const res = await GET(
      req("http://localhost/api/meetings?from=tomorrow"),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/meetings — tenant isolation", () => {
  beforeEach(asAdmin);

  it("passes tenantId in the where clause", async () => {
    mockDb.meeting.count.mockResolvedValue(0);
    mockDb.meeting.findMany.mockResolvedValue([]);

    const res = await GET(req(), { params: {} as any });
    expect(res.status).toBe(200);

    // Verify count was called with tenantId filter
    expect(mockDb.meeting.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
    expect(mockDb.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });

  it("queries meetings scoped to tenant (soft delete handled by middleware)", async () => {
    mockDb.meeting.count.mockResolvedValue(0);
    mockDb.meeting.findMany.mockResolvedValue([]);

    await GET(req(), { params: {} as any });

    const callArg = (mockDb.meeting.findMany as any).mock.calls[0][0];
    expect(callArg.where.tenantId).toBe(TENANT);
    // deletedAt filtering is handled by the Prisma soft-delete middleware
  });
});

describe("GET /api/meetings — filtering", () => {
  beforeEach(asAdmin);

  it("applies cadence filter when provided", async () => {
    mockDb.meeting.count.mockResolvedValue(0);
    mockDb.meeting.findMany.mockResolvedValue([]);

    await GET(
      req("http://localhost/api/meetings?cadence=weekly"),
      { params: {} as any },
    );

    const callArg = (mockDb.meeting.findMany as any).mock.calls[0][0];
    expect(callArg.where.cadence).toBe("weekly");
  });

  it("applies from/to datetime bounds", async () => {
    mockDb.meeting.count.mockResolvedValue(0);
    mockDb.meeting.findMany.mockResolvedValue([]);

    await GET(
      req(
        "http://localhost/api/meetings?from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z",
      ),
      { params: {} as any },
    );

    const callArg = (mockDb.meeting.findMany as any).mock.calls[0][0];
    expect(callArg.where.scheduledAt).toEqual({
      gte: new Date("2026-04-01T00:00:00.000Z"),
      lte: new Date("2026-04-30T23:59:59.000Z"),
    });
  });
});

describe("GET /api/meetings — pagination", () => {
  beforeEach(asAdmin);

  it("defaults to page 1, pageSize 20", async () => {
    mockDb.meeting.count.mockResolvedValue(100);
    mockDb.meeting.findMany.mockResolvedValue([]);

    const res = await GET(req(), { params: {} as any });
    const body = await res.json();

    expect(body.meta.page).toBe(1);
    expect(body.meta.pageSize).toBe(20);
    expect(body.meta.total).toBe(100);
    expect(body.meta.totalPages).toBe(5);

    const callArg = (mockDb.meeting.findMany as any).mock.calls[0][0];
    expect(callArg.skip).toBe(0);
    expect(callArg.take).toBe(20);
  });

  it("respects custom page and pageSize", async () => {
    mockDb.meeting.count.mockResolvedValue(100);
    mockDb.meeting.findMany.mockResolvedValue([]);

    await GET(
      req("http://localhost/api/meetings?page=3&pageSize=10"),
      { params: {} as any },
    );

    const callArg = (mockDb.meeting.findMany as any).mock.calls[0][0];
    expect(callArg.skip).toBe(20); // (3-1) * 10
    expect(callArg.take).toBe(10);
  });
});

describe("GET /api/meetings — response shape", () => {
  beforeEach(asAdmin);

  it("returns success envelope with data + meta", async () => {
    const meetings = [
      {
        id: "ckm1",
        name: "Weekly sync",
        cadence: "weekly",
        scheduledAt: new Date("2026-04-15T14:00:00.000Z"),
        duration: 90,
        location: "Zoom",
        meetingLink: null,
        startedOnTime: false,
        endedOnTime: false,
        formatFollowed: false,
        followUpRate: null,
        completedAt: null,
        createdAt: new Date(),
        attendees: [{ userId: "ckuser0001", attended: false }],
      },
    ];
    mockDb.meeting.count.mockResolvedValue(1);
    mockDb.meeting.findMany.mockResolvedValue(meetings as any);

    const res = await GET(req(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Weekly sync");
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("orders by scheduledAt desc", async () => {
    mockDb.meeting.count.mockResolvedValue(0);
    mockDb.meeting.findMany.mockResolvedValue([]);

    await GET(req(), { params: {} as any });

    const callArg = (mockDb.meeting.findMany as any).mock.calls[0][0];
    expect(callArg.orderBy).toEqual({ scheduledAt: "desc" });
  });
});
