import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { resolveIssueIdOrKey } from "@/lib/mcp/resolveIssue";

beforeEach(() => {
  resetMockDb();
});

describe("resolveIssueIdOrKey", () => {
  it("resolves by cuid", async () => {
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", projectId: "proj_1" } as never);

    const result = await resolveIssueIdOrKey("org_1", "issue_1");

    expect(result).toEqual({ id: "issue_1", projectId: "proj_1" });
    expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith({
      where: {
        orgId: "org_1",
        isDeleted: false,
        OR: [{ id: "issue_1" }, { key: "ISSUE_1" }],
      },
      select: { id: true, projectId: true },
    });
  });

  it("resolves by human-readable key, case-insensitively", async () => {
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", projectId: "proj_1" } as never);

    const result = await resolveIssueIdOrKey("org_1", "quiktr-119");

    expect(result).toEqual({ id: "issue_1", projectId: "proj_1" });
    expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith({
      where: {
        orgId: "org_1",
        isDeleted: false,
        OR: [{ id: "quiktr-119" }, { key: "QUIKTR-119" }],
      },
      select: { id: true, projectId: true },
    });
  });

  it("scopes to the given projectId when provided", async () => {
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: "issue_1", projectId: "proj_1" } as never);

    await resolveIssueIdOrKey("org_1", "QUIKTR-119", "proj_1");

    expect(mockDb.qtIssue.findFirst).toHaveBeenCalledWith({
      where: {
        orgId: "org_1",
        isDeleted: false,
        projectId: "proj_1",
        OR: [{ id: "QUIKTR-119" }, { key: "QUIKTR-119" }],
      },
      select: { id: true, projectId: true },
    });
  });

  it("returns null when no issue matches (unknown key, wrong org, or wrong project scope)", async () => {
    mockDb.qtIssue.findFirst.mockResolvedValue(null);

    const result = await resolveIssueIdOrKey("org_1", "NOPE-1", "proj_1");

    expect(result).toBeNull();
  });
});
