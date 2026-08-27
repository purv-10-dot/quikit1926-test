import type { Prisma } from "@prisma/client";
// QUIKTR-118 — every Prisma call this file makes must go through the guarded
// client, same invariant as lib/mcp/server.ts. See docs/mcp-security.md.
import { mcpDb as db } from "@/lib/mcp/guardedDb";
import { createTestCaseInTransaction, TestCaseError } from "@/lib/services/testCases";
import type { McpCreateTestCaseInput } from "@/lib/validation/testCase";

export interface McpTestCaseResult {
  id: string;
  refId: number;
  title: string;
  sectionId: string;
  createdAt: Date;
  issue: { id: string; key: string; title: string } | null;
}

/**
 * QUIKTR-122 — resolves an optional section/suite down to a concrete
 * sectionId, mirroring lib/services/testImport.ts's "fall back to the first
 * section in the suite" pattern (same ordering: orderNo asc, then name asc).
 * No project-level "default suite" concept exists anywhere in the schema, so
 * when neither sectionId nor suiteId is given this only auto-resolves when
 * the project has exactly one suite — otherwise it's a clear validation
 * error rather than a silent guess among several suites.
 */
export async function resolveMcpTestCaseSection(
  tx: Prisma.TransactionClient,
  params: { orgId: string; projectId: string; sectionId?: string; suiteId?: string },
): Promise<string> {
  const { orgId, projectId, sectionId, suiteId } = params;

  if (sectionId) {
    const section = await tx.qtTestSection.findFirst({
      where: { id: sectionId, orgId, isDeleted: false },
      select: { id: true, suiteId: true, suite: { select: { projectId: true } } },
    });
    if (!section || section.suite.projectId !== projectId) {
      throw new TestCaseError("Section not found in this project.", 404, "SECTION_NOT_FOUND");
    }
    if (suiteId && section.suiteId !== suiteId) {
      throw new TestCaseError("sectionId does not belong to the given suiteId.", 400, "SECTION_SUITE_MISMATCH");
    }
    return section.id;
  }

  const firstSectionOfSuite = async (resolvedSuiteId: string): Promise<string> => {
    const first = await tx.qtTestSection.findFirst({
      where: { orgId, suiteId: resolvedSuiteId, isDeleted: false },
      orderBy: [{ orderNo: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    if (!first) throw new TestCaseError("This suite has no sections yet.", 400, "SUITE_HAS_NO_SECTIONS");
    return first.id;
  };

  if (suiteId) {
    const suite = await tx.qtTestSuite.findFirst({
      where: { id: suiteId, orgId, projectId, isDeleted: false },
      select: { id: true },
    });
    if (!suite) throw new TestCaseError("Suite not found in this project.", 404, "SUITE_NOT_FOUND");
    return firstSectionOfSuite(suite.id);
  }

  const suites = await tx.qtTestSuite.findMany({
    where: { orgId, projectId, isDeleted: false },
    select: { id: true },
    take: 2,
  });
  if (suites.length === 0) {
    throw new TestCaseError(
      "This project has no test suites yet — create one first, or pass suiteId/sectionId.",
      400,
      "NO_SUITE_IN_PROJECT",
    );
  }
  if (suites.length > 1) {
    throw new TestCaseError(
      "This project has multiple test suites — pass suiteId or sectionId to say which one.",
      400,
      "AMBIGUOUS_SUITE",
    );
  }
  return firstSectionOfSuite(suites[0].id);
}

/**
 * QUIKTR-122 — the single test-case creation path shared by the standalone
 * `create_test_case` MCP tool and `create_issue`'s bundled test-case
 * creation. When `tx` is supplied (the bundled path), everything runs inside
 * the CALLER's transaction — a thrown TestCaseError aborts that whole
 * transaction, so a bundled test case can never fail independently of the
 * issue it was meant to cover. When `tx` is omitted (the standalone tool),
 * this opens its own transaction.
 *
 * `input.issueId`, if set, must already be a resolved cuid — the standalone
 * tool resolves a caller-supplied id-or-key via resolveIssueIdOrKey first;
 * the bundled path passes the freshly-created issue's own id directly. The
 * issue lookup below is scoped to `orgId` + `projectId` (QUIKTR-122 decision:
 * a test case may only link to an issue in its own project — unlike the
 * REST work-item-coverage route, which allows cross-project links).
 */
export async function createMcpTestCase(params: {
  orgId: string;
  projectId: string;
  userId: string;
  input: McpCreateTestCaseInput;
  tx?: Prisma.TransactionClient;
}): Promise<McpTestCaseResult> {
  const { orgId, projectId, userId, input } = params;

  const run = async (tx: Prisma.TransactionClient): Promise<McpTestCaseResult> => {
    const sectionId = await resolveMcpTestCaseSection(tx, {
      orgId,
      projectId,
      sectionId: input.sectionId,
      suiteId: input.suiteId,
    });

    const created = await createTestCaseInTransaction(tx, orgId, projectId, userId, {
      sectionId,
      title: input.title,
      priority: input.priority,
      type: input.type,
      automationStatus: "MANUAL",
      preconditions: input.preconditions,
      steps: input.steps,
    });

    let issue: McpTestCaseResult["issue"] = null;
    if (input.issueId) {
      const issueRow = await tx.qtIssue.findFirst({
        where: { id: input.issueId, orgId, projectId, isDeleted: false },
        select: { id: true, key: true, title: true },
      });
      if (!issueRow) {
        throw new TestCaseError("Work item not found.", 404, "ISSUE_NOT_FOUND");
      }
      await tx.qtTestCaseIssueLink.upsert({
        where: { caseId_issueId_type: { caseId: created.id, issueId: issueRow.id, type: "covers" } },
        create: { orgId, caseId: created.id, issueId: issueRow.id, type: "covers", createdBy: userId },
        update: {},
      });
      issue = issueRow;
    }

    return { ...created, sectionId, issue };
  };

  if (params.tx) return run(params.tx);
  return db.$transaction((tx) => run(tx), { timeout: 20_000, maxWait: 5_000 });
}
