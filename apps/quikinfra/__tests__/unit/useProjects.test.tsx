// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import {
  useBOQ,
  useBOQInfinite,
  useImportBOQ,
  useEstimations,
  useEstimation,
  useCreateEstimation,
  useWorkOrders,
  useWorkOrder,
  useCreateWorkOrder,
  useUpdateWorkOrder,
  useDeleteWorkOrder,
  useDPRs,
  useDPR,
  useCreateDPR,
  useSubmitDPR,
  useRABs,
  useCreateRAB,
  useApproveRAB,
} from "@/hooks/use-projects";

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

describe("use-projects: BOQ", () => {
  it("useBOQ fetches /api/projects/:id/boq when projectId is set", async () => {
    const payload = { data: [{ id: "b1" }], summary: { total: 1 } };
    const fetchFn = stubFetch(payload);
    const { result } = renderHook(() => useBOQ("proj1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(lastUrl(fetchFn)).toBe("/api/projects/proj1/boq");
  });

  it("useBOQ is disabled when projectId is null", () => {
    const fetchFn = stubFetch({});
    const { result } = renderHook(() => useBOQ(null), { wrapper: TestProviders });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("useBOQInfinite (smoke) fetches page 1 with pagination params", async () => {
    const fetchFn = stubFetch({
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 100,
      hasMore: false,
      summary: {},
      lockState: { isLocked: false, lockedAt: null, lockedBy: null, version: 0 },
    });
    const { result } = renderHook(() => useBOQInfinite("proj1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("/api/projects/proj1/boq?");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=100");
  });

  it("useImportBOQ POSTs to /api/projects/:id/boq/import", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useImportBOQ(), { wrapper: TestProviders });
    result.current.mutate({ projectId: "p1", data: { rows: [] } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/p1/boq/import");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ rows: [] });
  });
});

describe("use-projects: Estimations", () => {
  it("useEstimations with projectId encodes the query param", async () => {
    const fetchFn = stubFetch({ data: [] });
    const { result } = renderHook(() => useEstimations("p1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/estimations?projectId=p1");
  });

  it("useEstimations with no project fetches the unscoped list", async () => {
    const fetchFn = stubFetch({ data: [{ id: "e1" }] });
    const { result } = renderHook(() => useEstimations(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/estimations");
  });

  it("useEstimation fetches the detail URL", async () => {
    const fetchFn = stubFetch({ id: "e9" });
    const { result } = renderHook(() => useEstimation("e9"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/estimations/e9");
  });

  it("useCreateEstimation POSTs to /api/projects/:id/estimations", async () => {
    const fetchFn = stubFetch({ id: "e1" });
    const { result } = renderHook(() => useCreateEstimation(), { wrapper: TestProviders });
    result.current.mutate({ projectId: "p1", data: { qty: 1 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/p1/estimations");
    expect(lastInit(fetchFn).method).toBe("POST");
  });
});

describe("use-projects: Work Orders", () => {
  it("useWorkOrders drops status=all and keeps real filters", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => useWorkOrders({ status: "all", projectId: "p1", search: "wo" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("/api/projects/work-orders?");
    expect(url).not.toContain("status=");
    expect(url).toContain("projectId=p1");
    expect(url).toContain("search=wo");
  });

  it("useWorkOrder fetches detail", async () => {
    const fetchFn = stubFetch({ id: "wo1" });
    const { result } = renderHook(() => useWorkOrder("wo1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/work-orders/wo1");
  });

  it("useCreateWorkOrder POSTs to the collection", async () => {
    const fetchFn = stubFetch({ id: "wo1" });
    const { result } = renderHook(() => useCreateWorkOrder(), { wrapper: TestProviders });
    result.current.mutate({ title: "WO" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/work-orders");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useUpdateWorkOrder PUTs to /:id with id stripped", async () => {
    const fetchFn = stubFetch({ id: "wo1" });
    const { result } = renderHook(() => useUpdateWorkOrder(), { wrapper: TestProviders });
    result.current.mutate({ id: "wo1", title: "Edited" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/work-orders/wo1");
    expect(lastInit(fetchFn).method).toBe("PUT");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ title: "Edited" });
  });

  it("useDeleteWorkOrder DELETEs /:id", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteWorkOrder(), { wrapper: TestProviders });
    result.current.mutate("wo5");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/work-orders/wo5");
    expect(lastInit(fetchFn).method).toBe("DELETE");
  });
});

describe("use-projects: DPR", () => {
  it("useDPRs builds the filtered list URL", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => useDPRs({ status: "draft", projectId: "p1", fromDate: "2026-01-01" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("status=draft");
    expect(url).toContain("projectId=p1");
    expect(url).toContain("fromDate=2026-01-01");
  });

  it("useDPR fetches detail", async () => {
    const fetchFn = stubFetch({ id: "d1" });
    const { result } = renderHook(() => useDPR("d1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/dpr/d1");
  });

  it("useCreateDPR POSTs to /api/projects/dpr", async () => {
    const fetchFn = stubFetch({ id: "d1" });
    const { result } = renderHook(() => useCreateDPR(), { wrapper: TestProviders });
    result.current.mutate({ date: "2026-06-01" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/dpr");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useSubmitDPR POSTs to /api/projects/dpr/:id/submit with no body", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitDPR(), { wrapper: TestProviders });
    result.current.mutate("d1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/dpr/d1/submit");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(lastInit(fetchFn).body).toBeUndefined();
  });
});

describe("use-projects: RAB", () => {
  it("useRABs builds the list URL", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => useRABs({ status: "all", projectId: "p1", contractorId: "c1" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).not.toContain("status=");
    expect(url).toContain("projectId=p1");
    expect(url).toContain("contractorId=c1");
  });

  it("useCreateRAB POSTs to /api/projects/rab", async () => {
    const fetchFn = stubFetch({ id: "r1" });
    const { result } = renderHook(() => useCreateRAB(), { wrapper: TestProviders });
    result.current.mutate({ projectId: "p1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/rab");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useApproveRAB POSTs action+comments to /api/projects/rab/:id/approve", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useApproveRAB(), { wrapper: TestProviders });
    result.current.mutate({ id: "r1", action: "reject", comments: "fix qty" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/projects/rab/r1/approve");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({
      action: "reject",
      comments: "fix qty",
    });
  });
});
