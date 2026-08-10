/**
 * Activity Type-wise target math: source resolution (readCountSources) and
 * progress folding (actualForType / buildTypeProgress).
 *
 * These are the pure pieces of the type-wise feature — no DB. They encode the
 * two rules that make the feature data-driven rather than hardcoded:
 *   1. Which sources a type counts comes from its `config.countsSources`.
 *   2. Activities match a type by NORMALIZED code, so writer case/format drift
 *      ("email" vs "Email", "follow-up" vs "follow_up") still counts.
 */
import { describe, expect, it } from "vitest";
import {
  readCountSources,
  DEFAULT_COUNT_SOURCES,
  type ActivityTypeTargetRow,
} from "@/lib/services/workspace/activity-type-target-config";
import {
  actualForType,
  buildTypeProgress,
  type TypeSourceCounts,
} from "@/lib/services/dashboard/activity-type-count";

function counts(byKey: Record<string, number>, calls = 0, completedTasks = 0): TypeSourceCounts {
  return { byActivityKey: new Map(Object.entries(byKey)), calls, completedTasks };
}

function typeRow(over: Partial<ActivityTypeTargetRow> = {}): ActivityTypeTargetRow {
  return {
    activityTypeId: "t1",
    code: "call",
    label: "Calls",
    sortOrder: 0,
    dailyTarget: 20,
    countsSources: ["activity"],
    ...over,
  };
}

describe("readCountSources", () => {
  it("defaults to activities-only when config is absent or not an object", () => {
    expect(readCountSources(null)).toEqual([...DEFAULT_COUNT_SOURCES]);
    expect(readCountSources(undefined)).toEqual(["activity"]);
    expect(readCountSources("nonsense")).toEqual(["activity"]);
    expect(readCountSources({})).toEqual(["activity"]);
  });

  it("reads an explicit source list", () => {
    expect(readCountSources({ countsSources: ["activity", "call"] })).toEqual(["activity", "call"]);
  });

  it("drops unknown entries and de-dupes rather than throwing", () => {
    expect(readCountSources({ countsSources: ["activity", "bogus", "activity", "task"] })).toEqual([
      "activity",
      "task",
    ]);
  });

  it("honors an explicitly empty list (type counts nothing)", () => {
    expect(readCountSources({ countsSources: [] })).toEqual([]);
  });
});

describe("actualForType", () => {
  it("counts activities matched by normalized code", () => {
    const t = typeRow({ code: "follow_up", countsSources: ["activity"] });
    // Writer produced "Follow-Up"; grouping normalized it to follow_up.
    expect(actualForType(t, counts({ follow_up: 7 }))).toBe(7);
  });

  it("adds call logs when the type declares the call source", () => {
    const t = typeRow({ code: "call", countsSources: ["activity", "call"] });
    expect(actualForType(t, counts({ call: 3 }, 9))).toBe(12);
  });

  it("adds completed tasks when the type declares the task source", () => {
    const t = typeRow({ code: "task", countsSources: ["activity", "task"] });
    expect(actualForType(t, counts({ task: 1 }, 0, 4))).toBe(5);
  });

  it("ignores calls and tasks for an activities-only type", () => {
    const t = typeRow({ code: "email", countsSources: ["activity"] });
    expect(actualForType(t, counts({ email: 15 }, 99, 99))).toBe(15);
  });

  it("returns 0 for a type with no matching activities", () => {
    const t = typeRow({ code: "demo", countsSources: ["activity"] });
    expect(actualForType(t, counts({ call: 5 }))).toBe(0);
  });
});

describe("buildTypeProgress", () => {
  const targets: ActivityTypeTargetRow[] = [
    typeRow({ activityTypeId: "a", code: "call", label: "Calls", sortOrder: 0, dailyTarget: 20, countsSources: ["activity", "call"] }),
    typeRow({ activityTypeId: "b", code: "meeting", label: "Meetings", sortOrder: 1, dailyTarget: 5 }),
    typeRow({ activityTypeId: "c", code: "email", label: "Emails", sortOrder: 2, dailyTarget: 25 }),
  ];

  it("produces the Calls 12/20, Meetings 3/5, Emails 15/25 shape", () => {
    const rows = buildTypeProgress(
      targets,
      counts({ call: 4, meeting: 3, email: 15 }, 8),
    );
    expect(rows.map((r) => `${r.label}: ${r.actual} / ${r.dailyTarget}`)).toEqual([
      "Calls: 12 / 20", // 4 activities + 8 call logs
      "Meetings: 3 / 5",
      "Emails: 15 / 25",
    ]);
  });

  it("excludes types with no target assigned", () => {
    const withZero = [...targets, typeRow({ activityTypeId: "d", code: "note", label: "Notes", dailyTarget: 0 })];
    const rows = buildTypeProgress(withZero, counts({ note: 40 }));
    expect(rows.find((r) => r.code === "note")).toBeUndefined();
  });

  it("computes remaining floored at zero and an uncapped percentage", () => {
    const rows = buildTypeProgress([typeRow({ dailyTarget: 10, countsSources: ["activity"] })], counts({ call: 15 }));
    expect(rows[0]?.remaining).toBe(0);
    expect(rows[0]?.completionPct).toBe(150);
  });

  it("rounds the percentage to a whole number", () => {
    const rows = buildTypeProgress([typeRow({ dailyTarget: 9, countsSources: ["activity"] })], counts({ call: 7 }));
    expect(rows[0]?.completionPct).toBe(78); // 7/9 = 77.8%
  });

  it("orders rows by the admin's configured sortOrder", () => {
    const shuffled = [
      typeRow({ activityTypeId: "c", code: "email", label: "Emails", sortOrder: 2, dailyTarget: 1 }),
      typeRow({ activityTypeId: "a", code: "call", label: "Calls", sortOrder: 0, dailyTarget: 1 }),
      typeRow({ activityTypeId: "b", code: "meeting", label: "Meetings", sortOrder: 1, dailyTarget: 1 }),
    ];
    expect(buildTypeProgress(shuffled, counts({})).map((r) => r.label)).toEqual([
      "Calls",
      "Meetings",
      "Emails",
    ]);
  });

  it("returns an empty list when nothing is targeted", () => {
    expect(buildTypeProgress([], counts({ call: 5 }))).toEqual([]);
  });
});
