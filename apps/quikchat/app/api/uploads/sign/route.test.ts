import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getRawSession } from "@/lib/session";
import { POST } from "./route";

const mockSession = getRawSession as unknown as Mock;

let orgAId = "";
let aliceId = "";
let generalId = "";
let globexChannelId = "";

const post = (body: unknown) =>
  new Request("http://test.local/api/uploads/sign", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  generalId = (
    await prisma.qcChannel.findFirstOrThrow({ where: { orgId: orgAId, name: "general" } })
  ).id;
  const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
  globexChannelId = (
    await prisma.qcChannel.findFirstOrThrow({ where: { orgId: orgB.id, name: "announcements" } })
  ).id;
  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const valid = { channelId: "", filename: "pic.png", contentType: "image/png", size: 1024 };

describe("POST /api/uploads/sign", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post({ ...valid, channelId: generalId }));
    expect(res.status).toBe(401);
  });

  it("mints an org-scoped upload target for a member", async () => {
    const res = await POST(post({ ...valid, channelId: generalId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { objectPath: string; uploadUrl: string; method: string };
    expect(body.method).toBe("PUT");
    expect(body.objectPath.startsWith(`quikchat/${orgAId}/${generalId}/`)).toBe(true);
    expect(typeof body.uploadUrl).toBe("string");
  });

  it("rejects a disallowed content-type (415)", async () => {
    const res = await POST(
      post({ ...valid, channelId: generalId, contentType: "application/x-evil" }),
    );
    expect(res.status).toBe(415);
  });

  it("admits an empty-MIME code file by extension (200)", async () => {
    const res = await POST(
      post({ ...valid, channelId: generalId, contentType: "", filename: "script.py" }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an empty-MIME active-content / unknown extension (415)", async () => {
    const html = await POST(
      post({ ...valid, channelId: generalId, contentType: "", filename: "index.html" }),
    );
    expect(html.status).toBe(415);
    const exe = await POST(
      post({ ...valid, channelId: generalId, contentType: "", filename: "virus.exe" }),
    );
    expect(exe.status).toBe(415);
  });

  it("rejects an oversize file (413)", async () => {
    const res = await POST(post({ ...valid, channelId: generalId, size: 26 * 1024 * 1024 }));
    expect(res.status).toBe(413);
  });

  it("rejects a cross-org / non-member channel (403)", async () => {
    const res = await POST(post({ ...valid, channelId: globexChannelId }));
    expect(res.status).toBe(403);
  });

  it("rate-limits a burst (429)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      const res = await POST(post({ ...valid, channelId: generalId }));
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
