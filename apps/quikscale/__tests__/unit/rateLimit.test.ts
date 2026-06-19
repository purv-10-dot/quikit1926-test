import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  rateLimit,
  MemoryRateLimitStore,
  getClientIp,
  _resetDefaultStore,
  LIMITS,
} from "@/lib/api/rateLimit";

beforeEach(() => {
  _resetDefaultStore();
});

describe("rateLimit — basic allow / deny", () => {
  it("allows the first hit", () => {
    const r = rateLimit({
      routeKey: "test",
      clientKey: "u1",
      limit: 3,
      windowMs: 60_000,
    });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it("allows up to `limit` hits in the same window", () => {
    const opts = {
      routeKey: "test",
      clientKey: "u1",
      limit: 3,
      windowMs: 60_000,
    };
    const r1 = rateLimit(opts);
    const r2 = rateLimit(opts);
    const r3 = rateLimit(opts);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
  });

  it("denies the (limit + 1)th hit in the same window", () => {
    const opts = {
      routeKey: "test",
      clientKey: "u1",
      limit: 2,
      windowMs: 60_000,
    };
    rateLimit(opts);
    rateLimit(opts);
    const r3 = rateLimit(opts);
    expect(r3.ok).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("isolates clients from each other", () => {
    const base = { routeKey: "test", limit: 1, windowMs: 60_000 };
    const a = rateLimit({ ...base, clientKey: "u1" });
    const b = rateLimit({ ...base, clientKey: "u2" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("isolates routes from each other", () => {
    const base = { clientKey: "u1", limit: 1, windowMs: 60_000 };
    const a = rateLimit({ ...base, routeKey: "r1" });
    const b = rateLimit({ ...base, routeKey: "r2" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});

describe("rateLimit — window rollover", () => {
  afterEach(() => vi.useRealTimers());

  it("resets the counter when the window changes", () => {
    vi.useFakeTimers();
    // Pin to a deterministic window start
    vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));
    const opts = {
      routeKey: "test",
      clientKey: "u1",
      limit: 2,
      windowMs: 60_000, // 1-minute window
    };
    rateLimit(opts);
    rateLimit(opts);
    expect(rateLimit(opts).ok).toBe(false);

    // advance past the window boundary
    vi.setSystemTime(new Date("2026-04-11T12:01:05.000Z"));
    const r = rateLimit(opts);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(1);
  });
});

describe("MemoryRateLimitStore", () => {
  it("counts hits per bucket key", () => {
    const store = new MemoryRateLimitStore();
    const ws = Date.now();
    expect(store.hit("a", ws, 60_000)).toBe(1);
    expect(store.hit("a", ws, 60_000)).toBe(2);
    expect(store.hit("a", ws, 60_000)).toBe(3);
  });

  it("treats different window starts as separate buckets", () => {
    const store = new MemoryRateLimitStore();
    const ws1 = Date.now();
    const ws2 = ws1 + 60_000;
    store.hit("a", ws1, 60_000);
    store.hit("a", ws1, 60_000);
    expect(store.hit("a", ws2, 60_000)).toBe(1);
  });

  it("reset() clears the map", () => {
    const store = new MemoryRateLimitStore();
    store.hit("a", Date.now(), 60_000);
    store.reset();
    expect(store.hit("a", Date.now(), 60_000)).toBe(1);
  });
});

describe("getClientIp", () => {
  const makeReq = (h: Record<string, string>) => ({
    headers: { get: (name: string) => h[name.toLowerCase()] ?? null },
  });

  it("uses x-forwarded-for first", () => {
    const r = makeReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(r)).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip", () => {
    const r = makeReq({ "x-real-ip": "9.9.9.9" });
    expect(getClientIp(r)).toBe("9.9.9.9");
  });
  it("returns 'anonymous' when no headers are present", () => {
    const r = makeReq({});
    expect(getClientIp(r)).toBe("anonymous");
  });
});

describe("LIMITS presets", () => {
  it("login preset is reasonable (10 / 15min)", () => {
    expect(LIMITS.login.limit).toBe(10);
    expect(LIMITS.login.windowMs).toBe(15 * 60 * 1000);
  });
  it("kpiWrite preset is 30 / minute", () => {
    expect(LIMITS.kpiWrite.limit).toBe(30);
    expect(LIMITS.kpiWrite.windowMs).toBe(60_000);
  });
});
