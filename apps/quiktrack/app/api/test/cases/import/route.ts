import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { importTestCases, TestImportError } from "@/lib/services/testImport";
import { badRequest, gateProjectResolved, serverError } from "@/lib/test/gate";

/**
 * POST /api/test/cases/import — bulk-create cases from a parsed spreadsheet.
 *
 * The FILE is parsed in the browser (see lib/test/importParse.ts) and the rows are
 * posted as JSON. That keeps the upload off the server, lets the preview run without
 * a round-trip, and means this endpoint has one job: validate and persist.
 *
 * Suite and folder come from where the user opened Import, so the caller sends both;
 * `sectionPath` on a row can nest deeper, creating folders on demand.
 */

const stepSchema = z.object({
  action: z.string().trim().min(1).max(5_000),
  expected: z.string().max(5_000).optional(),
});

const caseSchema = z.object({
  /** File row number, echoed back in the summary so errors are locatable. */
  rowNumber: z.number().int().min(1),
  title: z.string().trim().min(1).max(255),
  sectionPath: z.array(z.string().trim().min(1).max(255)).max(10).default([]),
  description: z.string().max(10_000).nullish(),
  preconditions: z.string().max(10_000).nullish(),
  expectedResult: z.string().max(10_000).nullish(),
  priority: z.string().max(40),
  type: z.string().max(40),
  automationStatus: z.string().max(40),
  automationId: z.string().trim().max(500).nullish(),
  refTickets: z.string().trim().max(2_000).nullish(),
  estimateMs: z.number().int().min(0).max(86_400_000).nullish(),
  steps: z.array(stepSchema).max(200).default([]),
});

const bodySchema = z.object({
  projectId: z.string().min(1),
  suiteId: z.string().min(1),
  /** Folder to use for rows with no Section. Null = the suite's first folder. */
  sectionId: z.string().min(1).nullish(),
  // 2,000 is a deliberate ceiling: the whole import runs in ONE transaction so it is
  // all-or-nothing, and an unbounded batch would hold that transaction open long
  // enough to time out against a remote (Neon) database.
  cases: z.array(caseSchema).min(1).max(2_000),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return badRequest(
        issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid body",
      );
    }
    const body = parsed.data;

    // Resolve BEFORE writing — the cases store projectId, so a projectKey must never
    // reach the insert (it would create rows no id-based query can find).
    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      body.projectId,
      "TestCase",
      "create",
    );
    if (denied) return denied;

    // The suite must belong to the resolved project, or an import could plant cases
    // in another project's suite.
    const suite = await db.qtTestSuite.findFirst({
      where: { id: body.suiteId, orgId, projectId, isDeleted: false },
      select: { id: true },
    });
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Test suite not found in this project." },
        { status: 404 },
      );
    }

    const result = await importTestCases({
      orgId,
      userId,
      projectId,
      suiteId: suite.id,
      defaultSectionId: body.sectionId ?? null,
      cases: body.cases,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TestImportError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    return serverError(error);
  }
});
