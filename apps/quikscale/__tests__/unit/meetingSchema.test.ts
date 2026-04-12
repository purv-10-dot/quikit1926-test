import { describe, it, expect } from "vitest";
import {
  createMeetingSchema,
  updateMeetingSchema,
  listMeetingsParamsSchema,
  createTemplateSchema,
  updateTemplateSchema,
  CADENCES,
} from "@/lib/schemas/meetingSchema";

// Use real-looking cuids so Zod .cuid() passes
const CUID_A = "ckuser0000000000000000000a";
const CUID_B = "ckuser0000000000000000000b";
const CUID_T = "cktmpl0000000000000000000a";

const baseCreate = {
  name: "Weekly Sync",
  cadence: "weekly" as const,
  scheduledAt: "2026-04-15T14:00:00.000Z",
  duration: 90,
  attendeeIds: [] as string[],
};

describe("createMeetingSchema", () => {
  it("accepts a minimal valid meeting", () => {
    const r = createMeetingSchema.safeParse(baseCreate);
    expect(r.success).toBe(true);
  });

  it("requires name", () => {
    const r = createMeetingSchema.safeParse({ ...baseCreate, name: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toMatch(/name/i);
  });

  it("trims whitespace-only name to empty and rejects", () => {
    const r = createMeetingSchema.safeParse({ ...baseCreate, name: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects name longer than 200 chars", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      name: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("accepts every valid cadence", () => {
    for (const c of CADENCES) {
      const r = createMeetingSchema.safeParse({ ...baseCreate, cadence: c });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an invalid cadence", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      cadence: "biweekly",
    });
    expect(r.success).toBe(false);
  });

  it("requires scheduledAt to be ISO datetime", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      scheduledAt: "tomorrow at 3pm",
    });
    expect(r.success).toBe(false);
  });

  it("requires duration to be a positive integer", () => {
    const r1 = createMeetingSchema.safeParse({ ...baseCreate, duration: 0 });
    expect(r1.success).toBe(false);
    const r2 = createMeetingSchema.safeParse({ ...baseCreate, duration: -30 });
    expect(r2.success).toBe(false);
    const r3 = createMeetingSchema.safeParse({ ...baseCreate, duration: 1.5 });
    expect(r3.success).toBe(false);
  });

  it("defaults attendeeIds to [] when omitted", () => {
    const { attendeeIds: _a, ...rest } = baseCreate;
    const r = createMeetingSchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.attendeeIds).toEqual([]);
  });

  it("accepts multiple attendee cuids", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      attendeeIds: [CUID_A, CUID_B],
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-cuid attendee ids", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      attendeeIds: ["not-a-cuid"],
    });
    expect(r.success).toBe(false);
  });

  it("accepts templateId when it is a valid cuid or null/omitted", () => {
    expect(
      createMeetingSchema.safeParse({ ...baseCreate, templateId: CUID_T }).success,
    ).toBe(true);
    expect(
      createMeetingSchema.safeParse({ ...baseCreate, templateId: null }).success,
    ).toBe(true);
    expect(createMeetingSchema.safeParse(baseCreate).success).toBe(true);
  });

  it("rejects templateId that is not a cuid", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      templateId: "xxx",
    });
    expect(r.success).toBe(false);
  });

  it("accepts empty string for meetingLink (coerced to allowed)", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      meetingLink: "",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid URL for meetingLink", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      meetingLink: "https://meet.example.com/abc",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed meetingLink", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      meetingLink: "not a url",
    });
    expect(r.success).toBe(false);
  });

  it("trims and caps location at 200 chars", () => {
    const r = createMeetingSchema.safeParse({
      ...baseCreate,
      location: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });
});

describe("updateMeetingSchema", () => {
  it("accepts an empty object (no changes)", () => {
    const r = updateMeetingSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts partial text updates", () => {
    const r = updateMeetingSchema.safeParse({
      decisions: "Decided to ship Q2 OKRs by Friday",
      blockers: null,
      highlights: "Landed the hiring plan",
    });
    expect(r.success).toBe(true);
  });

  it("accepts boolean quality flags", () => {
    const r = updateMeetingSchema.safeParse({
      startedOnTime: true,
      endedOnTime: false,
      formatFollowed: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects followUpRate outside 0..1", () => {
    expect(
      updateMeetingSchema.safeParse({ followUpRate: 1.5 }).success,
    ).toBe(false);
    expect(
      updateMeetingSchema.safeParse({ followUpRate: -0.1 }).success,
    ).toBe(false);
  });

  it("accepts followUpRate at the boundaries", () => {
    expect(updateMeetingSchema.safeParse({ followUpRate: 0 }).success).toBe(true);
    expect(updateMeetingSchema.safeParse({ followUpRate: 1 }).success).toBe(true);
    expect(
      updateMeetingSchema.safeParse({ followUpRate: 0.75 }).success,
    ).toBe(true);
  });

  it("accepts completedAt as ISO datetime or null", () => {
    expect(
      updateMeetingSchema.safeParse({
        completedAt: "2026-04-15T16:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      updateMeetingSchema.safeParse({ completedAt: null }).success,
    ).toBe(true);
  });

  it("rejects a bogus completedAt", () => {
    const r = updateMeetingSchema.safeParse({ completedAt: "yesterday" });
    expect(r.success).toBe(false);
  });

  it("accepts an attendeeIds replacement list", () => {
    const r = updateMeetingSchema.safeParse({
      attendeeIds: [CUID_A, CUID_B],
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-cuid in attendeeIds", () => {
    const r = updateMeetingSchema.safeParse({ attendeeIds: ["abc"] });
    expect(r.success).toBe(false);
  });
});

describe("listMeetingsParamsSchema", () => {
  it("defaults page to 1 and pageSize to 20", () => {
    const r = listMeetingsParamsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.pageSize).toBe(20);
    }
  });

  it("coerces string page/pageSize to numbers (query-string friendly)", () => {
    const r = listMeetingsParamsSchema.safeParse({ page: "3", pageSize: "50" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(3);
      expect(r.data.pageSize).toBe(50);
    }
  });

  it("rejects pageSize > 100", () => {
    const r = listMeetingsParamsSchema.safeParse({ pageSize: 500 });
    expect(r.success).toBe(false);
  });

  it("rejects negative page", () => {
    const r = listMeetingsParamsSchema.safeParse({ page: -1 });
    expect(r.success).toBe(false);
  });

  it("accepts cadence filter", () => {
    const r = listMeetingsParamsSchema.safeParse({ cadence: "quarterly" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid cadence filter", () => {
    const r = listMeetingsParamsSchema.safeParse({ cadence: "monthlyyy" });
    expect(r.success).toBe(false);
  });

  it("accepts from/to as ISO datetimes", () => {
    const r = listMeetingsParamsSchema.safeParse({
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-04-30T23:59:59.000Z",
    });
    expect(r.success).toBe(true);
  });
});

describe("createTemplateSchema", () => {
  const baseTpl = {
    name: "Custom Weekly",
    cadence: "weekly" as const,
    sections: ["Intro", "Metrics", "Discussion"],
  };

  it("accepts a minimal valid template", () => {
    const r = createTemplateSchema.safeParse(baseTpl);
    expect(r.success).toBe(true);
  });

  it("defaults duration to 60", () => {
    const r = createTemplateSchema.safeParse(baseTpl);
    if (r.success) expect(r.data.duration).toBe(60);
  });

  it("defaults defaultAttendees to []", () => {
    const r = createTemplateSchema.safeParse(baseTpl);
    if (r.success) expect(r.data.defaultAttendees).toEqual([]);
  });

  it("rejects empty sections array", () => {
    const r = createTemplateSchema.safeParse({ ...baseTpl, sections: [] });
    expect(r.success).toBe(false);
  });

  it("rejects sections with empty strings after trim", () => {
    const r = createTemplateSchema.safeParse({
      ...baseTpl,
      sections: ["", "   "],
    });
    expect(r.success).toBe(false);
  });

  it("rejects name longer than 100 chars", () => {
    const r = createTemplateSchema.safeParse({
      ...baseTpl,
      name: "x".repeat(101),
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid cadence", () => {
    const r = createTemplateSchema.safeParse({
      ...baseTpl,
      cadence: "biweekly",
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative duration", () => {
    const r = createTemplateSchema.safeParse({ ...baseTpl, duration: -10 });
    expect(r.success).toBe(false);
  });
});

describe("updateTemplateSchema", () => {
  it("accepts empty object (partial update)", () => {
    const r = updateTemplateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts name-only update", () => {
    const r = updateTemplateSchema.safeParse({ name: "Renamed" });
    expect(r.success).toBe(true);
  });

  it("accepts sections-only update with at least one entry", () => {
    const r = updateTemplateSchema.safeParse({ sections: ["only one"] });
    expect(r.success).toBe(true);
  });

  it("still rejects empty sections array on update", () => {
    const r = updateTemplateSchema.safeParse({ sections: [] });
    expect(r.success).toBe(false);
  });
});

describe("CADENCES const", () => {
  it("has exactly the 5 Scaling Up cadences", () => {
    expect(CADENCES).toEqual([
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "annual",
    ]);
  });
});
