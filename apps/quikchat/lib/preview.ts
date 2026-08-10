import type { ChannelLastMessage } from "@/lib/shared";
import { flattenMarkdown } from "@/lib/richtext";

export type PreviewKind = "none" | "deleted" | "media" | "system" | "text";

export interface MessagePreview {
  kind: PreviewKind;
  text: string;
}

/**
 * Channel-list last-message preview. The list contract's `lastMessage` carries
 * no media subtype (only type + content), so Media collapses to its caption /
 * "Attachment". Mirrors the reference's MessagePreview behaviour for the kinds.
 */
export function messagePreview(last: ChannelLastMessage | null | undefined): MessagePreview {
  if (!last) return { kind: "none", text: "No messages yet" };
  switch (last.type) {
    case "Delete":
      return { kind: "deleted", text: "This message was deleted" };
    case "Media":
      return { kind: "media", text: flattenMarkdown(last.content ?? "") || "Attachment" };
    case "SystemActivity":
      return { kind: "system", text: last.content ?? "" };
    default:
      return { kind: "text", text: flattenMarkdown(last.content ?? "") };
  }
}
