/**
 * Due dates are calendar days stored as UTC midnight. The backlog's inline
 * chip and the issue drawer both edit the same field, so the round-trip has to
 * be exact — a value that drifts by a day each save is the failure this guards.
 */
import { describe, it, expect } from "vitest";
import {
  DUE_DATE_FILTER_OPTIONS,
  appendDueDateParams,
  dayKeyFromToday,
  dueDateFilterQuery,
  dueDateInputToISO,
  dueDateTone,
  formatDueDateLabel,
  localDayKey,
  toDueDateInput,
} from "@/lib/utils/due-date";

describe("toDueDateInput", () => {
  it("projects a stored instant onto its UTC day", () => {
    expect(toDueDateInput("2026-08-12T00:00:00.000Z")).toBe("2026-08-12");
    expect(toDueDateInput("2026-08-12T09:30:00.000Z")).toBe("2026-08-12");
  });

  it("returns an empty string for missing or unparseable values", () => {
    expect(toDueDateInput(null)).toBe("");
    expect(toDueDateInput(undefined)).toBe("");
    expect(toDueDateInput("")).toBe("");
    expect(toDueDateInput("not-a-date")).toBe("");
  });
});

describe("dueDateInputToISO", () => {
  it("converts a picker day to UTC midnight", () => {
    expect(dueDateInputToISO("2026-08-12")).toBe("2026-08-12T00:00:00.000Z");
  });

  it("maps an empty input to null so the API clears the field", () => {
    expect(dueDateInputToISO("")).toBeNull();
  });

  it("returns null rather than an Invalid Date for junk", () => {
    expect(dueDateInputToISO("2026-13-45")).toBeNull();
  });

  it("round-trips without drifting a day", () => {
    let iso: string | null = "2026-08-12T00:00:00.000Z";
    for (let i = 0; i < 5; i++) iso = dueDateInputToISO(toDueDateInput(iso));
    expect(iso).toBe("2026-08-12T00:00:00.000Z");
  });
});

describe("dueDateTone", () => {
  const now = new Date(2026, 7, 12, 15, 30); // 12 Aug 2026, local

  it("flags a past day as overdue", () => {
    expect(dueDateTone("2026-08-07T00:00:00.000Z", now)).toBe("overdue");
  });

  it("flags the current local day as today", () => {
    expect(dueDateTone("2026-08-12T00:00:00.000Z", now)).toBe("today");
  });

  it("flags a later day as upcoming", () => {
    expect(dueDateTone("2026-08-20T00:00:00.000Z", now)).toBe("upcoming");
  });

  it("returns null when there is no due date", () => {
    expect(dueDateTone(null, now)).toBeNull();
    expect(dueDateTone("nonsense", now)).toBeNull();
  });

  it("compares year boundaries correctly", () => {
    expect(dueDateTone("2025-12-31T00:00:00.000Z", now)).toBe("overdue");
    expect(dueDateTone("2027-01-01T00:00:00.000Z", now)).toBe("upcoming");
  });
});

describe("localDayKey / dayKeyFromToday", () => {
  it("formats the local calendar day zero-padded", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("offsets from today and rolls over the month", () => {
    const now = new Date(2026, 7, 31, 10, 0);
    expect(dayKeyFromToday(0, now)).toBe("2026-08-31");
    expect(dayKeyFromToday(1, now)).toBe("2026-09-01");
    expect(dayKeyFromToday(7, now)).toBe("2026-09-07");
  });
});

describe("formatDueDateLabel", () => {
  const now = new Date(2026, 7, 12);

  it("renders the stored UTC day, not a zone-shifted one", () => {
    const label = formatDueDateLabel("2026-08-12T00:00:00.000Z", now);
    expect(label).toContain("12");
    expect(label).toContain("Aug");
  });

  it("adds the year when the due date is not in the current year", () => {
    expect(formatDueDateLabel("2025-12-31T00:00:00.000Z", now)).toContain("2025");
    expect(formatDueDateLabel("2026-08-12T00:00:00.000Z", now)).not.toContain("2026");
  });

  it("renders nothing when unset", () => {
    expect(formatDueDateLabel(null, now)).toBe("");
  });
});

/**
 * The filter presets resolve in the BROWSER, against the viewer's local day,
 * then travel to the API as absolute instants. The bug this guards is a bound
 * that lands mid-day: a "due today" item stored at UTC midnight must be inside
 * the today window no matter what time the page was loaded.
 */
describe("dueDateFilterQuery", () => {
  // Mid-afternoon local, deliberately not midnight.
  const now = new Date(2026, 7, 12, 15, 30);

  it("returns nothing for Any, so no params are sent", () => {
    expect(dueDateFilterQuery("", now)).toEqual({});
  });

  it("ignores an unknown (e.g. stale persisted) preset instead of throwing", () => {
    expect(dueDateFilterQuery("last-fortnight", now)).toEqual({});
  });

  it("selects items with no due date at all", () => {
    expect(dueDateFilterQuery("none", now)).toEqual({ dueDate: "none" });
  });

  it("treats overdue as everything up to the end of yesterday", () => {
    const q = dueDateFilterQuery("overdue", now);
    expect(q.dueTo).toBe("2026-08-11T23:59:59.999Z");
    // No lower bound — an item due last year is still overdue.
    expect(q.dueFrom).toBeUndefined();
    expect(q.dueDate).toBeUndefined();
  });

  it("bounds 'due today' to the whole of today, not from the current time", () => {
    const q = dueDateFilterQuery("today", now);
    expect(q.dueFrom).toBe("2026-08-12T00:00:00.000Z");
    expect(q.dueTo).toBe("2026-08-12T23:59:59.999Z");
  });

  it("makes the forward windows start today and include the last day in full", () => {
    expect(dueDateFilterQuery("week", now)).toEqual({
      dueFrom: "2026-08-12T00:00:00.000Z",
      dueTo: "2026-08-19T23:59:59.999Z",
    });
    expect(dueDateFilterQuery("month", now)).toEqual({
      dueFrom: "2026-08-12T00:00:00.000Z",
      dueTo: "2026-09-11T23:59:59.999Z",
    });
  });

  it("rolls over month and year boundaries", () => {
    const nye = new Date(2026, 11, 31, 9, 0);
    expect(dueDateFilterQuery("overdue", nye).dueTo).toBe("2026-12-30T23:59:59.999Z");
    expect(dueDateFilterQuery("week", nye).dueTo).toBe("2027-01-07T23:59:59.999Z");
  });

  it("brackets a stored due date correctly", () => {
    // What the row actually holds for "due today" (UTC midnight, per this
    // module's convention) must fall inside the today window.
    const stored = Date.parse("2026-08-12T00:00:00.000Z");
    const q = dueDateFilterQuery("today", now);
    expect(stored).toBeGreaterThanOrEqual(Date.parse(q.dueFrom!));
    expect(stored).toBeLessThanOrEqual(Date.parse(q.dueTo!));
    // ...and outside the overdue window.
    expect(stored).toBeGreaterThan(Date.parse(dueDateFilterQuery("overdue", now).dueTo!));
  });
});

describe("appendDueDateParams", () => {
  const now = new Date(2026, 7, 12, 15, 30);

  it("adds nothing for Any", () => {
    const p = new URLSearchParams();
    appendDueDateParams(p, "", now);
    expect(p.toString()).toBe("");
  });

  it("serializes a range preset", () => {
    const p = new URLSearchParams();
    appendDueDateParams(p, "today", now);
    expect(p.get("dueFrom")).toBe("2026-08-12T00:00:00.000Z");
    expect(p.get("dueTo")).toBe("2026-08-12T23:59:59.999Z");
    expect(p.get("dueDate")).toBeNull();
  });

  it("serializes the no-due-date preset", () => {
    const p = new URLSearchParams();
    appendDueDateParams(p, "none", now);
    expect(p.get("dueDate")).toBe("none");
    expect(p.get("dueFrom")).toBeNull();
  });
});

describe("DUE_DATE_FILTER_OPTIONS", () => {
  it("leads with Any and offers every preset the query helper handles", () => {
    expect(DUE_DATE_FILTER_OPTIONS[0]).toEqual({ value: "", label: "Any" });
    expect(DUE_DATE_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "",
      "overdue",
      "today",
      "week",
      "month",
      "none",
    ]);
  });
});
