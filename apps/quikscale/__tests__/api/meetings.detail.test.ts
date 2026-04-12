import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import { GET, PUT, DELETE } from "@/app/api/meetings/[id]/route";

const USER = "ckactor00000000000000000001";
const USER_B = "ckactor00000000000000000002";
const TENANT = "tenant-meet-1";
const MEETING_ID = "ckmeet0000000000000000001";

function buildRequest(body?: unknown, method = "GET"): NextRequest {
  return new NextRequest("http://localhost/api/meetings/" + MEETING_ID, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
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

const fakeMeeting = {
  id: MEETING_ID,
  tenantId: TENANT,
  name: "Weekly sync",
  cadence: "weekly",
  scheduledAt: new Date("2026-04-15T14:00:00.000Z"),
  duration: 90,
  location: "Zoom",
  meetingLink: null,
  agenda: null,
  decisions: null,
  blockers: null,
  highlights: null,
  startedOnTime: false,
  endedOnTime: false,
  formatFollowed: false,
  followUpRate: null,
  completedAt: null,
  deletedAt: null,
  attendees: [{ userId: USER, attended: false, attendedAt: null, leftAt: null }],
  metrics: [],
  template: null,
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

/* ═══════════════════════════════════════════════
   GET /api/meetings/[id]
═══════════════════════════════════════════════ */

describe("GET /api/meetings/[id] — auth", () => {
  it("401 unauthenticated", async () => {
    const res = await GET(buildRequest(), { params: { id: MEETING_ID } });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/meetings/[id] — tenant scope", () => {
  beforeEach(asAdmin);

  it("404 when meeting not found (or in another tenant)", async () => {
    mockDb.meeting.findFirst.mockResolvedValue(null);
    const res = await GET(buildRequest(), { params: { id: MEETING_ID } });
    expect(res.status).toBe(404);

    // Tenant-scoped lookup
    expect(mockDb.meeting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MEETING_ID, tenantId: TENANT }),
      }),
    );
  });

  it("200 with attendee user data resolved", async () => {
    mockDb.meeting.findFirst.mockResolvedValue(fakeMeeting as any);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Alice", lastName: "Admin", email: "alice@co.com" },
    ] as any);

    const res = await GET(buildRequest(), { params: { id: MEETING_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MEETING_ID);
    expect(body.data.attendees[0].user).toEqual(
      expect.objectContaining({ id: USER, firstName: "Alice" }),
    );
  });

  it("skips the user fetch when there are no attendees", async () => {
    mockDb.meeting.findFirst.mockResolvedValue({
      ...fakeMeeting,
      attendees: [],
    } as any);

    const res = await GET(buildRequest(), { params: { id: MEETING_ID } });
    expect(res.status).toBe(200);
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════
   PUT /api/meetings/[id]
═══════════════════════════════════════════════ */

describe("PUT /api/meetings/[id] — auth + not found", () => {
  it("401 unauthenticated", async () => {
    const res = await PUT(buildRequest({ agenda: "new" }, "PUT"), {
      params: { id: MEETING_ID },
    });
    expect(res.status).toBe(401);
  });

  it("404 when meeting not in tenant", async () => {
    asAdmin();
    mockDb.meeting.findFirst.mockResolvedValue(null);
    const res = await PUT(buildRequest({ agenda: "new" }, "PUT"), {
      params: { id: MEETING_ID },
    });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/meetings/[id] — validation", () => {
  beforeEach(() => {
    asAdmin();
    mockDb.meeting.findFirst.mockResolvedValue({ id: MEETING_ID } as any);
  });

  it("400 for out-of-range followUpRate", async () => {
    const res = await PUT(
      buildRequest({ followUpRate: 2 }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    expect(res.status).toBe(400);
  });

  it("400 for non-ISO scheduledAt", async () => {
    const res = await PUT(
      buildRequest({ scheduledAt: "tomorrow" }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/meetings/[id] — updates + audit", () => {
  beforeEach(() => {
    asAdmin();
    mockDb.meeting.findFirst.mockResolvedValue({ id: MEETING_ID } as any);
    mockDb.meeting.update.mockResolvedValue({
      id: MEETING_ID,
      name: "Weekly sync",
      cadence: "weekly",
      scheduledAt: new Date(),
      duration: 90,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);
  });

  it("200 with partial update (decisions + highlights only)", async () => {
    const res = await PUT(
      buildRequest(
        { decisions: "Ship Friday", highlights: "Great sprint" },
        "PUT",
      ),
      { params: { id: MEETING_ID } },
    );
    expect(res.status).toBe(200);
    expect(mockDb.meeting.update).toHaveBeenCalledOnce();

    const updateArg = (mockDb.meeting.update as any).mock.calls[0][0];
    expect(updateArg.data.decisions).toBe("Ship Friday");
    expect(updateArg.data.highlights).toBe("Great sprint");
    // Untouched fields should NOT be in the update payload
    expect(updateArg.data.agenda).toBeUndefined();
    expect(updateArg.data.blockers).toBeUndefined();
  });

  it("writes an audit log with UPDATE + Meeting entity", async () => {
    await PUT(
      buildRequest({ formatFollowed: true }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("UPDATE");
    expect(auditArg.data.entityType).toBe("Meeting");
  });

  it("converts ISO scheduledAt to a Date instance", async () => {
    await PUT(
      buildRequest(
        { scheduledAt: "2026-04-15T14:00:00.000Z" },
        "PUT",
      ),
      { params: { id: MEETING_ID } },
    );
    const updateArg = (mockDb.meeting.update as any).mock.calls[0][0];
    expect(updateArg.data.scheduledAt).toBeInstanceOf(Date);
  });

  it("converts empty meetingLink string to null", async () => {
    await PUT(
      buildRequest({ meetingLink: "" }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    const updateArg = (mockDb.meeting.update as any).mock.calls[0][0];
    expect(updateArg.data.meetingLink).toBeNull();
  });
});

describe("PUT /api/meetings/[id] — attendee sync", () => {
  beforeEach(() => {
    asAdmin();
    mockDb.meeting.findFirst.mockResolvedValue({ id: MEETING_ID } as any);
    mockDb.meeting.update.mockResolvedValue({
      id: MEETING_ID,
      name: "x",
      cadence: "weekly",
      scheduledAt: new Date(),
      duration: 30,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);
  });

  it("400 if attendees contain non-members", async () => {
    mockDb.membership.count.mockResolvedValue(0);
    const res = await PUT(
      buildRequest({ attendeeIds: [USER] }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    expect(res.status).toBe(400);
  });

  it("does NOT run the transaction when attendeeIds is omitted", async () => {
    const res = await PUT(
      buildRequest({ agenda: "x" }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    expect(res.status).toBe(200);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("runs the replace-all transaction when attendeeIds is provided", async () => {
    mockDb.membership.count.mockResolvedValue(2);
    mockDb.$transaction.mockResolvedValue([] as any);

    const res = await PUT(
      buildRequest({ attendeeIds: [USER, USER_B] }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    expect(res.status).toBe(200);
    expect(mockDb.$transaction).toHaveBeenCalledOnce();
  });

  it("accepts an empty attendeeIds (replace with none)", async () => {
    mockDb.$transaction.mockResolvedValue([] as any);
    const res = await PUT(
      buildRequest({ attendeeIds: [] }, "PUT"),
      { params: { id: MEETING_ID } },
    );
    expect(res.status).toBe(200);
    // Membership count should NOT be called for an empty list
    expect(mockDb.membership.count).not.toHaveBeenCalled();
    expect(mockDb.$transaction).toHaveBeenCalledOnce();
  });
});

/* ═══════════════════════════════════════════════
   DELETE /api/meetings/[id]
═══════════════════════════════════════════════ */

describe("DELETE /api/meetings/[id]", () => {
  it("401 unauthenticated", async () => {
    const res = await DELETE(buildRequest(undefined, "DELETE"), {
      params: { id: MEETING_ID },
    });
    expect(res.status).toBe(401);
  });

  it("404 when meeting not in tenant", async () => {
    asAdmin();
    mockDb.meeting.findFirst.mockResolvedValue(null);
    const res = await DELETE(buildRequest(undefined, "DELETE"), {
      params: { id: MEETING_ID },
    });
    expect(res.status).toBe(404);
  });

  it("soft-deletes (sets deletedAt), does not hard-delete", async () => {
    asAdmin();
    mockDb.meeting.findFirst.mockResolvedValue({ id: MEETING_ID } as any);
    mockDb.meeting.update.mockResolvedValue({} as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await DELETE(buildRequest(undefined, "DELETE"), {
      params: { id: MEETING_ID },
    });
    expect(res.status).toBe(200);
    expect(mockDb.meeting.delete).not.toHaveBeenCalled();
    expect(mockDb.meeting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEETING_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it("writes an audit log with DELETE action", async () => {
    asAdmin();
    mockDb.meeting.findFirst.mockResolvedValue({ id: MEETING_ID } as any);
    mockDb.meeting.update.mockResolvedValue({} as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await DELETE(buildRequest(undefined, "DELETE"), {
      params: { id: MEETING_ID },
    });
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("DELETE");
    expect(auditArg.data.entityType).toBe("Meeting");
  });
});
