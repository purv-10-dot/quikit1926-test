import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { hashPatToken } from "@/lib/api/patToken";
import { POST } from "@/app/api/mcp/route";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

vi.mock("@quikit/shared/rateLimit", () => ({
  rateLimitAsync: vi.fn(),
}));

const mockRateLimitAsync = vi.mocked(rateLimitAsync);

const ORG = "org_1";
const PROJECT = "proj_1";
const CREATED_BY = "user_1";
const RAW_TOKEN = "test-raw-token-value";

async function readMcpJsonRpcResponse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(dataLine!.slice("data: ".length));
}

function mcpRequest(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetMockDb();
  mockRateLimitAsync.mockResolvedValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000, retryAfterSeconds: 0 });
  mockDb.qtPersonalAccessToken.update.mockResolvedValue({} as never);
});

describe("POST /api/mcp", () => {
  it("returns 401 when the PAT is missing or invalid", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue(null);
    const res = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_issue", arguments: {} } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns the issue for a valid PAT calling get_issue", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      title: "Fix the bug",
      description: null,
      type: "TASK",
      priority: "MEDIUM",
      statusId: "status_1",
      assigneeId: null,
    } as never);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_issue", arguments: { issueId: "issue_1" } } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual({
      id: "issue_1",
      key: "PRJ-1",
      title: "Fix the bug",
      description: null,
      type: "TASK",
      priority: "MEDIUM",
      statusId: "status_1",
      assigneeId: null,
    });
  });

  it("returns an MCP error for get_issue when the issue belongs to another project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    // The issue exists, but not with this projectId — the tenant-scoped query
    // returns nothing, exactly as it would for a PAT leaked to another project.
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_issue", arguments: { issueId: "other_project_issue" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
    );
  });

  it("returns the PAT's scoped project for get_project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({
      id: PROJECT,
      projectKey: "PRJ",
      name: "Project One",
      description: null,
      statuses: [{ id: "status_1", name: "To Do", color: "#000", category: "BACKLOG" }],
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);

    const res = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_project", arguments: {} } }, RAW_TOKEN),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual({
      id: PROJECT,
      projectKey: "PRJ",
      name: "Project One",
      description: null,
      statuses: [{ id: "status_1", name: "To Do", color: "#000", category: "BACKLOG" }],
    });
  });

  it("returns 401 (via the PAT live-access recheck) when the project no longer exists", async () => {
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
    // A deleted project fails withPatAuth's own loadProjectAccess recheck
    // before the request ever reaches the get_project tool handler.
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_project", arguments: {} } }, RAW_TOKEN),
    );

    expect(res.status).toBe(401);
    expect(mockDb.qtPersonalAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pat_1" } }),
    );
  });

  it("returns the PAT's scoped project's custom field definitions for list_custom_fields", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtCustomField.findMany.mockResolvedValue([
      {
        id: "cf_1",
        orgId: ORG,
        scope: "space",
        projectId: PROJECT,
        name: "Story Points",
        key: "story_points",
        type: "NUMBER",
        description: null,
        status: "active",
        isRequired: false,
        defaultValue: null,
        placeholder: null,
        helpText: null,
        position: 0,
        options: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_custom_fields", arguments: {} } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const fields = JSON.parse(body.result.content[0].text);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ id: "cf_1", key: "story_points", name: "Story Points", type: "NUMBER" });
  });

  it("returns 401 (via the PAT live-access recheck) for list_custom_fields when the project no longer exists", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_custom_fields", arguments: {} } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(401);
  });

  it("returns a project member's profile for get_member", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({
      id: "member_1",
      userId: "user_2",
      role: "MEMBER",
    } as never);
    mockDb.user.findUnique.mockResolvedValue({
      id: "user_2",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      avatar: null,
    } as never);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_member", arguments: { userId: "user_2" } } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual({
      id: "member_1",
      userId: "user_2",
      role: "MEMBER",
      user: { id: "user_2", email: "jane@example.com", firstName: "Jane", lastName: "Doe", avatar: null },
    });
  });

  it("returns an MCP error for get_member when the user isn't a project member", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_member", arguments: { userId: "user_2" } } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
  });

  it("returns matching project members for search_users", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtProjectMember.findMany.mockResolvedValue([
      { userId: "user_2" },
      { userId: "user_3" },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "user_2", email: "jane@example.com", firstName: "Jane", lastName: "Doe", avatar: null },
    ] as never);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_users", arguments: { query: "jane" } } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual([
      { id: "user_2", email: "jane@example.com", firstName: "Jane", lastName: "Doe", avatar: null },
    ]);
    expect(mockDb.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["user_2", "user_3"] } }),
      }),
    );
  });

  it("returns an empty list for search_users when the project has no members", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtProjectMember.findMany.mockResolvedValue([] as never);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_users", arguments: {} } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(JSON.parse(body.result.content[0].text)).toEqual([]);
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
  });

  it("creates an issue with a resolved default status and a generated key", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT, projectKey: "PRJ" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        qtIssueStatus: {
          findFirst: () => Promise.resolve({ id: "status_1" }),
        },
        qtIssue: {
          count: () => Promise.resolve(0),
          create: ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: "issue_1", ...data }),
        },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_issue", arguments: { title: "Fix the bug" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const created = JSON.parse(body.result.content[0].text);
    expect(created).toMatchObject({
      id: "issue_1",
      key: "PRJ-1",
      title: "Fix the bug",
      statusId: "status_1",
    });
    expect(mockDb.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("returns an MCP error for create_issue when the caller lacks Issue:create", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_issue", arguments: { title: "Fix the bug" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns an MCP error for create_issue when title is missing", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT, projectKey: "PRJ" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_issue", arguments: {} },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns an issue's comments with author profiles, oldest first", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);
    mockDb.qtIssueComment.findMany.mockResolvedValue([
      {
        id: "comment_1",
        userId: "user_2",
        body: "First comment",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        editedAt: null,
      },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "user_2", firstName: "Jane", lastName: "Doe", email: "jane@example.com", avatar: null },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_comments", arguments: { issueId: "issue_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual([
      {
        id: "comment_1",
        userId: "user_2",
        body: "First comment",
        createdAt: "2026-01-01T00:00:00.000Z",
        editedAt: null,
        user: { id: "user_2", firstName: "Jane", lastName: "Doe", email: "jane@example.com", avatar: null },
      },
    ]);
  });

  it("returns an MCP error for list_comments when the issue isn't in the PAT's project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_comments", arguments: { issueId: "other_project_issue" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
  });

  it("starts a PLANNING sprint", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.findFirst.mockResolvedValue({ id: "sprint_1", status: "PLANNING" } as never);
    mockDb.qtSprint.update.mockResolvedValue({
      id: "sprint_1",
      name: "Sprint 1",
      status: "ACTIVE",
      startedAt: new Date("2026-01-01T00:00:00Z"),
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "start_sprint", arguments: { sprintId: "sprint_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const started = JSON.parse(body.result.content[0].text);
    expect(started).toMatchObject({ id: "sprint_1", status: "ACTIVE" });
    expect(mockDb.qtSprint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sprint_1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("returns an MCP error for start_sprint when the caller lacks Sprint:update", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtSprint.findFirst.mockResolvedValue({ id: "sprint_1", status: "PLANNING" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "start_sprint", arguments: { sprintId: "sprint_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtSprint.update).not.toHaveBeenCalled();
  });

  it("returns an MCP error for start_sprint when the sprint is already active", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.findFirst.mockResolvedValue({ id: "sprint_1", status: "ACTIVE" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "start_sprint", arguments: { sprintId: "sprint_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtSprint.update).not.toHaveBeenCalled();
  });

  it("returns an MCP error for start_sprint when the sprint belongs to another project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "start_sprint", arguments: { sprintId: "other_project_sprint" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtSprint.update).not.toHaveBeenCalled();
    expect(mockDb.qtSprint.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
    );
  });

  const HISTORY_SNAPSHOT = {
    statusId: "status_1",
    assigneeId: null,
    parentId: null,
    epicId: null,
    sprintId: null,
    priority: "MEDIUM",
    type: "TASK",
    title: "Fix the bug",
    startDate: null,
    dueDate: null,
    storyPoints: null,
    eta: null,
    groupId: null,
  };

  it("moves an issue to a new status and sprint", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      projectId: PROJECT,
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);
    mockDb.qtIssue.update.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      orderInColumn: 2,
      ...HISTORY_SNAPSHOT,
      statusId: "status_2",
      sprintId: "sprint_1",
    } as never);
    // The handler now wraps its update in db.$transaction (workflow-transition
    // pipeline parity with the REST PATCH route) — run the callback against
    // mockDb so qtIssue.update still records its call. No workflow is
    // configured (qtWorkflowScheme.findUnique left unmocked → undefined), so
    // executeTransition resolves as a no-op, same as the legacy any→any move.
    mockDb.$transaction.mockImplementation((cb: unknown) =>
      (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
    );

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "move_issue",
            arguments: { issueId: "issue_1", statusId: "status_2", sprintId: "sprint_1" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const moved = JSON.parse(body.result.content[0].text);
    expect(moved).toMatchObject({ id: "issue_1", statusId: "status_2", sprintId: "sprint_1" });
    expect(mockDb.qtIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "issue_1" },
        data: expect.objectContaining({ statusId: "status_2", sprintId: "sprint_1" }),
      }),
    );
  });

  it("returns an MCP error for move_issue when the caller lacks Issue:update", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      projectId: PROJECT,
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "move_issue", arguments: { issueId: "issue_1", statusId: "status_2" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("returns an MCP error for move_issue when orderInColumn is invalid", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      projectId: PROJECT,
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "move_issue", arguments: { issueId: "issue_1", orderInColumn: -1 } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("returns an MCP error for move_issue when the issue belongs to another project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "move_issue",
            arguments: { issueId: "other_project_issue", statusId: "status_2" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
    expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
    );
  });

  it("creates a sprint in PLANNING status", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.create.mockResolvedValue({
      id: "sprint_1",
      name: "Sprint 1",
      goal: null,
      status: "PLANNING",
      startDate: null,
      endDate: null,
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_sprint", arguments: { name: "Sprint 1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const created = JSON.parse(body.result.content[0].text);
    expect(created).toMatchObject({ id: "sprint_1", name: "Sprint 1", status: "PLANNING" });
    expect(mockDb.qtSprint.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: PROJECT, name: "Sprint 1" }) }),
    );
  });

  it("returns an MCP error for create_sprint when the caller lacks Sprint:create", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_sprint", arguments: { name: "Sprint 1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtSprint.create).not.toHaveBeenCalled();
  });

  it("returns an MCP error for create_sprint when name is missing", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_sprint", arguments: {} },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtSprint.create).not.toHaveBeenCalled();
  });

  it("accepts a plain YYYY-MM-DD date for create_sprint's startDate/endDate", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.create.mockResolvedValue({
      id: "sprint_1",
      name: "Sprint 1",
      goal: null,
      status: "PLANNING",
      startDate: new Date("2026-08-03T00:00:00.000Z"),
      endDate: new Date("2026-08-17T00:00:00.000Z"),
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_sprint",
            arguments: { name: "Sprint 1", startDate: "2026-08-03", endDate: "2026-08-17" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBeFalsy();
    expect(mockDb.qtSprint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startDate: new Date("2026-08-03T00:00:00.000Z"),
          endDate: new Date("2026-08-17T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("adds a comment to an issue", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);
    mockDb.qtIssueComment.create.mockResolvedValue({
      id: "comment_1",
      userId: CREATED_BY,
      body: "On it",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      editedAt: null,
    } as never);
    mockDb.user.findUnique.mockResolvedValue({
      id: CREATED_BY,
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      avatar: null,
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "add_comment", arguments: { issueId: "issue_1", body: "On it" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const created = JSON.parse(body.result.content[0].text);
    expect(created).toMatchObject({
      id: "comment_1",
      body: "On it",
      user: { id: CREATED_BY, firstName: "Jane", lastName: "Doe" },
    });
    expect(mockDb.qtIssueComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ issueId: "issue_1", userId: CREATED_BY, body: "On it" }),
      }),
    );
  });

  it("returns an MCP error for add_comment when the caller lacks IssueComment:create", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "add_comment", arguments: { issueId: "issue_1", body: "On it" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssueComment.create).not.toHaveBeenCalled();
  });

  it("returns an MCP error for add_comment when body is empty", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "add_comment", arguments: { issueId: "issue_1", body: "" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssueComment.create).not.toHaveBeenCalled();
  });

  it("returns an MCP error for add_comment when the issue isn't in the PAT's project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "add_comment", arguments: { issueId: "other_project_issue", body: "On it" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssueComment.create).not.toHaveBeenCalled();
  });

  it("completes an active sprint and moves its open issues to the backlog", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.findFirst.mockResolvedValue({ id: "sprint_1", status: "ACTIVE" } as never);
    // recordSprintVelocity (called inside the transaction, before the
    // updateMany that clears sprintId) reads the sprint's issues to freeze a
    // velocity snapshot, then upserts QtSprintSnapshot — mock both.
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtSprintSnapshot.upsert.mockResolvedValue({} as never);
    mockDb.qtIssueStatus.findMany.mockResolvedValue([{ id: "status_done" }] as never);
    mockDb.qtIssue.updateMany.mockResolvedValue({ count: 2 } as never);
    mockDb.qtSprint.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "sprint_1", name: "Sprint 1", ...data }) as never,
    );
    mockDb.$transaction.mockImplementation((cb: unknown) =>
      (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
    );

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "complete_sprint", arguments: { sprintId: "sprint_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const completed = JSON.parse(body.result.content[0].text);
    expect(completed).toMatchObject({ id: "sprint_1", status: "COMPLETED" });
    expect(mockDb.qtSprintSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sprintId: "sprint_1" } }),
    );
  });

  it("returns an MCP error for complete_sprint when the caller lacks Sprint:update", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtSprint.findFirst.mockResolvedValue({ id: "sprint_1", status: "ACTIVE" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "complete_sprint", arguments: { sprintId: "sprint_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns an MCP error for complete_sprint when the sprint isn't active", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.findFirst.mockResolvedValue({ id: "sprint_1", status: "PLANNING" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "complete_sprint", arguments: { sprintId: "sprint_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns an MCP error for complete_sprint when the sprint belongs to another project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtSprint.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "complete_sprint", arguments: { sprintId: "other_project_sprint" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.qtSprint.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
    );
  });

  it("returns issues matching filters, scoped to the PAT's project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      {
        id: "issue_1",
        key: "PRJ-1",
        title: "Fix the bug",
        type: "BUG",
        priority: "HIGH",
        statusId: "status_1",
        assigneeId: "user_2",
        sprintId: "sprint_1",
        parentId: null,
        epicId: null,
      },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "search_issues", arguments: { assigneeId: "user_2", statusCategory: "IN_PROGRESS" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const result = JSON.parse(body.result.content[0].text);
    expect(result).toEqual({
      issues: [
        {
          id: "issue_1",
          key: "PRJ-1",
          title: "Fix the bug",
          type: "BUG",
          priority: "HIGH",
          statusId: "status_1",
          assigneeId: "user_2",
          sprintId: "sprint_1",
          parentId: null,
          epicId: null,
        },
      ],
      nextCursor: null,
    });
    expect(mockDb.qtIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: PROJECT,
          assigneeId: "user_2",
          status: { category: "IN_PROGRESS" },
        }),
      }),
    );
  });

  it("returns a nextCursor when more issues exist than the limit", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "issue_1", key: "PRJ-1", title: "A", type: "TASK", priority: "MEDIUM", statusId: "s", assigneeId: null, sprintId: null, parentId: null, epicId: null },
      { id: "issue_2", key: "PRJ-2", title: "B", type: "TASK", priority: "MEDIUM", statusId: "s", assigneeId: null, sprintId: null, parentId: null, epicId: null },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "search_issues", arguments: { limit: 1 } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const result = JSON.parse(body.result.content[0].text);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe("issue_1");
    expect(result.nextCursor).toBe("issue_1");
    expect(mockDb.qtIssue.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it("returns 401 (via the PAT live-access recheck) for search_issues when the project isn't accessible", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "search_issues", arguments: {} },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(401);
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
  });

  it("updates an issue's plain fields", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);
    mockDb.qtIssue.update.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
      title: "Fix the worse bug",
      priority: "HIGH",
    } as never);
    // The handler now always wraps its update in db.$transaction (parity with
    // the REST PATCH route) — run the callback against mockDb.
    mockDb.$transaction.mockImplementation((cb: unknown) =>
      (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
    );

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "quiktrack_update_issue",
            arguments: { issueId: "issue_1", title: "Fix the worse bug", priority: "HIGH" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const updated = JSON.parse(body.result.content[0].text);
    expect(updated).toMatchObject({ id: "issue_1", title: "Fix the worse bug", priority: "HIGH" });
    expect(mockDb.qtIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "issue_1" },
        data: expect.objectContaining({ title: "Fix the worse bug", priority: "HIGH" }),
      }),
    );
  });

  it("returns an MCP error for quiktrack_update_issue when the caller lacks Issue:update", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "quiktrack_update_issue", arguments: { issueId: "issue_1", title: "x" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("returns an MCP error for quiktrack_update_issue when priority is invalid", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "quiktrack_update_issue",
            arguments: { issueId: "issue_1", priority: "URGENT" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("returns an MCP error for quiktrack_update_issue when the issue belongs to another project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "quiktrack_update_issue",
            arguments: { issueId: "other_project_issue", title: "x" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
    expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
    );
  });

  const CF_FIELD_ROW = {
    id: "cf_1",
    orgId: ORG,
    scope: "global",
    projectId: null,
    name: "Customer Tier",
    key: "customer_tier",
    type: "SHORT_TEXT",
    description: null,
    status: "active",
    isRequired: true,
    defaultValue: null,
    placeholder: null,
    helpText: null,
    position: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    options: [],
  };

  it("returns an MCP error for quiktrack_update_issue when a custom field value is invalid", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);
    mockDb.qtCustomField.findMany.mockResolvedValue([CF_FIELD_ROW] as never);
    mockDb.qtIssueFieldValue.findMany.mockResolvedValue([] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "quiktrack_update_issue",
            arguments: { issueId: "issue_1", customFields: { cf_1: "" } },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("writes a custom field value and logs a history event for the change", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);
    mockDb.qtIssue.update.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);
    mockDb.qtCustomField.findMany.mockResolvedValue([CF_FIELD_ROW] as never);
    mockDb.qtIssueFieldValue.findMany.mockResolvedValue([] as never);
    mockDb.qtIssueFieldValue.upsert.mockResolvedValue({} as never);
    // The handler now always wraps its update in db.$transaction (parity with
    // the REST PATCH route) — run the callback against mockDb.
    mockDb.$transaction.mockImplementation((cb: unknown) =>
      (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
    );

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "quiktrack_update_issue",
            arguments: { issueId: "issue_1", customFields: { cf_1: "Gold" } },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBeFalsy();
    expect(mockDb.qtIssueFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { issueId_fieldId: { issueId: "issue_1", fieldId: "cf_1" } },
      }),
    );
  });

  it("returns an MCP error (not a silent no-op) for quiktrack_update_issue when a customFields key isn't a real field id", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: "issue_1",
      key: "PRJ-1",
      ...HISTORY_SNAPSHOT,
    } as never);
    // No active fields at all on this project — mirrors the real Test_demo
    // gap this test was written from.
    mockDb.qtCustomField.findMany.mockResolvedValue([] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "quiktrack_update_issue",
            arguments: { issueId: "issue_1", customFields: { mcp_test_field: "in-review" } },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("mcp_test_field");
    expect(body.result.content[0].text).toContain("list_custom_fields");
    expect(mockDb.qtIssueFieldValue.upsert).not.toHaveBeenCalled();
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("lists an issue's remote links, oldest first", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);
    mockDb.qtRemoteLink.findMany.mockResolvedValue([
      {
        id: "link_1",
        url: "https://github.com/acme/repo/pull/1",
        title: "Fix the bug",
        type: "pull_request",
        metadata: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_remote_links", arguments: { issueId: "issue_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual([
      {
        id: "link_1",
        url: "https://github.com/acme/repo/pull/1",
        title: "Fix the bug",
        type: "pull_request",
        metadata: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("returns an MCP error for list_remote_links when the issue isn't in the PAT's project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_remote_links", arguments: { issueId: "other_project_issue" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
  });

  it("adds a remote link to an issue", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);
    mockDb.qtRemoteLink.create.mockResolvedValue({
      id: "link_1",
      url: "https://github.com/acme/repo/pull/1",
      title: "Fix the bug",
      type: "pull_request",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "add_remote_link",
            arguments: {
              issueId: "issue_1",
              url: "https://github.com/acme/repo/pull/1",
              title: "Fix the bug",
              type: "pull_request",
            },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const created = JSON.parse(body.result.content[0].text);
    expect(created).toMatchObject({ id: "link_1", url: "https://github.com/acme/repo/pull/1" });
    expect(mockDb.qtRemoteLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issueId: "issue_1",
          url: "https://github.com/acme/repo/pull/1",
          title: "Fix the bug",
          type: "pull_request",
        }),
      }),
    );
  });

  it("returns an MCP error for add_remote_link when the caller lacks Issue:update", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "add_remote_link",
            arguments: {
              issueId: "issue_1",
              url: "https://github.com/acme/repo/pull/1",
              title: "Fix the bug",
              type: "pull_request",
            },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtRemoteLink.create).not.toHaveBeenCalled();
  });

  it("returns an MCP error for add_remote_link when url is invalid", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "add_remote_link",
            arguments: { issueId: "issue_1", url: "not-a-url", title: "Fix the bug", type: "pull_request" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtRemoteLink.create).not.toHaveBeenCalled();
  });

  it("returns an MCP error for add_remote_link when the issue belongs to another project", async () => {
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
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "add_remote_link",
            arguments: {
              issueId: "other_project_issue",
              url: "https://github.com/acme/repo/pull/1",
              title: "Fix the bug",
              type: "pull_request",
            },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtRemoteLink.create).not.toHaveBeenCalled();
    expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
    );
  });
});
