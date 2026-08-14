import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPipelineConfig,
  fetchSources,
  invalidatePipelineConfigCache,
  invalidateSourcesCache,
} from "@/lib/cache/lead-form-lookups";

describe("lead-form-lookups caches", () => {
  beforeEach(() => {
    invalidateSourcesCache();
    invalidatePipelineConfigCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refetches after invalidateSourcesCache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "1", name: "Website" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: "1", name: "Website" },
            { id: "2", name: "Referral" },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSources();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateSourcesCache();

    const next = await fetchSources();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next).toEqual([
      { id: "1", name: "Website" },
      { id: "2", name: "Referral" },
    ]);
  });

  it("refetches pipeline after invalidatePipelineConfigCache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          leadPipelineConfig: { stages: ["New"], statuses: ["Open"], dependentRules: {} },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          leadPipelineConfig: {
            stages: ["New", "Qualified"],
            statuses: ["Open"],
            dependentRules: {},
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchPipelineConfig();
    expect(first?.stages).toEqual(["New"]);

    invalidatePipelineConfigCache();

    const next = await fetchPipelineConfig();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next?.stages).toEqual(["New", "Qualified"]);
  });

  it("serves from cache until invalidateSourcesCache(), then refetches fresh data", async () => {
    // fetchSources() takes no args; the cache is bypassed via
    // invalidateSourcesCache(), not a { force } option. This exercises the
    // real bypass: cached call does not refetch; post-invalidation call does
    // and returns the fresh payload.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "1", name: "A" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "1", name: "A" }, { id: "2", name: "B" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchSources();
    expect(first).toEqual([{ id: "1", name: "A" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Cached: a second call without invalidation must NOT refetch.
    await fetchSources();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // invalidateSourcesCache() forces the next call to refetch fresh data.
    invalidateSourcesCache();
    const next = await fetchSources();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next).toEqual([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ]);
  });
});
