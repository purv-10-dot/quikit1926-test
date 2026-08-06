import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getRawSession } from "@/lib/session";
import { DELETE as clearAll, GET as listFeed } from "./route";
import { GET as getSettings, PATCH as patchSettings } from "./settings/route";
import { GET as listKeywords, POST as addKeyword } from "./keywords/route";
import { DELETE as removeKeyword } from "./keywords/[id]/route";
import { POST as readByChannel } from "./read-by-channel/route";
import { PATCH as patchPref } from "../channels/[id]/notification-preference/route";

const mockSession = getRawSession as unknown as Mock;

let aliceId = "";
let orgAId = "";
let generalId = "";
let globexChannelId = "";

const get = (path = "http://test.local/api/notifications") => new Request(path);
const send = (method: string, body: unknown) =>
  new Request("http://test.local/api/x", {
    method,
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
  await prisma.qcNotificationKeyword.deleteMany({ where: { userId: aliceId } });
  await prisma.qcNotificationPreference.deleteMany({ where: { userId: aliceId } });
  await prisma.qcUserNotificationSettings.deleteMany({ where: { userId: aliceId } });
  await prisma.qcNotification.deleteMany({ where: { userId: aliceId } });
  await prisma.$disconnect();
});

describe("GET /api/notifications", () => {
  it("401 unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    expect((await listFeed(get())).status).toBe(401);
  });

  it("200 with { items, unreadCount }", async () => {
    const res = await listFeed(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; unreadCount: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.unreadCount).toBe("number");
  });
});

describe("settings route", () => {
  it("GET returns the default-shaped settings", async () => {
    const body = (await (await getSettings(get())).json()) as Record<string, unknown>;
    expect(body.defaultChannelLevel).toBe("all");
    expect(body.priorityDuringDnd).toBe(true);
    expect(body.callSoundsEnabled).toBe(true); // calls ring out of the box
  });

  it("PATCH updates allow-listed fields", async () => {
    const res = await patchSettings(send("PATCH", { dmsLevel: "mentions", desktopEnabled: false }));
    const body = (await res.json()) as { dmsLevel: string; desktopEnabled: boolean };
    expect(body.dmsLevel).toBe("mentions");
    expect(body.desktopEnabled).toBe(false);
  });

  // Regression: callSoundsEnabled reached the DB column, the DTO and the
  // service allow-list but was missing its line in the route's per-field chain,
  // so the PATCH 200'd and persisted nothing. Round-trips against the real DB
  // here; settings/route.test.ts covers the input gate without one.
  it("PATCH persists callSoundsEnabled:false and GET reads it back", async () => {
    const patched = (await (
      await patchSettings(send("PATCH", { callSoundsEnabled: false }))
    ).json()) as { callSoundsEnabled: boolean };
    expect(patched.callSoundsEnabled).toBe(false);

    const reread = (await (await getSettings(get())).json()) as { callSoundsEnabled: boolean };
    expect(reread.callSoundsEnabled).toBe(false);
  });

  it("PATCH callSoundsEnabled does not disturb soundEnabled (independent toggles)", async () => {
    await patchSettings(send("PATCH", { soundEnabled: true, callSoundsEnabled: false }));
    const body = (await (await getSettings(get())).json()) as {
      soundEnabled: boolean;
      callSoundsEnabled: boolean;
    };
    expect(body.soundEnabled).toBe(true);
    expect(body.callSoundsEnabled).toBe(false);
  });
});

describe("keywords route", () => {
  it("POST adds, GET lists, DELETE removes", async () => {
    const added = (await (await addKeyword(send("POST", { keyword: "Launch" }))).json()) as {
      id: string;
      keyword: string;
    };
    expect(added.keyword).toBe("launch");

    const list = (await (await listKeywords(get())).json()) as Array<{ keyword: string }>;
    expect(list.some((k) => k.keyword === "launch")).toBe(true);

    const del = await removeKeyword(send("DELETE", {}), { params: { id: added.id } });
    expect(del.status).toBe(200);
  });
});

describe("read-by-channel route", () => {
  it("returns { channelId, affected, unreadCount }", async () => {
    const res = await readByChannel(send("POST", { channelId: generalId }));
    const body = (await res.json()) as { channelId: string; affected: number; unreadCount: number };
    expect(body.channelId).toBe(generalId);
    expect(typeof body.affected).toBe("number");
  });
});

describe("channel preference route (tenant isolation)", () => {
  it("rejects a cross-org channel preference (403)", async () => {
    const res = await patchPref(send("PATCH", { level: "none" }), {
      params: { id: globexChannelId },
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/notifications clears the feed", () => {
  it("returns { unreadCount: 0 }", async () => {
    const res = await clearAll(send("DELETE", {}));
    const body = (await res.json()) as { unreadCount: number };
    expect(body.unreadCount).toBe(0);
  });
});
