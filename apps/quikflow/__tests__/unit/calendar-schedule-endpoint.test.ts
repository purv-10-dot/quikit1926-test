import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/internal/calendar/schedule — the direct "Create Teams meetings" path
 * (QuikScale button/save → here → both meetings). We mock the facade and assert
 * the endpoint parses the daily + weekly windows and attendees into the spec.
 */
const scheduleClientMeetingsForOrg = vi.fn();
vi.mock("@/lib/connectors", () => ({
  scheduleClientMeetingsForOrg: (...a: unknown[]) => scheduleClientMeetingsForOrg(...a),
}));

import { POST } from "@/app/api/internal/calendar/schedule/route";

const SECRET = "s3cr3t";
function req(body: unknown, headers: Record<string, string> = { "x-internal-secret": SECRET }) {
  return new NextRequest(new URL("/api/internal/calendar/schedule", "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  } as ConstructorParameters<typeof NextRequest>[1]);
}

beforeEach(() => {
  process.env.INTERNAL_SECRET = SECRET;
  scheduleClientMeetingsForOrg.mockReset();
  scheduleClientMeetingsForOrg.mockResolvedValue({ connected: true, daily: { id: "d" }, weekly: { id: "w" } });
});

describe("POST /api/internal/calendar/schedule", () => {
  it("401 without the service secret", async () => {
    expect((await POST(req({ orgId: "o", refId: "c" }, {}))).status).toBe(401);
  });

  it("400 without orgId/refId", async () => {
    expect((await POST(req({ orgId: "o" }))).status).toBe(400);
  });

  it("parses both windows + attendees into the spec and returns the result", async () => {
    const body = {
      orgId: "org_A",
      refId: "client_1",
      name: "Acme",
      attendees: ["a@x.com", "b@x.com"],
      daily: { start: "10:00", end: "10:15", days: ["monday", "friday"], startDate: "2026-08-07", until: "2026-09-30" },
      weekly: { start: "15:00", end: "15:20", day: "friday", startDate: "2026-08-07", until: "2026-09-30" },
    };
    const res = await POST(req(body));
    expect((await res.json()).data).toMatchObject({ connected: true });

    const [orgId, spec] = scheduleClientMeetingsForOrg.mock.calls[0];
    expect(orgId).toBe("org_A");
    expect(spec.refType).toBe("clientMaster");
    expect(spec.name).toBe("Acme");
    expect(spec.attendees).toEqual(["a@x.com", "b@x.com"]);
    expect(spec.daily).toMatchObject({ start: "10:00", end: "10:15", days: ["monday", "friday"], startDate: "2026-08-07", until: "2026-09-30" });
    // weekly.day → days:[day]
    expect(spec.weekly).toMatchObject({ start: "15:00", end: "15:20", days: ["friday"], startDate: "2026-08-07", until: "2026-09-30" });
  });
});
