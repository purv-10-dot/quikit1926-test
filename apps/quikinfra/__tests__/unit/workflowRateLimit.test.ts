import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimit, LIMITS } from "@/lib/workflow/rate-limit";

// Minimal NextRequest stand-in: rate-limit only reads opts.req.headers.get(...)
function fakeReq(headers: Record<string, string> = {}): any {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

function clearStore() {
  const g = globalThis as any;
  if (g.__qcRateLimitStore) (g.__qcRateLimitStore as Map<string, unknown>).clear();
}

const ORIGINAL_DISABLED = process.env.RATE_LIMIT_DISABLED;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  clearStore();
  delete process.env.RATE_LIMIT_DISABLED;
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_DISABLED === undefined) delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = ORIGINAL_DISABLED;
  (process.env as any).NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("rateLimit — counting", () => {
  it("allows requests up to the limit, then blocks", async () => {
    const opts = { req: fakeReq({ "x-real-ip": "1.1.1.1" }), bucket: "t1", limit: 3, windowMs: 60_000 };

    const r1 = await rateLimit(opts);
    expect(r1.blocked).toBe(false);
    expect(r1.remaining).toBe(2);

    const r2 = await rateLimit(opts);
    expect(r2.blocked).toBe(false);
    expect(r2.remaining).toBe(1);

    const r3 = await rateLimit(opts);
    expect(r3.blocked).toBe(false);
    expect(r3.remaining).toBe(0);

    const r4 = await rateLimit(opts);
    expect(r4.blocked).toBe(true);
    expect(r4.remaining).toBe(0);
    expect(r4.response).toBeDefined();
  });

  it("the blocked response is a 429 with Retry-After + X-RateLimit headers", async () => {
    const opts = { req: fakeReq({ "x-real-ip": "9.9.9.9" }), bucket: "t2", limit: 1, windowMs: 60_000 };
    await rateLimit(opts);
    const blocked = await rateLimit(opts);

    expect(blocked.blocked).toBe(true);
    const res = blocked.response!;
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("keys independently per identifier", async () => {
    const base = { bucket: "t3", limit: 1, windowMs: 60_000 };
    const a = await rateLimit({ ...base, req: fakeReq(), identifier: "user-a" });
    const b = await rateLimit({ ...base, req: fakeReq(), identifier: "user-b" });
    expect(a.blocked).toBe(false);
    expect(b.blocked).toBe(false);
    // second hit for user-a is blocked, user-b still has its own window
    const a2 = await rateLimit({ ...base, req: fakeReq(), identifier: "user-a" });
    expect(a2.blocked).toBe(true);
  });

  it("keys independently per bucket", async () => {
    const id = "same-ip";
    const r1 = await rateLimit({ req: fakeReq(), bucket: "bucketA", limit: 1, windowMs: 60_000, identifier: id });
    const r2 = await rateLimit({ req: fakeReq(), bucket: "bucketB", limit: 1, windowMs: 60_000, identifier: id });
    expect(r1.blocked).toBe(false);
    expect(r2.blocked).toBe(false);
  });

  it("falls back to client IP from x-forwarded-for (first hop)", async () => {
    const opts = {
      req: fakeReq({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }),
      bucket: "t4",
      limit: 1,
      windowMs: 60_000,
    };
    expect((await rateLimit(opts)).blocked).toBe(false);
    expect((await rateLimit(opts)).blocked).toBe(true);
  });
});

describe("rateLimit — window reset", () => {
  it("resets the count after the window elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const opts = { req: fakeReq({ "x-real-ip": "2.2.2.2" }), bucket: "win", limit: 1, windowMs: 1000 };

    expect((await rateLimit(opts)).blocked).toBe(false);
    expect((await rateLimit(opts)).blocked).toBe(true);

    // advance past the window — bucket.resetAt < now => fresh bucket
    vi.setSystemTime(2000);
    const after = await rateLimit(opts);
    expect(after.blocked).toBe(false);
  });
});

describe("rateLimit — bypasses", () => {
  it("never blocks when RATE_LIMIT_DISABLED=true", async () => {
    process.env.RATE_LIMIT_DISABLED = "true";
    const opts = { req: fakeReq(), bucket: "off", limit: 1, windowMs: 60_000, identifier: "x" };
    expect((await rateLimit(opts)).blocked).toBe(false);
    expect((await rateLimit(opts)).blocked).toBe(false);
    expect((await rateLimit(opts)).remaining).toBe(1);
  });

  it("bypasses for x-e2e-test header outside production", async () => {
    (process.env as any).NODE_ENV = "test";
    const opts = { req: fakeReq({ "x-e2e-test": "1" }), bucket: "e2e", limit: 1, windowMs: 60_000 };
    expect((await rateLimit(opts)).blocked).toBe(false);
    expect((await rateLimit(opts)).blocked).toBe(false);
  });
});

describe("LIMITS presets", () => {
  it("exposes canonical buckets", () => {
    expect(LIMITS.LOGIN.bucket).toBe("auth.login");
    expect(LIMITS.IMPORT_BOQ.limit).toBe(5);
    expect(LIMITS.APPROVAL.windowMs).toBe(60_000);
  });
});
