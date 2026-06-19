// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import {
  useWbsTasks,
  useCreateWbsTask,
  useUpdateWbsTask,
  useDeleteWbsTask,
} from "@/hooks/use-wbs";

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

describe("use-wbs", () => {
  it("useWbsTasks fetches /api/projects/:id/wbs/tasks", async () => {
    const payload = { data: [{ id: "t1", wbsCode: "1.1", name: "Excavate" }] };
    const fetchFn = stubFetch(payload);
    const { result } = renderHook(() => useWbsTasks("p1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(lastUrl(fetchFn)).toBe("/api/projects/p1/wbs/tasks");
  });

  it("useWbsTasks is disabled when projectId is empty", () => {
    const fetchFn = stubFetch({ data: [] });
    const { result } = renderHook(() => useWbsTasks(""), { wrapper: TestProviders });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("useCreateWbsTask POSTs to the project's tasks collection", async () => {
    const fetchFn = stubFetch({ id: "t1" });
    const { result } = renderHook(() => useCreateWbsTask("p1"), {
      wrapper: TestProviders,
    });
    result.current.mutate({ name: "New task", wbsCode: "1.2" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/p1/wbs/tasks");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({
      name: "New task",
      wbsCode: "1.2",
    });
  });

  it("useUpdateWbsTask PATCHes /:id with id stripped from the body", async () => {
    const fetchFn = stubFetch({ id: "t1" });
    const { result } = renderHook(() => useUpdateWbsTask("p1"), {
      wrapper: TestProviders,
    });
    result.current.mutate({ id: "t1", progress: 50 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/p1/wbs/tasks/t1");
    expect(lastInit(fetchFn).method).toBe("PATCH");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ progress: 50 });
  });

  it("useDeleteWbsTask DELETEs /:id", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteWbsTask("p1"), {
      wrapper: TestProviders,
    });
    result.current.mutate("t9");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/p1/wbs/tasks/t9");
    expect(lastInit(fetchFn).method).toBe("DELETE");
  });
});
