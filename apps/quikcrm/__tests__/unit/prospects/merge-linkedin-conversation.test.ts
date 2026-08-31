import { describe, it, expect } from "vitest";
import {
  mergeLinkedInConversation,
  extractStoredMessages,
  type StoredConversation,
  type StoredMessage,
} from "@/lib/services/prospects/merge-linkedin-conversation";

/**
 * Incremental (append-only) conversation merge.
 *
 * The extractor re-returns the entire thread on every run, so these tests pin
 * the property that matters: saving twice must not double the history, while
 * legitimately repeated text must never be collapsed.
 */

function msg(
  order: number,
  senderName: string,
  text: string,
  extra: Partial<StoredMessage> = {},
): StoredMessage {
  return {
    messageId: null,
    senderName,
    senderProfileUrl: null,
    receiverName: null,
    text,
    timestamp: null,
    date: "Wednesday",
    time: "6:55 PM",
    direction: senderName === "Anurag Pal" ? "sent" : "received",
    messageOrder: order,
    source: "LINKEDIN",
    attachments: [],
    ...extra,
  };
}

function convo(messages: StoredMessage[]): StoredConversation {
  return {
    participant: { name: "Adarsh Jain", profileUrl: null },
    threadId: null,
    capturedAt: "2026-08-13T00:00:00.000Z",
    messageCount: messages.length,
    messages,
  };
}

/** A 10-message baseline thread. */
function tenMessages(): StoredMessage[] {
  return Array.from({ length: 10 }, (_, i) =>
    msg(i + 1, i % 2 === 0 ? "Adarsh Jain" : "Anurag Pal", `message ${i + 1}`),
  );
}

describe("mergeLinkedInConversation", () => {
  it("first save: 0 → 10", () => {
    const r = mergeLinkedInConversation(null, convo(tenMessages()));
    expect(r.totalCount).toBe(10);
    expect(r.appendedCount).toBe(10);
    expect(r.strategy).toBe("no-existing");
    expect(r.conversation.messages.map((m) => m.messageOrder)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("same conversation again: 10 → 10 (nothing appended)", () => {
    const saved = convo(tenMessages());
    const r = mergeLinkedInConversation(saved, convo(tenMessages()));
    expect(r.totalCount).toBe(10);
    expect(r.appendedCount).toBe(0);
    expect(r.strategy).toBe("no-new");
  });

  it("five new messages: 10 → 15, appending only the new ones", () => {
    const saved = convo(tenMessages());
    const fetched = tenMessages().concat([
      msg(11, "Anurag Pal", "I need a demo"),
      msg(12, "Adarsh Jain", "Let's connect tomorrow"),
      msg(13, "Anurag Pal", "Sure"),
      msg(14, "Adarsh Jain", "Thanks"),
      msg(15, "Anurag Pal", "Bye"),
    ]);
    const r = mergeLinkedInConversation(saved, convo(fetched));
    expect(r.totalCount).toBe(15);
    expect(r.appendedCount).toBe(5);
    expect(r.conversation.messages[10].text).toBe("I need a demo");
    expect(r.conversation.messages[14].text).toBe("Bye");
  });

  it("fetch returns the full 15: only 11–15 are appended, never re-added", () => {
    const saved = convo(tenMessages());
    const full15 = tenMessages().concat(
      Array.from({ length: 5 }, (_, i) => msg(11 + i, "Anurag Pal", `new ${i + 1}`)),
    );
    const first = mergeLinkedInConversation(saved, convo(full15));
    expect(first.totalCount).toBe(15);

    // Re-saving the SAME full fetch must be a no-op, not 15 → 30.
    const second = mergeLinkedInConversation(first.conversation, convo(full15));
    expect(second.totalCount).toBe(15);
    expect(second.appendedCount).toBe(0);
  });

  it("repeated identical text is NOT deduplicated", () => {
    const repeated = [
      msg(1, "Anurag Pal", "Well"),
      msg(2, "Adarsh Jain", "Well"),
      msg(3, "Anurag Pal", "Well"),
      msg(4, "Anurag Pal", "No problem"),
      msg(5, "Adarsh Jain", "No problem"),
    ];
    const r = mergeLinkedInConversation(null, convo(repeated));
    expect(r.totalCount).toBe(5);
    expect(r.conversation.messages.filter((m) => m.text === "Well")).toHaveLength(3);
    expect(r.conversation.messages.filter((m) => m.text === "No problem")).toHaveLength(2);

    // And re-saving the same thread must still be a no-op.
    const again = mergeLinkedInConversation(r.conversation, convo(repeated));
    expect(again.totalCount).toBe(5);
    expect(again.appendedCount).toBe(0);
  });

  it("appends correctly when the NEW tail repeats earlier text", () => {
    // "Well" already exists; a further "Well" arrives later. Text-based dedupe
    // would wrongly drop it — sequence alignment must keep it.
    const saved = convo([
      msg(1, "Anurag Pal", "Well"),
      msg(2, "Adarsh Jain", "Well"),
    ]);
    const fetched = [
      msg(1, "Anurag Pal", "Well"),
      msg(2, "Adarsh Jain", "Well"),
      msg(3, "Anurag Pal", "Well"),
    ];
    const r = mergeLinkedInConversation(saved, convo(fetched));
    expect(r.totalCount).toBe(3);
    expect(r.appendedCount).toBe(1);
    expect(r.conversation.messages.filter((m) => m.text === "Well")).toHaveLength(3);
  });

  it("same sender + same timestamp but different text are all preserved", () => {
    const run = [
      msg(1, "Anurag Pal", "No problem"),
      msg(2, "Anurag Pal", "Take your time"),
      msg(3, "Anurag Pal", "I understand"),
      msg(4, "Anurag Pal", "Thanks for letting me know"),
    ];
    const r = mergeLinkedInConversation(null, convo(run));
    expect(r.totalCount).toBe(4);
    expect(r.conversation.messages.map((m) => m.text)).toEqual([
      "No problem",
      "Take your time",
      "I understand",
      "Thanks for letting me know",
    ]);
    // All four share one timestamp — they must not collapse.
    expect(new Set(r.conversation.messages.map((m) => m.time)).size).toBe(1);
  });

  it("existing messageOrder values are never rewritten", () => {
    // Saved history deliberately starts at a non-1 order to prove we preserve
    // whatever was stored rather than renumbering.
    const saved = convo([
      msg(101, "Adarsh Jain", "old one"),
      msg(102, "Anurag Pal", "old two"),
    ]);
    const fetched = [
      msg(1, "Adarsh Jain", "old one"),
      msg(2, "Anurag Pal", "old two"),
      msg(3, "Adarsh Jain", "brand new"),
    ];
    const r = mergeLinkedInConversation(saved, convo(fetched));
    expect(r.conversation.messages[0].messageOrder).toBe(101);
    expect(r.conversation.messages[1].messageOrder).toBe(102);
    // New message continues from the highest existing order.
    expect(r.conversation.messages[2].messageOrder).toBe(103);
    expect(r.appendedCount).toBe(1);
  });

  it("aligns on messageId when available", () => {
    const saved = convo([
      msg(1, "A B", "one", { messageId: "urn:1" }),
      msg(2, "C D", "two", { messageId: "urn:2" }),
    ]);
    const fetched = [
      msg(1, "A B", "one", { messageId: "urn:1" }),
      msg(2, "C D", "two", { messageId: "urn:2" }),
      msg(3, "A B", "three", { messageId: "urn:3" }),
    ];
    const r = mergeLinkedInConversation(saved, convo(fetched));
    expect(r.strategy).toBe("message-id");
    expect(r.appendedCount).toBe(1);
    expect(r.totalCount).toBe(3);
  });

  it("handles a virtualised fetch that starts mid-history", () => {
    // LinkedIn returned only the tail of the thread. The saved tail overlaps
    // the fetched head, so only the genuinely new messages are appended.
    const saved = convo([
      msg(1, "A B", "m1"),
      msg(2, "C D", "m2"),
      msg(3, "A B", "m3"),
    ]);
    const fetched = [
      msg(1, "C D", "m2"),
      msg(2, "A B", "m3"),
      msg(3, "C D", "m4"),
    ];
    const r = mergeLinkedInConversation(saved, convo(fetched));
    expect(r.totalCount).toBe(4);
    expect(r.appendedCount).toBe(1);
    expect(r.conversation.messages.map((m) => m.text)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("appends everything when the fetch is wholly disjoint (lossless)", () => {
    const saved = convo([msg(1, "A B", "old")]);
    const fetched = [msg(1, "C D", "totally different")];
    const r = mergeLinkedInConversation(saved, convo(fetched));
    expect(r.strategy).toBe("disjoint-append");
    expect(r.totalCount).toBe(2);
    expect(r.appendedCount).toBe(1);
  });

  it("accepts both stored shapes (envelope and bare array)", () => {
    const bare = [msg(1, "A B", "one")];
    const r = mergeLinkedInConversation(bare, convo([msg(1, "A B", "one"), msg(2, "C D", "two")]));
    expect(r.totalCount).toBe(2);
    expect(r.appendedCount).toBe(1);
  });

  it("extractStoredMessages tolerates malformed blobs", () => {
    expect(extractStoredMessages(null)).toEqual([]);
    expect(extractStoredMessages({})).toEqual([]);
    expect(extractStoredMessages({ messages: "nope" })).toEqual([]);
    expect(extractStoredMessages("string")).toEqual([]);
  });
});
