import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { listChannelKbSourceFileIds, markMessageIngested } from "./kb.service";

const base = {
  orgId: "org-1",
  channelId: "c1",
  messageId: "m1",
  storageKey: "quikchat/org-1/c1/uuid-a.pdf",
  visibility: "PRIVATE",
  userId: "u1",
  ingestedAt: new Date("2026-07-16T00:00:00.000Z"),
};

beforeEach(() => resetMockDb());

describe("markMessageIngested", () => {
  it("spreads existing data and stamps the KB marker on a matching Media row", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue({
      channelId: "c1",
      type: "Media",
      data: { objectPath: base.storageKey, originalName: "a.pdf", mediaType: "application/pdf" },
    } as never);

    await markMessageIngested(base);

    expect(mockDb.qcMessage.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: {
        data: {
          objectPath: base.storageKey,
          originalName: "a.pdf",
          mediaType: "application/pdf",
          kbIngested: true,
          kbVisibility: "PRIVATE",
          kbIngestedBy: "u1",
          kbIngestedAt: "2026-07-16T00:00:00.000Z",
        },
      },
    });
  });

  it("does not update when the row is missing", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(null as never);
    await markMessageIngested(base);
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
  });

  it("does not update when the channel does not match (cross-channel guard)", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue({
      channelId: "other",
      type: "Media",
      data: { objectPath: base.storageKey },
    } as never);
    await markMessageIngested(base);
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
  });

  it("does not update when objectPath ≠ storageKey (wrong-row guard)", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue({
      channelId: "c1",
      type: "Media",
      data: { objectPath: "quikchat/org-1/c1/uuid-OTHER.pdf" },
    } as never);
    await markMessageIngested(base);
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
  });
});

describe("listChannelKbSourceFileIds", () => {
  it("returns deduped objectPaths of marked Media messages", async () => {
    mockDb.qcMessage.findMany.mockResolvedValue([
      { data: { objectPath: "quikchat/org-1/c1/a.pdf", kbIngested: true } },
      { data: { objectPath: "quikchat/org-1/c1/b.pdf", kbIngested: true } },
      { data: { objectPath: "quikchat/org-1/c1/a.pdf", kbIngested: true } }, // dup
      { data: null }, // ignored
    ] as never);

    const ids = await listChannelKbSourceFileIds("org-1", "c1");
    expect(ids).toEqual(["quikchat/org-1/c1/a.pdf", "quikchat/org-1/c1/b.pdf"]);
    expect(mockDb.qcMessage.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        channelId: "c1",
        type: "Media",
        data: { path: ["kbIngested"], equals: true },
      },
      select: { data: true },
    });
  });
});
