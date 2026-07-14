import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChannelListItem } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// createClientSpy counts how many times the realtime socket is constructed —
// Bug 1 asserts it's exactly once per session (no disconnect/recreate churn).
const { joinSpy, createClientSpy } = vi.hoisted(() => ({
  joinSpy: vi.fn().mockResolvedValue(true),
  createClientSpy: vi.fn(),
}));
vi.mock("@/lib/realtime-client", () => ({
  createRealtimeClient: (...args: unknown[]) => {
    createClientSpy(...args);
    return {
      socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
      on: vi.fn(),
      off: vi.fn(),
      join: joinSpy,
      typing: vi.fn(),
      disconnect: vi.fn(),
    };
  },
  fetchRealtimeToken: vi.fn(),
}));

vi.mock("../calling/CallHandler", () => ({
  CallHandler: () => null,
}));

// `useNotifications` returns a FRESH object on every call — this mimics the real
// context, which re-memoizes whenever notification state changes (new
// notification, unread tick, read-mark). Bug 1: the socket effect must NOT
// depend on this identity, or it recreates the socket on every such change.
vi.mock("@/components/notifications/NotificationProvider", () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
  useNotifications: () => ({
    feed: [],
    unreadCount: 0,
    byChannel: {},
    hasMore: false,
    loading: false,
    osPermission: "granted",
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    markChannelRead: vi.fn(),
    clearAll: vi.fn(),
    loadMore: vi.fn(),
    openChannel: vi.fn(),
    requestOsPermission: vi.fn(),
    attachClient: vi.fn(),
    registerChannelOpener: vi.fn(),
  }),
}));

import { ChatWorkspace } from "./ChatWorkspace";

const newDm: ChannelListItem = {
  channelId: "new1",
  name: "Bob",
  avatarUrl: null,
  type: "dm",
  visibility: "private",
  isPriority: false,
  unreadCount: 0,
  lastActivityAt: new Date().toISOString(),
  members: [{ id: "u-bob", displayName: "Bob", avatarUrl: null }],
  memberReadAt: {},
  memberDeliveredAt: {},
  lastMessage: null,
};

beforeEach(() => {
  createClientSpy.mockClear();
  let created = false;
  global.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = {};
    if (u.includes("/api/users")) body = [{ id: "u-bob", displayName: "Bob", avatarUrl: null }];
    else if (u.includes("/api/channels") && method === "POST") {
      created = true;
      body = newDm;
    } else if (u.includes("/messages")) body = [];
    else if (u.match(/\/api\/channels(\?|$)/)) {
      // The list reflects the new DM once it's been created (server fidelity).
      body = { priority: [], recent: created ? [newDm] : [] };
    } else body = {};
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderWorkspace() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChatWorkspace
        currentUserId="u-me"
        currentUserName="Alice"
        workspaceName="Acme"
        realtimeUrl="http://rt"
      />
    </QueryClientProvider>,
  );
}

describe("ChatWorkspace selectChannel glue", () => {
  it("after creating a DM: joins the realtime room and opens the channel", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "New direct message" }));
    fireEvent.click(await screen.findByText("Bob"));
    fireEvent.click(screen.getByRole("button", { name: "Start chat" }));

    await waitFor(() => expect(joinSpy).toHaveBeenCalledWith("new1"));
    // Channel opened → its composer is shown.
    expect(await screen.findByLabelText("Message")).toBeInTheDocument();
  });
});

describe("ChatWorkspace socket lifecycle (Bug 1)", () => {
  it("creates the realtime client once across re-renders and a channel switch", async () => {
    renderWorkspace();
    await screen.findByRole("button", { name: "New direct message" });
    expect(createClientSpy).toHaveBeenCalledTimes(1);

    // A channel switch drives many re-renders, each with a fresh `notifications`
    // identity. Before the fix the socket effect depended on that identity and
    // tore down + recreated the socket; now it must stay at one construction.
    fireEvent.click(screen.getByRole("button", { name: "New direct message" }));
    fireEvent.click(await screen.findByText("Bob"));
    fireEvent.click(screen.getByRole("button", { name: "Start chat" }));
    await waitFor(() => expect(joinSpy).toHaveBeenCalledWith("new1"));
    await screen.findByLabelText("Message");

    expect(createClientSpy).toHaveBeenCalledTimes(1);
  });
});
