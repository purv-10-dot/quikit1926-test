import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/daily-huddle/route";

const USER = "user-001";
const TENANT = "tenant-001";

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/daily-huddle${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/daily-huddle", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asUser() {
  setSession({ id: USER, tenantId: TENANT, role: "member" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1", userId: USER, tenantId: TENANT, role: "member", status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/daily-huddle — auth
// ═══════════════════════════════════════════════

describe("GET /api/daily-huddle — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════
// GET /api/daily-huddle — happy path
// ═══════════════════════════════════════════════

describe("GET /api/daily-huddle — happy path", () => {
  beforeEach(asUser);

  it("returns paginated huddles", async () => {
    const mockItem = {
      id: "h1",
      tenantId: TENANT,
      meetingDate: new Date("2026-04-10"),
      callStatus: "completed",
      clientName: "Client A",
      absentMembers: null,
      actualStartTime: "09:00",
      actualEndTime: "09:15",
      yesterdaysAchievements: true,
      stuckIssues: false,
      todaysPriority: true,
      notesKPDashboard: null,
      otherNotes: null,
      createdAt: new Date("2026-04-10"),
      updatedAt: new Date("2026-04-10"),
    };

    mockDb.dailyHuddle.findMany.mockResolvedValue([mockItem] as any);
    mockDb.dailyHuddle.count.mockResolvedValue(1);

    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════
// POST /api/daily-huddle — validation
// ═══════════════════════════════════════════════

describe("POST /api/daily-huddle — validation", () => {
  beforeEach(asUser);

  it("returns 400 when meetingDate missing", async () => {
    const res = await POST(buildPOST({ callStatus: "completed" }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/daily-huddle — happy path
// ═══════════════════════════════════════════════

describe("POST /api/daily-huddle — happy path", () => {
  beforeEach(asUser);

  it("creates a huddle record", async () => {
    const mockCreated = {
      id: "h-new",
      tenantId: TENANT,
      meetingDate: new Date("2026-04-12"),
      callStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.dailyHuddle.create.mockResolvedValue(mockCreated as any);

    const res = await POST(buildPOST({
      meetingDate: "2026-04-12",
      callStatus: "completed",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
