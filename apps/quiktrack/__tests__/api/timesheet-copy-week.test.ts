import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/timesheets/copy-previous-week/route";

const USER = "user_1";
const TENANT = "tenant_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
  // Pin "today" to Wednesday 2026-06-24 so the future-day cutoff is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const ROUTE_CTX = { params: {} } as never;

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/timesheets/copy-previous-week", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// Viewed week: Mon 2026-06-22 → Sun 2026-06-28. Previous week: 06-15 → 06-21.
const BODY = {
  weekStart: "2026-06-22T00:00:00.000Z",
  weekEnd: "2026-06-28T23:59:59.999Z",
  projectId: "proj_1",
};

describe("POST /api/timesheets/copy-previous-week", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq(BODY), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("copies weekday→weekday, skips future days and already-filled days", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    // Org owner → hasAdminAccess true → bypasses per-project Timesheet:create.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);

    const prev = [
      { projectId: "proj_1", issueId: "A", parentIssueId: null, entryDate: new Date("2026-06-15T00:00:00Z"), hours: 2, description: null }, // Mon
      { projectId: "proj_1", issueId: "A", parentIssueId: null, entryDate: new Date("2026-06-16T00:00:00Z"), hours: 1, description: null }, // Tue
      { projectId: "proj_1", issueId: "A", parentIssueId: null, entryDate: new Date("2026-06-17T00:00:00Z"), hours: 3, description: null }, // Wed
      { projectId: "proj_1", issueId: "A", parentIssueId: null, entryDate: new Date("2026-06-18T00:00:00Z"), hours: 1, description: null }, // Thu → future
    ];
    // This week already has Mon (06-22) for issue A → should be skipped (dedupe).
    const existing = [{ issueId: "A", entryDate: new Date("2026-06-22T00:00:00Z") }];

    mockDb.qtTimesheetEntry.findMany
      .mockResolvedValueOnce(prev as never) // previous-week entries
      .mockResolvedValueOnce(existing as never); // existing this-week entries
    mockDb.qtTimesheetEntry.create.mockResolvedValue({} as never);
    mockDb.qtTimesheetWeeklySummary.findFirst.mockResolvedValue(null);
    mockDb.qtTimesheetWeeklySummary.create.mockResolvedValue({} as never);

    const res = await POST(postReq(BODY), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Tue + Wed copied; Mon skipped (existing); Thu skipped (future).
    expect(json.data).toEqual({ created: 2, skippedFuture: 1, skippedExisting: 1 });
    expect(mockDb.qtTimesheetEntry.create).toHaveBeenCalledTimes(2);
  });

  it("returns created:0 when there's nothing in the previous week", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtTimesheetEntry.findMany.mockResolvedValueOnce([] as never);

    const res = await POST(postReq(BODY), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.created).toBe(0);
    expect(mockDb.qtTimesheetEntry.create).not.toHaveBeenCalled();
  });
});
