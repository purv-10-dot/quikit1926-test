import type { MessageDto, PublicUser } from "@/lib/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { replyPreviewText, ReplyBar } from "./ReplyBar";

const members: PublicUser[] = [{ id: "u-alice", displayName: "Alice", avatarUrl: null }];

const mk = (over: Partial<MessageDto> & { id: string }): MessageDto => ({
  channelId: "c1",
  senderId: "u-alice",
  actorType: "human",
  type: "Text",
  content: "original",
  data: null,
  parentMessageId: null,
  parentPreview: null,
  isPinned: false,
  reactions: [],
  mentions: [],
  createdAt: new Date().toISOString(),
  editedAt: null,
  ...over,
});

describe("replyPreviewText", () => {
  it("handles text/media/deleted", () => {
    expect(replyPreviewText(mk({ id: "a", content: "yo" }))).toBe("yo");
    expect(replyPreviewText(mk({ id: "a", type: "Media", content: "" }))).toBe("📎 Attachment");
    expect(replyPreviewText(mk({ id: "a", type: "Delete", content: "" }))).toBe(
      "This message was deleted",
    );
  });
});

describe("ReplyBar", () => {
  it("shows the author + preview and cancels", () => {
    const onCancel = vi.fn();
    render(
      <ReplyBar
        target={mk({ id: "a" })}
        members={members}
        currentUserId="me"
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Replying to Alice")).toBeInTheDocument();
    expect(screen.getByText("original")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
