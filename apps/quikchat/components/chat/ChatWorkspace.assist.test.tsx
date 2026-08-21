// Assist loader lifecycle (Bug: the "thinking" loader died before the answer
// was on screen). The property under test: the streamed text lands in the
// message cache in the SAME batched commit that clears the bubble — there must
// be no rendered frame with neither — and the realtime echo de-dupes in place
// by clientMessageId whether it arrives before or after `done`. Plus: the
// loader clears on error/abort, and a superseded turn can never touch the live
// one.
//
// ConversationView is stubbed: the real one mounts TipTap, which can't be
// driven in jsdom (see Composer.assist.test.tsx). The stub exposes the assist
// props ChatWorkspace owns, which is exactly the surface under test.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AssistApprovalRequest, ChannelListItem, MessageDto } from "@/lib/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AssistHandlerSet {
  onDelta: (t: string) => void;
  onDone: (p: {
    text: string;
    agentRunId: string;
    clientMessageId: string;
    sources?: unknown[];
  }) => void;
  onError: (m: string) => void;
  onApprovalNeeded?: (r: AssistApprovalRequest) => void;
}
interface AssistTurn {
  channelId: string;
  handlers: AssistHandlerSet;
  signal: AbortSignal;
}
interface Frame {
  streaming: string | null;
  contents: string[];
}
interface StubProps {
  messages?: MessageDto[];
  assistStreaming?: string | null;
  assistError?: string | null;
  onAssist?: (prompt: string) => void;
  onStopAssist?: () => void;
  assistApproval?: AssistApprovalRequest | null;
  onDismissAssistApproval?: () => void;
}

const { clientHandlers, fireClientEvent, joinSpy, turns, frames } = vi.hoisted(() => {
  const handlers = new Map<string, (arg: unknown) => void>();
  return {
    clientHandlers: handlers,
    fireClientEvent: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    joinSpy: vi.fn().mockResolvedValue(true),
    turns: [] as AssistTurn[],
    frames: [] as Frame[],
  };
});

vi.mock("@/lib/assist-client", () => ({
  streamAssist: (
    channelId: string,
    _body: unknown,
    handlers: AssistHandlerSet,
    signal: AbortSignal,
  ) => {
    turns.push({ channelId, handlers, signal });
    return new Promise<void>(() => {}); // driven by the test, never self-resolves
  },
}));

vi.mock("./ConversationView", () => ({
  ConversationView: (props: StubProps) => {
    const streaming = props.assistStreaming ?? null;
    frames.push({ streaming, contents: (props.messages ?? []).map((m) => m.content) });
    return (
      <div>
        <button type="button" onClick={() => props.onAssist?.("summarize")}>
          ask
        </button>
        <button type="button" onClick={() => props.onStopAssist?.()}>
          stop assist
        </button>
        <div data-testid="loader">{streaming === null ? "off" : `on:${streaming}`}</div>
        <div data-testid="assist-err">{props.assistError ?? ""}</div>
        <div data-testid="assist-approval">{props.assistApproval?.requestId ?? ""}</div>
        <button type="button" onClick={() => props.onDismissAssistApproval?.()}>
          dismiss approval
        </button>
        <ul data-testid="messages">
          {(props.messages ?? []).map((m) => (
            <li key={m.id} data-id={m.id} data-cmid={m.clientMessageId ?? ""}>
              {m.content}
            </li>
          ))}
        </ul>
      </div>
    );
  },
}));

vi.mock("@/lib/realtime-client", () => ({
  createRealtimeClient: () => ({
    socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    on: (event: string, handler: (arg: unknown) => void) => {
      clientHandlers.set(event, handler);
    },
    off: vi.fn(),
    join: joinSpy,
    typing: vi.fn(),
    disconnect: vi.fn(),
  }),
  fetchRealtimeToken: vi.fn(),
}));

vi.mock("../calling/CallHandler", () => ({ CallHandler: () => null }));

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
    registerNewChatOpener: vi.fn(),
    openNewChat: vi.fn(),
    setActiveChannel: vi.fn(),
  }),
}));

import { ChatWorkspace } from "./ChatWorkspace";

const dm: ChannelListItem = {
  channelId: "c1",
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

const DONE = { text: "Here is the summary.", agentRunId: "r1", clientMessageId: "assist-r1" };

/** The persisted ai_agent row as it arrives over the realtime socket. */
const echo = {
  id: "m-server-1",
  channelId: "c1",
  senderId: "quikchat-assistant-bot",
  actorType: "ai_agent",
  type: "Text",
  content: DONE.text,
  data: null,
  parentMessageId: null,
  parentPreview: null,
  isPinned: false,
  reactions: [],
  mentions: [],
  clientMessageId: DONE.clientMessageId,
  createdAt: new Date().toISOString(),
  editedAt: null,
};

let created = false;

beforeEach(() => {
  clientHandlers.clear();
  turns.length = 0;
  frames.length = 0;
  created = false;
  global.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = {};
    if (u.includes("/api/users")) body = [{ id: "u-bob", displayName: "Bob", avatarUrl: null }];
    else if (u.includes("/api/channels") && method === "POST") {
      created = true;
      body = dm;
    } else if (u.includes("/messages")) body = [];
    else if (u.match(/\/api\/channels(\?|$)/)) body = { priority: [], recent: created ? [dm] : [] };
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render, open a DM, and wait for its (empty) message list to settle. */
async function openChannel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ChatWorkspace
        currentUserId="u-me"
        currentUserName="Alice"
        realtimeUrl="http://rt"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "New direct message" }));
  fireEvent.click(await screen.findByText("Bob"));
  fireEvent.click(screen.getByRole("button", { name: "Start chat" }));
  await waitFor(() => expect(joinSpy).toHaveBeenCalledWith("c1"));
  // messagesQuery settled → the assist merge writes into a live cache entry.
  await waitFor(() => expect(frames.at(-1)?.contents).toEqual([]));
}

const rows = () => Array.from(screen.getByTestId("messages").querySelectorAll("li"));
const loader = () => screen.getByTestId("loader").textContent;

/**
 * Deliver the persisted ai_agent row over the socket. Async act: a cache write
 * with no accompanying React state update reaches the component through React
 * Query's (batched) notifyManager, so the re-render lands on the next tick.
 */
async function emitEcho() {
  act(() => fireClientEvent("message", echo));
  await waitFor(() => expect(rows().some((li) => li.dataset.id === echo.id)).toBe(true));
}

describe("ChatWorkspace assist loader lifecycle", () => {
  it("keeps the loader on through every streamed chunk", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    expect(loader()).toBe("on:");

    for (const [chunk, sofar] of [
      ["Here ", "Here "],
      ["is the ", "Here is the "],
      ["summary.", "Here is the summary."],
    ]) {
      act(() => turns[0]!.handlers.onDelta(chunk!));
      expect(loader()).toBe(`on:${sofar}`);
    }
    expect(rows()).toHaveLength(0);
  });

  it("on done: the answer lands in the same commit that clears the loader", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    act(() => turns[0]!.handlers.onDelta(DONE.text));

    frames.length = 0; // only frames from `done` onward matter
    act(() => turns[0]!.handlers.onDone(DONE));

    expect(loader()).toBe("off");
    expect(rows().map((li) => li.textContent)).toEqual([DONE.text]);
    expect(rows()[0]!.dataset.cmid).toBe(DONE.clientMessageId);
    // The regression itself: not one rendered frame may show the loader off
    // while the answer is still missing.
    const gap = frames.filter((f) => f.streaming === null && !f.contents.includes(DONE.text));
    expect(gap).toEqual([]);
  });

  it("realtime echo AFTER done replaces the row in place (no duplicate)", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    act(() => turns[0]!.handlers.onDone(DONE));
    expect(rows()).toHaveLength(1);

    await emitEcho();

    const li = rows();
    expect(li).toHaveLength(1);
    expect(li[0]!.dataset.id).toBe("m-server-1"); // temp row reconciled to the server row
    expect(li[0]!.textContent).toBe(DONE.text);
  });

  it("realtime echo BEFORE done wins and is not clobbered (no duplicate)", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    await emitEcho();
    expect(rows()).toHaveLength(1);
    expect(loader()).toBe("on:"); // still streaming — the turn isn't over

    act(() => turns[0]!.handlers.onDone(DONE));

    const li = rows();
    expect(li).toHaveLength(1);
    expect(li[0]!.dataset.id).toBe("m-server-1"); // authoritative row kept
    expect(li[0]!.textContent).toBe(DONE.text);
    expect(loader()).toBe("off");
  });

  it("clears the loader on error and shows the error card", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    act(() => turns[0]!.handlers.onError("The assistant stream ended unexpectedly"));

    expect(loader()).toBe("off");
    expect(screen.getByTestId("assist-err").textContent).toBe(
      "The assistant stream ended unexpectedly",
    );
    expect(rows()).toHaveLength(0);
  });

  it("clears the loader on stop and aborts the turn", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    fireEvent.click(screen.getByRole("button", { name: "stop assist" }));

    expect(loader()).toBe("off");
    expect(turns[0]!.signal.aborted).toBe(true);
  });
});

describe("ChatWorkspace assist supersede guard", () => {
  it("a superseded turn's late callbacks cannot touch the live turn", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    act(() => turns[0]!.handlers.onDelta("stale "));
    expect(loader()).toBe("on:stale ");

    // Second ask supersedes the first (same channelId — the reason a plain
    // channel-id check isn't enough).
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    expect(turns).toHaveLength(2);
    expect(turns[0]!.signal.aborted).toBe(true);
    expect(loader()).toBe("on:");

    // Everything the dead turn could still fire, in every terminal flavour.
    act(() => turns[0]!.handlers.onDelta("ghost"));
    act(() => turns[0]!.handlers.onError("boom"));
    act(() => turns[0]!.handlers.onDone({ ...DONE, text: "stale answer" }));

    expect(loader()).toBe("on:"); // live turn's loader untouched
    expect(screen.getByTestId("assist-err").textContent).toBe("");
    expect(rows()).toHaveLength(0); // no stale answer merged

    // The live turn still completes normally.
    act(() => turns[1]!.handlers.onDone(DONE));
    expect(loader()).toBe("off");
    expect(rows().map((li) => li.textContent)).toEqual([DONE.text]);
  });
});

/**
 * `approval_needed` is TERMINAL — the stream emits it INSTEAD of `done` and then
 * closes. Before this was wired, the client's guard fell through to "the
 * assistant proposed an action that needs approval, but this view can't show it
 * yet": technically honest and useless, because the write was genuinely parked
 * and the user had no way to reach it.
 */
describe("ChatWorkspace assist — a parked write ends the turn", () => {
  const request: AssistApprovalRequest = {
    requestId: "req-7",
    appId: "quiktrack",
    toolName: "create_issue",
    riskClass: "soft_write",
    summary: "Create a QuikTrack issue.",
    toolInput: { projectId: "QTRK" },
    expiresAt: "2099-01-01T00:00:00.000Z",
  };

  it("clears the loader and shows the card in one commit, with no answer merged", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    act(() => turns[0]!.handlers.onDelta("thinking "));
    expect(loader()).toBe("on:thinking ");

    act(() => turns[0]!.handlers.onApprovalNeeded!(request));

    expect(loader()).toBe("off");
    expect(screen.getByTestId("assist-approval").textContent).toBe("req-7");
    // A parked write is not an assistant reply — nothing goes into history.
    expect(rows()).toHaveLength(0);
    // And it is not an error, so the error bubble stays empty.
    expect(screen.getByTestId("assist-err").textContent).toBe("");
  });

  it("dismiss hides the bubble only — it does not withdraw the request", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    act(() => turns[0]!.handlers.onApprovalNeeded!(request));
    expect(screen.getByTestId("assist-approval").textContent).toBe("req-7");

    fireEvent.click(screen.getByRole("button", { name: "dismiss approval" }));

    // Gone from the turn. Still parked on the runtime, and still listed in
    // "Your approvals" — dismissing must never make a pending write disappear.
    expect(screen.getByTestId("assist-approval").textContent).toBe("");
  });

  it("a new turn clears the previous turn's card", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    act(() => turns[0]!.handlers.onApprovalNeeded!(request));
    expect(screen.getByTestId("assist-approval").textContent).toBe("req-7");

    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    expect(screen.getByTestId("assist-approval").textContent).toBe("");
    expect(loader()).toBe("on:");
  });

  it("a superseded turn's late approval frame cannot touch the live turn", async () => {
    await openChannel();
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    expect(turns[0]!.signal.aborted).toBe(true);

    act(() => turns[0]!.handlers.onApprovalNeeded!(request));

    expect(screen.getByTestId("assist-approval").textContent).toBe("");
    expect(loader()).toBe("on:");
  });
});
