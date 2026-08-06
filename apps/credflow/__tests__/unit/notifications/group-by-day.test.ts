import { describe, expect, it } from "vitest";
import { groupByDay } from "@/components/notifications/notification-center";
import type { NotificationRow } from "@/lib/notifications/types";

/** Minimal row with only the fields groupByDay reads (id + createdAt). */
function at(id: string, createdAt: Date | string): NotificationRow {
  return {
    id,
    tenantId: "t1",
    userId: "u1",
    title: "t",
    body: null,
    category: null,
    link: null,
    readAt: null,
    metadata: null,
    createdAt,
  };
}

describe("groupByDay", () => {
  it("splits items into Today vs Earlier by local midnight", () => {
    const now = new Date();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const yesterday = new Date(startOfToday.getTime() - 60_000); // 1 min before midnight
    const lastWeek = new Date(startOfToday.getTime() - 7 * 86_400_000);

    const { today, earlier } = groupByDay([
      at("now", now),
      at("midnight", startOfToday), // boundary: >= cutoff → Today
      at("yesterday", yesterday),
      at("lastweek", lastWeek),
    ]);

    expect(today.map((n) => n.id)).toEqual(["now", "midnight"]);
    expect(earlier.map((n) => n.id)).toEqual(["yesterday", "lastweek"]);
  });

  it("handles ISO string timestamps", () => {
    const { today, earlier } = groupByDay([at("old", "2020-01-01T00:00:00.000Z")]);
    expect(today).toHaveLength(0);
    expect(earlier.map((n) => n.id)).toEqual(["old"]);
  });

  it("returns empty groups for an empty list", () => {
    const { today, earlier } = groupByDay([]);
    expect(today).toEqual([]);
    expect(earlier).toEqual([]);
  });
});
