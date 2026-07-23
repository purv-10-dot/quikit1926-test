import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTest, rateLimit } from "./rate-limit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("rateLimit (in-memory fixed window)", () => {
  beforeEach(() => __resetRateLimitForTest());
  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("allows up to the limit, then blocks with a retry-after", async () => {
    expect((await rateLimit("k", 3, 1000)).ok).toBe(true);
    expect((await rateLimit("k", 3, 1000)).ok).toBe(true);
    expect((await rateLimit("k", 3, 1000)).ok).toBe(true);
    const blocked = await rateLimit("k", 3, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", async () => {
    expect((await rateLimit("k2", 1, 30)).ok).toBe(true);
    expect((await rateLimit("k2", 1, 30)).ok).toBe(false);
    await sleep(45);
    expect((await rateLimit("k2", 1, 30)).ok).toBe(true);
  });

  it("keys are independent", async () => {
    expect((await rateLimit("a", 1, 1000)).ok).toBe(true);
    expect((await rateLimit("b", 1, 1000)).ok).toBe(true);
  });
});
