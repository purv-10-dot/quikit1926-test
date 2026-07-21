import type { MessageDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import { buildMessageRows } from "./grouping";

const T = new Date("2026-05-08T12:00:00.000Z").getTime();
const at = (ms: number) => new Date(T + ms).toISOString();

function mk(over: Partial<MessageDto> & { id: string }): MessageDto {
  return {
    channelId: "c1",
    senderId: "u1",
    actorType: "human",
    type: "Text",
    content: "hi",
    data: null,
    parentMessageId: null,
    parentPreview: null,
    isPinned: false,
    reactions: [],
    mentions: [],
    createdAt: at(0),
    editedAt: null,
    ...over,
  };
}

describe("buildMessageRows", () => {
  it("groups consecutive same-sender messages within the window", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1", createdAt: at(0) }),
      mk({ id: "b", senderId: "u1", createdAt: at(60_000) }),
    ]);
    expect(rows[0]!.showAuthor).toBe(true);
    expect(rows[1]!.showAuthor).toBe(false);
  });

  it("starts a new author block when the sender changes", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1" }),
      mk({ id: "b", senderId: "u2", createdAt: at(1000) }),
    ]);
    expect(rows[1]!.showAuthor).toBe(true);
  });

  it("starts a new block when the gap exceeds the window", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1", createdAt: at(0) }),
      mk({ id: "b", senderId: "u1", createdAt: at(6 * 60_000) }),
    ]);
    expect(rows[1]!.showAuthor).toBe(true);
  });

  it("system rows always break grouping (both sides)", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1", createdAt: at(0) }),
      mk({ id: "s", senderId: "u1", type: "SystemActivity", createdAt: at(1000) }),
      mk({ id: "b", senderId: "u1", createdAt: at(2000) }),
    ]);
    expect(rows[1]!.showAuthor).toBe(true); // the system row
    expect(rows[2]!.showAuthor).toBe(true); // after a system row
  });

  it("inserts a date divider on the first row and across day boundaries", () => {
    const rows = buildMessageRows([
      mk({ id: "a", createdAt: at(0) }),
      mk({ id: "b", createdAt: at(60_000) }),
      mk({ id: "c", createdAt: new Date(T + 24 * 3600_000).toISOString() }),
    ]);
    expect(rows[0]!.showDateDivider).toBe(true);
    expect(rows[1]!.showDateDivider).toBe(false);
    expect(rows[2]!.showDateDivider).toBe(true);
  });
});
