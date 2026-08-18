import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Unit tests for the BullMQ transport (lib/queue/queue.ts). BullMQ + ioredis are
 * mocked so no Redis connection is opened. Modules are reset per test so the
 * lazy singletons (redis/queue) don't leak between cases.
 */
const { QueueMock, addMock, RedisMock } = vi.hoisted(() => {
  const addMock = vi.fn(async () => ({ id: "job-1" }));
  // Function expressions (not arrows) so `new QueueMock()` / `new RedisMock()`
  // are valid constructors under vitest.
  const QueueMock = vi.fn(function () {
    return { add: addMock };
  });
  const RedisMock = vi.fn(function () {
    return {};
  });
  return { QueueMock, addMock, RedisMock };
});

vi.mock("bullmq", () => ({ Queue: QueueMock }));
vi.mock("ioredis", () => ({ default: RedisMock }));

const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

beforeEach(() => {
  vi.resetModules();
  addMock.mockClear();
  QueueMock.mockClear();
  RedisMock.mockClear();
  process.env.REDIS_URL = "redis://localhost:6379";
});

afterEach(() => {
  if (ORIGINAL_REDIS_URL === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = ORIGINAL_REDIS_URL;
});

describe("BullMQ queue", () => {
  it("enqueueEvent adds a job with a colon-free (orgId, dedupeKey) jobId and retry policy", async () => {
    const { enqueueEvent, JOB_NAME } = await import("@/lib/queue/queue");
    const event = {
      app: "quikscale",
      event: "kpi.below_target",
      orgId: "org_A",
      dedupeKey: "kpi:1:w7",
      data: { kpiId: "1" },
    };

    const id = await enqueueEvent(event as never);

    expect(id).toBe("job-1");
    expect(addMock).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = addMock.mock.calls[0] as unknown as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(name).toBe(JOB_NAME);
    expect(payload).toEqual(event);
    // BullMQ forbids ":" in a custom jobId — colons must be stripped.
    expect(opts.jobId).toBe("org_A_kpi_1_w7");
    expect(String(opts.jobId)).not.toContain(":");
    expect(opts.attempts).toBe(3);
  });

  it("reuses a single Queue instance across enqueues (lazy singleton)", async () => {
    const { enqueueEvent } = await import("@/lib/queue/queue");
    const ev = { app: "a", event: "e", orgId: "o", dedupeKey: "d", data: {} };
    await enqueueEvent(ev as never);
    await enqueueEvent({ ...ev, dedupeKey: "d2" } as never);
    expect(QueueMock).toHaveBeenCalledTimes(1);
  });

  it("getRedis throws a clear error when REDIS_URL is unset", async () => {
    delete process.env.REDIS_URL;
    const { getRedis } = await import("@/lib/queue/queue");
    expect(() => getRedis()).toThrow(/REDIS_URL is not set/);
  });
});
