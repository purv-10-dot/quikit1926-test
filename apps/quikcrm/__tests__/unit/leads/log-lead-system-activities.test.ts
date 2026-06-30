import { beforeEach, describe, expect, it, vi } from "vitest";

const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "act-1" }));

vi.mock("@/lib/services/activities/log-activity", () => ({
  logActivity,
}));

import {
  inferLeadCreationChannel,
  logLeadSystemActivitiesOnCreate,
  LEAD_SYSTEM_ACTIVITY_CODE,
  LEAD_INIT_EVENT_TYPE,
  EXCLUDE_LEAD_INIT_EVENTS_WHERE,
  isUserVisibleLeadActivity,
} from "@/lib/services/leads/log-lead-system-activities";

describe("logLeadSystemActivitiesOnCreate", () => {
  beforeEach(() => {
    logActivity.mockClear();
  });

  const baseLead = {
    id: "lead-1",
    orgId: "t1",
    name: "Acme",
    source: "Website",
    ownerName: "Ashwin Singh",
    ownerId: "u1",
    stage: "Contacted",
    status: "Working",
    sourceSystem: null,
    createdAt: new Date("2026-05-26T10:00:00.000Z"),
  };

  it("creates system activities for lead created, source, owner, stage, and status", async () => {
    await logLeadSystemActivitiesOnCreate(baseLead as never, {
      channel: "website",
      userId: "creator-1",
    });

    expect(logActivity).toHaveBeenCalledTimes(5);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LeadCreated",
        activityCode: LEAD_SYSTEM_ACTIVITY_CODE,
        userId: "creator-1",
        ownerId: "creator-1",
        relatedKind: "Lead",
        relatedObjectId: "lead-1",
        leadId: "lead-1",
        subject: "Lead created from Website",
        externalId: "lead-system:lead-1:created",
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Source added",
        externalId: "lead-system:lead-1:source",
      }),
    );
  });

  it("infers csv_import from ui-upload source system", () => {
    expect(
      inferLeadCreationChannel({ sourceSystem: "ui-upload", leadSource: "Partner" }),
    ).toBe("csv_import");
  });

  it("still writes all 5 events to the DB (init events kept for internal use)", async () => {
    await logLeadSystemActivitiesOnCreate(baseLead as never, { userId: "creator-1" });
    // Suppression is a READ-layer concern only — the writer is unchanged.
    expect(logActivity).toHaveBeenCalledTimes(5);
    const types = logActivity.mock.calls.map((c) => c[0].type);
    expect(types.filter((t) => t === "LeadCreated")).toHaveLength(1);
    expect(types.filter((t) => t === "LeadSystem")).toHaveLength(4);
  });
});

describe("lead-activity UI suppression", () => {
  // Mirrors the events the writer produces (buildSystemEvents).
  const created = { type: "LeadCreated", subject: "Lead added manually" };
  const initEvents = [
    { type: "LeadSystem", subject: "Source added" },
    { type: "LeadSystem", subject: "Owner assigned" },
    { type: "LeadSystem", subject: "Stage initialized" },
    { type: "LeadSystem", subject: "Status initialized" },
  ];

  it("keeps only the single 'Lead Created' event", () => {
    const all = [created, ...initEvents];
    const visible = all.filter(isUserVisibleLeadActivity);
    expect(visible).toEqual([created]);
  });

  it("isUserVisibleLeadActivity hides init events, keeps the creation event", () => {
    expect(isUserVisibleLeadActivity(created)).toBe(true);
    for (const ev of initEvents) {
      expect(isUserVisibleLeadActivity(ev)).toBe(false);
    }
  });

  it("does not hide ordinary user activities", () => {
    expect(isUserVisibleLeadActivity({ type: "Call" })).toBe(true);
    expect(isUserVisibleLeadActivity({ type: "Email" })).toBe(true);
    expect(isUserVisibleLeadActivity({ type: "Note" })).toBe(true);
  });

  it("EXCLUDE_LEAD_INIT_EVENTS_WHERE excludes exactly the init event type", () => {
    expect(EXCLUDE_LEAD_INIT_EVENTS_WHERE).toEqual({ NOT: { type: LEAD_INIT_EVENT_TYPE } });
    expect(LEAD_INIT_EVENT_TYPE).toBe("LeadSystem");
  });
});
