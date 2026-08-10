import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { hashPatToken } from "@/lib/api/patToken";
import { GET, POST } from "@/app/api/org/pats/route";
import { DELETE } from "@/app/api/org/pats/[patId]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

const ROUTE_CTX = { params: {} } as never;
const PAT_ROUTE_CTX = { params: { patId: "pat_1" } } as never;

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/org/pats", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function getReq() {
  return new NextRequest("http://localhost/api/org/pats");
}

function deleteReq() {
  return new NextRequest("http://localhost/api/org/pats/pat_1", { method: "DELETE" });
}

function asSignedInMember() {
  // Self-service — no permission check beyond "signed in, active member of
  // this org", unlike the retired project-nested route's Project:update gate.
  setSession({ id: USER, orgId: TENANT, role: "member" });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("POST /api/org/pats", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq({ name: "Claude Code", expiresInDays: 30 }), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("400 when expiresInDays is missing", async () => {
    asSignedInMember();
    const res = await POST(postReq({ name: "Claude Code" }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();
  });

  it("400 when expiresInDays exceeds the 90-day cap", async () => {
    asSignedInMember();
    const res = await POST(postReq({ name: "Claude Code", expiresInDays: 91 }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();
  });

  it("400 when name is missing or blank", async () => {
    asSignedInMember();
    const res = await POST(postReq({ expiresInDays: 30 }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();

    const res2 = await POST(postReq({ name: "   ", expiresInDays: 30 }), ROUTE_CTX);
    expect(res2.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();
  });

  it("creates a user-scoped PAT (projectId: null) and returns the raw token exactly once", async () => {
    asSignedInMember();
    mockDb.qtPersonalAccessToken.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "pat_1",
          name: data.name as string,
          expiresAt: data.expiresAt as Date,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        }) as never,
    );

    const res = await POST(postReq({ name: "Claude Code — laptop", expiresInDays: 30 }), ROUTE_CTX);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("pat_1");
    expect(json.data.name).toBe("Claude Code — laptop");
    expect(typeof json.data.token).toBe("string");
    expect(json.data.token.length).toBeGreaterThan(0);

    const createCall = mockDb.qtPersonalAccessToken.create.mock.calls[0][0] as {
      data: { orgId: string; projectId: string | null; createdById: string; name: string; tokenHash: string; expiresAt: Date };
    };
    expect(createCall.data.orgId).toBe(TENANT);
    expect(createCall.data.projectId).toBeNull();
    expect(createCall.data.createdById).toBe(USER);
    expect(createCall.data.name).toBe("Claude Code — laptop");
    expect(createCall.data.tokenHash).toBe(hashPatToken(json.data.token));
    const daysUntilExpiry = (createCall.data.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(29);
    expect(daysUntilExpiry).toBeLessThan(31);
  });
});

describe("GET /api/org/pats", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("returns this user's active PATs — both user-scoped and legacy project-scoped rows — without the token hash, newest first", async () => {
    asSignedInMember();
    mockDb.qtPersonalAccessToken.findMany.mockResolvedValue([
      {
        id: "pat_2",
        name: "Claude Code — laptop",
        projectId: null,
        project: null,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        lastUsedAt: null,
        expiresAt: new Date("2026-04-02T00:00:00Z"),
        revokedAt: null,
      },
      {
        id: "pat_1",
        name: "CI pipeline (legacy)",
        projectId: PROJECT,
        project: { name: "Test_demo" },
        createdAt: new Date("2026-01-01T00:00:00Z"),
        lastUsedAt: new Date("2026-01-03T00:00:00Z"),
        expiresAt: new Date("2027-01-01T00:00:00Z"),
        revokedAt: null,
      },
    ] as never);

    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].id).toBe("pat_2");
    expect(json.data[0].projectId).toBeNull();
    expect(json.data[1].project.name).toBe("Test_demo");
    expect(json.data[0]).not.toHaveProperty("tokenHash");
    expect(mockDb.qtPersonalAccessToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: TENANT, createdById: USER, revokedAt: null }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("DELETE /api/org/pats/[patId]", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the PAT doesn't exist for this user", async () => {
    asSignedInMember();
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue(null);

    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(404);
    expect(mockDb.qtPersonalAccessToken.update).not.toHaveBeenCalled();
  });

  it("404 when the PAT belongs to a different user — self-service only, no cross-user revocation", async () => {
    asSignedInMember();
    // The lookup itself is scoped to createdById: userId, so another user's
    // token simply doesn't match — same 404 as a nonexistent id, no leak.
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue(null);

    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(404);
    expect(mockDb.qtPersonalAccessToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pat_1", orgId: TENANT, createdById: USER } }),
    );
  });

  it("200 when the user revokes their own token", async () => {
    asSignedInMember();
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({ id: "pat_1" } as never);
    mockDb.qtPersonalAccessToken.update.mockResolvedValue({
      id: "pat_1",
      revokedAt: new Date("2026-01-01T00:00:00Z"),
    } as never);

    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.revokedAt).toBeTruthy();
  });
});
