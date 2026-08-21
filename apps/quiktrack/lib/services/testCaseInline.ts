import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertResolvedProjectId } from "@/lib/test/projectId";
import { TestCaseError } from "./testCases";

/**
 * Inline (grid) edits to a test case.
 *
 * WHY THIS IS SEPARATE FROM `updateTestCase`.
 *
 * `updateTestCase` ALWAYS mints a new version, because a version pins what a
 * historical run executed — that is the whole reason versions exist. Applying that to
 * a Priority tweak would push a suite to v12 on label changes alone and make the
 * version history useless for its actual purpose.
 *
 * So this path deliberately does NOT version, and to keep that honest it accepts ONLY
 * fields that describe the case's classification, never its BODY. Steps, preconditions
 * and expectations are not reachable here at all — editing those must go through
 * `updateTestCase` so the snapshot is taken. A separate function makes that
 * structurally true rather than a rule someone has to remember.
 *
 * `title` is the one judgement call: it is body-ish, but renaming a case does not
 * change what a tester DOES, and a title correction should not fork the version
 * history. The owner asked for it inline; it is called out here so the reasoning is
 * visible if that is ever revisited.
 */

/** Vocabularies. Mirrors lib/validation/testCase.ts — invalid values are rejected. */
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST"];
const TYPES = [
  "FUNCTIONAL", "REGRESSION", "SMOKE", "UAT", "SECURITY",
  "PERFORMANCE", "COMPATIBILITY", "NEGATIVE", "BDD", "EXPLORATORY",
];
const AUTOMATION = ["MANUAL", "AUTOMATED"];
const APPROVAL = ["DRAFT", "IN_REVIEW", "APPROVED", "DEPRECATED"];

export interface InlinePatch {
  title?: string;
  priority?: string;
  type?: string;
  automationStatus?: string;
  approvalState?: string;
}

export interface InlineResult {
  id: string;
  title: string;
  priority: string;
  type: string;
  automationStatus: string;
  approvalState: string;
  /** Unchanged by this path — returned so the client can prove it did not move. */
  currentVersion: number;
}

export async function inlineUpdateTestCase(
  orgId: string,
  projectId: string,
  userId: string,
  caseId: string,
  patch: InlinePatch,
): Promise<InlineResult> {
  assertResolvedProjectId(projectId);

  const existing = await db.qtTestCase.findFirst({
    where: { id: caseId, orgId, projectId, isDeleted: false },
    select: { id: true, currentVersion: true },
  });
  if (!existing) {
    throw new TestCaseError("Test case not found.", 404, "CASE_NOT_FOUND");
  }

  const data: Prisma.QtTestCaseUpdateInput = {};

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) {
      throw new TestCaseError("A title is required.", 400, "TITLE_REQUIRED");
    }
    if (title.length > 255) {
      throw new TestCaseError(
        `Title is ${title.length} characters; the limit is 255.`,
        400,
        "TITLE_TOO_LONG",
      );
    }
    data.title = title;
  }

  // Each enum is validated rather than trusted. These columns are free text in the
  // schema (no DB CHECK), which is exactly how `priority = "SAsaS"` got into QtIssue
  // and crashed a render — an unvalidated write here would repeat that.
  const check = (value: string, allowed: string[], label: string) => {
    if (!allowed.includes(value)) {
      throw new TestCaseError(`"${value}" is not a valid ${label}.`, 400, "BAD_VALUE");
    }
    return value;
  };

  if (patch.priority !== undefined) {
    data.priority = check(patch.priority, PRIORITIES, "priority");
  }
  if (patch.type !== undefined) {
    data.type = check(patch.type, TYPES, "type");
  }
  if (patch.automationStatus !== undefined) {
    data.automationStatus = check(
      patch.automationStatus,
      AUTOMATION,
      "automation status",
    );
  }
  if (patch.approvalState !== undefined) {
    data.approvalState = check(patch.approvalState, APPROVAL, "status");
  }

  if (Object.keys(data).length === 0) {
    throw new TestCaseError("Nothing to update.", 400, "EMPTY_PATCH");
  }

  const updated = await db.qtTestCase.update({
    where: { id: caseId },
    // NOTE: `currentVersion` is deliberately absent — see the file comment. The row's
    // `updatedAt` still moves, so the edit is timestamped.
    data: { ...data, updatedBy: userId },
    select: {
      id: true,
      title: true,
      priority: true,
      type: true,
      automationStatus: true,
      approvalState: true,
      currentVersion: true,
    },
  });

  return updated;
}
