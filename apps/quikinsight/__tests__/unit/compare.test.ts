import { describe, expect, it } from "vitest";
import {
  compositeDelta,
  computeDelta,
  deltaTrend,
  formatDelta,
  type CompositePart,
} from "@/lib/data/compare";
import { isComparable, needsSecondCall, supportFor } from "@/lib/period/capability";

describe("deltaTrend", () => {
  it("treats zero as flat, not up", () => {
    // The pre-existing deltaDir() in formatters.ts returns "up" for 0, which
    // renders a green ▲ 0% for an unchanged metric.
    expect(deltaTrend(0)).toBe("flat");
    expect(deltaTrend(1)).toBe("up");
    expect(deltaTrend(-1)).toBe("down");
  });

  it("passes null through and rejects non-finite input", () => {
    expect(deltaTrend(null)).toBeNull();
    expect(deltaTrend(Infinity)).toBeNull();
    expect(deltaTrend(NaN)).toBeNull();
  });
});

describe("computeDelta", () => {
  it("computes a normal percentage change", () => {
    const d = computeDelta(120, 100);
    expect(d.percent).toBe(20);
    expect(d.direction).toBe("up");
    expect(d.availability).toBe("available");
    expect(d.previousValue).toBe(100);
  });

  it("computes a decline", () => {
    const d = computeDelta(80, 100);
    expect(d.percent).toBe(-20);
    expect(d.direction).toBe("down");
  });

  it("reports a genuinely unchanged metric as 0%, available", () => {
    const d = computeDelta(100, 100);
    expect(d.percent).toBe(0);
    expect(d.direction).toBe("flat");
    expect(d.availability).toBe("available");
  });

  it("refuses to invent a percentage from a zero baseline", () => {
    // 0 -> 40 is not "+100%" or "+Infinity"; it has no meaningful percentage.
    const d = computeDelta(40, 0);
    expect(d.percent).toBeNull();
    expect(d.availability).toBe("unavailable");
    expect(Number.isFinite(d.percent as number)).toBe(false);
  });

  it("returns unavailable — never 0 — when there is no baseline", () => {
    const d = computeDelta(40, null);
    expect(d.percent).toBeNull();
    expect(d.percent).not.toBe(0);
    expect(d.availability).toBe("unavailable");
  });

  it("handles a negative baseline by magnitude", () => {
    const d = computeDelta(-50, -100);
    expect(d.percent).toBe(50);
    expect(d.direction).toBe("up");
  });
});

describe("compositeDelta", () => {
  const part = (o: Partial<CompositePart> & { platform: string }): CompositePart => ({
    connected: true,
    current: 100,
    previous: 80,
    ...o,
  });

  it("compares when every connected contributor is comparable", () => {
    const { value, delta } = compositeDelta([
      part({ platform: "ga4", current: 100, previous: 80 }),
      part({ platform: "gsc", current: 50, previous: 20 }),
    ]);
    expect(value).toBe(150);
    expect(delta.availability).toBe("available");
    expect(delta.percent).toBe(50);
  });

  it("refuses to compare when ANY connected contributor is snapshot-only", () => {
    // Diffing the sum would treat LinkedIn as unchanged and understate the move.
    const { value, delta } = compositeDelta([
      part({ platform: "ga4", current: 100, previous: 80 }),
      part({ platform: "linkedin", current: 50, previous: null }),
    ]);
    expect(value).toBe(150);
    expect(delta.availability).toBe("unavailable");
    expect(delta.percent).toBeNull();
  });

  it("ignores disconnected sources on both sides of the sum", () => {
    const { value, delta } = compositeDelta([
      part({ platform: "ga4", current: 100, previous: 80 }),
      part({ platform: "hubspot", connected: false, current: 999, previous: null }),
    ]);
    expect(value).toBe(100);
    expect(delta.availability).toBe("available");
  });

  it("is unavailable when nothing is connected", () => {
    const { value, delta } = compositeDelta([
      part({ platform: "ga4", connected: false }),
    ]);
    expect(value).toBe(0);
    expect(delta.availability).toBe("unavailable");
  });

  it("a CRM-only workspace can never compare", () => {
    const { delta } = compositeDelta([
      part({ platform: "hubspot", previous: null }),
      part({ platform: "zoho", previous: null }),
    ]);
    expect(delta.availability).toBe("unavailable");
  });
});

describe("capability map", () => {
  it("classifies the tiers", () => {
    expect(supportFor("ga4")).toBe("dual-range");
    expect(supportFor("googleAds")).toBe("windowed");
    expect(supportFor("hubspot")).toBe("fixed");
  });

  it("defaults an unknown platform to fixed, so new connectors fail closed", () => {
    expect(supportFor("brand-new-thing")).toBe("fixed");
    expect(isComparable("brand-new-thing")).toBe(false);
  });

  it("only windowed platforms cost an extra call", () => {
    expect(needsSecondCall("ga4")).toBe(false); // dual-range: one call, two ranges
    expect(needsSecondCall("gsc")).toBe(true);
    expect(needsSecondCall("hubspot")).toBe(false); // never fetched twice
  });
});

describe("formatDelta", () => {
  it("renders arrows for movement and a bare 0% for flat", () => {
    expect(formatDelta(computeDelta(120, 100))).toBe("▲ 20%");
    expect(formatDelta(computeDelta(80, 100))).toBe("▼ 20%");
    expect(formatDelta(computeDelta(100, 100))).toBe("0%");
  });

  it("renders nothing when there is no comparison", () => {
    expect(formatDelta(computeDelta(100, null))).toBe("");
  });
});
