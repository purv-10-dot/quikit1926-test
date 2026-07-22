import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Control runtime.ingest + capture its input, but keep the REAL IngestError so
// the route's `instanceof` error-mapping path works.
const runtime: { impl: (inp: unknown) => unknown; lastInput?: Record<string, unknown> } = {
  impl: () => ({ sourceFileId: "x", chunksStored: 1, contentHash: "h" }),
};
vi.mock("@/lib/server/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/runtime")>("@/lib/server/runtime");
  return {
    ...actual,
    getRuntimeClient: () => ({
      ingest: (inp: Record<string, unknown>) => {
        runtime.lastInput = inp;
        return runtime.impl(inp);
      },
    }),
  };
});

import { getRawSession } from "@/lib/session";
import { IngestError } from "@/lib/server/runtime";
import { POST } from "./route";

const mockSession = getRawSession as unknown as Mock;

let orgAId = "";
let aliceId = "";
let channelId = "";

const post = (id: string, body: unknown) =>
  new Request(`http://test.local/api/channels/${id}/ingest`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "ai", visibility: "private", name: null },
  });
  channelId = channel.id;
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId, userId: aliceId, role: "admin" },
  });
  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

afterAll(async () => {
  await prisma.qcChannelMember.deleteMany({ where: { channelId } });
  await prisma.qcAssistantConfig.deleteMany({ where: { orgId: orgAId } });
  await prisma.qcChannel.deleteMany({ where: { id: channelId } });
  await prisma.$disconnect();
});

const keyFor = (id = channelId) => `quikchat/${orgAId}/${id}/uuid-report.pdf`;

describe("POST /api/channels/[id]/ingest", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post(channelId, { storageKey: keyFor(), filename: "report.pdf" }), {
      params: { id: channelId },
    });
    expect(res.status).toBe(401);
  });

  it("ingests with sourceFileId===storageKey, appId=quikchat, default PRIVATE", async () => {
    runtime.impl = () => ({ sourceFileId: keyFor(), chunksStored: 42, contentHash: "abc" });
    const res = await POST(post(channelId, { storageKey: keyFor(), filename: "report.pdf" }), {
      params: { id: channelId },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sourceFileId: keyFor(),
      chunksStored: 42,
      contentHash: "abc",
    });
    expect(runtime.lastInput).toMatchObject({
      storageKey: keyFor(),
      sourceFileId: keyFor(),
      appId: "quikchat",
      visibility: "PRIVATE",
      filename: "report.pdf",
    });
  });

  it("rejects a storageKey not in the caller's channel (403, runtime not called)", async () => {
    runtime.lastInput = undefined;
    const res = await POST(
      post(channelId, { storageKey: keyFor("some-other-channel"), filename: "x.pdf" }),
      { params: { id: channelId } },
    );
    expect(res.status).toBe(403);
    expect(runtime.lastInput).toBeUndefined();
  });

  it("rejects an invalid visibility (400)", async () => {
    const res = await POST(
      post(channelId, { storageKey: keyFor(), filename: "x.pdf", visibility: "PUBLIC" }),
      { params: { id: channelId } },
    );
    expect(res.status).toBe(400);
  });

  it("maps a runtime IngestError(object_not_found) → 404 with the code", async () => {
    runtime.impl = () => {
      throw new IngestError("object_not_found", 404);
    };
    const res = await POST(post(channelId, { storageKey: keyFor(), filename: "x.pdf" }), {
      params: { id: channelId },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "object_not_found" });
  });
});
