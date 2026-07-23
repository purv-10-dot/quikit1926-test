import type { ChannelList, ChannelListItem, MessageDto } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ForwardModal } from "./ForwardModal";

const chan = (id: string, name: string): ChannelListItem => ({
  channelId: id,
  name,
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
});

const channels: ChannelList = {
  priority: [],
  recent: [chan("c1", "general"), chan("c2", "random")],
};
const message = { id: "m1" } as MessageDto;

describe("ForwardModal", () => {
  it("multi-selects channels + note and forwards with the correct body", async () => {
    const onForward = vi.fn().mockResolvedValue(undefined);
    render(
      <ForwardModal
        open
        message={message}
        channels={channels}
        onClose={vi.fn()}
        onForward={onForward}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forward note"), { target: { value: "fyi" } });
    fireEvent.click(screen.getByRole("button", { name: /general/ }));
    fireEvent.click(screen.getByRole("button", { name: /random/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Forward/ }));

    await waitFor(() => expect(onForward).toHaveBeenCalledWith("m1", ["c1", "c2"], "fyi"));
  });

  it("disables Forward with nothing selected", () => {
    render(
      <ForwardModal
        open
        message={message}
        channels={channels}
        onClose={vi.fn()}
        onForward={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Forward/ })).toBeDisabled();
  });
});
