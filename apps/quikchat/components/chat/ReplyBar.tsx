"use client";

import type { MessageDto, PublicUser } from "@/lib/shared";
import { IconButton, Reply, X } from "@/components/ui";
import { flattenMarkdown } from "@/lib/richtext";

export function replyPreviewText(msg: MessageDto): string {
  if (msg.type === "Delete") return "This message was deleted";
  if (msg.type === "Media") return "📎 Attachment";
  return flattenMarkdown(msg.content || "");
}

export interface ReplyBarProps {
  target: MessageDto;
  members: PublicUser[];
  currentUserId: string;
  onCancel: () => void;
}

/** Quote strip shown above the Composer while replying. */
export function ReplyBar({ target, members, currentUserId, onCancel }: ReplyBarProps) {
  const isOwn = target.senderId === currentUserId;
  const author = isOwn
    ? "You"
    : (members.find((m) => m.id === target.senderId)?.displayName ?? "Someone");
  return (
    <div className="qc-reply-bar" data-testid="reply-bar">
      <Reply size={14} aria-hidden />
      <div className="qc-reply-bar__body">
        <div className="qc-quote__author">Replying to {author}</div>
        <div className="qc-quote__text">{replyPreviewText(target)}</div>
      </div>
      <IconButton label="Cancel reply" onClick={onCancel}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
