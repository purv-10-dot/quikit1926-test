import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { hashPatToken } from "@/lib/api/patToken";
import { POST, OPTIONS } from "@/app/api/mcp/route";
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

  it("has no delete-capable tool reachable even by guessing a plausible destructive name (QUIKTR-118)", async () => {
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

    for (const name of ["delete_issue", "remove_comment", "purge_project", "delete_worklog"]) {
      const res = await POST(
        mcpRequest(
          { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } },
          RAW_TOKEN,
        ),
      );
      expect(res.status).toBeLessThan(500);
      const body = await readMcpJsonRpcResponse(res);
      const failed = body.error !== undefined || body.result?.isError === true;
      expect(failed).toBe(true);
    }
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
    mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);

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
      links: { outward: [], inward: [] },
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

  it("lists a project's issue types with uppercased codes and isSubtask flagged", async () => {
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
    mockDb.qtIssueType.findMany.mockResolvedValue([
      { id: "type_1", name: "Task" },
      { id: "type_2", name: "Subtask" },
    ] as never);

    const res = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_issue_types", arguments: {} } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const types = JSON.parse(body.result.content[0].text);
    expect(types).toEqual([
      { id: "type_1", name: "TASK", isSubtask: false },
      { id: "type_2", name: "SUBTASK", isSubtask: true },
    ]);
  });

  it("returns built-in + custom create fields for get_create_field_metadata", async () => {
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
        name: "Severity",
        key: "severity",
        type: "DROPDOWN_SINGLE",
        description: null,
        status: "active",
        isRequired: true,
        defaultValue: null,
        placeholder: null,
        helpText: null,
        position: 0,
        options: [
          { id: "opt_1", label: "Low", value: "low", position: 0, isActive: true },
          { id: "opt_2", label: "High", value: "high", position: 1, isActive: true },
        ],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_create_field_metadata", arguments: { type: "bug" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const data = JSON.parse(body.result.content[0].text);
    expect(data.type).toBe("BUG");
    expect(data.fields).toContainEqual({ key: "title", label: "Title", required: true, dataType: "string" });
    expect(data.fields).toContainEqual({
      key: "cf_1",
      label: "Severity",
      required: true,
      dataType: "DROPDOWN_SINGLE",
      allowedValues: ["low", "high"],
    });
  });

  it("returns an MCP error for get_create_field_metadata with an unsupported type", async () => {
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
          params: { name: "get_create_field_metadata", arguments: { type: "Design" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("EPIC, TASK, STORY, BUG, SUBTASK");
  });

  it("lists internal issue-link types with inward/outward names", async () => {
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
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_link_types", arguments: {} } },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const types = JSON.parse(body.result.content[0].text);
    expect(types).toEqual([
      { type: "RELATES_TO", outward: "relates to", inward: "relates to" },
      { type: "BLOCKS", outward: "blocks", inward: "is blocked by" },
      { type: "DUPLICATES", outward: "duplicates", inward: "is duplicated by" },
    ]);
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

  it("lists legal transitions for an issue under a published workflow", async () => {
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
      statusId: "status_1",
      type: "Task",
      assigneeId: null,
      resolutionId: null,
      priority: "MEDIUM",
    } as never);
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({
      items: [{ isDefault: true, workflowId: "wf_1", issueType: null }],
    } as never);
    mockDb.qtWorkflow.findFirst.mockResolvedValue({
      id: "wf_1",
      isActive: true,
      transitions: [
        {
          id: "tr_1",
          name: "Start Progress",
          type: "NORMAL",
          toStatusId: "status_2",
          fromStatuses: [{ statusId: "status_1" }],
          rules: [],
        },
      ],
    } as never);
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "status_2", name: "In Progress", category: "IN_PROGRESS" },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_transitions", arguments: { issueId: "issue_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const data = JSON.parse(body.result.content[0].text);
    expect(data).toEqual({
      fromStatusId: "status_1",
      transitions: [{ toStatusId: "status_2", toStatusName: "In Progress", category: "IN_PROGRESS" }],
    });
  });

  it("list_transitions falls back to every other project status when there's no published workflow", async () => {
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
      statusId: "status_1",
      type: "Task",
      assigneeId: null,
      resolutionId: null,
      priority: "MEDIUM",
    } as never);
    // qtWorkflowScheme.findUnique left unmocked → undefined → ungated, same
    // convention the existing move_issue tests use for the no-workflow case.
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "status_2", name: "In Progress", category: "IN_PROGRESS" },
      { id: "status_3", name: "Done", category: "DONE" },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_transitions", arguments: { issueId: "issue_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const data = JSON.parse(body.result.content[0].text);
    expect(data.fromStatusId).toBe("status_1");
    expect(data.transitions).toEqual([
      { toStatusId: "status_2", toStatusName: "In Progress", category: "IN_PROGRESS" },
      { toStatusId: "status_3", toStatusName: "Done", category: "DONE" },
    ]);
    expect(mockDb.qtIssueStatus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT, id: { not: "status_1" } }) }),
    );
  });

  it("returns an MCP error enumerating legal targets when move_issue requests an illegal status", async () => {
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
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({
      items: [{ isDefault: true, workflowId: "wf_1", issueType: null }],
    } as never);
    mockDb.qtWorkflow.findFirst.mockResolvedValue({
      id: "wf_1",
      isActive: true,
      transitions: [
        {
          id: "tr_1",
          name: "Start Progress",
          type: "NORMAL",
          toStatusId: "status_2",
          fromStatuses: [{ statusId: "status_1" }],
          rules: [],
        },
      ],
    } as never);
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "status_2", name: "In Progress", category: "IN_PROGRESS" },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "move_issue", arguments: { issueId: "issue_1", statusId: "status_99" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Legal targets: In Progress (status_2)");
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
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

  it("logs time on an issue via add_worklog", async () => {
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
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", parentId: null } as never);
    mockDb.qtTimesheetEntry.create.mockResolvedValue({
      id: "entry_1",
      issueId: "issue_1",
      hours: 2.5,
      entryDate: new Date("2026-06-24T10:00:00.000Z"),
      description: "Investigated the bug",
    } as never);
    mockDb.qtTimesheetWeeklySummary.findFirst.mockResolvedValue(null);
    mockDb.qtTimesheetWeeklySummary.create.mockResolvedValue({} as never);
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
          params: {
            name: "add_worklog",
            arguments: {
              issueId: "issue_1",
              timeSpent: "2h 30m",
              started: "2026-06-24T10:00:00.000Z",
              comment: "Investigated the bug",
            },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const created = JSON.parse(body.result.content[0].text);
    expect(created).toMatchObject({
      id: "entry_1",
      issueId: "issue_1",
      timeSpentSeconds: 9000,
      comment: "Investigated the bug",
      author: { id: CREATED_BY, firstName: "Jane", lastName: "Doe" },
    });
    expect(mockDb.qtTimesheetEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ issueId: "issue_1", userId: CREATED_BY, hours: 2.5 }),
      }),
    );
  });

  it("returns an MCP error for add_worklog when timeSpent doesn't match the expected format", async () => {
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
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", parentId: null } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "add_worklog", arguments: { issueId: "issue_1", timeSpent: "not a duration" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtTimesheetEntry.create).not.toHaveBeenCalled();
  });

  it("returns an MCP error for add_worklog when the caller lacks Timesheet:create", async () => {
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
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", parentId: null } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "add_worklog", arguments: { issueId: "issue_1", timeSpent: "1h" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtTimesheetEntry.create).not.toHaveBeenCalled();
  });

  it("returns an MCP error for add_worklog when authorId names another user and the caller isn't a tenant admin", async () => {
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
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue({ id: "grant_1" } as never);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", parentId: null } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "add_worklog",
            arguments: { issueId: "issue_1", timeSpent: "1h", authorId: "other_user" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(mockDb.qtTimesheetEntry.create).not.toHaveBeenCalled();
  });

  it("lists worklogs for an issue chronologically", async () => {
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
    mockDb.qtTimesheetEntry.findMany.mockResolvedValue([
      {
        id: "entry_1",
        userId: CREATED_BY,
        hours: 1,
        entryDate: new Date("2026-06-24T09:00:00.000Z"),
        description: "Morning work",
      },
      {
        id: "entry_2",
        userId: CREATED_BY,
        hours: 0.5,
        entryDate: new Date("2026-06-24T14:00:00.000Z"),
        description: null,
      },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: CREATED_BY, firstName: "Jane", lastName: "Doe", email: "jane@example.com", avatar: null },
    ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_worklogs", arguments: { issueId: "issue_1" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const { worklogs } = JSON.parse(body.result.content[0].text);
    expect(worklogs).toHaveLength(2);
    expect(worklogs[0]).toMatchObject({
      id: "entry_1",
      timeSpentSeconds: 3600,
      comment: "Morning work",
      author: { id: CREATED_BY, firstName: "Jane" },
    });
    expect(worklogs[1]).toMatchObject({ id: "entry_2", timeSpentSeconds: 1800, comment: null });
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
    mockDb.qtIssue.count.mockResolvedValue(1 as never);

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
      total: 1,
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
    mockDb.qtIssue.count.mockResolvedValue(2 as never);

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

  it("runs the QQL example query with IN, assignee acct: token, relative date, and ORDER BY", async () => {
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
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "status_todo", name: "To Do" },
      { id: "status_inprogress", name: "In Progress" },
    ] as never);
    mockDb.qtIssue.count.mockResolvedValue(1 as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      {
        id: "issue_1",
        key: "PRJ-1",
        title: "Fix the bug",
        type: "BUG",
        priority: "HIGH",
        statusId: "status_todo",
        assigneeId: "123",
        sprintId: null,
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
          params: {
            name: "search_issues",
            arguments: {
              query:
                'status IN ("To Do","In Progress") AND assignee = "acct:123" AND updated >= -7d ORDER BY updated DESC',
            },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const result = JSON.parse(body.result.content[0].text);
    expect(result.total).toBe(1);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(25);
    expect(result.issues).toHaveLength(1);
    expect(mockDb.qtIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: 0,
        take: 25,
      }),
    );
  });

  it("returns a positioned parse error for an unknown QQL field", async () => {
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
          params: { name: "search_issues", arguments: { query: 'bogus = "1"' } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/Parse error at position \d+.*Unknown field "bogus"/);
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
  });

  it("returns a parse error when an operator isn't valid for a field", async () => {
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
          params: { name: "search_issues", arguments: { query: 'text = "foo"' } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('"text" only supports the "~" operator');
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
  });

  it("returns a parse error for an unresolvable status name", async () => {
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
    mockDb.qtIssueStatus.findMany.mockResolvedValue([] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "search_issues", arguments: { query: 'status = "Nonexistent"' } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Unknown status "Nonexistent"');
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
  });

  it("supports the ~ text operator via QQL", async () => {
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
    mockDb.qtIssue.count.mockResolvedValue(0 as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "search_issues", arguments: { query: 'text ~ "login bug"' } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBeUndefined();
    expect(mockDb.qtIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([{ title: { contains: "login bug", mode: "insensitive" } }]),
            }),
          ]),
        }),
      }),
    );
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

  it("creates a link between two issues via link_issues", async () => {
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
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({ id: "issue_a", projectId: PROJECT } as never)
      .mockResolvedValueOnce({ id: "issue_b" } as never);
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    mockDb.qtIssueLink.create.mockResolvedValue({ id: "link_1" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "link_issues",
            arguments: { outwardIssueId: "issue_a", inwardIssueId: "issue_b", linkType: "BLOCKS" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const data = JSON.parse(body.result.content[0].text);
    expect(data).toEqual({
      id: "link_1",
      linkType: "BLOCKS",
      outwardIssueId: "issue_a",
      inwardIssueId: "issue_b",
      outwardRelationship: "blocks",
      inwardRelationship: "is blocked by",
    });
    expect(mockDb.qtIssueLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceIssueId: "issue_a", targetIssueId: "issue_b", type: "BLOCKS" }),
      }),
    );
  });

  it("rejects a self-link in link_issues", async () => {
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
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_a", projectId: PROJECT } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "link_issues",
            arguments: { outwardIssueId: "issue_a", inwardIssueId: "issue_a", linkType: "RELATES_TO" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Cannot link an issue to itself");
    expect(mockDb.qtIssueLink.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown linkType in link_issues", async () => {
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
    // Distinct outward/inward ids so the resolver doesn't collapse them to
    // the same issue (a blanket mock would falsely trigger the self-link
    // check before ever reaching linkType validation).
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({ id: "issue_a", projectId: PROJECT } as never)
      .mockResolvedValueOnce({ id: "issue_b", projectId: PROJECT } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "link_issues",
            arguments: { outwardIssueId: "issue_a", inwardIssueId: "issue_b", linkType: "CAUSES" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Valid types: RELATES_TO, BLOCKS, DUPLICATES");
    expect(mockDb.qtIssueLink.create).not.toHaveBeenCalled();
  });

  it("link_issues is a no-op when the link already exists", async () => {
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
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({ id: "issue_a", projectId: PROJECT } as never)
      .mockResolvedValueOnce({ id: "issue_b" } as never);
    mockDb.qtIssueLink.findFirst.mockResolvedValue({ id: "existing_link" } as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "link_issues",
            arguments: { outwardIssueId: "issue_a", inwardIssueId: "issue_b", linkType: "RELATES_TO" },
          },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const data = JSON.parse(body.result.content[0].text);
    expect(data.id).toBe("existing_link");
    expect(mockDb.qtIssueLink.create).not.toHaveBeenCalled();
  });

  it("lists inward and outward links for an issue via list_issue_links", async () => {
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
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_a" } as never);
    mockDb.qtIssueLink.findMany
      .mockResolvedValueOnce([
        {
          id: "link_1",
          type: "BLOCKS",
          targetIssue: {
            id: "issue_b",
            key: "PRJ-2",
            title: "Other issue",
            statusId: "status_1",
            status: { id: "status_1", name: "To Do", color: "#000", category: "BACKLOG" },
          },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "link_2",
          type: "RELATES_TO",
          sourceIssue: {
            id: "issue_c",
            key: "PRJ-3",
            title: "Third issue",
            statusId: "status_2",
            status: null,
          },
        },
      ] as never);

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_issue_links", arguments: { issueId: "issue_a" } },
        },
        RAW_TOKEN,
      ),
    );

    expect(res.status).toBe(200);
    const body = await readMcpJsonRpcResponse(res);
    const data = JSON.parse(body.result.content[0].text);
    expect(data.outward).toEqual([
      {
        id: "link_1",
        type: "BLOCKS",
        relationship: "blocks",
        issue: {
          id: "issue_b",
          key: "PRJ-2",
          title: "Other issue",
          statusId: "status_1",
          status: { id: "status_1", name: "To Do", color: "#000", category: "BACKLOG" },
        },
      },
    ]);
    expect(data.inward).toEqual([
      {
        id: "link_2",
        type: "RELATES_TO",
        relationship: "relates to",
        issue: { id: "issue_c", key: "PRJ-3", title: "Third issue", statusId: "status_2", status: null },
      },
    ]);
  });

  describe("projectId resolution — legacy project-scoped vs. user-scoped tokens", () => {
    function mockPat(projectId: string | null) {
      mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
        id: "pat_1",
        orgId: ORG,
        projectId,
        createdById: CREATED_BY,
        tokenHash: hashPatToken(RAW_TOKEN),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        revokedAt: null,
        lastUsedAt: new Date(),
        createdAt: new Date(),
        failedAccessChecks: 0,
      } as never);
    }

    it("rejects a legacy project-scoped token when the call names a different project", async () => {
      mockPat(PROJECT);
      // withPatAuth's own live-recheck (loadProjectAccess against the token's
      // bound project) must pass before the tool handler ever runs. The
      // "other_project" arg must resolve to a genuinely different real id
      // than the token's own PROJECT — otherwise this test can't tell apart
      // "rejected because it's a different project" from "rejected/allowed
      // for the wrong reason," now that the check compares resolved ids.
      mockDb.qtProject.findFirst.mockImplementation(((args: { where?: { OR?: Array<{ id?: string }> } }) => {
        const idOrKey = args.where?.OR?.[0]?.id;
        return Promise.resolve(idOrKey === "other_project" ? { id: "other_project_resolved" } : { id: PROJECT });
      }) as never);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "issue_1", projectId: "other_project" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toMatch(/scoped to a single project and cannot act on a different one/);
      expect(mockDb.qtIssue.findFirst).not.toHaveBeenCalled();
    });

    it("resolves a legacy project-scoped token naming its OWN project by key, not just id (regression: this used to be falsely rejected as \"a different project\")", async () => {
      mockPat(PROJECT);
      // "PRJ" is the SAME project as PROJECT, just referenced by its
      // human-readable key instead of its cuid.
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
        projectId: PROJECT,
      } as never);
      mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "issue_1", projectId: "PRJ" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
      );
    });

    it("rejects a user-scoped token (no bound project) calling a tool without a projectId argument", async () => {
      mockPat(null);
      // withPatAuth's live-recheck for a user-scoped token is isActiveOrgMember,
      // not loadProjectAccess — just needs an active membership row.
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "issue_1" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toMatch(/isn't scoped to a single project/);
      expect(mockDb.qtIssue.findFirst).not.toHaveBeenCalled();
    });

    it("resolves a user-scoped token calling get_issue with an explicit projectId it has access to", async () => {
      mockPat(null);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
      mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
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
      mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "issue_1", projectId: PROJECT } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
      );
    });

    it("resolves a user-scoped token calling get_issue with a project KEY instead of its cuid", async () => {
      mockPat(null);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
      mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
      mockDb.qtIssue.findFirst.mockResolvedValue({
        id: "issue_1",
        key: "PRJ-1",
        title: "Fix the bug",
        description: null,
        type: "TASK",
        priority: "MEDIUM",
        statusId: "status_1",
        assigneeId: null,
        projectId: PROJECT,
      } as never);
      mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "issue_1", projectId: "PRJ" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      expect(mockDb.qtProject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: [{ id: "PRJ" }, { projectKey: "PRJ" }] }) }),
      );
      expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
      );
    });

    it("resolves an issue KEY (e.g. \"PRJ-1\") anywhere an issueId is accepted", async () => {
      mockPat(PROJECT);
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
        projectId: PROJECT,
      } as never);
      mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "PRJ-1" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      // The tool's own follow-up lookup must use the RESOLVED cuid, not the
      // raw key the caller sent.
      expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: "issue_1" }) }),
      );
    });

    it("resolves an issue key for add_worklog too, not just read-only tools", async () => {
      mockPat(PROJECT);
      mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
      mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", parentId: null, projectId: PROJECT } as never);
      mockDb.qtTimesheetEntry.create.mockResolvedValue({
        id: "wl_1",
        issueId: "issue_1",
        hours: 0.5,
        entryDate: new Date(),
        description: "test",
      } as never);
      mockDb.qtTimesheetWeeklySummary.findFirst.mockResolvedValue(null);
      mockDb.qtTimesheetWeeklySummary.create.mockResolvedValue({} as never);
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
            params: { name: "add_worklog", arguments: { issueId: "PRJ-1", timeSpent: "30m" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: "issue_1" }) }),
      );
    });

    it("rejects a user-scoped token when the target project isn't accessible to the creator", async () => {
      mockPat(null);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
      mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
      mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
      mockDb.qtProject.findFirst.mockResolvedValue({ id: "other_project" } as never);
      mockDb.qtProjectMember.findFirst.mockResolvedValue(null);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "issue_1", projectId: "other_project" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toBe("Not found");
      expect(mockDb.qtIssue.findFirst).not.toHaveBeenCalled();
    });

    it("move_issue: a user-scoped token can act on an explicit project it has access to (fan-out case)", async () => {
      mockPat(null);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
      mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
      mockDb.qtIssue.findFirst.mockResolvedValue({
        id: "issue_1",
        projectId: PROJECT,
        key: "PRJ-1",
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
      } as never);
      mockDb.qtIssue.update.mockResolvedValue({
        id: "issue_1",
        key: "PRJ-1",
        orderInColumn: 0,
        statusId: "status_2",
      } as never);
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
              arguments: { issueId: "issue_1", statusId: "status_2", projectId: PROJECT },
            },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: PROJECT }) }),
      );
    });
  });

  describe("list_projects", () => {
    function mockPat(projectId: string | null) {
      mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
        id: "pat_1",
        orgId: ORG,
        projectId,
        createdById: CREATED_BY,
        tokenHash: hashPatToken(RAW_TOKEN),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        revokedAt: null,
        lastUsedAt: new Date(),
        createdAt: new Date(),
        failedAccessChecks: 0,
      } as never);
    }

    it("returns just the bound project for a legacy project-scoped token", async () => {
      mockPat(PROJECT);
      mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
      mockDb.qtProject.findMany.mockResolvedValue([
        { id: PROJECT, projectKey: "PRJ", name: "Project One" },
      ] as never);

      const res = await POST(
        mcpRequest(
          { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_projects", arguments: {} } },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(JSON.parse(body.result.content[0].text)).toEqual([
        { id: PROJECT, projectKey: "PRJ", name: "Project One" },
      ]);
      expect(mockDb.qtProject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: PROJECT, orgId: ORG }) }),
      );
    });

    it("returns every org project for an admin's user-scoped token", async () => {
      mockPat(null);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
      mockDb.qtProject.findMany.mockResolvedValue([
        { id: "p1", projectKey: "P1", name: "Project One" },
        { id: "p2", projectKey: "P2", name: "Project Two" },
      ] as never);

      const res = await POST(
        mcpRequest(
          { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_projects", arguments: {} } },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(JSON.parse(body.result.content[0].text)).toHaveLength(2);
      expect(mockDb.qtProject.findMany).toHaveBeenCalledWith({
        where: { orgId: ORG, isDeleted: false },
        select: { id: true, projectKey: true, name: true },
      });
    });

    it("returns only member projects for a non-admin's user-scoped token", async () => {
      mockPat(null);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
      mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
      mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
      mockDb.qtProject.findMany.mockResolvedValue([
        { id: "p1", projectKey: "P1", name: "Project One" },
      ] as never);

      const res = await POST(
        mcpRequest(
          { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_projects", arguments: {} } },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(JSON.parse(body.result.content[0].text)).toHaveLength(1);
      expect(mockDb.qtProject.findMany).toHaveBeenCalledWith({
        where: {
          orgId: ORG,
          isDeleted: false,
          members: { some: { userId: CREATED_BY, isDeleted: false } },
        },
        select: { id: true, projectKey: true, name: true },
      });
    });
  });

  describe("QUIKTR-119 — access decision audit log", () => {
    it("logs an allow decision when a project member reads an issue", async () => {
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
      mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);

      await POST(
        mcpRequest(
          { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_issue", arguments: { issueId: "issue_1" } } },
          RAW_TOKEN,
        ),
      );

      expect(mockDb.qtMcpAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: ORG,
            userId: CREATED_BY,
            projectId: PROJECT,
            tool: "get_issue",
            decision: "allow",
          }),
        }),
      );
    });

    it("logs a deny decision when the caller isn't a project member", async () => {
      mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
        id: "pat_1",
        orgId: ORG,
        projectId: null,
        createdById: CREATED_BY,
        tokenHash: hashPatToken(RAW_TOKEN),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        revokedAt: null,
        lastUsedAt: new Date(),
        createdAt: new Date(),
        failedAccessChecks: 0,
      } as never);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
      mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
      mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
      mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
      mockDb.qtProjectMember.findFirst.mockResolvedValue(null);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_issue", arguments: { issueId: "issue_1", projectId: PROJECT } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBe(true);
      expect(mockDb.qtMcpAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "get_issue",
            decision: "deny",
            reason: "not a project member",
          }),
        }),
      );
    });

    it("logs a deny decision with the resource/action for a write permission failure", async () => {
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
            params: { name: "create_issue", arguments: { title: "New issue" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBe(true);
      expect(mockDb.qtMcpAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "create_issue",
            resource: "Issue",
            action: "create",
            decision: "deny",
            reason: "lacks Issue:create",
          }),
        }),
      );
    });

    it("allows create_issue for a project role that HAS the Issue:create grant (not just an org-admin bypass)", async () => {
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
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
      mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
      mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
      mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
      mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
        projectRoleId: "contrib_role",
        projectRole: { name: "Contributor" },
      } as never);
      mockDb.qtProjectRolePermission.findFirst.mockResolvedValue({ id: "grant_1" } as never);
      mockDb.qtIssue.count.mockResolvedValue(0 as never);
      mockDb.$transaction.mockImplementation((cb: unknown) => (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb));
      mockDb.qtIssue.create.mockResolvedValue({
        id: "issue_new",
        key: "PRJ-1",
        title: "New issue",
        description: undefined,
        type: "TASK",
        priority: "MEDIUM",
        statusId: "status_1",
        assigneeId: null,
      } as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "create_issue", arguments: { title: "New issue", statusId: "status_1" } },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      expect(mockDb.qtMcpAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tool: "create_issue", resource: "Issue", action: "create", decision: "allow" }),
        }),
      );
    });
  });

  describe("QUIKTR-119 — cross-project leakage fixes", () => {
    it("rejects link_issues when the caller can't access the inward issue's own project", async () => {
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
      // Two "is a member" answers: the PAT's own live-recheck (loadProjectAccess
      // against the token's bound project, before the tool even runs) consumes
      // the first; the tool's own outward-project membership check consumes the
      // second. The third call (the inward issue's own project) falls through
      // to an unconfigured mock (undefined), correctly denying it.
      mockDb.qtProjectMember.findFirst
        .mockResolvedValueOnce({ role: "MEMBER" } as never)
        .mockResolvedValueOnce({ role: "MEMBER" } as never);
      mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
        projectRoleId: "contrib_role",
        projectRole: { name: "Contributor" },
      } as never);
      mockDb.qtProjectRolePermission.findFirst.mockResolvedValue({ id: "grant_1" } as never);
      mockDb.qtIssue.findFirst
        .mockResolvedValueOnce({ id: "issue_outward", projectId: PROJECT } as never)
        .mockResolvedValueOnce({ id: "issue_inward", projectId: "other_project" } as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "link_issues",
              arguments: { outwardIssueId: "issue_outward", inwardIssueId: "issue_inward", linkType: "RELATES_TO" },
            },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toBe("Not found");
      expect(mockDb.qtIssueLink.create).not.toHaveBeenCalled();
    });

    it("resolves an inward issue referenced by its KEY across projects (not just an id)", async () => {
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
      mockDb.qtIssue.findFirst
        .mockResolvedValueOnce({ id: "issue_outward", projectId: PROJECT } as never)
        .mockResolvedValueOnce({ id: "issue_inward", projectId: "other_project" } as never);
      mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
      mockDb.qtIssueLink.create.mockResolvedValue({ id: "link_1" } as never);

      const res = await POST(
        mcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "link_issues",
              arguments: { outwardIssueId: "issue_outward", inwardIssueId: "OTHER-5", linkType: "RELATES_TO" },
            },
          },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      expect(body.result.isError).toBeUndefined();
      // The raw key, not just an id, must have reached the resolver — scoped
      // to no projectId, since a cross-project inward issue is intentional.
      expect(mockDb.qtIssue.findFirst).toHaveBeenNthCalledWith(2, {
        where: { orgId: ORG, isDeleted: false, OR: [{ id: "OTHER-5" }, { key: "OTHER-5" }] },
        select: { id: true, projectId: true },
      });
      expect(mockDb.qtIssueLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sourceIssueId: "issue_outward", targetIssueId: "issue_inward" }),
        }),
      );
    });

    it("filters a linked issue out of get_issue's response when its own project isn't accessible", async () => {
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
      // Two "is a member" answers: the PAT's own live-recheck consumes the
      // first, get_issue's own membership check on PROJECT consumes the
      // second. The third call (the linked issue's own project) falls
      // through to an unconfigured mock (undefined), correctly denying it.
      mockDb.qtProjectMember.findFirst
        .mockResolvedValueOnce({ role: "MEMBER" } as never)
        .mockResolvedValueOnce({ role: "MEMBER" } as never);
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
      mockDb.qtIssueLink.findMany
        .mockResolvedValueOnce([
          {
            id: "link_1",
            type: "RELATES_TO",
            targetIssue: {
              id: "issue_2",
              key: "OTH-1",
              title: "Other project's issue",
              statusId: "status_2",
              status: null,
              projectId: "other_project",
            },
          },
        ] as never)
        .mockResolvedValueOnce([] as never);

      const res = await POST(
        mcpRequest(
          { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_issue", arguments: { issueId: "issue_1" } } },
          RAW_TOKEN,
        ),
      );

      expect(res.status).toBe(200);
      const body = await readMcpJsonRpcResponse(res);
      const data = JSON.parse(body.result.content[0].text);
      expect(data.links.outward).toEqual([]);
      expect(data.links.inward).toEqual([]);
    });
  });
});

describe("CORS on /api/mcp", () => {
  it("OPTIONS returns a 204 preflight response with CORS headers", async () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("includes CORS headers on a 401 response so a browser-context client can read it", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue(null);
    const res = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_issue", arguments: {} } }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
