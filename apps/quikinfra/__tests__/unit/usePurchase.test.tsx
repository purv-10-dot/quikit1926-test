// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import {
  usePurchaseRequisitions,
  usePurchaseRequisition,
  useCreatePR,
  useSubmitPR,
  usePurchaseOrders,
  usePurchaseOrder,
  useCreatePO,
  useSubmitPO,
  useGRNs,
  useGRN,
  useCreateGRN,
  useSubmitGRN,
  useApproveDocument,
} from "@/hooks/use-purchase";

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

describe("use-purchase: Requisitions", () => {
  it("usePurchaseRequisitions builds the list URL, dropping status=all", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => usePurchaseRequisitions({ status: "all", projectId: "p1", search: "x" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("/api/purchase/requisitions?");
    expect(url).not.toContain("status=");
    expect(url).toContain("projectId=p1");
    expect(url).toContain("search=x");
  });

  it("usePurchaseRequisition fetches detail", async () => {
    const fetchFn = stubFetch({ id: "pr1" });
    const { result } = renderHook(() => usePurchaseRequisition("pr1"), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/requisitions/pr1");
  });

  it("useCreatePR POSTs to the collection", async () => {
    const fetchFn = stubFetch({ id: "pr1" });
    const { result } = renderHook(() => useCreatePR(), { wrapper: TestProviders });
    result.current.mutate({ note: "n" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/requisitions");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useSubmitPR POSTs to /:id/submit", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitPR(), { wrapper: TestProviders });
    result.current.mutate("pr1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/requisitions/pr1/submit");
    expect(lastInit(fetchFn).method).toBe("POST");
  });
});

describe("use-purchase: Orders", () => {
  it("usePurchaseOrders includes vendorId filter", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => usePurchaseOrders({ vendorId: "v1" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toContain("vendorId=v1");
  });

  it("usePurchaseOrder fetches detail", async () => {
    const fetchFn = stubFetch({ id: "po1" });
    const { result } = renderHook(() => usePurchaseOrder("po1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/orders/po1");
  });

  it("useCreatePO POSTs to the collection", async () => {
    const fetchFn = stubFetch({ id: "po1" });
    const { result } = renderHook(() => useCreatePO(), { wrapper: TestProviders });
    result.current.mutate({ vendorId: "v1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/orders");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useSubmitPO accepts a bare id and submits with no body", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitPO(), { wrapper: TestProviders });
    result.current.mutate("po1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/orders/po1/submit");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(lastInit(fetchFn).body).toBeUndefined();
  });

  it("useSubmitPO accepts { id, emailHtmlBody } and ships the body", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitPO(), { wrapper: TestProviders });
    result.current.mutate({ id: "po2", emailHtmlBody: "<p>Hi</p>" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/orders/po2/submit");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({
      emailHtmlBody: "<p>Hi</p>",
    });
  });
});

describe("use-purchase: GRN", () => {
  it("useGRNs builds the list URL", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useGRNs({ projectId: "p1" }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toContain("/api/purchase/grn?");
  });

  it("useGRN fetches detail", async () => {
    const fetchFn = stubFetch({ id: "g1" });
    const { result } = renderHook(() => useGRN("g1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/grn/g1");
  });

  it("useCreateGRN POSTs to the collection", async () => {
    const fetchFn = stubFetch({ id: "g1" });
    const { result } = renderHook(() => useCreateGRN(), { wrapper: TestProviders });
    result.current.mutate({ poId: "po1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/grn");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useSubmitGRN POSTs to /:id/submit", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitGRN(), { wrapper: TestProviders });
    result.current.mutate("g1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/grn/g1/submit");
    expect(lastInit(fetchFn).method).toBe("POST");
  });
});

describe("use-purchase: Approvals", () => {
  it("useApproveDocument POSTs to /api/approvals/:id/:action with comments body", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useApproveDocument(), { wrapper: TestProviders });
    result.current.mutate({ id: "doc1", action: "approve", comments: "ok" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/approvals/doc1/approve");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ comments: "ok" });
  });

  it("useApproveDocument routes the action into the URL (return)", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useApproveDocument(), { wrapper: TestProviders });
    result.current.mutate({ id: "doc2", action: "return" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/approvals/doc2/return");
  });
});
