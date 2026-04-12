import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { _resetDefaultStore } from "@/lib/api/rateLimit";

import { POST } from "@/app/api/meetings/route";

const USER = "ckactor00000000000000000001";
const OTHER_USER = "ckactor00000000000000000002";
const TENANT = "tenant-meet-1";
const TEMPLATE_ID = "cktmpl0000000000000000000a";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/meetings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
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

const baseBody = {
  name: "Weekly leadership sync",
  cadence: "weekly" as const,
  scheduledAt: "2026-04-15T14:00:00.000Z",
  duration: 90,
  attendeeIds: [] as string[],
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
  _resetDefaultStore();
});

describe("POST /api/meetings — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildRequest(baseBody), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when membership missing", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildRequest(baseBody), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/meetings — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when name is missing", async () => {
    const res = await POST(
      buildRequest({ ...baseBody, name: "" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when scheduledAt is not ISO", async () => {
    const res = await POST(
      buildRequest({ ...baseBody, scheduledAt: "soon" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when cadence is invalid", async () => {
    const res = await POST(
      buildRequest({ ...baseBody, cadence: "biweekly" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when duration is zero", async () => {
    const res = await POST(
      buildRequest({ ...baseBody, duration: 0 }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/meetings — template validation", () => {
  beforeEach(asAdmin);

  it("returns 404 when templateId belongs to another tenant", async () => {
    mockDb.meetingTemplate.findFirst.mockResolvedValue(null);

    const res = await POST(
      buildRequest({ ...baseBody, templateId: TEMPLATE_ID }),
      { params: {} as any },
    );
    expect(res.status).toBe(404);

    // Verify the lookup was tenant-scoped
    expect(mockDb.meetingTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: TEMPLATE_ID,
          tenantId: TENANT,
        }),
      }),
    );
  });

  it("accepts a valid templateId from the same tenant", async () => {
    mockDb.meetingTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID } as any);
    mockDb.meeting.create.mockResolvedValue({
      id: "ckm1",
      name: baseBody.name,
      cadence: baseBody.cadence,
      scheduledAt: new Date(baseBody.scheduledAt),
      duration: baseBody.duration,
    } as any);

    const res = await POST(
      buildRequest({ ...baseBody, templateId: TEMPLATE_ID }),
      { params: {} as any },
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /api/meetings — attendee validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when attendees contain non-members", async () => {
    mockDb.membership.count.mockResolvedValue(1); // only 1 of 2 valid

    const res = await POST(
      buildRequest({ ...baseBody, attendeeIds: [USER, OTHER_USER] }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });

  it("accepts attendees that are all active members", async () => {
    mockDb.membership.count.mockResolvedValue(2);
    mockDb.meeting.create.mockResolvedValue({
      id: "ckm-new",
      name: baseBody.name,
      cadence: baseBody.cadence,
      scheduledAt: new Date(baseBody.scheduledAt),
      duration: baseBody.duration,
    } as any);

    const res = await POST(
      buildRequest({ ...baseBody, attendeeIds: [USER, OTHER_USER] }),
      { params: {} as any },
    );
    expect(res.status).toBe(201);

    // Attendees get passed through to create()
    const createArg = (mockDb.meeting.create as any).mock.calls[0][0];
    expect(createArg.data.attendees.create).toHaveLength(2);
  });

  it("scopes the membership count to the current tenant", async () => {
    mockDb.membership.count.mockResolvedValue(1);
    await POST(
      buildRequest({ ...baseBody, attendeeIds: [USER] }),
      { params: {} as any },
    );
    expect(mockDb.membership.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, status: "active" }),
      }),
    );
  });
});

describe("POST /api/meetings — happy path + audit", () => {
  beforeEach(asAdmin);

  it("creates the meeting, returns 201, and writes an audit log", async () => {
    mockDb.meeting.create.mockResolvedValue({
      id: "ckm-created",
      name: "Weekly leadership sync",
      cadence: "weekly",
      scheduledAt: new Date("2026-04-15T14:00:00.000Z"),
      duration: 90,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest(baseBody), { params: {} as any });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("ckm-created");

    expect(mockDb.meeting.create).toHaveBeenCalledOnce();
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.entityType).toBe("Meeting");
    expect(auditArg.data.entityId).toBe("ckm-created");
  });

  it("persists meetingLink=null when empty string is passed", async () => {
    mockDb.meeting.create.mockResolvedValue({
      id: "ckm1",
      name: baseBody.name,
      cadence: "weekly",
      scheduledAt: new Date(baseBody.scheduledAt),
      duration: 90,
    } as any);

    await POST(
      buildRequest({ ...baseBody, meetingLink: "" }),
      { params: {} as any },
    );

    const createArg = (mockDb.meeting.create as any).mock.calls[0][0];
    expect(createArg.data.meetingLink).toBeNull();
  });
});

describe("POST /api/meetings — rate limiting", () => {
  beforeEach(asAdmin);

  it("enforces per-(tenant,user) rate limit after bursts", async () => {
    mockDb.meeting.create.mockResolvedValue({
      id: "ckm",
      name: "x",
      cadence: "weekly",
      scheduledAt: new Date(),
      duration: 30,
    } as any);

    // LIMITS.mutation is 60 per 60s — burst exactly to the cap, then one more
    const limit = 60;
    for (let i = 0; i < limit; i++) {
      const r = await POST(buildRequest(baseBody), { params: {} as any });
      expect([201, 429]).toContain(r.status);
    }
    // The (limit+1)-th call MUST be 429
    const r = await POST(buildRequest(baseBody), { params: {} as any });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).not.toBeNull();
  });
});
