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
  it("groups rows into Channels / Groups / Direct Messages by type AND visibility", () => {
    const data: ChannelListData = {
      // Same `type: "group"` — only `visibility` separates a Channel from a
      // Group, which is exactly what the old `type`-only switch could not see.
      priority: [item({ channelId: "general", visibility: "public", isPriority: true })],
      recent: [
        item({ channelId: "design-team", visibility: "private" }),
        item({ channelId: "alice", type: "dm", visibility: "private" }),
      ],
    };
    render(<ChannelList data={data} activeChannelId="general" onPick={vi.fn()} />);

    const sections = Array.from(document.querySelectorAll(".qc-list-section__toggle")).map((n) =>
      n.textContent?.replace(/[^A-Za-z ]/g, "").trim(),
    );
    expect(sections).toEqual(["Channels", "Groups", "Direct Messages"]);

    const sectionOf = (label: string) =>
      document.querySelector(`.qc-list-group[data-kind="${label}"]`)!;
    expect(sectionOf("channel").textContent).toContain("general");
    expect(sectionOf("group").textContent).toContain("design-team");
    expect(sectionOf("dm").textContent).toContain("alice");
    // The public channel must NOT be filed under Groups.
    expect(sectionOf("group").textContent).not.toContain("general");

    const active = screen.getByText("general").closest(".qc-chan-row")!;
    expect(active.getAttribute("data-active")).toBe("true");
  });

  // A brand-new user gets the three sections with their own copy, NOT one
  // generic "no conversations yet" — the per-section copy is what tells them
  // what they can create, and for Channels it is permission-conditional.
  it("shows per-section empty copy when there is nothing at all", () => {
    render(<ChannelList data={{ priority: [], recent: [] }} onPick={vi.fn()} />);
    expect(screen.getByText("No groups yet — create one.")).toBeInTheDocument();
    expect(screen.getByText("No direct messages yet.")).toBeInTheDocument();
  });

  it("shows a filter-specific empty state when a filter matches nothing", () => {
    render(
      <ChannelList
        data={{ priority: [], recent: [item({ channelId: "quiet", unreadCount: 0 })] }}
        onPick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  /**
   * The part the original design got wrong by assuming everyone could create.
   *
   * `Channel.Public:create` is not held by every role, so the Channels `+` and
   * its empty-state copy have to react to it — otherwise the UI advertises a
   * button that 403s, or tells someone to "create one" when they cannot.
   */
  describe("Channels section is permission-conditional", () => {
    const empty: ChannelListData = { priority: [], recent: [] };

    it("offers the + and invites creation WITH the grant", () => {
      const onNewChannel = vi.fn();
      render(
        <ChannelList
          data={empty}
          onPick={vi.fn()}
          canCreateChannel
          onNewChannel={onNewChannel}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "New channel" }));
      expect(onNewChannel).toHaveBeenCalled();
      expect(screen.getByText("No channels yet — create one.")).toBeInTheDocument();
    });

    it("hides the + and does not advise creating WITHOUT the grant", () => {
      const onNewChannel = vi.fn();
      render(
        <ChannelList
          data={empty}
          onPick={vi.fn()}
          canCreateChannel={false}
          onNewChannel={onNewChannel}
        />,
      );

      expect(screen.queryByRole("button", { name: "New channel" })).toBeNull();
      // The copy must not tell them to do something the server will refuse.
      expect(screen.queryByText("No channels yet — create one.")).toBeNull();
      expect(
        screen.getByText("No channels yet. Channels you join or get added to will appear here."),
      ).toBeInTheDocument();
    });

    it("defaults to WITHOUT the grant — a missing prop must never grant", () => {
      render(<ChannelList data={empty} onPick={vi.fn()} onNewChannel={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "New channel" })).toBeNull();
    });

    it("still offers Groups and DMs regardless of the channel grant", () => {
      render(
        <ChannelList
          data={empty}
          onPick={vi.fn()}
          canCreateChannel={false}
          onNewGroup={vi.fn()}
          onNewChat={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "New group" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New direct message" })).toBeInTheDocument();
    });
  });

  it("sections collapse and expand", () => {
    const data: ChannelListData = {
      priority: [],
      recent: [item({ channelId: "general", visibility: "public" })],
    };
    render(<ChannelList data={data} onPick={vi.fn()} />);

    expect(screen.getByText("general")).toBeInTheDocument();
    const toggle = screen.getAllByRole("button", { expanded: true })[0];
    fireEvent.click(toggle);
    expect(screen.queryByText("general")).toBeNull();
  });

  // "dm" was implemented in matchesType and never offered as a chip — an
  // unreachable branch. This is its first caller.
  it("the Direct filter chip narrows to DMs", () => {
    const data: ChannelListData = {
      priority: [],
      recent: [
        item({ channelId: "general", visibility: "public" }),
        item({ channelId: "alice", type: "dm", visibility: "private" }),
      ],
    };
    render(<ChannelList data={data} onPick={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Direct" }));
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.queryByText("general")).toBeNull();
  });

  it("the Channels filter chip excludes private groups", () => {
    const data: ChannelListData = {
      priority: [],
      recent: [
        item({ channelId: "general", visibility: "public" }),
        item({ channelId: "design-team", visibility: "private" }),
      ],
    };
    render(<ChannelList data={data} onPick={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Channels" }));
    expect(screen.getByText("general")).toBeInTheDocument();
    expect(screen.queryByText("design-team")).toBeNull();
  });

  it("Unread filter hides read rows across every section", () => {
    const data: ChannelListData = {
      priority: [item({ channelId: "pinned-unread", isPriority: true, unreadCount: 2 })],
      recent: [
        item({ channelId: "random", unreadCount: 3 }),
        item({ channelId: "quiet", unreadCount: 0 }),
      ],
    };
    render(<ChannelList data={data} onPick={vi.fn()} />);

    expect(screen.getByText("quiet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    expect(screen.queryByText("quiet")).toBeNull();
    expect(screen.getByText("random")).toBeInTheDocument();
    expect(screen.getByText("pinned-unread")).toBeInTheDocument();
  });

  it("renders the Discover button and calls onDiscover", () => {
    const onDiscover = vi.fn();
    render(
      <ChannelList
        data={{ priority: [], recent: [] }}
        onPick={vi.fn()}
        onDiscover={onDiscover}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discover channels" }));
    expect(onDiscover).toHaveBeenCalled();
  });

  /**
   * WIRING, not rendering — and it needs its own assertion.
   *
   * Every test above passes `canCreateChannel` by hand, so all of them would
   * still pass if ChatWorkspace hardcoded `canCreateChannel` to true and handed
   * the `+` to everyone. That is the sweep's lesson restated: mounting the
   * component proves the component, never the caller.
   *
   * Mounting ChatWorkspace for real would drag in React Query, a socket and the
   * whole permission provider, so this reads the call site instead. It is a
   * coarse check and it proves exactly one thing: the grant reaches the prop.
   * If this breaks because the expression was legitimately refactored, update
   * the pattern — do not delete the test.
   */
  it("ChatWorkspace feeds the real grant into canCreateChannel", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "components/chat/ChatWorkspace.tsx"),
      "utf8",
    );
    expect(src).toMatch(/canCreateChannel=\{perms\.has\("Channel\.Public",\s*"create"\)\}/);
    // …and never a literal, which is how this silently becomes ungated again.
    expect(src).not.toMatch(/canCreateChannel=\{true\}/);
    expect(src).not.toMatch(/canCreateChannel\s*\/>/);
  });
});
