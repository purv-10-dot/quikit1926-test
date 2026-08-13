import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * calendar.event.create executor — recurrence resolution + auto-fill from the
 * Client Master payload. Mocks the connector facade and asserts the
 * CalendarEventInput handed to it (times/attendees/recurrence) and the link.
 */
const createCalendarEventForOrg = vi.fn();
const deleteCalendarEventsForOrg = vi.fn();
const sendMailForOrg = vi.fn();
vi.mock("@/lib/connectors", () => ({
  createCalendarEventForOrg: (...a: unknown[]) => createCalendarEventForOrg(...a),
  deleteCalendarEventsForOrg: (...a: unknown[]) => deleteCalendarEventsForOrg(...a),
  sendMailForOrg: (...a: unknown[]) => sendMailForOrg(...a),
}));

import { getActionExecutor } from "@/lib/engine/actions";
import type { ActionContext } from "@/lib/engine/types";

function ctx(params: Record<string, unknown>, data: Record<string, unknown> = { recordId: "client_1" }): ActionContext {
  return {
    orgId: "org_A",
    workflowId: "wf1",
    runId: "run1",
    event: { app: "quikscale", event: "clientMaster.created", orgId: "org_A", dedupeKey: "k", data },
    node: { id: "a1", kind: "action", label: "Cal", config: { actionId: "calendar.event.create" } },
    params,
  } as ActionContext;
}
const run = (params: Record<string, unknown>, data?: Record<string, unknown>) =>
  getActionExecutor("calendar.event.create")(ctx(params, data));

beforeEach(() => {
  createCalendarEventForOrg.mockReset();
  createCalendarEventForOrg.mockResolvedValue({ id: "evt_1", webLink: null, joinUrl: null, organizer: "me@org.com", updated: false });
});

describe("calendar.event.create — explicit params", () => {
  it("weekly on a single day, bounded by an until date", async () => {
    const res = await run({
      subject: "Weekly Meeting — Acme",
      start_time: "11:00",
      end_time: "12:00",
      date: "2026-07-29",
      recurrence: "weekly",
      recurrence_days: "wednesday",
      recurrence_until: "2027-01-20",
      kind: "weekly",
    });
    expect(res.status).toBe("ok");
    const [orgId, event, opts] = createCalendarEventForOrg.mock.calls[0];
    expect(orgId).toBe("org_A");
    expect(event.start).toBe("2026-07-29T11:00:00");
    expect(event.end).toBe("2026-07-29T12:00:00");
    expect(event.recurrence).toMatchObject({
      pattern: "weekly",
      daysOfWeek: ["wednesday"],
      startDate: "2026-07-29",
      endDate: "2027-01-20",
    });
    expect(opts.link).toEqual({ refType: "clientMaster", refId: "client_1", kind: "weekly" });
  });

  it("no recurrence config → one-off (recurrence null)", async () => {
    await run({ subject: "One off", start_time: "09:00", end_time: "09:30", date: "2026-07-29" });
    const [, event] = createCalendarEventForOrg.mock.calls[0];
    expect(event.recurrence).toBeNull();
  });
});

describe("calendar.event.create — auto-fill from the client by kind", () => {
  const dailyData = {
    recordId: "client_1",
    name: "Acme",
    dailyStartTime: "10:00",
    dailyEndTime: "10:15",
    dailyDays: "monday,tuesday,wednesday,thursday,friday",
    teamMemberEmails: "a@acme.com, b@acme.com",
    meetingUntil: "2026-08-12",
    startDate: "2026-07-28",
  };

  it("fills EVERYTHING from the payload when only `kind: daily` is set", async () => {
    await run({ kind: "daily" }, dailyData);
    const [, event, opts] = createCalendarEventForOrg.mock.calls[0];
    expect(event.subject).toBe("Daily Huddle — Acme");
    expect(event.start).toBe("2026-07-28T10:00:00");
    expect(event.end).toBe("2026-07-28T10:15:00");
    expect(event.attendees).toEqual(["a@acme.com", "b@acme.com"]);
    expect(event.recurrence).toMatchObject({
      pattern: "weekly",
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      startDate: "2026-07-28",
      endDate: "2026-08-12",
    });
    expect(opts.link).toEqual({ refType: "clientMaster", refId: "client_1", kind: "daily" });
  });

  it("`kind: weekly` fills the weekly window + single day", async () => {
    await run(
      { kind: "weekly" },
      { recordId: "client_1", name: "Acme", weeklyStartTime: "15:12", weeklyEndTime: "15:20", weeklyDay: "wednesday", startDate: "2026-07-28" },
    );
    const [, event] = createCalendarEventForOrg.mock.calls[0];
    expect(event.subject).toBe("Weekly Meeting — Acme");
    expect(event.start).toBe("2026-07-28T15:12:00");
    expect(event.recurrence).toMatchObject({ pattern: "weekly", daysOfWeek: ["wednesday"] });
  });

  it("still skips cleanly when neither times nor kind are provided", async () => {
    const res = await run({ subject: "x" }, { recordId: "client_1" });
    expect(res.output).toMatchObject({ skipped: true });
    expect(createCalendarEventForOrg).not.toHaveBeenCalled();
  });
});
