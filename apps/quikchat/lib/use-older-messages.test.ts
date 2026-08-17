// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageDto } from "@/lib/shared";

const h = vi.hoisted(() => ({ fetchMessages: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, fetchMessages: h.fetchMessages };
});

import { MESSAGES_PAGE_SIZE } from "@/lib/api";
import { useOlderMessages } from "./use-older-messages";

const CHANNEL = "chan-1";

function msg(id: string, minute: number): MessageDto {
  return {
    id,
    channelId: CHANNEL,
    senderId: "u-2",
    type: "Text",
    content: id,
    createdAt: new Date(Date.UTC(2026, 1, 1, 10, minute)).toISOString(),
  } as MessageDto;
}

/** A full page — anything shorter signals end-of-history. */
function fullPage(prefix: string): MessageDto[] {
  return Array.from({ length: MESSAGES_PAGE_SIZE }, (_, i) => msg(`${prefix}-${i}`, i));
}

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: qc }, children);
}

function seed(messages: MessageDto[]) {
  qc.setQueryData<MessageDto[]>(["messages", CHANNEL], messages);
}

beforeEach(() => {
  h.fetchMessages.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("useOlderMessages — cursor advancement", () => {
  it("pages with the oldest cached id, then advances to the newly-prepended oldest", async () => {
    seed([msg("b", 50), msg("c", 51)]);
    h.fetchMessages.mockResolvedValueOnce(fullPage("older"));

    const { result } = renderHook(() => useOlderMessages(CHANNEL), { wrapper });

    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.loadingOlder).toBe(false));

    // First page used the oldest cached id.
    expect(h.fetchMessages).toHaveBeenNthCalledWith(1, CHANNEL, "b");

    // The prepended page's oldest row becomes the next cursor — proving the
    // cursor tracks the cache rather than being pinned to the original id.
    h.fetchMessages.mockResolvedValueOnce([]);
    act(() => result.current.loadOlder());
    await waitFor(() => expect(h.fetchMessages).toHaveBeenCalledTimes(2));
    expect(h.fetchMessages).toHaveBeenNthCalledWith(2, CHANNEL, "older-0");
  });

  it("never uses an optimistic temp id as a cursor", async () => {
    // A temp row is unknown to the server and would take the new 400 path.
    seed([msg("real", 10), { ...msg("temp-999", 99), id: "temp-999" }]);
    h.fetchMessages.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useOlderMessages(CHANNEL), { wrapper });
    act(() => result.current.loadOlder());

    await waitFor(() => expect(h.fetchMessages).toHaveBeenCalledTimes(1));
    expect(h.fetchMessages).toHaveBeenCalledWith(CHANNEL, "real");
  });
});

describe("useOlderMessages — end of history", () => {
  it("latches atEnd on a short page and issues no further requests", async () => {
    seed([msg("b", 50)]);
    h.fetchMessages.mockResolvedValueOnce([msg("a", 1)]); // 1 < PAGE_SIZE

    const { result } = renderHook(() => useOlderMessages(CHANNEL), { wrapper });
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.atEnd).toBe(true));

    // The bug this guards: an endless loop of empty fetches at the top of
    // every conversation. Repeated triggers must stay at one call.
    act(() => result.current.loadOlder());
    act(() => result.current.loadOlder());
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it("does not latch atEnd while full pages keep coming", async () => {
    seed([msg("b", 50)]);
    h.fetchMessages.mockResolvedValueOnce(fullPage("p1"));

    const { result } = renderHook(() => useOlderMessages(CHANNEL), { wrapper });
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.loadingOlder).toBe(false));

    expect(result.current.atEnd).toBe(false);
  });

  it("latches atEnd when a request fails, so a persistent error cannot loop", async () => {
    seed([msg("b", 50)]);
    h.fetchMessages.mockRejectedValueOnce(new Error("GET … → 400"));

    const { result } = renderHook(() => useOlderMessages(CHANNEL), { wrapper });
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.atEnd).toBe(true));

    act(() => result.current.loadOlder());
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);
  });
});

describe("useOlderMessages — concurrency guard", () => {
  it("collapses a burst of scroll-driven calls into one in-flight request", async () => {
    seed([msg("b", 50)]);
    let release: (v: MessageDto[]) => void = () => {};
    h.fetchMessages.mockReturnValueOnce(
      new Promise<MessageDto[]>((res) => {
        release = res;
      }),
    );

    const { result } = renderHook(() => useOlderMessages(CHANNEL), { wrapper });

    // Scroll fires on every frame of a drag — all of these land before the
    // first request settles.
    act(() => {
      result.current.loadOlder();
      result.current.loadOlder();
      result.current.loadOlder();
    });
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(fullPage("p1"));
    });
    await waitFor(() => expect(result.current.loadingOlder).toBe(false));
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);
  });
});

describe("useOlderMessages — cache integrity", () => {
  it("prepends older pages ascending and de-duped, leaving newer rows in place", async () => {
    seed([msg("b", 50), msg("c", 51)]);
    // Server page is newest-first and overlaps `b` — both must be handled.
    h.fetchMessages.mockResolvedValueOnce([msg("b", 50), msg("a2", 20), msg("a1", 10)]);

    const { result } = renderHook(() => useOlderMessages(CHANNEL), { wrapper });
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.loadingOlder).toBe(false));

    expect(qc.getQueryData<MessageDto[]>(["messages", CHANNEL])!.map((m) => m.id)).toEqual([
      "a1",
      "a2",
      "b",
      "c",
    ]);
  });

  it("resets atEnd when the channel changes", async () => {
    seed([msg("b", 50)]);
    h.fetchMessages.mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(({ id }) => useOlderMessages(id), {
      wrapper,
      initialProps: { id: CHANNEL },
    });
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.atEnd).toBe(true));

    rerender({ id: "chan-2" });
    await waitFor(() => expect(result.current.atEnd).toBe(false));
  });
});
