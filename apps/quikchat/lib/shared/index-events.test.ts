import RedisMock from "ioredis-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ioredis", () => import("ioredis-mock"));

import {
  __getIndexedForTest,
  __resetIndexedForTest,
  emitIndexEvent,
  INDEX_CHANNEL,
  type IndexEvent,
} from "./index-events";

const evt: IndexEvent = {
  op: "upsert",
  orgId: "o1",
  app: "quikchat",
  entity: "message",
  id: "m1",
  channelId: "c1",
  text: "hello",
};

const tick = () => new Promise((r) => setTimeout(r, 25));

describe("emitIndexEvent seam", () => {
  let sub: InstanceType<typeof RedisMock>;
  let received: string[];

  beforeEach(async () => {
    received = [];
    sub = new RedisMock();
    await sub.subscribe(INDEX_CHANNEL);
    sub.on("message", (_c: string, m: string) => received.push(m));
    __resetIndexedForTest();
  });
  afterEach(async () => {
    await sub.quit();
    delete process.env.REDIS_URL;
  });

  it("fires the in-process spy AND publishes to Redis when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    await emitIndexEvent(evt);
    expect(__getIndexedForTest()).toHaveLength(1);
    await tick();
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!)).toMatchObject({ op: "upsert", id: "m1", channelId: "c1" });
  });

  it("fires ONLY the spy when REDIS_URL is unset", async () => {
    await emitIndexEvent(evt);
    expect(__getIndexedForTest()).toHaveLength(1);
    await tick();
    expect(received).toHaveLength(0);
  });
});
