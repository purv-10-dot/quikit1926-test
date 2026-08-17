import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { logMcpAction } from "@/lib/mcp/actionLog";

beforeEach(() => {
  resetMockDb();
});

describe("logMcpAction (QUIKTR-121)", () => {
  it("writes a success entry with all fields", async () => {
    mockDb.qtMcpActionLog.create.mockResolvedValue({} as never);

    await logMcpAction({
      orgId: "org_1",
      userId: "user_1",
      actorType: "agent",
      projectId: "proj_1",
      tool: "create_issue",
      action: "CREATE",
      entityType: "issue",
      entityId: "issue_1",
      entityKey: "QUIKTR-1",
      payload: { title: "New issue" },
      after: { id: "issue_1", title: "New issue" },
      result: "success",
    });

    expect(mockDb.qtMcpActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org_1",
        userId: "user_1",
        actorType: "agent",
        projectId: "proj_1",
        tool: "create_issue",
        action: "CREATE",
        entityType: "issue",
        entityId: "issue_1",
        entityKey: "QUIKTR-1",
        payload: { title: "New issue" },
        after: { id: "issue_1", title: "New issue" },
        result: "success",
        errorMessage: null,
      }),
    });
  });

  it("writes an error entry with errorMessage set and no after", async () => {
    mockDb.qtMcpActionLog.create.mockResolvedValue({} as never);

    await logMcpAction({
      orgId: "org_1",
      userId: "user_1",
      actorType: "agent",
      projectId: "proj_1",
      tool: "move_issue",
      action: "MOVE",
      entityType: "issue",
      entityId: "issue_1",
      entityKey: "QUIKTR-1",
      before: { statusId: "s1" },
      result: "error",
      errorMessage: "Transition not allowed",
    });

    expect(mockDb.qtMcpActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: "error",
        errorMessage: "Transition not allowed",
        before: { statusId: "s1" },
      }),
    });
    const call = mockDb.qtMcpActionLog.create.mock.calls[0]![0] as { data: { after?: unknown } };
    expect(call.data.after).toBeUndefined();
  });

  it("redacts sensitive-shaped keys in payload/before/after at any nesting depth", async () => {
    mockDb.qtMcpActionLog.create.mockResolvedValue({} as never);

    await logMcpAction({
      orgId: "org_1",
      userId: "user_1",
      actorType: "agent",
      projectId: "proj_1",
      tool: "create_issue",
      action: "CREATE",
      entityType: "issue",
      entityId: null,
      entityKey: null,
      payload: { title: "x", nested: { apiKey: "secret-value", ok: "fine" } },
      result: "success",
    });

    const call = mockDb.qtMcpActionLog.create.mock.calls[0]![0] as unknown as {
      data: { payload: { nested: { apiKey: string; ok: string } } };
    };
    expect(call.data.payload.nested.apiKey).toBe("[REDACTED]");
    expect(call.data.payload.nested.ok).toBe("fine");
  });

  it("preserves Date values in before/after instead of collapsing them to {}", async () => {
    mockDb.qtMcpActionLog.create.mockResolvedValue({} as never);
    const startDate = new Date("2026-08-01T00:00:00.000Z");

    await logMcpAction({
      orgId: "org_1",
      userId: "user_1",
      actorType: "agent",
      projectId: "proj_1",
      tool: "move_issue",
      action: "MOVE",
      entityType: "issue",
      entityId: "issue_1",
      entityKey: "QUIKTR-1",
      before: { startDate },
      after: { startDate },
      result: "success",
    });

    const call = mockDb.qtMcpActionLog.create.mock.calls[0]![0] as unknown as {
      data: { before: { startDate: Date }; after: { startDate: Date } };
    };
    expect(call.data.before.startDate).toBeInstanceOf(Date);
    expect(call.data.before.startDate.getTime()).toBe(startDate.getTime());
    expect(call.data.after.startDate).toBeInstanceOf(Date);
  });

  it("never throws when the write fails (e.g. the migration hasn't been applied yet)", async () => {
    mockDb.qtMcpActionLog.create.mockRejectedValue(new Error("relation QtMcpActionLog does not exist"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logMcpAction({
        orgId: "org_1",
        userId: "user_1",
        actorType: "agent",
        projectId: "proj_1",
        tool: "create_issue",
        action: "CREATE",
        entityType: "issue",
        entityId: null,
        entityKey: null,
        result: "success",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
