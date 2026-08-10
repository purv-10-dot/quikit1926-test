import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChannelListItem } from "@/lib/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

// createClientSpy counts how many times the realtime socket is constructed —
// Bug 1 asserts it's exactly once per session (no disconnect/recreate churn).
// clientHandlers captures the `client.on(event, …)` wiring so tests can fire a
// real inbound socket event; fireClientEvent invokes the registered handler.
const { joinSpy, createClientSpy, clientHandlers, fireClientEvent } = vi.hoisted(() => {
  const handlers = new Map<string, (arg: unknown) => void>();
  return {
    joinSpy: vi.fn().mockResolvedValue(true),
    createClientSpy: vi.fn(),
    clientHandlers: handlers,
    fireClientEvent: (event: string, payload: unknown) => handlers.get(event)?.(payload),
  };
});
vi.mock("@/lib/realtime-client", () => ({
  createRealtimeClient: (...args: unknown[]) => {
    createClientSpy(...args);
    return {
      socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
      on: (event: string, handler: (arg: unknown) => void) => {
        clientHandlers.set(event, handler);
      },
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
    setActiveChannel: vi.fn(),
  }),
}));

import { ChatWorkspace } from "./ChatWorkspace";

const newDm: ChannelListItem = {
  channelId: "new1",
  name: "Bob",
  description: null,
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

// A group the current user is created INTO by someone else (no local POST) —
// exists server-side and appears in the list only once `remotePresent` is set.
const remoteGroup: ChannelListItem = {
  channelId: "grp1",
  name: "Team Rocket",
  description: null,
  avatarUrl: null,
  type: "group",
  visibility: "private",
  isPriority: false,
  unreadCount: 0,
  lastActivityAt: new Date().toISOString(),
  members: [{ id: "u-bob", displayName: "Bob", avatarUrl: null }],
  memberReadAt: {},
  memberDeliveredAt: {},
  lastMessage: null,
};

// Server-fidelity flags for the channels fetch: `created` = a DM we POSTed,
// `remotePresent` = a channel someone else created us into (set by the test
// right before firing the first inbound message).
let created = false;
let remotePresent = false;

beforeEach(() => {
  createClientSpy.mockClear();
  clientHandlers.clear();
  created = false;
  remotePresent = false;
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
      // The list reflects the new DM once POSTed + any channel we've been added to.
      const recent: ChannelListItem[] = [];
      if (created) recent.push(newDm);
      if (remotePresent) recent.push(remoteGroup);
      body = { priority: [], recent };
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
      <ToastProvider>
        <ChatWorkspace
          currentUserId="u-me"
          currentUserName="Alice"
          workspaceName="Acme"
          realtimeUrl="http://rt"
        />
      </ToastProvider>
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

describe("ChatWorkspace group-live (new-channel first message)", () => {
  it("surfaces a channel we were added into when its first message arrives — no refresh", async () => {
    renderWorkspace();
    // Initial list is empty; the group isn't rendered yet.
    await screen.findByRole("button", { name: "New direct message" });
    expect(screen.queryByText("Team Rocket")).not.toBeInTheDocument();

    // The gateway already socket-joined us to the room (server-side); the group
    // now exists on the server. The FIRST message is the only client signal.
    remotePresent = true;
    act(() => {
      fireClientEvent("message", {
        id: "m-grp-1",
        channelId: "grp1",
        senderId: "u-bob",
        actorType: "human",
        type: "Text",
        content: "welcome to the team",
        createdAt: new Date().toISOString(),
      });
    });

    // onMessage saw an unknown channel → invalidated ["channels"] → refetch →
    // the group row appears live.
    expect(await screen.findByText("Team Rocket")).toBeInTheDocument();
  });
});

describe("ChatWorkspace read-advance while the channel stays open", () => {
  it("re-fires the mark-read PATCH on a later message for the still-open channel", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "New direct message" }));
    fireEvent.click(await screen.findByText("Bob"));
    fireEvent.click(screen.getByRole("button", { name: "Start chat" }));
    await waitFor(() => expect(joinSpy).toHaveBeenCalledWith("new1"));
    await screen.findByLabelText("Message");

    const readPatchCount = () =>
      vi
        .mocked(global.fetch)
        .mock.calls.filter(
          ([url, init]) =>
            String(url).includes("/api/channels/new1/read") &&
            (init as RequestInit | undefined)?.method === "PATCH",
        ).length;

    // Opening the channel already fired one (selectChannel → markChannelReadApi).
    const openedCount = readPatchCount();
    expect(openedCount).toBeGreaterThanOrEqual(1);

    // A later message arrives while "new1" is still open — the server's
    // lastReadAt must keep advancing so a future ["channels"] refetch doesn't
    // resurrect a stale unread count for it (see advanceReadForOpenChannel).
    act(() => {
      fireClientEvent("message", {
        id: "m-new1-1",
        channelId: "new1",
        senderId: "u-bob",
        actorType: "human",
        type: "Text",
        content: "still here?",
        data: null,
        parentMessageId: null,
        parentPreview: null,
        isPinned: false,
        reactions: [],
        mentions: [],
        createdAt: new Date().toISOString(),
        editedAt: null,
      });
    });

    await waitFor(() => expect(readPatchCount()).toBeGreaterThan(openedCount), { timeout: 1000 });
  });
});

describe("ChatWorkspace group call live notification (CALL-3 §3)", () => {
  it("ignores call_group_started for a call we ourselves started", async () => {
    renderWorkspace();
    await screen.findByRole("button", { name: "New direct message" });

    act(() => {
      fireClientEvent("call_group_started", {
        callId: "call-1",
        channelId: "grp1",
        initiatorId: "u-me",
        type: "video",
      });
    });

    expect(screen.queryByText(/Group call started/)).not.toBeInTheDocument();
  });

  it("shows a joinable toast when another member starts a group call, and clicking it opens the call window", async () => {
    remotePresent = true;
    renderWorkspace();
    // Get "grp1" → "Team Rocket" into the channels cache before the event fires.
    await screen.findByText("Team Rocket");

    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    act(() => {
      fireClientEvent("call_group_started", {
        callId: "call-1",
        channelId: "grp1",
        initiatorId: "u-bob",
        type: "video",
      });
    });

    // Click the toast's title text; the click bubbles to the toast's own
    // onClick handler (the toast div itself, not this text node, owns it).
    const toastTitle = await screen.findByText(/Group call started in #Team Rocket/);
    fireEvent.click(toastTitle);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0]!;
    expect(String(url)).toContain("/call/call-1?");
    expect(String(url)).toContain("group=1");
    expect(String(url)).toContain("myUserId=u-me");
  });
});
