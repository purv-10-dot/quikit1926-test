import { afterEach, describe, expect, it, vi } from "vitest";

describe("lead-form-lookups cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("refetches sources after invalidateSourcesCache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "1", name: "Website" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "2", name: "Referral" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSources, invalidateSourcesCache } = await import(
      "@/lib/cache/lead-form-lookups"
    );

    const first = await fetchSources();
    expect(first).toEqual([{ id: "1", name: "Website" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cached = await fetchSources();
    expect(cached).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateSourcesCache();
    const fresh = await fetchSources();
    expect(fresh).toEqual([{ id: "2", name: "Referral" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
