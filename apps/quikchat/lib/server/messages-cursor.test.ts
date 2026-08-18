import { describe, expect, it } from "vitest";
import { MESSAGES_ORDER, olderThanCursor } from "./messages-cursor";
import { sortMessagesAsc } from "@/lib/realtime-cache";
import type { MessageDto } from "@/lib/shared";

const T = new Date("2026-02-01T10:00:00.000Z");

describe("olderThanCursor", () => {
  it("matches strictly-older timestamps OR the same timestamp with a lower id", () => {
    expect(olderThanCursor({ createdAt: T, id: "m-5" })).toEqual({
      OR: [{ createdAt: { lt: T } }, { createdAt: T, id: { lt: "m-5" } }],
    });
  });

  it("keeps the tie branch pinned to the exact cursor timestamp, not a range", () => {
    // Regression guard for the original bug: the tie branch must be an equality
    // on `createdAt`. If it ever widens to `lte`, rows at T are matched by both
    // branches and the page overlaps itself.
    const tie = olderThanCursor({ createdAt: T, id: "m-5" }).OR as Array<Record<string, unknown>>;
    expect(tie[1]!.createdAt).toEqual(T);
  });
});

describe("MESSAGES_ORDER", () => {
  it("is the exact reverse of the client's ascending (createdAt, id) sort", () => {
    expect(MESSAGES_ORDER).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("reversing a page ordered by it reproduces sortMessagesAsc's order", () => {
    // The two orders must agree on same-timestamp rows or pagination seams
    // skip messages. Three rows share `T`; `b` is a millisecond older.
    const rows: MessageDto[] = [
      { id: "m-3", createdAt: T.toISOString() },
      { id: "m-1", createdAt: T.toISOString() },
      { id: "m-2", createdAt: T.toISOString() },
      { id: "m-0", createdAt: new Date(T.getTime() - 1).toISOString() },
    ] as MessageDto[];

    // What the DB returns under MESSAGES_ORDER (createdAt desc, id desc).
    const serverDesc = [...rows].sort((a, b) => {
      const d = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return d !== 0 ? d : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });

    expect([...serverDesc].reverse().map((m) => m.id)).toEqual(
      sortMessagesAsc(rows).map((m) => m.id),
    );
  });
});
