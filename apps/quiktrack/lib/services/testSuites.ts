import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * A suite with no section has nowhere to put a case —
 * resolveMcpTestCaseSection (lib/mcp/testCaseBundle.ts) throws
 * SUITE_HAS_NO_SECTIONS for one. So every suite must be created with a
 * default root section, atomically. This is the single source of truth for
 * that rule, shared by the REST route (app/api/test/suites/route.ts) and
 * the create_test_suite MCP tool (lib/mcp/server.ts).
 */
export const DEFAULT_TEST_SUITE_SECTION_NAME = "All test cases";
const DEFAULT_TEST_SUITE_SECTION_ORDER_NO = 0;

export interface CreateTestSuiteInput {
  name: string;
  description?: string;
}

export interface CreatedTestSuite {
  id: string;
  name: string;
}

async function runCreateTestSuite(
  tx: Prisma.TransactionClient,
  orgId: string,
  projectId: string,
  userId: string,
  input: CreateTestSuiteInput,
): Promise<CreatedTestSuite> {
  const suite = await tx.qtTestSuite.create({
    data: { orgId, projectId, name: input.name, description: input.description ?? null, createdBy: userId },
    select: { id: true, name: true },
  });
  await tx.qtTestSection.create({
    data: {
      orgId,
      suiteId: suite.id,
      name: DEFAULT_TEST_SUITE_SECTION_NAME,
      orderNo: DEFAULT_TEST_SUITE_SECTION_ORDER_NO,
    },
  });
  return suite;
}

/** Creates a suite (+ root section) in its own transaction. Used by the REST route. */
export async function createTestSuite(
  orgId: string,
  projectId: string,
  userId: string,
  input: CreateTestSuiteInput,
): Promise<CreatedTestSuite> {
  return db.$transaction((tx) => runCreateTestSuite(tx, orgId, projectId, userId, input));
}

/**
 * Creates a suite (+ root section) inside a transaction the CALLER already
 * owns — the create_test_suite MCP tool's own guarded transaction.
 */
export async function createTestSuiteInTransaction(
  tx: Prisma.TransactionClient,
  orgId: string,
  projectId: string,
  userId: string,
  input: CreateTestSuiteInput,
): Promise<CreatedTestSuite> {
  return runCreateTestSuite(tx, orgId, projectId, userId, input);
}
