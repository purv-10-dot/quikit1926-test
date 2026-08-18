import type { ChannelListItem, ChannelMemberDto, MessageDto } from "@/lib/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoDrawer } from "./InfoDrawer";

const channel: ChannelListItem = {
  channelId: "c1",
  name: "general",
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
  lastMessage: null,
};

const members: ChannelMemberDto[] = [
  {
    id: "u-alice",
    displayName: "Alice",
    avatarUrl: null,
    role: "admin",
    joinedAt: new Date().toISOString(),
  },
  {
    id: "u-bob",
    displayName: "Bob",
    avatarUrl: null,
    role: "member",
    joinedAt: new Date().toISOString(),
  },
];

const pinned: MessageDto[] = [
  {
    id: "p1",
    channelId: "c1",
    senderId: "u-alice",
    actorType: "human",
    type: "Text",
    content: "pinned note",
    data: null,
    parentMessageId: null,
    parentPreview: null,
    isPinned: true,
    reactions: [],
    mentions: [],
    createdAt: new Date().toISOString(),
    editedAt: null,
  },
];

beforeEach(() => {
  // InviteManager (group) lists invites on mount; UserPicker fetches users.
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  })) as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("InfoDrawer", () => {
  it("renders details, members + roles + presence, and pinned", () => {
    render(
      <InfoDrawer
        channel={channel}
        members={members}
        pinned={pinned}
        currentUserId="u-bob"
        onlineIds={new Set(["u-alice"])}
      />,
    );
    // Ram's InfoDrawer shows the channel name in the hero AND a details "Name"
    // row, so scope this to the hero rather than a bare getByText (which now
    // matches both).
    expect(screen.getByText("general", { selector: ".qc-drawer-hero__name" })).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
    expect(screen.getAllByLabelText("online").length).toBe(1);
    expect(screen.getByTestId("pinned-item")).toHaveTextContent("pinned note");
  });

  // QC_010 — pin is per-user state, so it shows for any member (no admin gate) and
  // the label tracks channel.isPriority.
  it("offers Pin for an unpinned conversation and reports the toggle", () => {
    const onTogglePin = vi.fn();
    render(
      <InfoDrawer
        channel={channel}
        members={members}
        pinned={[]}
        currentUserId="u-bob"
        onTogglePin={onTogglePin}
      />,
    );
    const btn = screen.getByTestId("toggle-pin");
    expect(btn).toHaveTextContent("Pin");
    fireEvent.click(btn);
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it("offers Unpin for a pinned conversation", () => {
    render(
      <InfoDrawer
        channel={{ ...channel, isPriority: true }}
        members={members}
        pinned={[]}
        currentUserId="u-bob"
        onTogglePin={vi.fn()}
      />,
    );
    expect(screen.getByTestId("toggle-pin")).toHaveTextContent("Unpin");
  });

  it("omits the pin row when no handler is supplied", () => {
    render(
      <InfoDrawer channel={channel} members={members} pinned={[]} currentUserId="u-bob" />,
    );
    expect(screen.queryByTestId("channel-pin-pref")).toBeNull();
  });

  it("hides management controls for non-admins", () => {
    render(
      <InfoDrawer
        channel={channel}
        members={members}
        pinned={[]}
        currentUserId="u-bob"
        onAddMembers={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Manage/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add people/ })).toBeNull();
  });

  it("admins can change role and remove members", () => {
    const onSetRole = vi.fn();
    const onRemoveMember = vi.fn();
    render(
      <InfoDrawer
        channel={channel}
        members={members}
        pinned={[]}
        currentUserId="u-alice"
        onAddMembers={vi.fn()}
        onRemoveMember={onRemoveMember}
        onSetRole={onSetRole}
      />,
    );
    // No manage control for self (Alice); one for Bob.
    fireEvent.click(screen.getByRole("button", { name: "Manage Bob" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Make admin" }));
    expect(onSetRole).toHaveBeenCalledWith("u-bob", "admin");

    fireEvent.click(screen.getByRole("button", { name: "Manage Bob" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from channel" }));
    expect(onRemoveMember).toHaveBeenCalledWith("u-bob");
  });

  it("surfaces a role error (e.g. last-admin rule)", () => {
    render(
      <InfoDrawer
        channel={channel}
        members={members}
        pinned={[]}
        currentUserId="u-alice"
        onAddMembers={vi.fn()}
        roleError="Cannot demote the last admin"
      />,
    );
    expect(screen.getByTestId("role-error")).toHaveTextContent("Cannot demote the last admin");
  });

  describe("Leave", () => {
    it("offers Leave to a non-admin member of a public channel, with rejoin-via-Discover copy", () => {
      const onLeaveChannel = vi.fn();
      render(
        <InfoDrawer
          channel={channel}
          members={members}
          pinned={[]}
          currentUserId="u-bob"
          onLeaveChannel={onLeaveChannel}
        />,
      );
      fireEvent.click(screen.getByTestId("leave-channel"));
      expect(screen.getByText(/You can rejoin anytime from Discover/)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("leave-confirm"));
      expect(onLeaveChannel).toHaveBeenCalledTimes(1);
    });

    it("warns that a private group needs a new invite to rejoin", () => {
      render(
        <InfoDrawer
          channel={{ ...channel, visibility: "private" }}
          members={members}
          pinned={[]}
          currentUserId="u-bob"
          onLeaveChannel={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("leave-channel"));
      expect(screen.getByText(/you'll need a new invite to rejoin/)).toBeInTheDocument();
    });

    it("cancel dismisses the confirm without calling onLeaveChannel", () => {
      const onLeaveChannel = vi.fn();
      render(
        <InfoDrawer
          channel={channel}
          members={members}
          pinned={[]}
          currentUserId="u-bob"
          onLeaveChannel={onLeaveChannel}
        />,
      );
      fireEvent.click(screen.getByTestId("leave-channel"));
      fireEvent.click(screen.getByText("Cancel"));
      expect(screen.queryByTestId("leave-confirm")).toBeNull();
      expect(onLeaveChannel).not.toHaveBeenCalled();
    });

    // The server has no last-admin guard on leave (see channels.service.ts) —
    // this is a purely informational warning, not a block.
    it("warns the sole admin that the group will be orphaned, but still allows leaving", () => {
      const onLeaveChannel = vi.fn();
      render(
        <InfoDrawer
          channel={channel}
          members={members}
          pinned={[]}
          currentUserId="u-alice"
          onLeaveChannel={onLeaveChannel}
        />,
      );
      fireEvent.click(screen.getByTestId("leave-channel"));
      expect(
        screen.getByText(/You're the only admin — no one will be able to manage this group/),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("leave-confirm"));
      expect(onLeaveChannel).toHaveBeenCalledTimes(1);
    });

    it("does not warn about sole-admin orphaning for a non-admin leaver", () => {
      render(
        <InfoDrawer
          channel={channel}
          members={members}
          pinned={[]}
          currentUserId="u-bob"
          onLeaveChannel={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("leave-channel"));
      expect(screen.queryByText(/the only admin/)).toBeNull();
    });

    it("does not offer Leave for a direct message", () => {
      render(
        <InfoDrawer
          channel={{ ...channel, type: "dm" }}
          members={members}
          pinned={[]}
          currentUserId="u-bob"
          onLeaveChannel={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("leave-channel")).toBeNull();
      expect(screen.queryByTestId("leave-section")).toBeNull();
    });

    it("does not offer Leave for the AI chat", () => {
      render(
        <InfoDrawer
          channel={{ ...channel, type: "ai" }}
          members={members}
          pinned={[]}
          currentUserId="u-bob"
          onLeaveChannel={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("leave-channel")).toBeNull();
    });

    it("is absent when no onLeaveChannel handler is supplied", () => {
      render(<InfoDrawer channel={channel} members={members} pinned={[]} currentUserId="u-bob" />);
      expect(screen.queryByTestId("leave-section")).toBeNull();
    });
  });
});
