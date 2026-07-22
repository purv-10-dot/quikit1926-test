import { db as prisma } from "@quikit/database";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Control the runtime stream + capture the assist input.
type Evt =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; agentRunId: string }
  | { type: "error"; message: string };
type AssistDoc = { url: string; filename: string };
const runtime: {
  events: Evt[];
  lastInput?: { prompt: string; history: unknown[]; document?: AssistDoc };
} = {
  events: [],
};
vi.mock("@/lib/server/runtime", () => ({
  getRuntimeClient: () => ({
    // eslint-disable-next-line require-yield
    assist: async function* (inp: { prompt: string; history: unknown[]; document?: AssistDoc }) {
      runtime.lastInput = inp;
      for (const e of runtime.events) yield e;
    },
  }),
}));

import { getRawSession } from "@/lib/session";
import {
  setAssistantEnabled,
  ASSISTANT_BOT_USER_ID,
} from "@/lib/server/assistant.service";
import { POST } from "./route";

const mockSession = getRawSession as unknown as Mock;

let orgAId = "";
let aliceId = "";
let channelId = "";
let globexChannelId = "";

const post = (id: string, body: unknown) =>
  new Request(`http://test.local/api/channels/${id}/assist`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

async function readSse(res: Response): Promise<string> {
  return res.text();
}

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "assist-test" },
  });
  channelId = channel.id;
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId, userId: aliceId, role: "admin" },
  });
  await prisma.qcMessage.create({
    data: {
      orgId: orgAId,
      channelId,
      senderId: aliceId,
      content: "earlier message",
      reactions: {},
    },
  });
  const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
  globexChannelId = (
    await prisma.qcChannel.findFirstOrThrow({ where: { orgId: orgB.id, name: "announcements" } })
  ).id;
  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

afterAll(async () => {
  await prisma.qcNotification.deleteMany({ where: { channelId } });
  await prisma.qcMessage.deleteMany({ where: { channelId } });
  await prisma.qcChannelMember.deleteMany({ where: { channelId } });
  await prisma.qcAssistantConfig.deleteMany({ where: { orgId: orgAId } });
  await prisma.qcChannel.deleteMany({ where: { id: channelId } });
  await prisma.$disconnect();
});

afterEach(() => {
  runtime.events = [];
  runtime.lastInput = undefined;
});

describe("POST /api/channels/[id]/assist", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post(channelId, { prompt: "hi" }), { params: { id: channelId } });
    expect(res.status).toBe(401);
  });

  it("relays delta/done as SSE, builds history, and posts an ai_agent reply", async () => {
    runtime.events = [
      { type: "delta", text: "Hel" },
      { type: "done", text: "Hello there", agentRunId: "run-A" },
    ];
    const res = await POST(post(channelId, { prompt: "summarize this" }), {
      params: { id: channelId },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await readSse(res);
    expect(body).toContain('"type":"delta"');
    expect(body).toContain('"type":"done"');
    expect(body).toContain('"agentRunId":"run-A"');
    expect(body).toContain('"clientMessageId":"assist-run-A"');

    // History was built from recent messages + the prompt forwarded.
    expect(runtime.lastInput?.prompt).toBe("summarize this");
    expect(Array.isArray(runtime.lastInput?.history)).toBe(true);
    expect(runtime.lastInput!.history.length).toBeGreaterThan(0);

    // The reply was posted as an ai_agent message stamped with agentRunId.
    const posted = await prisma.qcMessage.findFirstOrThrow({
      where: { channelId, actorType: "ai_agent", clientMessageId: "assist-run-A" },
    });
    expect(posted.content).toBe("Hello there");
    expect(posted.agentRunId).toBe("run-A");
    expect(posted.senderId).toBe(ASSISTANT_BOT_USER_ID);
  });

  it("resolves an attached document to a server-minted URL and forwards url+filename", async () => {
    runtime.events = [{ type: "done", text: "summary", agentRunId: "run-doc" }];
    const storageKey = `quikchat/${orgAId}/${channelId}/uuid-report.pdf`;
    const res = await POST(
      post(channelId, {
        prompt: "summarize this",
        document: { storageKey, filename: "report.pdf", contentType: "application/pdf" },
      }),
      { params: { id: channelId } },
    );
    expect(res.status).toBe(200);
    await readSse(res);
    // The server minted the URL (a client never supplies one); filename forwarded.
    expect(runtime.lastInput?.document?.filename).toBe("report.pdf");
    expect(typeof runtime.lastInput?.document?.url).toBe("string");
    // The local driver (test env) mints an app-token URL, never a client value.
    expect(runtime.lastInput!.document!.url.startsWith("/api/uploads/local/")).toBe(true);
  });

  it("allows an attachment with an empty prompt (summarize on the doc alone)", async () => {
    runtime.events = [{ type: "done", text: "summary", agentRunId: "run-doc2" }];
    const storageKey = `quikchat/${orgAId}/${channelId}/uuid-empty.pdf`;
    const res = await POST(
      post(channelId, { prompt: "", document: { storageKey, filename: "empty.pdf" } }),
      { params: { id: channelId } },
    );
    expect(res.status).toBe(200);
    await readSse(res);
    expect(runtime.lastInput?.prompt).toBe("");
    expect(runtime.lastInput?.document?.filename).toBe("empty.pdf");
  });

  it("rejects a document whose storageKey is not in the caller's channel (403)", async () => {
    runtime.events = [{ type: "done", text: "x", agentRunId: "run-doc3" }];
    const foreignKey = `quikchat/${orgAId}/some-other-channel/uuid-x.pdf`;
    const res = await POST(
      post(channelId, {
        prompt: "summarize",
        document: { storageKey: foreignKey, filename: "x.pdf" },
      }),
      { params: { id: channelId } },
    );
    expect(res.status).toBe(403);
  });

  it("is idempotent on the agentRunId (no duplicate post)", async () => {
    runtime.events = [{ type: "done", text: "dup", agentRunId: "run-DUP" }];
    await POST(post(channelId, { prompt: "x" }), { params: { id: channelId } }).then(readSse);
    runtime.events = [{ type: "done", text: "dup", agentRunId: "run-DUP" }];
    await POST(post(channelId, { prompt: "x" }), { params: { id: channelId } }).then(readSse);
    const count = await prisma.qcMessage.count({
      where: { channelId, clientMessageId: "assist-run-DUP" },
    });
    expect(count).toBe(1);
  });

  it("on error relays the error and posts nothing", async () => {
    runtime.events = [{ type: "error", message: "runtime boom" }];
    const res = await POST(post(channelId, { prompt: "x" }), { params: { id: channelId } });
    const body = await readSse(res);
    expect(body).toContain('"type":"error"');
    const count = await prisma.qcMessage.count({
      where: { channelId, actorType: "ai_agent", content: "runtime boom" },
    });
    expect(count).toBe(0);
  });

  it("rejects when the assistant is disabled for the channel (403)", async () => {
    await setAssistantEnabled(orgAId, channelId, false);
    runtime.events = [{ type: "done", text: "x", agentRunId: "run-z" }];
    const res = await POST(post(channelId, { prompt: "x" }), { params: { id: channelId } });
    expect(res.status).toBe(403);
    await setAssistantEnabled(orgAId, channelId, true);
  });

  it("rejects assisting a cross-org channel (403)", async () => {
    const res = await POST(post(globexChannelId, { prompt: "x" }), {
      params: { id: globexChannelId },
    });
    expect(res.status).toBe(403);
  });

  it("rejects an empty prompt (400)", async () => {
    const res = await POST(post(channelId, { prompt: "   " }), { params: { id: channelId } });
    expect(res.status).toBe(400);
  });

  it("rate-limits a burst (429)", async () => {
    runtime.events = [{ type: "done", text: "x", agentRunId: "run-rl" }];
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) {
      const res = await POST(post(channelId, { prompt: "x" }), { params: { id: channelId } });
      statuses.push(res.status);
      if (res.body) await readSse(res);
    }
    expect(statuses).toContain(429);
  });
});
