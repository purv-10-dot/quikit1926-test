import type { ChannelLastMessage } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import { messagePreview } from "./preview";

const mk = (over: Partial<ChannelLastMessage>): ChannelLastMessage => ({
  id: "m1",
  type: "Text",
  content: "hello",
  senderId: "u1",
  createdAt: new Date().toISOString(),
  ...over,
});

describe("messagePreview", () => {
  it("none when there is no last message", () => {
    expect(messagePreview(null)).toEqual({ kind: "none", text: "No messages yet" });
  });
  it("deleted tombstone", () => {
    expect(messagePreview(mk({ type: "Delete" }))).toEqual({
      kind: "deleted",
      text: "This message was deleted",
    });
  });
  it("media falls back to caption or 'Attachment'", () => {
    expect(messagePreview(mk({ type: "Media", content: "" })).text).toBe("Attachment");
    expect(messagePreview(mk({ type: "Media", content: "photo.png" })).text).toBe("photo.png");
  });
  it("system uses the content italic", () => {
    expect(messagePreview(mk({ type: "SystemActivity", content: "alice joined" }))).toEqual({
      kind: "system",
      text: "alice joined",
    });
  });
  it("text passes content through", () => {
    expect(messagePreview(mk({ content: "yo" }))).toEqual({ kind: "text", text: "yo" });
  });
});
