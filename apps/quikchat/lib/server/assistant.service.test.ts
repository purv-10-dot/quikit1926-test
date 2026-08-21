// @vitest-environment node
import "../../__tests__/helpers/mockDb"; // neutralize the real PrismaClient import
import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/lib/shared";
import {
  AI_CONTEXT_RESET_KIND,
  AI_CONTEXT_RESET_TEXT,
  buildHistory,
  isContextResetMarker,
} from "./assistant.service";

// buildHistory is pure — it only reads type/content/actorType/createdAt, plus
// `data` since the context-reset marker is identified by `data.kind`. Build
// minimal newest-first rows (as messages.list returns) and cast.
function msg(partial: Partial<MessageDto>): MessageDto {
  return {
    id: partial.id ?? "m",
    channelId: "c1",
    senderId: partial.senderId ?? "u1",
    actorType: partial.actorType ?? "human",
    type: partial.type ?? "Text",
    content: partial.content ?? "",
    data: partial.data ?? null,
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

/** A context-reset marker exactly as `resetAiChatContext` persists one. */
function resetMarker(id: string): MessageDto {
  return msg({
    id,
    type: "SystemActivity",
    content: AI_CONTEXT_RESET_TEXT,
    data: { kind: AI_CONTEXT_RESET_KIND },
  });
}

describe("buildHistory — \"New chat\" context reset", () => {
  it("stops the runtime receiving anything at or before the marker", () => {
    const rows = [
      msg({ id: "4", content: "after the reset" }), // newest
      resetMarker("marker"),
      msg({ id: "2", actorType: "ai_agent", content: "poisoned reply" }),
      msg({ id: "1", content: "before the reset" }), // oldest
    ];
    expect(buildHistory(rows).map((h) => h.text)).toEqual(["after the reset"]);
  });

  it("cuts at the NEWEST marker, not the first — resetting twice is the normal case", () => {
    const rows = [
      msg({ id: "5", content: "newest turn" }),
      resetMarker("second-reset"),
      msg({ id: "3", content: "between the two resets" }),
      resetMarker("first-reset"),
      msg({ id: "1", content: "oldest turn" }),
    ];
    // Anchoring on the first marker would re-admit "between the two resets",
    // which the second reset existed to hide.
    expect(buildHistory(rows).map((h) => h.text)).toEqual(["newest turn"]);
  });

  it("sends nothing when the marker is the newest row (a reset with no turns since)", () => {
    const rows = [resetMarker("marker"), msg({ id: "1", content: "before" })];
    expect(buildHistory(rows)).toEqual([]);
  });

  it("still drops the just-persisted prompt on the first turn after a reset", () => {
    // The AI chat persists the user's turn BEFORE invoking assist, so the newest
    // row is the live prompt. It must be sent once, not twice, reset or no reset.
    const rows = [
      msg({ id: "3", content: "first question of the new chat" }),
      resetMarker("marker"),
      msg({ id: "1", content: "before" }),
    ];
    expect(buildHistory(rows, "first question of the new chat")).toEqual([]);
  });

  it("is unaffected by an ordinary system row (join/leave must not truncate)", () => {
    const rows = [
      msg({ id: "3", content: "after" }),
      msg({ id: "sys", type: "SystemActivity", content: "x joined the chat" }),
      msg({ id: "1", content: "before" }),
    ];
    expect(buildHistory(rows).map((h) => h.text)).toEqual(["before", "after"]);
  });
});

describe("isContextResetMarker", () => {
  it("matches only a SystemActivity row carrying the reset kind", () => {
    expect(isContextResetMarker(resetMarker("m"))).toBe(true);
    // Right kind, wrong type: a Text message can carry arbitrary `data`, and a
    // client-authored one must never be able to truncate the assistant's context.
    expect(
      isContextResetMarker(msg({ type: "Text", data: { kind: AI_CONTEXT_RESET_KIND } })),
    ).toBe(false);
    expect(isContextResetMarker(msg({ type: "SystemActivity", content: "x joined" }))).toBe(
      false,
    );
    expect(isContextResetMarker(msg({ type: "SystemActivity", data: { kind: "other" } }))).toBe(
      false,
    );
  });
});
