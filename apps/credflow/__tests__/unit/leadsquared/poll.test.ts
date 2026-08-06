import { describe, it, expect, vi } from "vitest";
import { pollLeadSquaredInbound, type PollDeps } from "@/lib/services/leadsquared/poll";
import { DEFAULT_FIELD_MAP_CONFIG } from "@/lib/services/leadsquared/field-map";

const NOW = new Date("2026-07-20T12:00:00.000Z");

function setup(over: Partial<PollDeps> = {}) {
  const getRecentlyModifiedLeads = vi.fn().mockResolvedValue([]);
  const processBatch = vi.fn().mockResolvedValue([]);
  const getWatermark = vi.fn().mockResolvedValue(null);
  const setWatermark = vi.fn().mockResolvedValue(undefined);
  const deps: PollDeps = {
    client: { getRecentlyModifiedLeads },
    processBatch: processBatch as unknown as PollDeps["processBatch"],
    resolveTenant: () => "t1",
    resolveFieldMap: async () => DEFAULT_FIELD_MAP_CONFIG,
    getWatermark,
    setWatermark,
    now: () => NOW,
    windowMs: 600_000, // 10 min
    overlapMs: 120_000, // 2 min
    ...over,
  };
  return { deps, getRecentlyModifiedLeads, processBatch, getWatermark, setWatermark };
}

describe("pollLeadSquaredInbound", () => {
  it("first run (no watermark): looks back windowMs and advances the watermark to `to`", async () => {
    const { deps, getRecentlyModifiedLeads, setWatermark } = setup();
    const res = await pollLeadSquaredInbound(deps);

    const [from, to] = getRecentlyModifiedLeads.mock.calls[0];
    expect(to).toEqual(NOW);
    expect(from).toEqual(new Date("2026-07-20T11:50:00.000Z")); // to − 10min window
    expect(setWatermark).toHaveBeenCalledWith("t1", NOW);
    expect(res).toMatchObject({ tenantId: "t1", fetched: 0, applied: 0 });
  });

  it("subsequent run: from = watermark − overlapMs", async () => {
    const { deps, getRecentlyModifiedLeads } = setup({
      getWatermark: vi.fn().mockResolvedValue(new Date("2026-07-20T11:58:00.000Z")),
    });
    await pollLeadSquaredInbound(deps);
    const [from] = getRecentlyModifiedLeads.mock.calls[0];
    expect(from).toEqual(new Date("2026-07-20T11:56:00.000Z")); // watermark − 2min overlap
  });

  it("feeds fetched leads through processInboundBatch and counts applied (created/updated)", async () => {
    const leads = [{ ProspectID: "P1" }, { ProspectID: "P2" }, { ProspectID: "P3" }];
    const processBatch = vi.fn().mockResolvedValue([
      { ok: true, action: "created" },
      { ok: true, action: "updated" },
      { ok: true, action: "skipped-echo" },
    ]);
    const { deps } = setup({
      client: { getRecentlyModifiedLeads: vi.fn().mockResolvedValue(leads) },
      processBatch: processBatch as unknown as PollDeps["processBatch"],
    });

    const res = await pollLeadSquaredInbound(deps);

    expect(processBatch).toHaveBeenCalledWith("t1", leads, { fieldMap: DEFAULT_FIELD_MAP_CONFIG });
    expect(res).toMatchObject({ fetched: 3, applied: 2 }); // echo doesn't count as applied
  });

  it("empty result: does not call processBatch but still advances the watermark", async () => {
    const processBatch = vi.fn();
    const { deps, setWatermark } = setup({
      processBatch: processBatch as unknown as PollDeps["processBatch"],
    });
    await pollLeadSquaredInbound(deps);
    expect(processBatch).not.toHaveBeenCalled();
    expect(setWatermark).toHaveBeenCalledWith("t1", NOW);
  });

  it("fetch error: does NOT advance the watermark (window is retried next run)", async () => {
    const setWatermark = vi.fn();
    const { deps } = setup({
      client: { getRecentlyModifiedLeads: vi.fn().mockRejectedValue(new Error("LSQ 500")) },
      setWatermark,
    });
    await expect(pollLeadSquaredInbound(deps)).rejects.toThrow("LSQ 500");
    expect(setWatermark).not.toHaveBeenCalled();
  });
});
