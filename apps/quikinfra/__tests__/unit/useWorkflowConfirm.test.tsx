// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import { useWorkflowConfirm } from "@/hooks/use-workflow-confirm";

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

const config = {
  submitUrl: "/api/x/1/submit",
  approveUrl: "/api/x/1/approve",
  invalidateKeys: [["x"], ["x-list"]],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useWorkflowConfirm — local state transitions", () => {
  it("starts idle", () => {
    stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    expect(result.current.action).toBeNull();
    expect(result.current.rejectReason).toBe("");
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("open(kind) sets the action and clears prior reason/error", () => {
    stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    act(() => result.current.setRejectReason("stale"));
    act(() => result.current.open("approve"));
    expect(result.current.action).toBe("approve");
    expect(result.current.rejectReason).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("setRejectReason updates the textarea state", () => {
    stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    act(() => result.current.setRejectReason("missing docs"));
    expect(result.current.rejectReason).toBe("missing docs");
  });

  it("close() resets state when not pending", () => {
    stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    act(() => result.current.open("reject"));
    act(() => result.current.setRejectReason("x"));
    act(() => result.current.close());
    expect(result.current.action).toBeNull();
    expect(result.current.rejectReason).toBe("");
  });
});

describe("useWorkflowConfirm — run()", () => {
  it("submit → POSTs to submitUrl with no body, then clears action", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    act(() => result.current.open("submit"));
    await act(async () => {
      await result.current.run();
    });
    expect(lastUrl(fetchFn)).toBe("/api/x/1/submit");
    expect(lastInit(fetchFn).method).toBe("POST");
    expect(lastInit(fetchFn).body).toBeUndefined();
    expect(result.current.action).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("approve → POSTs { action: 'approve' } to approveUrl", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    act(() => result.current.open("approve"));
    await act(async () => {
      await result.current.run();
    });
    expect(lastUrl(fetchFn)).toBe("/api/x/1/approve");
    const sent = JSON.parse(lastInit(fetchFn).body as string);
    expect(sent.action).toBe("approve");
    expect(sent.comments).toBeUndefined();
  });

  it("reject → POSTs { action: 'reject', comments } with the trimmed reason", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    act(() => result.current.open("reject"));
    act(() => result.current.setRejectReason("  bad qty  "));
    await act(async () => {
      await result.current.run();
    });
    const sent = JSON.parse(lastInit(fetchFn).body as string);
    expect(sent.action).toBe("reject");
    expect(sent.comments).toBe("bad qty");
  });

  it("captures an error message when the server returns !ok", async () => {
    stubFetch({ error: "Workflow blocked" }, false, 422);
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    act(() => result.current.open("submit"));
    await act(async () => {
      await result.current.run();
    });
    await waitFor(() => expect(result.current.error).toBe("Workflow blocked"));
    // Action stays open so the user sees the error in the dialog.
    expect(result.current.action).toBe("submit");
    expect(result.current.pending).toBe(false);
  });

  it("run() is a no-op when no action is open", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useWorkflowConfirm(config), {
      wrapper: TestProviders,
    });
    await act(async () => {
      await result.current.run();
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
