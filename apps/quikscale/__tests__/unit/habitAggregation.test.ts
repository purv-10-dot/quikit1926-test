import { describe, it, expect } from "vitest";
import {
  aggregateResponses,
  subItemBitsSchema,
  HABIT_KEYS,
  type SubItemBits,
} from "@/lib/schemas/habitSchema";
import { ragForPct, ragForHabit } from "@/lib/utils/habitColorLogic";

function bits(filled: Partial<SubItemBits>): SubItemBits {
  return Object.fromEntries(
    HABIT_KEYS.map((k) => [k, filled[k] ?? [false, false, false, false]]),
  ) as SubItemBits;
}

describe("aggregateResponses", () => {
  it("returns zero respondents for an empty input", () => {
    const result = aggregateResponses([]);
    expect(result.respondentCount).toBe(0);
    expect(result.overallPct).toBe(0);
    expect(result.totalOutOf40).toBe(0);
    expect(result.habitsAtMax).toBe(0);
    expect(result.perHabit).toHaveLength(10);
    for (const h of result.perHabit) {
      expect(h.pct).toBe(0);
      for (const s of h.subItems) {
        expect(s.yes).toBe(0);
        expect(s.total).toBe(0);
        expect(s.pct).toBe(0);
      }
    }
  });

  it("computes 'X of N agreed' for each sub-item", () => {
    // 3 respondents, all ticking sub-item 1.1 only
    const responses = [
      { subItemBits: bits({ habit1_vision: [true, false, false, false] }) },
      { subItemBits: bits({ habit1_vision: [true, false, false, false] }) },
      { subItemBits: bits({ habit1_vision: [true, false, false, false] }) },
    ];
    const result = aggregateResponses(responses);

    expect(result.respondentCount).toBe(3);

    const habit1 = result.perHabit.find((h) => h.key === "habit1_vision");
    expect(habit1).toBeDefined();
    expect(habit1!.subItems[0]).toMatchObject({ yes: 3, total: 3, pct: 1 });
    expect(habit1!.subItems[1]).toMatchObject({ yes: 0, total: 3, pct: 0 });
    expect(habit1!.pct).toBeCloseTo(0.25); // 1/4 of sub-items unanimously ticked
  });

  it("averages mixed agreement levels into the per-habit %", () => {
    // 4 respondents on habit2_meetings:
    //   sub-item 0: 4/4   → 1.00
    //   sub-item 1: 3/4   → 0.75
    //   sub-item 2: 2/4   → 0.50
    //   sub-item 3: 0/4   → 0.00
    // Per-habit pct = (1 + 0.75 + 0.5 + 0) / 4 = 0.5625
    // avgYes        = (4 + 3 + 2 + 0) / 4 = 2.25 → rounds to 2
    const responses = [
      { subItemBits: bits({ habit2_meetings: [true, true, true, false] }) },
      { subItemBits: bits({ habit2_meetings: [true, true, true, false] }) },
      { subItemBits: bits({ habit2_meetings: [true, true, false, false] }) },
      { subItemBits: bits({ habit2_meetings: [true, false, false, false] }) },
    ];
    const result = aggregateResponses(responses);
    const habit2 = result.perHabit.find((h) => h.key === "habit2_meetings")!;
    expect(habit2.subItems[0].pct).toBeCloseTo(1);
    expect(habit2.subItems[1].pct).toBeCloseTo(0.75);
    expect(habit2.subItems[2].pct).toBeCloseTo(0.5);
    expect(habit2.subItems[3].pct).toBeCloseTo(0);
    expect(habit2.pct).toBeCloseTo(0.5625);
    expect(habit2.avgYes).toBe(2);
  });

  it("avgYes = rounded average of sub-item yes counts (powers the checklist COUNT column)", () => {
    // Mirrors the reference screenshot: habit1 sub-items show 10, 9, 7, 10
    // out of 11 respondents → parent row should show COUNT = 9 (avg = 9).
    const yes = [10, 9, 7, 10];
    const responses: Array<{ subItemBits: SubItemBits }> = [];
    // Build 11 responses where sub-item i is ticked by `yes[i]` of them.
    for (let r = 0; r < 11; r++) {
      const row: [boolean, boolean, boolean, boolean] = [
        r < yes[0],
        r < yes[1],
        r < yes[2],
        r < yes[3],
      ];
      responses.push({ subItemBits: bits({ habit1_vision: row }) });
    }
    const result = aggregateResponses(responses);
    const habit1 = result.perHabit.find((h) => h.key === "habit1_vision")!;
    expect(habit1.subItems.map((s) => s.yes)).toEqual([10, 9, 7, 10]);
    expect(habit1.avgYes).toBe(9);
    // % avg = (10/11 + 9/11 + 7/11 + 10/11) / 4 = 36/44 = ~81.8% — matches
    // the 80% the reference shows for that habit row.
    expect(Math.round(habit1.pct * 100)).toBe(82);
  });

  it("overall % = average of the 10 per-habit percentages, totalOutOf40 follows", () => {
    // 1 respondent who ticks every sub-item of every habit.
    const all = bits(
      Object.fromEntries(HABIT_KEYS.map((k) => [k, [true, true, true, true]])) as Partial<SubItemBits>,
    );
    const result = aggregateResponses([{ subItemBits: all }]);
    expect(result.overallPct).toBe(1);
    expect(result.totalOutOf40).toBe(40);
    expect(result.habitsAtMax).toBe(10);
  });

  it("habitsAtMax counts only habits where every sub-item hit 100%", () => {
    const responses = [
      // Habit 1: both ticked all 4 → 100%
      // Habit 2: only first respondent ticked all 4 → 50% on each sub-item → not max
      {
        subItemBits: bits({
          habit1_vision: [true, true, true, true],
          habit2_meetings: [true, true, true, true],
        }),
      },
      {
        subItemBits: bits({
          habit1_vision: [true, true, true, true],
          habit2_meetings: [false, false, false, false],
        }),
      },
    ];
    const result = aggregateResponses(responses);
    expect(result.habitsAtMax).toBe(1);
    expect(result.perHabit.find((h) => h.key === "habit1_vision")!.pct).toBe(1);
    expect(result.perHabit.find((h) => h.key === "habit2_meetings")!.pct).toBe(0.5);
  });

  it("never exposes respondent identity in the aggregate (anonymity check)", () => {
    // Even if the caller passes through extra fields, the aggregate output
    // shape only carries counts/percentages — no userIds, no per-response data.
    const responses = [
      { subItemBits: bits({ habit1_vision: [true, false, false, false] }), respondentUserId: "user-a" },
      { subItemBits: bits({ habit1_vision: [false, true, false, false] }), respondentUserId: "user-b" },
    ];
    const result = aggregateResponses(responses);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("user-a");
    expect(serialised).not.toContain("user-b");
    expect(serialised).not.toContain("respondentUserId");
  });

  it("silently drops malformed response rows instead of throwing", () => {
    const responses = [
      { subItemBits: bits({ habit1_vision: [true, true, false, false] }) },
      { subItemBits: { habit1_vision: "garbage" } }, // malformed
      { subItemBits: null }, // malformed
    ];
    const result = aggregateResponses(responses as never);
    // Only the one valid row should count.
    expect(result.respondentCount).toBe(1);
  });
});

describe("subItemBitsSchema", () => {
  it("requires exactly 4 booleans per habit key", () => {
    const invalid = subItemBitsSchema.safeParse({
      ...Object.fromEntries(HABIT_KEYS.map((k) => [k, [false, false, false, false]])),
      habit1_vision: [true, true, true], // only 3 — should fail
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects missing habit keys", () => {
    const partial = subItemBitsSchema.safeParse({
      habit1_vision: [true, true, true, true],
    });
    expect(partial.success).toBe(false);
  });

  it("rejects non-boolean values", () => {
    const result = subItemBitsSchema.safeParse({
      ...Object.fromEntries(HABIT_KEYS.map((k) => [k, [false, false, false, false]])),
      habit1_vision: [1, 0, 1, 0], // numbers, not booleans
    });
    expect(result.success).toBe(false);
  });

  it("accepts a fully populated bit map", () => {
    const valid = Object.fromEntries(
      HABIT_KEYS.map((k) => [k, [true, false, true, false]]),
    );
    const result = subItemBitsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("ragForPct thresholds", () => {
  it("green when ≥ 80%", () => {
    expect(ragForHabit(0.8)).toBe("green");
    expect(ragForHabit(1)).toBe("green");
    expect(ragForPct(0.82).badgeBg).toContain("green");
  });

  it("amber when ≥ 60% and < 80%", () => {
    expect(ragForHabit(0.6)).toBe("amber");
    expect(ragForHabit(0.79)).toBe("amber");
    expect(ragForHabit(0.64)).toBe("amber"); // from client's 64% example
  });

  it("red when < 60%", () => {
    expect(ragForHabit(0)).toBe("red");
    expect(ragForHabit(0.59)).toBe("red");
    expect(ragForHabit(0.61)).toBe("amber"); // matches the 61% example as amber boundary
  });
});
