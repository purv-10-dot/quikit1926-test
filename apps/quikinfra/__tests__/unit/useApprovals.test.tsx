// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import {
  usePendingApprovals,
  useApprovalHistory,
  useApproveAction,
  useIndents,
  useIndent,
  useCreateIndent,
  useSubmitIndent,
  useDeleteIndent,
  useRFQs,
  useRFQ,
  useCreateRFQ,
  useSubmitRFQ,
  useDeleteRFQ,
  useUsers,
  useWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
} from "@/hooks/use-approvals";

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

describe("use-approvals: pending + history + action", () => {
  it("usePendingApprovals drops entityType=all", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => usePendingApprovals({ entityType: "all", projectId: "p1" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("/api/approvals/pending?");
    expect(url).not.toContain("entityType=");
    expect(url).toContain("projectId=p1");
  });

  it("useApprovalHistory fetches /api/approvals/:id/history and is disabled with null id", async () => {
    const fetchFn = stubFetch({ data: [] });
    const disabled = renderHook(() => useApprovalHistory(null), {
      wrapper: TestProviders,
    });
    expect(disabled.result.current.fetchStatus).toBe("idle");
    expect(fetchFn).not.toHaveBeenCalled();

    const { result } = renderHook(() => useApprovalHistory("inst1"), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/approvals/inst1/history");
  });

  it("useApproveAction POSTs to /api/approvals/:id/:action with comments", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useApproveAction(), { wrapper: TestProviders });
    result.current.mutate({ id: "a1", action: "reject", comments: "no" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/approvals/a1/reject");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ comments: "no" });
  });
});

describe("use-approvals: Indents", () => {
  it("useIndents builds the list URL", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useIndents({ projectId: "p1" }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toContain("/api/purchase/indents?");
  });

  it("useIndent fetches detail", async () => {
    const fetchFn = stubFetch({ id: "ind1" });
    const { result } = renderHook(() => useIndent("ind1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/indents/ind1");
  });

  it("useCreateIndent POSTs", async () => {
    const fetchFn = stubFetch({ id: "ind1" });
    const { result } = renderHook(() => useCreateIndent(), { wrapper: TestProviders });
    result.current.mutate({ items: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/indents");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useSubmitIndent POSTs to /:id/submit", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitIndent(), { wrapper: TestProviders });
    result.current.mutate("ind1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/indents/ind1/submit");
  });

  it("useDeleteIndent DELETEs /:id", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteIndent(), { wrapper: TestProviders });
    result.current.mutate("ind1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/indents/ind1");
    expect(lastInit(fetchFn).method).toBe("DELETE");
  });
});

describe("use-approvals: RFQ", () => {
  it("useRFQs builds the list URL", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useRFQs({ status: "all" }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/rfqs");
  });

  it("useRFQ fetches detail", async () => {
    const fetchFn = stubFetch({ id: "rfq1" });
    const { result } = renderHook(() => useRFQ("rfq1"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/rfqs/rfq1");
  });

  it("useCreateRFQ POSTs", async () => {
    const fetchFn = stubFetch({ id: "rfq1" });
    const { result } = renderHook(() => useCreateRFQ(), { wrapper: TestProviders });
    result.current.mutate({ vendors: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/rfqs");
  });

  it("useSubmitRFQ with a bare id submits without a body", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitRFQ(), { wrapper: TestProviders });
    result.current.mutate("rfq1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/rfqs/rfq1/submit");
    expect(lastInit(fetchFn).body).toBeUndefined();
  });

  it("useSubmitRFQ with emailHtmlBodies ships the override map", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useSubmitRFQ(), { wrapper: TestProviders });
    result.current.mutate({ id: "rfq2", emailHtmlBodies: { v1: "<p>Hi</p>" } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/rfqs/rfq2/submit");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({
      emailHtmlBodies: { v1: "<p>Hi</p>" },
    });
  });

  it("useDeleteRFQ DELETEs /:id", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteRFQ(), { wrapper: TestProviders });
    result.current.mutate("rfq1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/purchase/rfqs/rfq1");
    expect(lastInit(fetchFn).method).toBe("DELETE");
  });
});

describe("use-approvals: Users + Workflows", () => {
  it("useUsers (settings) builds /api/settings/users with search+role", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useUsers({ search: "jo", role: "admin" }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("/api/settings/users?");
    expect(url).toContain("search=jo");
    expect(url).toContain("role=admin");
  });

  it("useWorkflows maps null projectId to projectId=default", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(() => useWorkflows({ projectId: null }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toContain("projectId=default");
  });

  it("useWorkflows passes through a concrete projectId", async () => {
    const fetchFn = stubFetch({ data: [], total: 0 });
    const { result } = renderHook(
      () => useWorkflows({ entityType: "PO", projectId: "p1" }),
      { wrapper: TestProviders },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = lastUrl(fetchFn);
    expect(url).toContain("entityType=PO");
    expect(url).toContain("projectId=p1");
  });

  it("useCreateWorkflow POSTs", async () => {
    const fetchFn = stubFetch({ id: "wf1" });
    const { result } = renderHook(() => useCreateWorkflow(), { wrapper: TestProviders });
    result.current.mutate({ entityType: "PO" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/settings/workflows");
    expect(lastInit(fetchFn).method).toBe("POST");
  });

  it("useUpdateWorkflow PATCHes /:id with id stripped", async () => {
    const fetchFn = stubFetch({ id: "wf1" });
    const { result } = renderHook(() => useUpdateWorkflow(), { wrapper: TestProviders });
    result.current.mutate({ id: "wf1", steps: 2 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/settings/workflows/wf1");
    expect(lastInit(fetchFn).method).toBe("PATCH");
    expect(JSON.parse(lastInit(fetchFn).body as string)).toEqual({ steps: 2 });
  });

  it("useDeleteWorkflow DELETEs /:id", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeleteWorkflow(), { wrapper: TestProviders });
    result.current.mutate("wf1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastUrl(fetchFn)).toBe("/api/settings/workflows/wf1");
    expect(lastInit(fetchFn).method).toBe("DELETE");
  });
});
