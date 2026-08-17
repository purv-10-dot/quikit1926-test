/**
 * "Leave channel/group" wiring. `leave()` (the server) publishes no realtime
 * event to the actor's own client — unlike delete-for-everyone, which relies
 * on the `channel_deleted` echo — so ConversationView must call the teardown
 * callback (`onChannelLeft`, which ChatWorkspace wires to its existing
 * `onChannelDeleted`) directly after a successful leave. These tests cover
 * that wiring, not InfoDrawer's own UI (see InfoDrawer.test.tsx's "Leave"
 * describe block for the confirm-copy/gating coverage).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import type { ChannelListItem } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { leaveChannel } = vi.hoisted(() => ({ leaveChannel: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPinned: vi.fn().mockResolvedValue([]),
  fetchMembers: vi.fn().mockResolvedValue([
    { id: "u1", displayName: "Alice", avatarUrl: null, role: "member", joinedAt: "" },
    { id: "u2", displayName: "Bob", avatarUrl: null, role: "admin", joinedAt: "" },
  ]),
  fetchChannelDetail: vi.fn().mockResolvedValue(null),
  fetchChannelLastSeen: vi.fn().mockResolvedValue({ lastSeen: null }),
  leaveChannel: (...a: unknown[]) => leaveChannel(...a),
}));

vi.mock("./MessageList", () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

import { ConversationView } from "./ConversationView";

function channel(): ChannelListItem {
  return {
    channelId: "chan-1",
    name: "design",
    description: null,
    avatarUrl: null,
    type: "group",
    visibility: "public",
    isPriority: false,
    unreadCount: 0,
    lastActivityAt: new Date(0).toISOString(),
    members: [
      { id: "u1", displayName: "Alice", avatarUrl: null },
      { id: "u2", displayName: "Bob", avatarUrl: null },
    ],
    memberReadAt: {},
    memberDeliveredAt: {},
    lastMessage: null,
  } as ChannelListItem;
}

function Harness({ onChannelLeft }: { onChannelLeft?: (p: { channelId: string }) => void }): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConversationView
          channel={channel()}
          currentUserId="u1"
          messages={[]}
          loadingMessages={false}
          channels={undefined}
          onSend={vi.fn()}
          onChannelLeft={onChannelLeft}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

async function openInfoAndLeave() {
  fireEvent.click(screen.getByLabelText("Conversation info"));
  fireEvent.click(await screen.findByTestId("leave-channel"));
  fireEvent.click(screen.getByTestId("leave-confirm"));
}

beforeEach(() => {
  leaveChannel.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConversationView — leave wiring", () => {
  it("calls leaveChannel and the reused teardown callback on success", async () => {
    leaveChannel.mockResolvedValue({ deleted: false });
    const onChannelLeft = vi.fn();
    render(<Harness onChannelLeft={onChannelLeft} />);

    await openInfoAndLeave();

    await waitFor(() => expect(leaveChannel).toHaveBeenCalledWith("chan-1"));
    expect(onChannelLeft).toHaveBeenCalledWith({ channelId: "chan-1" });
  });

  it("closes the info drawer on success", async () => {
    leaveChannel.mockResolvedValue({ deleted: false });
    render(<Harness onChannelLeft={vi.fn()} />);

    await openInfoAndLeave();

    await waitFor(() => expect(screen.queryByTestId("info-drawer")).toBeNull());
  });

  it("surfaces the server's refusal message and does not tear down", async () => {
    leaveChannel.mockRejectedValue(new Error("Not a member of this channel"));
    const onChannelLeft = vi.fn();
    render(<Harness onChannelLeft={onChannelLeft} />);

    await openInfoAndLeave();

    expect(await screen.findByTestId("role-error")).toHaveTextContent(
      "Not a member of this channel",
    );
    expect(onChannelLeft).not.toHaveBeenCalled();
    // Drawer stays open so the error is visible.
    expect(screen.getByTestId("info-drawer")).toBeInTheDocument();
  });
});
