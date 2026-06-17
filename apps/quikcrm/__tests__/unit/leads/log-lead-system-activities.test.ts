import { beforeEach, describe, expect, it, vi } from "vitest";

const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "act-1" }));

vi.mock("@/lib/services/activities/log-activity", () => ({
  logActivity,
}));

import {
  inferLeadCreationChannel,
  logLeadSystemActivitiesOnCreate,
  LEAD_SYSTEM_ACTIVITY_CODE,
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
});
