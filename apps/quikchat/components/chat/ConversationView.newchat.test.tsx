// @vitest-environment jsdom
/**
 * "New chat" in the AI conversation — the confirm gate and what it promises.
 *
 * The reset is cheap to trigger and its effect is invisible in the transcript
 * (a marker, not a deletion), so the only thing standing between a misclick and
 * a wiped context window is the confirm. These pin that it is genuinely
 * required, that dismissing it is inert, and that the copy states BOTH what is
 * reset and what survives — "New chat" reasonably reads as "drop everything",
 * and two of the three things a user might expect to lose are not lost.
 *
 * The server side (what the marker is, and that buildHistory cuts on it) lives
 * in app/api/channels/[id]/ai-reset/route.test.ts and assistant.service.test.ts.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import type { ChannelListItem, MessageDto } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetAiChat } = vi.hoisted(() => ({ resetAiChat: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPinned: vi.fn().mockResolvedValue([]),
  fetchMembers: vi.fn().mockResolvedValue([]),
  fetchChannelDetail: vi.fn().mockResolvedValue(null),
  fetchChannelLastSeen: vi.fn().mockResolvedValue({ lastSeen: null }),
  resetAiChat: (...a: unknown[]) => resetAiChat(...a),
}));

vi.mock("./MessageList", () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

import { ConversationView } from "./ConversationView";

const MARKER: MessageDto = {
  id: "m-marker",
  channelId: "chan-ai",
  senderId: "u1",
  actorType: "human",
  type: "SystemActivity",
  content: "New chat started",
  data: { kind: "ai_context_reset" },
  parentMessageId: null,
  parentPreview: null,
  isPinned: false,
  reactions: [],
  mentions: [],
  clientMessageId: null,
  createdAt: "2026-08-20T10:00:00.000Z",
  editedAt: null,
};

function channel(type: ChannelListItem["type"] = "ai"): ChannelListItem {
  return {
    channelId: "chan-ai",
    name: type === "ai" ? "AI Chat" : "design",
    description: null,
    avatarUrl: null,
    type,
    visibility: "private",
    isPriority: false,
    unreadCount: 0,
    lastActivityAt: new Date(0).toISOString(),
    members: [{ id: "u1", displayName: "Alice", avatarUrl: null }],
    memberReadAt: {},
    memberDeliveredAt: {},
    lastMessage: null,
  } as ChannelListItem;
}

function Harness({ type }: { type?: ChannelListItem["type"] }): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConversationView
          channel={channel(type)}
          currentUserId="u1"
          messages={[]}
          loadingMessages={false}
          channels={undefined}
          onSend={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetAiChat.mockReset();
  resetAiChat.mockResolvedValue(MARKER);
});

describe("ConversationView — New chat", () => {
  it("does not reset anything on the button alone; the confirm is required", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New chat"));

    // The dialog is up, and nothing has been sent.
    expect(await screen.findByTestId("new-chat-confirm")).toBeTruthy();
    expect(resetAiChat).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("new-chat-confirm"));
    await waitFor(() => expect(resetAiChat).toHaveBeenCalledWith("chan-ai"));
  });

  it("cancelling closes the dialog and resets nothing", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New chat"));
    fireEvent.click(await screen.findByText("Cancel"));

    await waitFor(() => expect(screen.queryByTestId("new-chat-confirm")).toBeNull());
    expect(resetAiChat).not.toHaveBeenCalled();
  });

  it("says what is reset AND what survives, because 'New chat' implies otherwise", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New chat"));
    const dialog = await screen.findByRole("dialog");

    expect(dialog.textContent).toContain("stop seeing everything above this point");
    // The two survivals a user would otherwise assume they are giving up.
    expect(dialog.textContent).toContain("your messages stay in this chat");
    expect(dialog.textContent).toContain("documents stay");
    expect(dialog.textContent).toContain("knowledge base");
  });

  it("closes the dialog once the reset lands", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New chat"));
    fireEvent.click(await screen.findByTestId("new-chat-confirm"));

    await waitFor(() => expect(screen.queryByTestId("new-chat-confirm")).toBeNull());
  });

  it("keeps the dialog open when the reset fails, so the action is not silently lost", async () => {
    resetAiChat.mockRejectedValue(new Error("nope"));
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("New chat"));
    fireEvent.click(await screen.findByTestId("new-chat-confirm"));

    await waitFor(() => expect(resetAiChat).toHaveBeenCalled());
    expect(screen.getByTestId("new-chat-confirm")).toBeTruthy();
  });

  it("offers no New chat control outside an AI chat, where a marker has no meaning", () => {
    render(<Harness type="group" />);
    expect(screen.queryByLabelText("New chat")).toBeNull();
  });
});
