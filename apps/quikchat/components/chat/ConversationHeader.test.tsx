import type { ChannelListItem } from "@/lib/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The header opens profile cards on avatar click; the provider is irrelevant here.
vi.mock("@/components/profile/ProfileProvider", () => ({
  useProfile: () => ({ openProfile: vi.fn() }),
}));

import { ConversationHeader } from "./ConversationHeader";

const ME = "u1";
const PEER = "u2";

function channel(over: Partial<ChannelListItem> = {}): ChannelListItem {
  return {
    channelId: "c1",
    name: "Priya",
    description: null,
    avatarUrl: null,
    type: "dm",
    visibility: "private",
    isPriority: false,
    unreadCount: 0,
    lastActivityAt: new Date().toISOString(),
    members: [
      { id: ME, displayName: "Me", avatarUrl: null },
      { id: PEER, displayName: "Priya", avatarUrl: null },
    ],
    memberReadAt: {},
    memberDeliveredAt: {},
    lastMessage: null,
    ...over,
  } as ChannelListItem;
}

const renderHeader = (props: Partial<Parameters<typeof ConversationHeader>[0]> = {}) =>
  render(
    <ConversationHeader
      channel={channel()}
      currentUserId={ME}
      onToggleInfo={() => undefined}
      {...props}
    />,
  );

describe("ConversationHeader — DM last seen", () => {
  it("shows the last-seen readout when the peer is offline", () => {
    renderHeader({ online: new Set<string>(), lastSeen: new Date().toISOString() });
    expect(screen.getByText(/^last seen today at /)).toBeInTheDocument();
    expect(screen.queryByText("Direct message")).not.toBeInTheDocument();
  });

  it("keeps 'Active now' for an online peer even when a last-seen value is loaded", () => {
    renderHeader({ online: new Set([PEER]), lastSeen: new Date().toISOString() });
    expect(screen.getByText("Active now")).toBeInTheDocument();
    expect(screen.queryByText(/last seen/)).not.toBeInTheDocument();
  });

  it("falls back to 'Direct message' when there is no value — hidden and never-seen look identical", () => {
    renderHeader({ online: new Set<string>(), lastSeen: null });
    expect(screen.getByText("Direct message")).toBeInTheDocument();
    expect(screen.queryByText(/last seen/)).not.toBeInTheDocument();
  });

  it("falls back to 'Direct message' for an unparseable value rather than rendering junk", () => {
    renderHeader({ online: new Set<string>(), lastSeen: "not-a-date" });
    expect(screen.getByText("Direct message")).toBeInTheDocument();
  });

  it("leaves the group sub-line untouched", () => {
    renderHeader({
      channel: channel({ type: "group", name: "#design" }),
      online: new Set([PEER]),
      lastSeen: new Date().toISOString(),
    });
    expect(screen.getByText("2 members · 1 online")).toBeInTheDocument();
    expect(screen.queryByText(/last seen/)).not.toBeInTheDocument();
  });
});
