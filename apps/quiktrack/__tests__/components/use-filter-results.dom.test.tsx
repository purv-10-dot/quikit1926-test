// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFilterResults } from "@/app/(dashboard)/filters/[id]/_components/use-filter-results";

/**
 * Phase 4 — saved-filter round-tripping between Basic (ToolbarState) and TQL
 * ({ tql: string }) criteria shapes. `criteria.tql` presence is the sole
 * discriminant (see isTqlCriteria in use-filter-results.ts).
 */

function mockFetchRouter(handlers: Record<string, unknown>) {
  return vi.fn((url: string) => {
    for (const [prefix, body] of Object.entries(handlers)) {
      if (url.includes(prefix)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: null }) });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFilterResults — saved TQL filter", () => {
  it("loads a saved filter whose criteria is { tql } into TQL mode with the exact query text", async () => {
    global.fetch = mockFetchRouter({
      "/api/saved-filters/sf_1": {
        success: true,
        data: { id: "sf_1", name: "My TQL filter", criteria: { tql: 'status != "Done" AND assignee = currentUser()' } },
      },
      "/api/filters/all": { success: true, data: [], total: 0, meta: { title: "My TQL filter" } },
    });

    const { result } = renderHook(() => useFilterResults("sf_1"));

    await waitFor(() => expect(result.current.mode).toBe("tql"));
    expect(result.current.tql).toBe('status != "Done" AND assignee = currentUser()');
  });

  it("loads a saved filter whose criteria is a ToolbarState into Basic mode", async () => {
    global.fetch = mockFetchRouter({
      "/api/saved-filters/sf_2": {
        success: true,
        data: {
          id: "sf_2",
          name: "My basic filter",
          criteria: { type: ["BUG"], statusCategory: [], assignee: "me", search: "login" },
        },
      },
      "/api/filters/all": { success: true, data: [], total: 0, meta: { title: "My basic filter" } },
    });

    const { result } = renderHook(() => useFilterResults("sf_2"));

    await waitFor(() => expect(result.current.mode).toBe("basic"));
    expect(result.current.toolbar.type).toEqual(["BUG"]);
    expect(result.current.toolbar.assignee).toBe("me");
    expect(result.current.search).toBe("login");
  });

  it("fetches with a tql= param (not toolbar params) once loaded in TQL mode", async () => {
    const fetchSpy = mockFetchRouter({
      "/api/saved-filters/sf_3": {
        success: true,
        data: { id: "sf_3", name: "T", criteria: { tql: 'priority = "HIGH"' } },
      },
      "/api/filters/all": { success: true, data: [], total: 0, meta: {} },
    });
    global.fetch = fetchSpy;

    renderHook(() => useFilterResults("sf_3"));

    await waitFor(() => {
      const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const resultsCall = calls.find((c) => String(c[0]).includes("/api/filters/all"));
      expect(resultsCall).toBeDefined();
      expect(String(resultsCall![0])).toContain("tql=priority");
      expect(String(resultsCall![0])).not.toContain("statusCategory");
    });
  });

  it("surfaces a tql-specific error (with position) separately from the basic error", async () => {
    global.fetch = mockFetchRouter({
      "/api/saved-filters/sf_4": {
        success: true,
        data: { id: "sf_4", name: "T", criteria: { tql: "status =" } },
      },
      "/api/filters/all": {
        success: false,
        error: 'Expected a value but found ""',
        position: { pos: 8, line: 1, col: 9 },
      },
    });

    const { result } = renderHook(() => useFilterResults("sf_4"));

    await waitFor(() => expect(result.current.tqlError).not.toBeNull());
    expect(result.current.tqlError?.message).toMatch(/Expected a value/);
    expect(result.current.tqlError?.position).toEqual({ pos: 8, line: 1, col: 9 });
    expect(result.current.error).toBeNull();
  });

  it("switching mode to tql via setMode fetches with tql= once tql text is set", async () => {
    const fetchSpy = mockFetchRouter({
      "/api/filters/all": { success: true, data: [], total: 0, meta: {} },
    });
    global.fetch = fetchSpy;

    const { result } = renderHook(() => useFilterResults("all"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setMode("tql");
      result.current.setTql('type = "BUG"');
    });

    await waitFor(() => {
      const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const resultsCall = calls.find(
        (c) => String(c[0]).includes("/api/filters/all") && String(c[0]).includes("tql="),
      );
      expect(resultsCall).toBeDefined();
    });
  });

  it("reseeds to Basic mode and clears tql when navigating away from a saved filter to a default slug", async () => {
    global.fetch = mockFetchRouter({
      "/api/filters/my-open": { success: true, data: [], total: 0, meta: {} },
    });

    const { result, rerender } = renderHook(({ id }) => useFilterResults(id), {
      initialProps: { id: "sf_5" },
    });

    act(() => {
      result.current.setMode("tql");
      result.current.setTql('status = "Done"');
    });
    expect(result.current.mode).toBe("tql");

    rerender({ id: "my-open" });

    await waitFor(() => expect(result.current.mode).toBe("basic"));
    expect(result.current.tql).toBe("");
  });
});
