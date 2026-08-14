import { describe, expect, it } from "vitest";
import {
  summarizeByActivityType,
  normalizeTypeKey,
  type ConfiguredType,
} from "@/lib/services/activities/type-summary";

// Mirrors the seeded CrmActivityType rows (code/label/sortOrder).
const CONFIGURED: ConfiguredType[] = [
  { code: "call", label: "Call", sortOrder: 0 },
  { code: "meeting", label: "Meeting", sortOrder: 1 },
  { code: "email", label: "Email", sortOrder: 2 },
  { code: "task", label: "Task", sortOrder: 3 },
  { code: "follow_up", label: "Follow-up", sortOrder: 11 },
];

describe("normalizeTypeKey", () => {
  it("collapses case and separator drift to one key", () => {
    expect(normalizeTypeKey("Follow-up")).toBe("follow_up");
    expect(normalizeTypeKey("follow_up")).toBe("follow_up");
    expect(normalizeTypeKey("FOLLOW UP")).toBe("follow_up");
  });

  it("splits PascalCase system event names", () => {
    expect(normalizeTypeKey("TaskStatusChange")).toBe("task_status_change");
    expect(normalizeTypeKey("LeadStageChange")).toBe("lead_stage_change");
  });
});

describe("summarizeByActivityType", () => {
  it("resolves labels from the configured types", () => {
    const out = summarizeByActivityType(
      [{ type: "call", count: 15 }],
      CONFIGURED,
    );
    expect(out).toEqual([{ key: "call", label: "Call", count: 15 }]);
  });

  it("merges the real-world casing split ('email' vs 'Email') into one chip", () => {
    // The DB genuinely holds lowercase "email" (sync pipeline) alongside
    // titlecase writers — these must not render as two chips.
    const out = summarizeByActivityType(
      [
        { type: "email", count: 48 },
        { type: "Email", count: 2 },
      ],
      CONFIGURED,
    );
    expect(out).toEqual([{ key: "email", label: "Email", count: 50 }]);
  });

  it("includes custom types with no code change", () => {
    const withCustom: ConfiguredType[] = [
      ...CONFIGURED,
      { code: "linkedin_dm_outreach", label: "Linkedin DM outreach", sortOrder: 20 },
    ];
    const out = summarizeByActivityType(
      [{ type: "linkedin_dm_outreach", count: 9 }],
      withCustom,
    );
    expect(out).toEqual([
      { key: "linkedin_dm_outreach", label: "Linkedin DM outreach", count: 9 },
    ]);
  });

  it("hides zero-count types", () => {
    const out = summarizeByActivityType(
      [
        { type: "call", count: 4 },
        { type: "meeting", count: 0 },
      ],
      CONFIGURED,
    );
    expect(out.map((g) => g.key)).toEqual(["call"]);
  });

  it("orders chips by the admin's configured sortOrder", () => {
    const out = summarizeByActivityType(
      [
        { type: "follow_up", count: 10 },
        { type: "email", count: 8 },
        { type: "call", count: 15 },
      ],
      CONFIGURED,
    );
    expect(out.map((g) => g.label)).toEqual(["Call", "Email", "Follow-up"]);
  });

  it("keeps unconfigured system events with a humanized label, sorted last", () => {
    const out = summarizeByActivityType(
      [
        { type: "TaskStatusChange", count: 3 },
        { type: "call", count: 1 },
      ],
      CONFIGURED,
    );
    expect(out).toEqual([
      { key: "call", label: "Call", count: 1 },
      { key: "task_status_change", label: "Task Status Change", count: 3 },
    ]);
  });

  it("preserves listing order when seeded rows share sortOrder 0", () => {
    const tied: ConfiguredType[] = [
      { code: "upwork_outreach", label: "Upwork outreach", sortOrder: 0 },
      { code: "call", label: "Call", sortOrder: 0 },
    ];
    const out = summarizeByActivityType(
      [
        { type: "call", count: 1 },
        { type: "upwork_outreach", count: 2 },
      ],
      tied,
    );
    expect(out.map((g) => g.label)).toEqual(["Upwork outreach", "Call"]);
  });

  it("returns nothing for an empty result set", () => {
    expect(summarizeByActivityType([], CONFIGURED)).toEqual([]);
  });

  it("skips blank type strings rather than emitting an empty chip", () => {
    const out = summarizeByActivityType([{ type: "   ", count: 5 }], CONFIGURED);
    expect(out).toEqual([]);
  });
});
