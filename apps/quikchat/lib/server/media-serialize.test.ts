import { db as prisma } from "@quikit/database";
import type { OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import * as messages from "./messages.service";

let orgAId = "";
let aliceId = "";
let channelId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "media-test" },
  });
  channelId = channel.id;
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId, userId: aliceId, role: "admin" },
  });
});

afterAll(async () => {
  await prisma.qcMessage.deleteMany({ where: { channelId } });
  await prisma.qcChannelMember.deleteMany({ where: { channelId } });
  await prisma.qcChannel.deleteMany({ where: { id: channelId } });
  await prisma.$disconnect();
});

const ctx = (): OrgContext => ({ userId: aliceId, orgId: orgAId });
const media = {
  objectPath: "quikchat/o/c/uuid-pic.png",
  mediaType: "image/png",
  originalName: "pic.png",
  size: 2048,
};

describe("Media message send + serialize", () => {
  it("stores objectPath and serializes a fresh short-lived mediaUrl", async () => {
    const dto = await messages.send(ctx(), channelId, {
      content: "look at this",
      type: "Media",
      data: { ...media },
      clientMessageId: "media-cmid-1",
    });
    expect(dto.type).toBe("Media");
    const data = dto.data as Record<string, unknown>;
    expect(data.objectPath).toBe(media.objectPath);
    // The local driver mints a token URL; never persisted, injected per read.
    expect(typeof data.mediaUrl).toBe("string");
    expect((data.mediaUrl as string).startsWith("/api/uploads/local/")).toBe(true);

    // Persisted row keeps objectPath but NOT a mediaUrl.
    const row = await prisma.qcMessage.findFirstOrThrow({ where: { id: dto.id } });
    const stored = row.data as Record<string, unknown>;
    expect(stored.objectPath).toBe(media.objectPath);
    expect(stored.mediaUrl).toBeUndefined();
  });

  it("is idempotent on clientMessageId", async () => {
    const a = await messages.send(ctx(), channelId, {
      content: "dup",
      type: "Media",
      data: { ...media },
      clientMessageId: "media-cmid-dup",
    });
    const b = await messages.send(ctx(), channelId, {
      content: "dup",
      type: "Media",
      data: { ...media },
      clientMessageId: "media-cmid-dup",
    });
    expect(b.id).toBe(a.id);
    const count = await prisma.qcMessage.count({
      where: { channelId, clientMessageId: "media-cmid-dup" },
    });
    expect(count).toBe(1);
  });

  it("re-serializes a fresh mediaUrl on read (list)", async () => {
    const list = await messages.list(ctx(), channelId, 50);
    const mediaMsgs = list.filter((m) => m.type === "Media");
    expect(mediaMsgs.length).toBeGreaterThan(0);
    for (const m of mediaMsgs) {
      expect(typeof (m.data as Record<string, unknown>).mediaUrl).toBe("string");
    }
  });
});
