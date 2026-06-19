import { describe, it, expect, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { refreshListQueries } from "@/lib/react-query/list-cache";

type ListPayload = { data: Array<Record<string, unknown>>; total?: number };

/**
 * Minimal QueryClient stub: setQueriesData runs the updater against a single
 * cached payload we hold here, so we can assert the optimistic-patch logic.
 */
function makeQc(initial: ListPayload | undefined) {
  let cache = initial;
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  const setQueriesData = vi.fn((_filters: unknown, updater: (old: ListPayload | undefined) => ListPayload | undefined) => {
    cache = updater(cache);
    return cache;
  });
  const qc = { setQueriesData, invalidateQueries } as unknown as QueryClient;
  return { qc, getCache: () => cache, invalidateQueries, setQueriesData };
}

describe("refreshListQueries", () => {
  it("removes a row by removedId and decrements total", async () => {
    const { qc, getCache, invalidateQueries } = makeQc({
      data: [{ id: "1" }, { id: "2" }, { id: "3" }],
      total: 3,
    });
    await refreshListQueries(qc, "vendors", { removedId: "2" });
    const c = getCache()!;
    expect(c.data.map((r) => r.id)).toEqual(["1", "3"]);
    expect(c.total).toBe(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["vendors"], refetchType: "active" });
  });

  it("patches an existing row by id with the updatedRow", async () => {
    const { qc, getCache } = makeQc({ data: [{ id: "1", name: "Old" }], total: 1 });
    await refreshListQueries(qc, "vendors", { id: "1", updatedRow: { name: "New" } });
    expect(getCache()!.data[0]).toMatchObject({ id: "1", name: "New" });
  });

  it("leaves data unchanged when the id is not found", async () => {
    const { qc, getCache } = makeQc({ data: [{ id: "1", name: "Old" }], total: 1 });
    await refreshListQueries(qc, "vendors", { id: "99", updatedRow: { name: "New" } });
    expect(getCache()!.data[0]).toMatchObject({ id: "1", name: "Old" });
  });

  it("still invalidates when no opts are passed", async () => {
    const { qc, invalidateQueries, setQueriesData } = makeQc({ data: [], total: 0 });
    await refreshListQueries(qc, "vendors");
    expect(setQueriesData).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["vendors"], refetchType: "active" });
  });

  it("does not throw when the cache is empty (no data)", async () => {
    const { qc, invalidateQueries } = makeQc(undefined);
    await refreshListQueries(qc, "vendors", { removedId: "1" });
    expect(invalidateQueries).toHaveBeenCalled();
  });
});
