// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import {
  useProjects,
  useProject,
  useAssets,
  useUOMs,
  useItems,
  useVendors,
  useLocations,
  useContractors,
  useCustomers,
  useItemGroups,
  useGSTCodes,
  useCreateProject,
  useUpdateProject,
  useCreateUOM,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
  useDeleteVendor,
} from "@/hooks/use-masters";

/** Build a fetch stub that records calls and returns the given JSON body. */
function stubFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Last URL passed to fetch. */
function lastUrl(fn: ReturnType<typeof vi.fn>): string {
  const calls = fn.mock.calls;
  return calls[calls.length - 1][0] as string;
}

/** Last RequestInit passed to fetch. */
function lastInit(fn: ReturnType<typeof vi.fn>): RequestInit {
  const calls = fn.mock.calls;
  return (calls[calls.length - 1][1] ?? {}) as RequestInit;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("use-masters query hooks", () => {
  it("useProjects fetches /api/masters/projects and returns the enveloped data", async () => {
    const payload = { data: [{ id: "p1", name: "Tower A" }], total: 1 };
    const fetchFn = stubFetch(payload);

    const { result } = renderHook(() => useProjects(), { wrapper: TestProviders });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(lastUrl(fetchFn)).toBe("/api/masters/projects");
  });

  it("useProjects encodes search, and omits status for the active default", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });

    const { result } = renderHook(
      () => useProjects({ search: "tower", status: "active" }),
      { wrapper: TestProviders },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("/api/masters/projects?");
    expect(url).toContain("search=tower");
    // Active-only is the API default, so the hook sends no status param.
    expect(url).not.toContain("status=");
    expect(url).not.toContain("includeInactive");
  });

  it("useProjects asks for inactive rows via includeInactive when status is 'all'", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });

    const { result } = renderHook(() => useProjects({ status: "all" }), {
      wrapper: TestProviders,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toContain("includeInactive=true");
  });

  it("useProject is disabled when id is null (no fetch)", async () => {
    const fetchFn = stubFetch({ id: "x" });

    const { result } = renderHook(() => useProject(null), { wrapper: TestProviders });

    // enabled:false → stays pending, never fetches
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("useProject fetches the detail URL when an id is supplied", async () => {
    const fetchFn = stubFetch({ id: "p9", name: "Detail" });

    const { result } = renderHook(() => useProject("p9"), { wrapper: TestProviders });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "p9", name: "Detail" });
    expect(lastUrl(fetchFn)).toBe("/api/masters/projects/p9");
  });

  it("useAssets hits /api/masters/assets", async () => {
    const fetchFn = stubFetch({ data: [{ id: "a1" }], total: 1 });
    const { result } = renderHook(() => useAssets(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/assets");
  });

  it.each([
    ["useUOMs", useUOMs, "/api/masters/uom"],
    ["useItems", useItems, "/api/masters/items"],
    ["useVendors", useVendors, "/api/masters/vendors"],
    ["useLocations", useLocations, "/api/masters/locations"],
    ["useContractors", useContractors, "/api/masters/contractors"],
    ["useCustomers", useCustomers, "/api/masters/customers"],
    ["useItemGroups", useItemGroups, "/api/masters/item-groups"],
    ["useGSTCodes", useGSTCodes, "/api/masters/gst"],
  ] as const)("%s targets %s", async (_name, hook, endpoint) => {
    const fetchFn = stubFetch({ data: [] });
    const { result } = renderHook(() => hook(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe(endpoint);
  });
});

describe("use-masters mutation hooks", () => {
  it("useCreateProject POSTs to /api/masters/projects with a JSON body", async () => {
    const fetchFn = stubFetch({ id: "new", name: "New" });

    const { result } = renderHook(() => useCreateProject(), { wrapper: TestProviders });
    result.current.mutate({ name: "New" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/projects");
    const init = lastInit(fetchFn);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "New" });
  });

  it("useUpdateProject PUTs to /api/masters/projects/:id, stripping id from the body", async () => {
    const fetchFn = stubFetch({ id: "p1", name: "Renamed" });

    const { result } = renderHook(() => useUpdateProject(), { wrapper: TestProviders });
    result.current.mutate({ id: "p1", name: "Renamed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/projects/p1");
    const init = lastInit(fetchFn);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Renamed" });
  });

  it("useCreateUOM POSTs to /api/masters/uom", async () => {
    const fetchFn = stubFetch({ id: "u1" });
    const { result } = renderHook(() => useCreateUOM(), { wrapper: TestProviders });
    result.current.mutate({ name: "kg" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/uom");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useCreateItem POSTs to /api/masters/items", async () => {
    const fetchFn = stubFetch({ id: "i1" });
    const { result } = renderHook(() => useCreateItem(), { wrapper: TestProviders });
    result.current.mutate({ name: "Cement" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/items");
  });

  it("useUpdateItem (factory) PUTs to /api/masters/items/:id", async () => {
    const fetchFn = stubFetch({ id: "i1", name: "Steel" });
    const { result } = renderHook(() => useUpdateItem(), { wrapper: TestProviders });
    result.current.mutate({ id: "i1", name: "Steel" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/items/i1");
    expect(lastInit(fetchFn).method).toBe("PUT");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ name: "Steel" });
  });

  it("useDeleteItem (factory) DELETEs /api/masters/items/:id with no body", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteItem(), { wrapper: TestProviders });
    result.current.mutate("i7");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/items/i7");
    expect(lastInit(fetchFn).method).toBe("DELETE");
    expect(lastInit(fetchFn).body).toBeUndefined();
  });

  it("useDeleteVendor (factory) DELETEs /api/masters/vendors/:id", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteVendor(), { wrapper: TestProviders });
    result.current.mutate("v3");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/masters/vendors/v3");
    expect(lastInit(fetchFn).method).toBe("DELETE");
  });
});
