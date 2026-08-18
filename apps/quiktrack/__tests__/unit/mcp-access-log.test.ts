import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { logAccessDecision } from "@/lib/mcp/accessLog";

beforeEach(() => {
  resetMockDb();
});

describe("logAccessDecision (QUIKTR-119)", () => {
  it("writes an allow decision with the given fields", async () => {
    mockDb.qtMcpAccessLog.create.mockResolvedValue({} as never);

    await logAccessDecision({
      orgId: "org_1",
      userId: "user_1",
      projectId: "proj_1",
      tool: "get_issue",
      decision: "allow",
      reason: "project member",
    });

    expect(mockDb.qtMcpAccessLog.create).toHaveBeenCalledWith({
      data: {
        orgId: "org_1",
        userId: "user_1",
        projectId: "proj_1",
        tool: "get_issue",
        resource: null,
        action: null,
        decision: "allow",
        reason: "project member",
      },
    });
  });

  it("writes a deny decision with resource/action when given", async () => {
    mockDb.qtMcpAccessLog.create.mockResolvedValue({} as never);

    await logAccessDecision({
      orgId: "org_1",
      userId: "user_1",
      projectId: "proj_1",
      tool: "create_issue",
      resource: "Issue",
      action: "create",
      decision: "deny",
      reason: "lacks Issue:create",
    });

    expect(mockDb.qtMcpAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resource: "Issue", action: "create", decision: "deny" }),
    });
  });

  it("never throws when the write fails (e.g. the migration hasn't been applied yet)", async () => {
    mockDb.qtMcpAccessLog.create.mockRejectedValue(new Error("relation QtMcpAccessLog does not exist"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logAccessDecision({
        orgId: "org_1",
        userId: "user_1",
        projectId: null,
        tool: "list_projects",
        decision: "allow",
        reason: "ok",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
