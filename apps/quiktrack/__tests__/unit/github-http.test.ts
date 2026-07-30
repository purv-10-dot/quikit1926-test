import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithRetry,
  isRetryableStatus,
  retryAfterMs,
} from "@/lib/services/github/http";

const noSleep = () => Promise.resolve();

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : "{}", { status, headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isRetryableStatus", () => {
  it("retries 429/408/5xx, not other 4xx or 2xx", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("retryAfterMs", () => {
  it("reads Retry-After seconds", () => {
    const h = new Headers({ "retry-after": "3" });
    expect(retryAfterMs(h, 0)).toBe(3000);
  });
  it("reads X-RateLimit-Reset only when remaining is 0", () => {
    const now = 1_000_000;
    const reset = String(Math.floor(now / 1000) + 5); // 5s out
    const h = new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset });
    expect(retryAfterMs(h, now)).toBe(5000);
  });
  it("ignores reset when remaining > 0", () => {
    const h = new Headers({ "x-ratelimit-remaining": "12", "x-ratelimit-reset": "999" });
    expect(retryAfterMs(h, 0)).toBeNull();
  });
  it("returns null with no hint headers", () => {
    expect(retryAfterMs(new Headers(), 0)).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  it("returns immediately on a 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchWithRetry("https://x", {}, { sleep: noSleep });
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchWithRetry("https://x", {}, { sleep: noSleep });
    expect(out.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchWithRetry("https://x", {}, { sleep: noSleep, baseDelayMs: 1 });
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts and returns the last retryable response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(429));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchWithRetry("https://x", {}, { sleep: noSleep, maxAttempts: 3 });
    expect(out.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a thrown network error, then rethrows if it never recovers", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithRetry("https://x", {}, { sleep: noSleep, maxAttempts: 2 }),
    ).rejects.toThrow(/ECONNRESET/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers from a network error on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchWithRetry("https://x", {}, { sleep: noSleep });
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits the hinted Retry-After instead of blind backoff", async () => {
    const waits: number[] = [];
    const sleep = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithRetry("https://x", {}, { sleep, baseDelayMs: 999 });
    expect(waits[0]).toBe(2000); // honoured the hint, not the 999ms base
  });
});
