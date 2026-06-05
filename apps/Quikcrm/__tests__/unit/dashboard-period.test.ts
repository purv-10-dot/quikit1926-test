import { describe, expect, it } from "vitest";
import {
  buildDayBuckets,
  computeDelta,
  isoDateInTz,
  parseAndClampRange,
  priorRange,
  rangeDays,
  startOfDayInTz,
} from "@/lib/services/dashboard/period";

describe("period helpers", () => {
  it("startOfDayInTz returns midnight for the given IANA zone", () => {
    // 2026-04-25 03:14 UTC → in IST (UTC+5:30) is 2026-04-25 08:44, so the IST
    // calendar day is the 25th and its start is 2026-04-24 18:30:00 UTC.
    const instant = new Date("2026-04-25T03:14:00Z");
    const start = startOfDayInTz(instant, "Asia/Kolkata");
    expect(start.toISOString()).toBe("2026-04-24T18:30:00.000Z");
  });

  it("isoDateInTz formats YYYY-MM-DD in the given zone", () => {
    expect(isoDateInTz(new Date("2026-04-25T22:00:00Z"), "Asia/Kolkata")).toBe("2026-04-26");
    expect(isoDateInTz(new Date("2026-04-25T22:00:00Z"), "America/Los_Angeles")).toBe("2026-04-25");
  });

  it("parseAndClampRange defaults to last 7 days when from/to are null", () => {
    const r = parseAndClampRange(null, null, "UTC", new Date("2026-05-02T12:00:00Z"));
    expect(rangeDays(r)).toBeGreaterThanOrEqual(6);
    expect(rangeDays(r)).toBeLessThanOrEqual(8);
    expect(r.tz).toBe("UTC");
  });

  it("parseAndClampRange rejects ranges over 366 days", () => {
    expect(() =>
      parseAndClampRange("2024-01-01", "2026-01-02", "UTC", new Date("2026-05-02T00:00:00Z")),
    ).toThrow(/range too large/i);
  });

  it("parseAndClampRange rejects from > to", () => {
    expect(() =>
      parseAndClampRange("2026-04-30", "2026-04-25", "UTC", new Date("2026-05-02T00:00:00Z")),
    ).toThrow();
  });

  it("priorRange returns an immediately-prior window of equal length", () => {
    const r = parseAndClampRange("2026-04-25", "2026-05-01", "UTC", new Date("2026-05-02T00:00:00Z"));
    const p = priorRange(r);
    const lenA = r.to.getTime() - r.from.getTime();
    const lenB = p.to.getTime() - p.from.getTime();
    expect(Math.abs(lenA - lenB)).toBeLessThan(1000);
    expect(p.to.getTime()).toBeLessThan(r.from.getTime());
  });

  it("buildDayBuckets produces one bucket per calendar day in the range", () => {
    const r = parseAndClampRange("2026-04-25", "2026-05-01", "Asia/Kolkata", new Date("2026-05-02T00:00:00Z"));
    const buckets = buildDayBuckets(r);
    expect(buckets.length).toBe(7);
    expect(buckets[0].iso).toBe("2026-04-25");
    expect(buckets[6].iso).toBe("2026-05-01");
  });

  it("computeDelta returns kind=pct when prior > 0", () => {
    expect(computeDelta(120, 100)).toEqual({ kind: "pct", value: 20 });
    expect(computeDelta(50, 100)).toEqual({ kind: "pct", value: -50 });
    expect(computeDelta(15, 10)).toEqual({ kind: "pct", value: 50 });
  });

  it("computeDelta returns kind=new when prior=0 and value>0", () => {
    // Bug 6: was 100 in the old deltaPct, which rendered as a fake "+100%".
    expect(computeDelta(5, 0)).toEqual({ kind: "new" });
    expect(computeDelta(1, 0)).toEqual({ kind: "new" });
    expect(computeDelta(10000, 0)).toEqual({ kind: "new" });
  });

  it("computeDelta returns kind=none when prior=0 and value=0", () => {
    expect(computeDelta(0, 0)).toEqual({ kind: "none" });
  });
});
