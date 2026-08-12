import { beforeEach, describe, expect, it } from "vitest";
import { getCounters, incr, resetCounters } from "@/lib/services/leadsquared/telemetry";

beforeEach(() => resetCounters());

describe("telemetry counters", () => {
  it("increments and accumulates by name", () => {
    incr("outbound.enqueue.ok");
    incr("outbound.enqueue.ok");
    incr("outbound.enqueue.dropped", 3);
    expect(getCounters()).toEqual({
      "outbound.enqueue.dropped": 3,
      "outbound.enqueue.ok": 2,
    });
  });

  it("resets cleanly", () => {
    incr("x");
    resetCounters();
    expect(getCounters()).toEqual({});
  });
});
