// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import {
  useUsers,
  useRoles,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@/hooks/use-users";

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
function lastUrl(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls[fn.mock.calls.length - 1][0] as string;
}
function lastInit(fn: ReturnType<typeof vi.fn>) {
  return (fn.mock.calls[fn.mock.calls.length - 1][1] ?? {}) as RequestInit;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("use-users", () => {
  it("useUsers fetches /api/settings/users and returns enveloped data", async () => {
    const payload = { data: [{ id: "u1", name: "Jo" }], total: 1 };
    const fetchFn = stubFetch(payload);
    const { result } = renderHook(() => useUsers(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(lastUrl(fetchFn)).toBe("/api/settings/users");
  });

  it("useUsers encodes the search param", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useUsers({ search: "ann" }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/settings/users?search=ann");
  });

  it("useRoles fetches /api/org/roles and returns the success envelope", async () => {
    const payload = {
      success: true,
      data: [{ id: "r1", name: "Admin", memberCount: 2 }],
    };
    const fetchFn = stubFetch(payload);
    const { result } = renderHook(() => useRoles(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(lastUrl(fetchFn)).toBe("/api/org/roles");
  });

  it("useCreateUser POSTs to /api/settings/users", async () => {
    const fetchFn = stubFetch({ id: "u1" });
    const { result } = renderHook(() => useCreateUser(), { wrapper: TestProviders });
    result.current.mutate({ name: "New", email: "n@x.io" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/settings/users");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({
      name: "New",
      email: "n@x.io",
    });
  });

  it("useUpdateUser PUTs to /api/settings/users/:id with id stripped", async () => {
    const fetchFn = stubFetch({ id: "u1" });
    const { result } = renderHook(() => useUpdateUser(), { wrapper: TestProviders });
    result.current.mutate({ id: "u1", name: "Renamed" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/settings/users/u1");
    expect(lastInit(fetchFn).method).toBe("PUT");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ name: "Renamed" });
  });

  it("useDeleteUser DELETEs /api/settings/users/:id", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteUser(), { wrapper: TestProviders });
    result.current.mutate("u9");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/settings/users/u9");
    expect(lastInit(fetchFn).method).toBe("DELETE");
  });
});
