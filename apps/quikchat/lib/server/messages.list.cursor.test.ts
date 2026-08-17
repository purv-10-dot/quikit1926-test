/**
 * Composition coverage for `messages.list`'s scroll-back cursor.
 *
 * `messages-cursor.test.ts` proves the predicate's SHAPE. It cannot prove the
 * service actually uses it — and the service's own test file
 * (`messages.service.test.ts`) is in vitest.config.ts's `exclude` list, so
 * nothing that runs would notice someone inlining a hand-rolled `where` here.
 * That is what this file closes.
 *
 * Those 30 files are excluded because they need a real Postgres. Asserting the
 * ARGUMENTS handed to Prisma needs no database at all, so this runs in the
 * normal suite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES_ORDER, olderThanCursor } from "./messages-cursor";
import type { OrgContext } from "@/lib/shared";

// `vi.mock` factories are hoisted above module-scope consts, so the spies have
// to be created inside `vi.hoisted` to exist by the time the factory runs.
const h = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));

vi.mock("@quikit/database", async () => {
  // Re-export the real Prisma namespace/enums (messages.service imports
  // `Prisma`), but hand back a stub client. Importing from @prisma/client
  // rather than @quikit/database avoids instantiating a real PrismaClient,
  // which would demand DATABASE_URL.
  const actual = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    ...actual,
    db: { qcMessage: { findFirst: h.findFirst, findMany: h.findMany } },
  };
});

vi.mock("@/lib/auth-shims", async () => {
  // Keep the real HttpError (the 400 assertion depends on its shape); stub only
  // the membership guard, which would otherwise hit the database.
  const errors = await vi.importActual<typeof import("@/lib/errors")>("@/lib/errors");
  return { ...errors, assertMembership: vi.fn().mockResolvedValue(undefined) };
});

import * as messages from "./messages.service";

const ctx = { orgId: "org-1", userId: "u-1" } as OrgContext;
const CHANNEL = "chan-1";
const CURSOR_AT = new Date("2026-02-01T10:00:00.000Z");

beforeEach(() => {
  h.findFirst.mockReset();
  h.findMany.mockReset();
  // Empty page → serializeMany short-circuits, so no further db calls are made.
  h.findMany.mockResolvedValue([]);
});

describe("messages.list — cursor composition", () => {
  it("composes olderThanCursor into the where clause and orders by MESSAGES_ORDER", async () => {
    h.findFirst.mockResolvedValue({ id: "m-5", createdAt: CURSOR_AT });

    await messages.list(ctx, CHANNEL, 30, "m-5");

    expect(h.findMany).toHaveBeenCalledTimes(1);
    const args = h.findMany.mock.calls[0]![0];
    // The composed where must CONTAIN the shared predicate verbatim — not a
    // hand-rolled equivalent that can drift from sortMessagesAsc.
    expect(args.where).toEqual({
      orgId: "org-1",
      channelId: CHANNEL,
      ...olderThanCursor({ id: "m-5", createdAt: CURSOR_AT }),
    });
    expect(args.orderBy).toEqual(MESSAGES_ORDER);
    expect(args.take).toBe(30);
  });

  it("scopes the cursor lookup to the channel, not just the org", async () => {
    h.findFirst.mockResolvedValue({ id: "m-5", createdAt: CURSOR_AT });

    await messages.list(ctx, CHANNEL, 30, "m-5");

    expect(h.findFirst).toHaveBeenCalledTimes(1);
    expect(h.findFirst.mock.calls[0]![0].where).toEqual({
      id: "m-5",
      orgId: "org-1",
      channelId: CHANNEL,
    });
  });

  it("rejects an unknown or cross-channel cursor with a 400 instead of the newest page", async () => {
    // A cursor id from another channel resolves to null under the channel-scoped
    // lookup above — same path as a genuinely unknown id.
    h.findFirst.mockResolvedValue(null);

    await expect(messages.list(ctx, CHANNEL, 30, "m-from-other-channel")).rejects.toMatchObject({
      status: 400,
    });
    // The critical half: it must NOT fall through and serve the newest page.
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it("omits the cursor predicate entirely when no `before` is given", async () => {
    await messages.list(ctx, CHANNEL, 30);

    expect(h.findFirst).not.toHaveBeenCalled();
    const args = h.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ orgId: "org-1", channelId: CHANNEL });
    expect(args.orderBy).toEqual(MESSAGES_ORDER);
  });

  it("caps `take` at 100 regardless of the requested limit", async () => {
    await messages.list(ctx, CHANNEL, 5000);
    expect(h.findMany.mock.calls[0]![0].take).toBe(100);
  });
});
