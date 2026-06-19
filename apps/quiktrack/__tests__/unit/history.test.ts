import { describe, it, expect } from "vitest";
import {
  groupHistoryByDay,
  relativeTime,
  type HistoryEntry,
} from "@/lib/utils/history";

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

function entry(id: string, ts: number): HistoryEntry {
  return { id, kind: "project", title: id, href: "/x", ts };
}

describe("relativeTime()", () => {
  it("'just now' for sub-minute deltas", () => {
    expect(relativeTime(Date.now() - 5_000)).toBe("just now");
  });

  it("'N minutes ago' for sub-hour deltas", () => {
    expect(relativeTime(Date.now() - 31 * 60 * 1000)).toMatch(/31 minutes ago/);
  });

  it("'N hours ago' under a day", () => {
    expect(relativeTime(Date.now() - 5 * ONE_HOUR)).toMatch(/5 hours ago/);
  });

  it("'N days ago' under a week", () => {
    expect(relativeTime(Date.now() - 3 * ONE_DAY)).toMatch(/3 days ago/);
  });
});

describe("groupHistoryByDay()", () => {
  it("buckets entries into Today / Yesterday / This week / Earlier", () => {
    const now = Date.now();
    const startOfToday = (() => {
      const d = new Date(now);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    })();

    const result = groupHistoryByDay([
      entry("a", now - 30 * 60 * 1000),         // today
      entry("b", startOfToday - 1),             // yesterday
      entry("c", now - 3 * ONE_DAY),            // this week
      entry("d", now - 30 * ONE_DAY),           // earlier
    ]);

    const map = Object.fromEntries(result.map((g) => [g.group, g.items.map((i) => i.id)]));
    expect(map.Today).toEqual(["a"]);
    expect(map.Yesterday).toEqual(["b"]);
    expect(map["This week"]).toEqual(["c"]);
    expect(map.Earlier).toEqual(["d"]);
  });

  it("omits empty buckets from the output", () => {
    const onlyToday = groupHistoryByDay([entry("a", Date.now())]);
    expect(onlyToday.length).toBe(1);
    expect(onlyToday[0]?.group).toBe("Today");
  });
});
