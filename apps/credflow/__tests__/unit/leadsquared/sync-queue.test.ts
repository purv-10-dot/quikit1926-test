import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — referenced inside the (hoisted) vi.mock factories below.
const h = vi.hoisted(() => ({
  addMock: vi.fn(),
  isRedisEnabledMock: vi.fn(() => true),
}));

vi.mock("bullmq", () => ({
  // Regular function so `new Queue(...)` works (arrow fns can't construct).
  Queue: vi.fn(function () {
    return { add: h.addMock };
  }),
}));

vi.mock("@/lib/db/redis", () => ({
  isRedisEnabled: h.isRedisEnabledMock,
  getQueueRedis: vi.fn(() => ({})),
}));

import {
  enqueueLeadSquaredSync,
  enqueueLeadSquaredSyncSafe,
} from "@/lib/queue/leadsquared-queue";

const INPUT = { tenantId: "tenant-1", crmLeadId: "lead-1" };

beforeEach(() => {
  // Global setup clears call history; re-establish default impls each test.
  h.isRedisEnabledMock.mockReturnValue(true);
  h.addMock.mockResolvedValue({ id: "job-1" });
});

describe("enqueueLeadSquaredSync", () => {
  it("adds a 'push' job with origin hardcoded to 'crm'", async () => {
    const id = await enqueueLeadSquaredSync(INPUT);

    expect(id).toBe("job-1");
    expect(h.addMock).toHaveBeenCalledOnce();
    const [jobName, data] = h.addMock.mock.calls[0];
    expect(jobName).toBe("push");
    expect(data).toEqual({
      tenantId: "tenant-1",
      crmLeadId: "lead-1",
      origin: "crm",
    });
  });
});

describe("enqueueLeadSquaredSyncSafe", () => {
  it("returns the job id on success", async () => {
    await expect(enqueueLeadSquaredSyncSafe(INPUT)).resolves.toBe("job-1");
  });

  it("returns null and does not enqueue when Redis is disabled", async () => {
    h.isRedisEnabledMock.mockReturnValue(false);

    await expect(enqueueLeadSquaredSyncSafe(INPUT)).resolves.toBeNull();
    expect(h.addMock).not.toHaveBeenCalled();
  });

  it("swallows a queue error — resolves null, never throws into the caller", async () => {
    h.addMock.mockRejectedValue(new Error("redis down"));

    await expect(enqueueLeadSquaredSyncSafe(INPUT)).resolves.toBeNull();
  });

  it("resolves null (does not hang) when the enqueue stalls past the timeout", async () => {
    vi.useFakeTimers();
    // Simulate ioredis' offline-queue hang: add() never settles.
    h.addMock.mockReturnValue(new Promise(() => {}));

    const promise = enqueueLeadSquaredSyncSafe(INPUT, { timeoutMs: 2500 });
    await vi.advanceTimersByTimeAsync(2500);

    await expect(promise).resolves.toBeNull();
    vi.useRealTimers();
  });
});
