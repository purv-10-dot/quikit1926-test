import { db as prisma } from "@quikit/database";
import {
  __getIndexedForTest,
  __getPublishedForTest,
  __resetIndexedForTest,
  __resetPublishedForTest,
  type OrgContext,
} from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import { deleteForEveryone, editMessage, send } from "./messages.service";

let orgAId = "";
let aliceId = "";
let channelId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "index-test" },
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

describe("message index events", () => {
  it("send emits an upsert alongside the fanout", async () => {
    __resetIndexedForTest();
    __resetPublishedForTest();
    const m = await send(ctx(), channelId, { content: "indexed hello" });
    const idx = __getIndexedForTest().find((e) => e.id === m.id);
    expect(idx).toMatchObject({ op: "upsert", orgId: orgAId, channelId, entity: "message" });
    expect(__getPublishedForTest().some((e) => e.event === "message")).toBe(true);
  });

  it("edit emits an upsert", async () => {
    const m = await send(ctx(), channelId, { content: "before" });
    __resetIndexedForTest();
    await editMessage(ctx(), m.id, "after");
    expect(__getIndexedForTest().find((e) => e.id === m.id)).toMatchObject({ op: "upsert" });
  });

  it("delete emits a delete", async () => {
    const m = await send(ctx(), channelId, { content: "to delete" });
    __resetIndexedForTest();
    await deleteForEveryone(ctx(), m.id);
    expect(__getIndexedForTest().find((e) => e.id === m.id)).toMatchObject({
      op: "delete",
      channelId,
    });
  });
});

describe("idempotent sends (clientMessageId)", () => {
  it("returns the same message for a repeated clientMessageId (one physical row)", async () => {
    const cmid = `cmid-${Date.now()}`;
    const m1 = await send(ctx(), channelId, { content: "once", clientMessageId: cmid });
    const m2 = await send(ctx(), channelId, { content: "once", clientMessageId: cmid });
    expect(m2.id).toBe(m1.id);
    expect(m2.clientMessageId).toBe(cmid);
    const count = await prisma.qcMessage.count({ where: { channelId, clientMessageId: cmid } });
    expect(count).toBe(1);
  });
});

describe("actorType stamping (Requirement 4)", () => {
  it("stamps ai_agent + agentRunId when an agent authors", async () => {
    const m = await send(
      ctx(),
      channelId,
      { content: "from agent" },
      {
        actorType: "ai_agent",
        agentRunId: "run-77",
      },
    );
    expect(m.actorType).toBe("ai_agent");
    const row = await prisma.qcMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.actorType).toBe("ai_agent");
    expect(row.agentRunId).toBe("run-77");
  });

  it("defaults to human for a normal send", async () => {
    const m = await send(ctx(), channelId, { content: "from human" });
    expect(m.actorType).toBe("human");
  });
});
