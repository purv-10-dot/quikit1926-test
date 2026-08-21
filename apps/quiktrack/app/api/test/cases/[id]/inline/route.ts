import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { TestCaseError } from "@/lib/services/testCases";
import { inlineUpdateTestCase } from "@/lib/services/testCaseInline";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * PATCH /api/test/cases/{id}/inline — grid (inline) edit of a case's classification.
 *
 * Separate from `PATCH /api/test/cases/{id}` on purpose: that route ALWAYS mints a new
 * version, because a version pins what a historical run executed. Applying it to a
 * Priority tweak would push a suite to v12 on label changes alone.
 *
 * This route accepts ONLY the fields the grid shows, so the case BODY (steps,
 * preconditions, expectations) cannot be changed without versioning. That is enforced
 * by the schema below AND by the service — belt and braces, because getting it wrong
 * would silently break the guarantee runs depend on.
 */

type Params = { id: string };

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST"]).optional(),
    type: z
      .enum([
        "FUNCTIONAL", "REGRESSION", "SMOKE", "UAT", "SECURITY",
        "PERFORMANCE", "COMPATIBILITY", "NEGATIVE", "BDD", "EXPLORATORY",
      ])
      .optional(),
    automationStatus: z.enum(["MANUAL", "AUTOMATED"]).optional(),
    approvalState: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "DEPRECATED"]).optional(),
  })
  // `.strict()` so a body carrying `steps` or `preconditions` is REJECTED rather than
  // silently ignored — a caller trying to edit the body here should be told, not
  // quietly given a no-op.
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Nothing to update.",
  });

/** Resolves the case's project, or null when it is not in this org. */
async function projectOf(orgId: string, caseId: string): Promise<string | null> {
  const row = await db.qtTestCase.findFirst({
    where: { id: caseId, orgId, isDeleted: false },
    select: { projectId: true },
  });
  return row?.projectId ?? null;
}

export const PATCH = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const projectId = await projectOf(orgId, params.id);
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, projectId, "TestCase", "update");
      if (denied) return denied;

      const parsed = patchSchema.safeParse(await req.json());
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return badRequest(
          issue
            ? `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`
            : "Invalid body",
        );
      }

      const updated = await inlineUpdateTestCase(
        orgId,
        projectId,
        userId,
        params.id,
        parsed.data,
      );
      return NextResponse.json({ success: true, data: updated });
    } catch (error: unknown) {
      if (error instanceof TestCaseError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      return serverError(error);
    }
  },
);
