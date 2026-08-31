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
  window.sessionStorage.clear();
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

  it("a fresh mount on a default slug starts in Basic mode when no sticky preference is set", () => {
    global.fetch = mockFetchRouter({});
    const { result } = renderHook(() => useFilterResults("my-open"));
    expect(result.current.mode).toBe("basic");
    expect(result.current.tql).toBe("");
  });
});

/**
 * The Basic/TQL choice is meant to persist as an admin clicks between
 * different default filters in the sidebar — each is its own page
 * (app/(dashboard)/filters/[id]/page.tsx keys <FilterView> by params.id), so
 * this can only be exercised by actually unmounting and mounting a fresh hook
 * instance per "navigation", not by rerendering the same one.
 */
describe("useFilterResults — TQL mode is sticky across a simulated page navigation", () => {
  it("choosing TQL on one default filter makes the next one mount straight into TQL, pre-filled with its own equivalent query", async () => {
    global.fetch = mockFetchRouter({
      "/api/filters/my-open": { success: true, data: [], total: 0, meta: {} },
      "/api/filters/reported-by-me": { success: true, data: [], total: 0, meta: {} },
    });

    const first = renderHook(() => useFilterResults("my-open"));
    act(() => {
      first.result.current.setMode("tql");
    });
    expect(first.result.current.mode).toBe("tql");
    first.unmount();

    // A genuinely fresh hook instance, as a real page navigation would create.
    const second = renderHook(() => useFilterResults("reported-by-me"));
    expect(second.result.current.mode).toBe("tql");
    expect(second.result.current.tql).toBe("reporter = currentUser() ORDER BY updated DESC");
  });

  it("does not carry a saved filter's own TQL mode into the sticky preference for later default filters", async () => {
    global.fetch = mockFetchRouter({
      "/api/saved-filters/sf_6": {
        success: true,
        data: { id: "sf_6", name: "T", criteria: { tql: 'priority = "HIGH"' } },
      },
      "/api/filters/all": { success: true, data: [], total: 0, meta: {} },
      "/api/filters/my-open": { success: true, data: [], total: 0, meta: {} },
    });

    const savedHook = renderHook(() => useFilterResults("sf_6"));
    await waitFor(() => expect(savedHook.result.current.mode).toBe("tql"));
    savedHook.unmount();

    // The saved filter's TQL mode is a property of that filter, not a
    // browsing preference — a later default filter should still start Basic.
    const nextHook = renderHook(() => useFilterResults("my-open"));
    expect(nextHook.result.current.mode).toBe("basic");
  });
});
