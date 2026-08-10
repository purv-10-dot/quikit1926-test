import { describe, expect, it } from "vitest";
import {
  dateDividerLabel,
  formatCallDuration,
  formatChannelTime,
  formatFullDate,
  formatLastSeen,
  formatVoiceDuration,
  sameCalendarDay,
} from "./format";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

describe("formatChannelTime", () => {
  it("returns empty for missing values", () => {
    expect(formatChannelTime(null)).toBe("");
    expect(formatChannelTime(undefined)).toBe("");
  });
  it("labels yesterday explicitly", () => {
    expect(formatChannelTime(daysAgo(1))).toBe("Yesterday");
  });
  it("uses a time for today (not 'Yesterday')", () => {
    const out = formatChannelTime(new Date());
    expect(out).not.toBe("Yesterday");
    expect(out.length).toBeGreaterThan(0);
  });
  it("uses 'MMM d' for older dates", () => {
    expect(formatChannelTime(daysAgo(10))).toMatch(/^[A-Z][a-z]{2}\s\d{1,2}$/);
  });
});

describe("dateDividerLabel", () => {
  it("Today / Yesterday", () => {
    expect(dateDividerLabel(new Date())).toBe("Today");
    expect(dateDividerLabel(daysAgo(1))).toBe("Yesterday");
  });
  it("weekday within the last week", () => {
    const label = dateDividerLabel(daysAgo(3));
    expect(["Today", "Yesterday"]).not.toContain(label);
    expect(label).toMatch(/^[A-Z][a-z]+$/);
  });
  it("full date for older", () => {
    expect(dateDividerLabel(daysAgo(30))).toMatch(/\d{4}$/);
  });
});

describe("formatLastSeen", () => {
  it("returns empty for missing / unparseable values so callers can fall back", () => {
    expect(formatLastSeen(null)).toBe("");
    expect(formatLastSeen(undefined)).toBe("");
    expect(formatLastSeen("not-a-date")).toBe("");
  });
  it("says 'today at <time>' for today", () => {
    expect(formatLastSeen(new Date())).toMatch(/^last seen today at .+/);
  });
  it("says 'yesterday at <time>' for yesterday", () => {
    expect(formatLastSeen(daysAgo(1))).toMatch(/^last seen yesterday at .+/);
  });
  it("uses the weekday within the last week (same buckets as dateDividerLabel)", () => {
    const out = formatLastSeen(daysAgo(3));
    expect(out).toMatch(/^last seen [A-Z][a-z]+ at .+/);
    expect(out).not.toMatch(/today|yesterday/);
  });
  it("uses 'd MMM at <time>' for older", () => {
    expect(formatLastSeen(new Date(2026, 4, 8, 16, 0))).toMatch(/^last seen 8 May at .+/);
  });
});

describe("formatFullDate", () => {
  it("renders the call-details heading as 'Weekday, d Month yyyy'", () => {
    expect(formatFullDate(new Date(2026, 4, 8))).toBe("Friday, 8 May 2026");
  });
  it("returns empty for an unparseable value", () => {
    expect(formatFullDate("not-a-date")).toBe("");
  });
});

describe("formatCallDuration", () => {
  it("formats talk time as m:ss with a zero-padded seconds field", () => {
    expect(formatCallDuration(252)).toBe("4:12");
    expect(formatCallDuration(65)).toBe("1:05");
    expect(formatCallDuration(9)).toBe("0:09");
  });
  it("does not roll minutes into hours (matches the call-summary message)", () => {
    expect(formatCallDuration(3661)).toBe("61:01");
  });
  it("returns undefined for unanswered calls (null / 0 / negative)", () => {
    expect(formatCallDuration(null)).toBeUndefined();
    expect(formatCallDuration(undefined)).toBeUndefined();
    expect(formatCallDuration(0)).toBeUndefined();
    expect(formatCallDuration(-5)).toBeUndefined();
  });
});

describe("formatVoiceDuration", () => {
  it("formats a voice-note length as m:ss", () => {
    expect(formatVoiceDuration(5)).toBe("0:05");
    expect(formatVoiceDuration(75)).toBe("1:15");
    expect(formatVoiceDuration(300)).toBe("5:00"); // the 5-minute cap
  });
  it("always returns a string — it drives a live timer that starts at 0:00", () => {
    // Unlike formatCallDuration, zero is a legitimate display value here.
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(null)).toBe("0:00");
    expect(formatVoiceDuration(undefined)).toBe("0:00");
    expect(formatVoiceDuration(-5)).toBe("0:00");
  });
  it("floors fractional seconds so the timer never shows a rounded-up value", () => {
    expect(formatVoiceDuration(3.9)).toBe("0:03");
  });
});

describe("sameCalendarDay", () => {
  it("true for two times on the same day, false across days", () => {
    const a = new Date(2026, 4, 8, 9, 0, 0); // local time
    const b = new Date(2026, 4, 8, 23, 0, 0);
    const c = new Date(2026, 4, 9, 1, 0, 0);
    expect(sameCalendarDay(a, b)).toBe(true);
    expect(sameCalendarDay(a, c)).toBe(false);
    expect(sameCalendarDay(null, b)).toBe(false);
  });
});
