import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { mcpDb, McpDeleteGuardrailError } from "@/lib/mcp/guardedDb";

beforeEach(() => {
  resetMockDb();
});

describe("mcpDb guardrail (QUIKTR-118)", () => {
  it("throws McpDeleteGuardrailError synchronously on delete, for any model", () => {
    expect(() => mcpDb.qtIssue.delete({ where: { id: "issue_1" } })).toThrow(McpDeleteGuardrailError);
    expect(() => mcpDb.qtProject.delete({ where: { id: "proj_1" } })).toThrow(McpDeleteGuardrailError);
  });

  it("throws McpDeleteGuardrailError synchronously on deleteMany, for any model", () => {
    expect(() => mcpDb.qtIssueComment.deleteMany({ where: { issueId: "issue_1" } })).toThrow(McpDeleteGuardrailError);
    expect(() => mcpDb.qtIssueLink.deleteMany({ where: { sourceIssueId: "issue_1" } })).toThrow(
      McpDeleteGuardrailError,
    );
  });

  it("never reaches the underlying database client for a blocked operation", () => {
    expect(() => mcpDb.qtIssue.delete({ where: { id: "issue_1" } })).toThrow(McpDeleteGuardrailError);
    expect(mockDb.qtIssue.delete).not.toHaveBeenCalled();
  });

  it("does not block reads, creates, or updates", async () => {
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "issue_1" }] as never);
    mockDb.qtIssue.update.mockResolvedValue({ id: "issue_1" } as never);
    mockDb.qtIssue.create.mockResolvedValue({ id: "issue_1" } as never);

    await expect(mcpDb.qtIssue.findMany({})).resolves.toEqual([{ id: "issue_1" }]);
    await expect(mcpDb.qtIssue.update({ where: { id: "issue_1" }, data: {} })).resolves.toEqual({ id: "issue_1" });
    await expect(mcpDb.qtIssue.create({ data: {} as never })).resolves.toEqual({ id: "issue_1" });
  });
});
