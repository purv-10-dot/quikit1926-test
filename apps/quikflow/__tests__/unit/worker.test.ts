import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit test for the worker's unit of work (worker/handler.ts). The engine is
 * mocked; we only assert the handler forwards the job's event to dispatchEvent
 * and reports the run count. Importing handler.ts (not main.ts) avoids starting
 * a live BullMQ worker.
 */
const { dispatchEvent } = vi.hoisted(() => ({ dispatchEvent: vi.fn() }));
vi.mock("@/lib/engine", () => ({ dispatchEvent }));

import { handleEvent } from "@/worker/handler";

beforeEach(() => {
  dispatchEvent.mockReset();
});

describe("worker handleEvent", () => {
  it("dispatches the event and returns the number of runs", async () => {
    dispatchEvent.mockResolvedValue([{ runId: "r1" }, { runId: "r2" }]);
    const event = {
      app: "quikscale",
      event: "kpi.below_target",
      orgId: "org_A",
      dedupeKey: "k1",
      data: {},
    };

    const result = await handleEvent({ data: event } as never);

    expect(dispatchEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({ runs: 2 });
  });

  it("returns zero runs when no workflows match", async () => {
    dispatchEvent.mockResolvedValue([]);
    const result = await handleEvent({
      data: { app: "a", event: "e", orgId: "o", dedupeKey: "d", data: {} },
    } as never);
    expect(result).toEqual({ runs: 0 });
  });
});
