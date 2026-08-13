import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { hashPatToken } from "@/lib/api/patToken";
import { withPatProjectAccess } from "@/lib/api/withPatProjectAccess";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

vi.mock("@quikit/shared/rateLimit", () => ({
  rateLimitAsync: vi.fn(),
}));

const mockRateLimitAsync = vi.mocked(rateLimitAsync);

const ORG = "org_1";
const PROJECT = "proj_1";
const CREATED_BY = "user_1";
const RAW_TOKEN = "test-raw-token-value";

function buildRequest(): NextRequest {
  return new NextRequest("http://localhost/api/mcp", {
    headers: { authorization: `Bearer ${RAW_TOKEN}` },
  });
}

function mockValidPat() {
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
}

beforeEach(() => {
  resetMockDb();
  mockRateLimitAsync.mockResolvedValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000, retryAfterSeconds: 0 });
  mockDb.qtPersonalAccessToken.update.mockResolvedValue({} as never);
});

describe("withPatProjectAccess", () => {
  it("returns 401 when the PAT's bound project no longer exists (caught by withPatAuth's own live-access recheck before this wrapper's own check ever runs)", async () => {
    mockValidPat();
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const handler = withPatProjectAccess(async () =>
      NextResponse.json({ success: true, data: "never" }),
    );
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("grants full access and skips the permission check for a tenant admin PAT creator", async () => {
    mockValidPat();
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);

    const seen: { projectId?: string; projectRole?: string | null; isTenantAdmin?: boolean } = {};
    const handler = withPatProjectAccess(
      async (ctx) => {
        seen.projectId = ctx.projectId;
        seen.projectRole = ctx.projectRole;
        seen.isTenantAdmin = ctx.isTenantAdmin;
        return NextResponse.json({ success: true, data: "ok" });
      },
      { requirePermission: { resource: "Issue", action: "update" } },
    );
    const res = await handler(buildRequest(), { params: {} });

    expect(res.status).toBe(200);
    expect(seen).toEqual({ projectId: PROJECT, projectRole: null, isTenantAdmin: true });
    expect(mockDb.qtProjectMember.findFirst).not.toHaveBeenCalled();
  });

  /** A project member without the Issue:update grant (mirrors project-tab-config.test.ts's Contributor recipe). */
  function mockMemberWithoutPermission() {
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
  }

  it("returns 403 when a project member lacks the required permission", async () => {
    mockValidPat();
    mockMemberWithoutPermission();

    const handler = withPatProjectAccess(
      async () => NextResponse.json({ success: true, data: "never" }),
      { requirePermission: { resource: "Issue", action: "update" } },
    );
    const res = await handler(buildRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("returns 200 and the resolved projectRole when a project member has the required permission", async () => {
    mockValidPat();
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue({ id: "grant_1" } as never);

    const seen: { projectRole?: string | null } = {};
    const handler = withPatProjectAccess(
      async (ctx) => {
        seen.projectRole = ctx.projectRole;
        return NextResponse.json({ success: true, data: "ok" });
      },
      { requirePermission: { resource: "Issue", action: "update" } },
    );
    const res = await handler(buildRequest(), { params: {} });

    expect(res.status).toBe(200);
    expect(seen.projectRole).toBe("MEMBER");
  });
});
