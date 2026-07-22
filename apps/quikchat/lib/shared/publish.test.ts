import RedisMock from "ioredis-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publishFanout lazily `import("ioredis")`; point it at the in-memory mock.
vi.mock("ioredis", () => import("ioredis-mock"));

import {
  __getPublishedForTest,
  __resetPublishedForTest,
  FANOUT_CHANNEL,
  publishFanout,
  type FanoutEvent,
} from "./publish";

const evt: FanoutEvent = {
  orgId: "o1",
  channelId: "c1",
  event: "message",
  payload: { id: "m1", content: "hi" },
};

const tick = () => new Promise((r) => setTimeout(r, 25));

describe("publishFanout seam", () => {
  let sub: InstanceType<typeof RedisMock>;
  let received: string[];

  beforeEach(async () => {
    received = [];
    sub = new RedisMock();
    await sub.subscribe(FANOUT_CHANNEL);
    sub.on("message", (_channel: string, message: string) => received.push(message));
    __resetPublishedForTest();
  });

  afterEach(async () => {
    await sub.quit();
    delete process.env.REDIS_URL;
  });

  it("fires the in-process spy AND publishes to Redis when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    await publishFanout(evt);

    expect(__getPublishedForTest()).toHaveLength(1);
    await tick();
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!)).toMatchObject({ orgId: "o1", event: "message" });
  });

  it("fires ONLY the in-process spy when REDIS_URL is unset (S02 stays hermetic)", async () => {
    // REDIS_URL is unset (vitest.setup deletes it; afterEach re-deletes).
    await publishFanout(evt);

    expect(__getPublishedForTest()).toHaveLength(1);
    await tick();
    expect(received).toHaveLength(0);
  });
});
