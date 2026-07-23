// @vitest-environment node
import "../../__tests__/helpers/mockDb"; // neutralize the real PrismaClient import
import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/lib/shared";
import { buildHistory } from "./assistant.service";

// buildHistory is pure — it only reads type/content/actorType/createdAt. Build
// minimal newest-first rows (as messages.list returns) and cast.
function msg(partial: Partial<MessageDto>): MessageDto {
  return {
    id: partial.id ?? "m",
    channelId: "c1",
    senderId: partial.senderId ?? "u1",
    actorType: partial.actorType ?? "human",
    type: partial.type ?? "Text",
    content: partial.content ?? "",
    data: null,
    parentMessageId: null,
    parentPreview: null,
    isPinned: false,
    reactions: [],
    mentions: [],
    clientMessageId: null,
    createdAt: partial.createdAt ?? "2026-07-15T00:00:00.000Z",
    editedAt: null,
  } as MessageDto;
}

describe("buildHistory", () => {
  it("maps newest-first rows to oldest→newest turns and roles, skipping system/deleted/empty", () => {
    const rows = [
      msg({ id: "3", actorType: "ai_agent", content: "reply" }), // newest
      msg({ id: "sys", type: "SystemActivity", content: "x joined" }),
      msg({ id: "empty", content: "   " }),
      msg({ id: "2", content: "hello" }),
      msg({ id: "del", type: "Delete", content: "gone" }),
      msg({ id: "1", content: "first" }), // oldest
    ];
    const history = buildHistory(rows);
    expect(history.map((h) => [h.role, h.text])).toEqual([
      ["user", "first"],
      ["user", "hello"],
      ["assistant", "reply"],
    ]);
  });

  it("drops the trailing user turn that matches currentPrompt (AI-chat sends the turn once)", () => {
    const rows = [
      msg({ id: "2", content: "summarize this" }), // newest — the just-persisted prompt
      msg({ id: "1", actorType: "ai_agent", content: "earlier reply" }),
    ];
    const history = buildHistory(rows, "summarize this");
    expect(history.map((h) => h.text)).toEqual(["earlier reply"]);
  });

  it("trims whitespace when matching the current prompt", () => {
    const rows = [msg({ id: "1", content: "  hi there  " })];
    expect(buildHistory(rows, "hi there")).toEqual([]);
  });

  it("keeps the trailing turn when no currentPrompt is passed (normal /ai path)", () => {
    const rows = [msg({ id: "1", content: "keep me" })];
    const history = buildHistory(rows, undefined);
    expect(history.map((h) => h.text)).toEqual(["keep me"]);
  });

  it("does not drop a trailing assistant turn even if its text equals the prompt", () => {
    const rows = [msg({ id: "1", actorType: "ai_agent", content: "echo" })];
    const history = buildHistory(rows, "echo");
    expect(history.map((h) => [h.role, h.text])).toEqual([["assistant", "echo"]]);
  });

  it("does not drop when the trailing user turn differs from the prompt", () => {
    const rows = [msg({ id: "1", content: "a genuine prior message" })];
    const history = buildHistory(rows, "a different current prompt");
    expect(history.map((h) => h.text)).toEqual(["a genuine prior message"]);
  });
});
