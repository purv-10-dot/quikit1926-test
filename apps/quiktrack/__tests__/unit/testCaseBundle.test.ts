import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { resolveMcpTestCaseSection, createMcpTestCase } from "@/lib/mcp/testCaseBundle";
import { guardClient } from "@/lib/mcp/guardedDb";

const ORG = "org_1";
const PROJECT = "proj_1";
// createMcpTestCase's bundled path (params.tx set) runs createTestCaseInTransaction,
// which calls assertResolvedProjectId — that rejects a placeholder like "proj_1", so
// this test needs a cuid-shaped id.
const PROJECT_CUID = "c" + "a".repeat(24);

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

/**
 * Regression test for a real bug found live-testing QUIKTR-122 against
 * quiktrack-uat: guardClient (lib/mcp/guardedDb.ts) used to unconditionally
 * wrap any object/function-typed property on a guarded Prisma client,
 * including Prisma's internal, non-configurable `_extensions` property —
 * violating the Proxy get-trap invariant and crashing with a TypeError.
 * See mcp-no-delete-guardrail.test.ts for the mechanism-level tests; this
 * one drives the real bundled create_issue -> createMcpTestCase(params.tx)
 * path (testCaseBundle.ts's params.tx branch) through a guardClient-wrapped
 * tx carrying that property shape, to prove the production code path — not
 * just the Proxy primitive — survives it.
 */
describe("createMcpTestCase — bundled path survives a guarded tx with a non-configurable Prisma-internal property", () => {
  it("resolves normally when the tx exposes a frozen _extensions property, and reading it mid-operation does not throw", async () => {
    let extensionsAccessedWithoutThrowing = false;

    const rawTx: Record<string, unknown> = {
      qtTestSection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "sec_1",
          suiteId: "suite_1",
          suite: { projectId: PROJECT_CUID },
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ n: 1 }]),
      qtTestCase: {
        create: vi.fn().mockImplementation(() => {
          // Simulate Prisma's own internals touching `_extensions` on the
          // (guarded) tx mid-operation — this is the exact access pattern
          // that threw before the fix.
          expect(() => {
            extensionsAccessedWithoutThrowing = (guardedTx as Record<string, unknown>)._extensions === innerExtensions;
          }).not.toThrow();
          return Promise.resolve({
            id: "case_1",
            refId: 1,
            title: "A bundled test case",
            sectionId: "sec_1",
            createdAt: new Date(),
          });
        }),
      },
      qtTestCaseStep: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      qtTestCaseVersion: { create: vi.fn().mockResolvedValue({}) },
      qtTestCaseTag: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const innerExtensions = {};
    Object.defineProperty(rawTx, "_extensions", {
      value: innerExtensions,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    const guardedTx = guardClient(rawTx);

    const result = await createMcpTestCase({
      orgId: ORG,
      projectId: PROJECT_CUID,
      userId: "user_1",
      input: {
        title: "A bundled test case",
        priority: "MEDIUM",
        type: "FUNCTIONAL",
        sectionId: "sec_1",
        steps: [],
      } as never,
      tx: guardedTx as never,
    });

    expect(result).toMatchObject({ id: "case_1", sectionId: "sec_1", issue: null });
    expect(extensionsAccessedWithoutThrowing).toBe(true);
  });
});
