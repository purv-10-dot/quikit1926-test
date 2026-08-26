import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST, PATCH } from "@/app/api/connections/route";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init as ConstructorParameters<typeof NextRequest>[1]);
}

const ADMIN = { id: "u_admin", orgId: "org_A", membershipRole: "org_admin" };
const MEMBER = { id: "u_member", orgId: "org_A", membershipRole: "employee" };

beforeEach(() => resetMockDb());

describe("GET /api/connections", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req("/api/connections"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("lists org connections and flags external providers", async () => {
    setSession(MEMBER);
    mockDb.wfConnection.findMany.mockResolvedValue([
      { id: "c1", provider: "teams", label: "Teams", status: "connected", expiresAt: null } as never,
      { id: "c2", provider: "quikscale", label: "QuikScale", status: "connected", expiresAt: null } as never,
    ]);
    const res = await GET(req("/api/connections"), { params: {} });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(mockDb.wfConnection.findMany.mock.calls[0][0]?.where?.orgId).toBe("org_A");
    expect(body.data.find((c: { provider: string }) => c.provider === "teams").external).toBe(true);
    expect(body.data.find((c: { provider: string }) => c.provider === "quikscale").external).toBe(false);
  });
});

describe("POST /api/connections", () => {
  it("rejects a non-admin with 403 (managing connections is admin-only)", async () => {
    setSession(MEMBER);
    const res = await POST(
      req("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "slack", label: "Slack" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(403);
    expect(mockDb.wfConnection.create).not.toHaveBeenCalled();
  });

  it("lets an admin create a connection (201)", async () => {
    setSession(ADMIN);
    mockDb.wfConnection.create.mockResolvedValue({ id: "c_new" } as never);
    const res = await POST(
      req("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "slack", label: "Slack" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(201);
    expect(mockDb.wfConnection.create.mock.calls[0][0].data.orgId).toBe("org_A");
  });
});

describe("PATCH /api/connections — Fathom account email", () => {
  it("rejects a non-admin with 403", async () => {
    setSession(MEMBER);
    const res = await PATCH(
      req("/api/connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "c1", notetakerEmail: "rohit@quikit.com" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(403);
    expect(mockDb.wfConnection.update).not.toHaveBeenCalled();
  });

  it("404s when the connection isn't in the caller's org", async () => {
    setSession(ADMIN);
    mockDb.wfConnection.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req("/api/connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "c1", notetakerEmail: "rohit@quikit.com" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(404);
  });

  it("merges notetakerEmail into existing settings", async () => {
    setSession(ADMIN);
    mockDb.wfConnection.findFirst.mockResolvedValue({ settings: { other: "keep-me" } } as never);
    mockDb.wfConnection.update.mockResolvedValue({} as never);
    const res = await PATCH(
      req("/api/connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "c1", notetakerEmail: "rohit@quikit.com" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(200);
    expect(mockDb.wfConnection.update.mock.calls[0][0].data.settings).toEqual({
      other: "keep-me",
      notetakerEmail: "rohit@quikit.com",
    });
  });

  it("clears notetakerEmail when given an empty string", async () => {
    setSession(ADMIN);
    mockDb.wfConnection.findFirst.mockResolvedValue({
      settings: { notetakerEmail: "old@quikit.com", other: "keep-me" },
    } as never);
    mockDb.wfConnection.update.mockResolvedValue({} as never);
    const res = await PATCH(
      req("/api/connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "c1", notetakerEmail: "" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(200);
    expect(mockDb.wfConnection.update.mock.calls[0][0].data.settings).toEqual({ other: "keep-me" });
  });

  /**
   * Save time is the ONLY moment a human is present to see this problem. Both
   * bad shapes fail silently later: a malformed address makes Graph reject the
   * whole event, and a bot-looking address is nobody's mailbox — the invite
   * bounces, the meeting never reaches Fathom's Upcoming Meetings, and nothing
   * joins, while every layer reports success.
   */
  it.each([
    ["a bot mailbox", "notetaker@fathom.video", /no invitable bot mailbox/i],
    ["a Fathom-domain address", "anything@fathom.ai", /no invitable bot mailbox/i],
    ["a notetaker-named address", "meeting-notetaker@acme.com", /no invitable bot mailbox/i],
    ["a malformed address", "not-an-email", /valid email address/i],
  ])("rejects %s with 400 and an explanation", async (_label, value, expected) => {
    setSession(ADMIN);
    const res = await PATCH(
      req("/api/connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "c1", notetakerEmail: value }),
      }),
      { params: {} },
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(expected);
    expect(mockDb.wfConnection.update).not.toHaveBeenCalled();
  });
});
