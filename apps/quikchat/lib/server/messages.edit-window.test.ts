/**
 * QC_007 — regression cover for the `editMessage` time window.
 *
 * Lives in its own file rather than in `messages.service.test.ts` because that
 * suite is DB-backed and excluded from the Vitest run (see `vitest.config.ts` —
 * "pending re-home to Playwright e2e"), so a case added there would never
 * execute. The window gate gets checked before any membership/DB write, so a
 * deep-mocked Prisma is enough to drive it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mockDb, resetMockDb } from "@/__tests__/helpers/mockDb";
import { editMessage, EDIT_WINDOW_MS } from "./messages.service";
import type { OrgContext } from "@/lib/shared";

const ctx: OrgContext = { orgId: "org-1", userId: "alice" } as OrgContext;

/** Minimal qcMessage row — only the fields the gate chain reads. */
function row(over: { senderId?: string; type?: string; ageMs?: number } = {}) {
  return {
    id: "m1",
    orgId: "org-1",
    channelId: "c1",
    senderId: over.senderId ?? "alice",
    type: over.type ?? "Text",
    content: "original",
    data: null,
    reactions: {},
    createdAt: new Date(Date.now() - (over.ageMs ?? 0)),
    editedAt: null,
  };
}

beforeEach(() => {
  resetMockDb();
});

describe("editMessage — edit window (QC_007)", () => {
  it("rejects an edit past the window and writes nothing", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(row({ ageMs: EDIT_WINDOW_MS + 1000 }) as never);

    await expect(editMessage(ctx, "m1", "too late")).rejects.toMatchObject({
      status: 403,
      message: "Edit window has passed",
    });
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
  });

  it("lets a message inside the window through the window gate", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(row({ ageMs: EDIT_WINDOW_MS - 1000 }) as never);

    // Empty content is rejected by the NEXT check, which proves the window gate
    // did not fire — asserting on the message distinguishes the two 403s without
    // having to mock the whole serialize + fanout happy path.
    await expect(editMessage(ctx, "m1", "   ")).rejects.toMatchObject({
      status: 403,
      message: "Message cannot be empty",
    });
  });

  it("still checks ownership before the window", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(
      row({ senderId: "bob", ageMs: EDIT_WINDOW_MS + 1000 }) as never,
    );

    await expect(editMessage(ctx, "m1", "nope")).rejects.toMatchObject({
      message: "You can only edit your own messages",
    });
  });

  it("still rejects non-editable types before the window", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(
      row({ type: "SystemActivity", ageMs: 0 }) as never,
    );

    await expect(editMessage(ctx, "m1", "nope")).rejects.toMatchObject({
      message: "This message cannot be edited",
    });
  });

  it("is a 15 minute window", () => {
    expect(EDIT_WINDOW_MS).toBe(15 * 60_000);
  });
});
