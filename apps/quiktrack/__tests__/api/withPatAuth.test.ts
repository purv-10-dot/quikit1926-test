import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { withPatAuth } from "@/lib/api/withPatAuth";
import { hashPatToken } from "@/lib/api/patToken";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

vi.mock("@quikit/shared/rateLimit", () => ({
  rateLimitAsync: vi.fn(),
}));

const mockRateLimitAsync = vi.mocked(rateLimitAsync);

const RAW_TOKEN = "test-raw-token-value";
const ORG = "org_1";
const PROJECT = "proj_1";
const CREATED_BY = "user_1";

function buildRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest("http://localhost/api/mcp", { headers });
}

beforeEach(() => {
  resetMockDb();
  mockRateLimitAsync.mockResolvedValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000, retryAfterSeconds: 0 });
  mockDb.qtPersonalAccessToken.update.mockResolvedValue({} as never);
  // Default: loadProjectAccess's live-access recheck succeeds (project exists,
  // creator is a plain — non-admin — active project member). Individual tests
  // override these to simulate a creator who has lost access.
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
});

describe("withPatAuth", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const handler = withPatAuth(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 401 when the Authorization header isn't a Bearer token", async () => {
    const handler = withPatAuth(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest("Basic abc123"), { params: {} });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("passes userId, orgId, and projectId to the inner handler for a valid PAT", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    } as never);

    const seen: { userId?: string; orgId?: string; projectId?: string } = {};
    const handler = withPatAuth(async (ctx) => {
      seen.userId = ctx.userId;
      seen.orgId = ctx.orgId;
      seen.projectId = ctx.projectId;
      return NextResponse.json({ success: true, data: "ok" });
    });
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });

    expect(res.status).toBe(200);
    expect(seen).toEqual({ userId: CREATED_BY, orgId: ORG, projectId: PROJECT });
  });

  it("returns 401 when the PAT is expired", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    } as never);

    const handler = withPatAuth(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the PAT is revoked", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: new Date(),
      lastUsedAt: null,
      createdAt: new Date(),
    } as never);

    const handler = withPatAuth(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns 401 and auto-revokes the PAT when its creator no longer has project access", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    } as never);
    // Creator is no longer an org/app admin and no longer a project member.
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);

    const handler = withPatAuth(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });

    expect(res.status).toBe(401);
    expect(mockDb.qtPersonalAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pat_1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it("returns 401 when no PAT matches the token hash", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue(null);

    const handler = withPatAuth(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });
    expect(res.status).toBe(401);
  });

  it("updates lastUsedAt when it has never been set", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    } as never);

    const handler = withPatAuth(async () => NextResponse.json({ success: true, data: "ok" }));
    await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });

    expect(mockDb.qtPersonalAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pat_1" } }),
    );
  });

  it("does not update lastUsedAt when it was updated less than 5 minutes ago", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      lastUsedAt: new Date(Date.now() - 1000 * 60), // 1 minute ago
      createdAt: new Date(),
    } as never);

    const handler = withPatAuth(async () => NextResponse.json({ success: true, data: "ok" }));
    await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });

    expect(mockDb.qtPersonalAccessToken.update).not.toHaveBeenCalled();
  });

  it("updates lastUsedAt when it was updated more than 5 minutes ago", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      lastUsedAt: new Date(Date.now() - 1000 * 60 * 6), // 6 minutes ago
      createdAt: new Date(),
    } as never);

    const handler = withPatAuth(async () => NextResponse.json({ success: true, data: "ok" }));
    await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });

    expect(mockDb.qtPersonalAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pat_1" } }),
    );
  });

  it("catches thrown errors and returns 500 with toErrorMessage", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    } as never);

    const handler = withPatAuth(
      async () => {
        throw new Error("inner failure");
      },
      { fallbackErrorMessage: "should not be used" },
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "inner failure" });
  });

  it("returns 429 with a retry-after header when the PAT is rate-limited", async () => {
    mockRateLimitAsync.mockResolvedValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });

    const handler = withPatAuth(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(mockDb.qtPersonalAccessToken.findFirst).not.toHaveBeenCalled();
  });

  it("rate-limits by the token's hash, not the raw request", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      orgId: ORG,
      projectId: PROJECT,
      createdById: CREATED_BY,
      tokenHash: hashPatToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    } as never);

    const handler = withPatAuth(async () => NextResponse.json({ success: true, data: "ok" }));
    await handler(buildRequest(`Bearer ${RAW_TOKEN}`), { params: {} });

    expect(mockRateLimitAsync).toHaveBeenCalledWith(
      expect.objectContaining({ clientKey: hashPatToken(RAW_TOKEN) }),
    );
  });
});
