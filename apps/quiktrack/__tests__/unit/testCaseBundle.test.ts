import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { resolveMcpTestCaseSection } from "@/lib/mcp/testCaseBundle";

const ORG = "org_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
});

/**
 * QUIKTR-122 — resolveMcpTestCaseSection resolves an optional section/suite
 * down to a concrete sectionId, mirroring testImport.ts's fallback pattern.
 * Uses mockDb directly as the transaction client, same convention move_issue's
 * own tests use for a caller-supplied tx.
 */
describe("resolveMcpTestCaseSection (QUIKTR-122)", () => {
  it("returns the sectionId directly when it belongs to the project", async () => {
    mockDb.qtTestSection.findFirst.mockResolvedValue({
      id: "sec_1",
      suiteId: "suite_1",
      suite: { projectId: PROJECT },
    } as never);

    const result = await resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT, sectionId: "sec_1" });

    expect(result).toBe("sec_1");
  });

  it("rejects a sectionId that doesn't exist", async () => {
    mockDb.qtTestSection.findFirst.mockResolvedValue(null);

    await expect(
      resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT, sectionId: "missing" }),
    ).rejects.toMatchObject({ code: "SECTION_NOT_FOUND", status: 404 });
  });

  it("rejects a sectionId belonging to a different project", async () => {
    mockDb.qtTestSection.findFirst.mockResolvedValue({
      id: "sec_1",
      suiteId: "suite_1",
      suite: { projectId: "other_project" },
    } as never);

    await expect(
      resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT, sectionId: "sec_1" }),
    ).rejects.toMatchObject({ code: "SECTION_NOT_FOUND" });
  });

  it("rejects a sectionId that doesn't belong to the given suiteId", async () => {
    mockDb.qtTestSection.findFirst.mockResolvedValue({
      id: "sec_1",
      suiteId: "suite_1",
      suite: { projectId: PROJECT },
    } as never);

    await expect(
      resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT, sectionId: "sec_1", suiteId: "suite_2" }),
    ).rejects.toMatchObject({ code: "SECTION_SUITE_MISMATCH", status: 400 });
  });

  it("resolves to the first section of a given suite, ordered by orderNo then name", async () => {
    mockDb.qtTestSuite.findFirst.mockResolvedValue({ id: "suite_1" } as never);
    mockDb.qtTestSection.findFirst.mockResolvedValue({ id: "sec_first" } as never);

    const result = await resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT, suiteId: "suite_1" });

    expect(result).toBe("sec_first");
    expect(mockDb.qtTestSection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG, suiteId: "suite_1", isDeleted: false },
        orderBy: [{ orderNo: "asc" }, { name: "asc" }],
      }),
    );
  });

  it("rejects a suite with no sections", async () => {
    mockDb.qtTestSuite.findFirst.mockResolvedValue({ id: "suite_1" } as never);
    mockDb.qtTestSection.findFirst.mockResolvedValue(null);

    await expect(
      resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT, suiteId: "suite_1" }),
    ).rejects.toMatchObject({ code: "SUITE_HAS_NO_SECTIONS", status: 400 });
  });

  it("rejects a suiteId belonging to a different project", async () => {
    mockDb.qtTestSuite.findFirst.mockResolvedValue(null);

    await expect(
      resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT, suiteId: "other_suite" }),
    ).rejects.toMatchObject({ code: "SUITE_NOT_FOUND", status: 404 });
  });

  it("auto-resolves to the sole suite's first section when neither sectionId nor suiteId is given", async () => {
    mockDb.qtTestSuite.findMany.mockResolvedValue([{ id: "suite_solo" }] as never);
    mockDb.qtTestSection.findFirst.mockResolvedValue({ id: "sec_root" } as never);

    const result = await resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT });

    expect(result).toBe("sec_root");
  });

  it("rejects when the project has no suites and neither sectionId nor suiteId is given", async () => {
    mockDb.qtTestSuite.findMany.mockResolvedValue([] as never);

    await expect(
      resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT }),
    ).rejects.toMatchObject({ code: "NO_SUITE_IN_PROJECT", status: 400 });
  });

  it("rejects when the project has multiple suites and neither sectionId nor suiteId is given", async () => {
    mockDb.qtTestSuite.findMany.mockResolvedValue([{ id: "suite_1" }, { id: "suite_2" }] as never);

    await expect(
      resolveMcpTestCaseSection(mockDb, { orgId: ORG, projectId: PROJECT }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_SUITE", status: 400 });
  });
});
