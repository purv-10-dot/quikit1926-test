import type { ChannelList as ChannelListData, ChannelListItem } from "@/lib/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChannelList } from "./ChannelList";

const item = (over: Partial<ChannelListItem> & { channelId: string }): ChannelListItem => ({
  name: over.channelId,
  description: null,
  avatarUrl: null,
  type: "group",
  visibility: "public",
  isPriority: false,
  unreadCount: 0,
  lastActivityAt: new Date().toISOString(),
  members: [],
  memberReadAt: {},
  memberDeliveredAt: {},
  lastMessage: {
    id: "m",
    type: "Text",
    content: "hey",
    senderId: "u1",
    createdAt: new Date().toISOString(),
  },
  ...over,
});

describe("ChannelList", () => {
  it("renders pinned + recent sections with active styling and unread badge", () => {
    const data: ChannelListData = {
      priority: [item({ channelId: "general", name: "general", isPriority: true })],
      recent: [item({ channelId: "random", name: "random", unreadCount: 3 })],
    };
    render(
      <ChannelList data={data} workspaceName="Acme" activeChannelId="general" onPick={vi.fn()} />,
    );
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();

    const active = screen.getByText("general").closest(".qc-chan-row")!;
    expect(active.getAttribute("data-active")).toBe("true");

    expect(screen.getByText("3")).toBeInTheDocument(); // unread badge
  });

  it("shows an empty state when there are no conversations", () => {
    render(
      <ChannelList data={{ priority: [], recent: [] }} workspaceName="Acme" onPick={vi.fn()} />,
    );
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("All/Unread filter shows only unread, preserving sections + search", () => {
    const data: ChannelListData = {
      priority: [
        item({
          channelId: "pinned-unread",
          name: "pinned-unread",
          isPriority: true,
          unreadCount: 2,
        }),
      ],
      recent: [
        item({ channelId: "random", name: "random", unreadCount: 3 }),
        item({ channelId: "quiet", name: "quiet", unreadCount: 0 }),
      ],
    };
    render(<ChannelList data={data} workspaceName="Acme" onPick={vi.fn()} />);

    // All (default): everything visible.
    expect(screen.getByText("quiet")).toBeInTheDocument();
    expect(screen.getByText("random")).toBeInTheDocument();
    expect(screen.getByText("pinned-unread")).toBeInTheDocument();

    // Unread: read channels disappear, sections preserved.
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    expect(screen.queryByText("quiet")).toBeNull();
    expect(screen.getByText("random")).toBeInTheDocument();
    expect(screen.getByText("pinned-unread")).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("renders the Discover button in chromeless mode and calls onDiscover", () => {
    const onDiscover = vi.fn();
    render(
      <ChannelList
        data={{ priority: [], recent: [] }}
        workspaceName="Acme"
        chromeless
        onPick={vi.fn()}
        onDiscover={onDiscover}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discover channels" }));
    expect(onDiscover).toHaveBeenCalled();
  });
});
