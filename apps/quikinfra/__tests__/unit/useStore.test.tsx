// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import {
  useStockRegister,
  useMaterialIssues,
  useMaterialIssue,
  useCreateMaterialIssue,
  useUpdateMaterialIssue,
  useGatePasses,
  useGatePass,
  useCreateGatePass,
  useGoodReturns,
  useCreateGoodReturn,
  useStockTransfers,
  useCreateStockTransfer,
  useStockReconciliations,
  useSubmitStockReconciliation,
  useApproveStockReconciliation,
  useDieselLogs,
  useCreateDieselLog,
} from "@/hooks/use-store";

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

describe("use-store: Stock Register", () => {
  it("useStockRegister sets lowStockOnly=true only when truthy", async () => {
    const fetchFn = stubFetch({ data: [], total: 0, summary: {} });
    const { result } = renderHook(
      () => useStockRegister({ projectId: "p1", lowStockOnly: true }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("/api/store/stock-register?");
    expect(url).toContain("projectId=p1");
    expect(url).toContain("lowStockOnly=true");
  });

  it("useStockRegister omits lowStockOnly when false", async () => {
    const fetchFn = stubFetch({ data: [], total: 0, summary: {} });
    const { result } = renderHook(
      () => useStockRegister({ lowStockOnly: false }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).not.toContain("lowStockOnly");
  });
});

describe("use-store: Material Issues", () => {
  it("useMaterialIssues drops status=all", async () => {
    const fetchFn = stubFetch({ data: [] });
    const { result } = renderHook(() => useMaterialIssues({ status: "all" }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/issues");
  });

  it("useMaterialIssue is disabled with no id", () => {
    const fetchFn = stubFetch({});
    const { result } = renderHook(() => useMaterialIssue(undefined), {
      wrapper: TestProviders,
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("useMaterialIssue fetches detail when id present", async () => {
    const fetchFn = stubFetch({ id: "mi1" });
    const { result } = renderHook(() => useMaterialIssue("mi1"), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/issues/mi1");
  });

  it("useCreateMaterialIssue POSTs to /api/store/issues", async () => {
    const fetchFn = stubFetch({ id: "mi1" });
    const { result } = renderHook(() => useCreateMaterialIssue(), {
      wrapper: TestProviders,
    });
    result.current.mutate({ qty: 5 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/issues");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useUpdateMaterialIssue PATCHes /:id with id stripped from body", async () => {
    const fetchFn = stubFetch({ id: "mi1" });
    const { result } = renderHook(() => useUpdateMaterialIssue(), {
      wrapper: TestProviders,
    });
    result.current.mutate({ id: "mi1", qty: 9 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/issues/mi1");
    expect(lastInit(fetchFn).method).toBe("PATCH");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ qty: 9 });
  });
});

describe("use-store: Gate Pass / Good Return / Transfer", () => {
  it("useGatePasses drops status=all and type=all", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => useGatePasses({ status: "all", type: "all", projectId: "p1" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).not.toContain("status=");
    expect(url).not.toContain("type=");
    expect(url).toContain("projectId=p1");
  });

  it("useGatePass fetches detail", async () => {
    const fetchFn = stubFetch({ id: "gp1" });
    const { result } = renderHook(() => useGatePass("gp1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/gate-passes/gp1");
  });

  it("useCreateGatePass POSTs", async () => {
    const fetchFn = stubFetch({ id: "gp1" });
    const { result } = renderHook(() => useCreateGatePass(), { wrapper: TestProviders });
    result.current.mutate({ type: "inward" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/gate-passes");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useGoodReturns hits the list endpoint", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useGoodReturns(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/good-returns");
  });

  it("useCreateGoodReturn POSTs", async () => {
    const fetchFn = stubFetch({ id: "gr1" });
    const { result } = renderHook(() => useCreateGoodReturn(), { wrapper: TestProviders });
    result.current.mutate({ items: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/good-returns");
  });

  it("useStockTransfers hits the list endpoint", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useStockTransfers(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/transfers");
  });

  it("useCreateStockTransfer POSTs", async () => {
    const fetchFn = stubFetch({ id: "st1" });
    const { result } = renderHook(() => useCreateStockTransfer(), {
      wrapper: TestProviders,
    });
    result.current.mutate({ from: "a", to: "b" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/transfers");
  });
});

describe("use-store: Stock Reconciliation", () => {
  it("useStockReconciliations hits the list endpoint", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useStockReconciliations(), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/reconciliations");
  });

  it("useSubmitStockReconciliation POSTs an empty body object to /:id/submit", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitStockReconciliation(), {
      wrapper: TestProviders,
    });
    result.current.mutate("sr1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/reconciliations/sr1/submit");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({});
  });

  it("useApproveStockReconciliation POSTs action+comments to /:id/approve", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useApproveStockReconciliation(), {
      wrapper: TestProviders,
    });
    result.current.mutate({ id: "sr1", action: "approve", comments: "ok" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/reconciliations/sr1/approve");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({
      action: "approve",
      comments: "ok",
    });
  });
});

describe("use-store: Diesel Log", () => {
  it("useDieselLogs builds the filtered URL", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => useDieselLogs({ projectId: "p1", machineryId: "m1" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("projectId=p1");
    expect(url).toContain("machineryId=m1");
  });

  it("useCreateDieselLog POSTs", async () => {
    const fetchFn = stubFetch({ id: "dl1" });
    const { result } = renderHook(() => useCreateDieselLog(), { wrapper: TestProviders });
    result.current.mutate({ litres: 50 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/store/diesel-logs");
    expect(lastInit(fetchFn).method).toBe("POST");
  });
});
