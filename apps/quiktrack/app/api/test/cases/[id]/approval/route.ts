import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { approveTestCaseSchema } from "@/lib/validation/testCase";

/**
 * Case approval workflow — Draft → In Review → Approved → Deprecated.
 *
 *   GET  /api/test/cases/{id}/approval — the sign-off log, newest first
 *   POST /api/test/cases/{id}/approval — {state, note} → move the case
 *
 * Why this exists (QUIKTR-319): run creation excludes DRAFT cases by design, but
 * there was no way to leave DRAFT — so "include draft cases" was effectively
 * mandatory forever and an un-ticked run always matched zero cases. The
 * exclusion is right; the missing transition was the bug.
 *
 * Every state change appends a QtTestCaseApproval row, so the log is the audit
 * trail of who signed off and when. Rows are never edited.
 */

type Params = { id: string };

/** Which moves are allowed. Deprecated is terminal-but-revivable to Draft. */
const ALLOWED: Record<string, string[]> = {
  DRAFT: ["IN_REVIEW", "APPROVED", "DEPRECATED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "DEPRECATED"],
  APPROVED: ["DEPRECATED", "DRAFT"],
  DEPRECATED: ["DRAFT"],
};

async function caseContext(orgId: string, caseId: string) {
  return db.qtTestCase.findFirst({
    where: { id: caseId, orgId, isDeleted: false },
    select: { id: true, projectId: true, approvalState: true, refId: true },
  });
}

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const kase = await caseContext(orgId, params.id);
      if (!kase) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, kase.projectId, "TestCase", "view");
      if (denied) return denied;

      const log = await db.qtTestCaseApproval.findMany({
        where: { caseId: params.id, orgId },
        select: { id: true, state: true, reviewerId: true, note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({
        success: true,
        data: {
          currentState: kase.approvalState,
          allowedNext: ALLOWED[kase.approvalState] ?? [],
          log,
        },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

export const POST = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const kase = await caseContext(orgId, params.id);
      if (!kase) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }

      // Gated on TestCaseApproval:create, not TestCase:update — signing off is a
      // reviewer act, so an author with edit rights cannot self-approve unless
      // they also hold the approval grant.
      const denied = await gateProject(
        orgId,
        userId,
        kase.projectId,
        "TestCaseApproval",
        "create",
      );
      if (denied) return denied;

      const parsed = approveTestCaseSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }
      const { state, note } = parsed.data;

      if (state === kase.approvalState) {
        return badRequest(`This case is already ${state.replace("_", " ").toLowerCase()}.`);
      }
      if (!(ALLOWED[kase.approvalState] ?? []).includes(state)) {
        return badRequest(
          `Cannot move a ${kase.approvalState.replace("_", " ").toLowerCase()} case to ${state
            .replace("_", " ")
            .toLowerCase()}.`,
        );
      }

      // One transaction: the case's state and its audit row move together, so a
      // sign-off can never be recorded without the state changing (or vice
      // versa) — the log has to remain a truthful history.
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.qtTestCase.update({
          where: { id: params.id },
          data: { approvalState: state, updatedBy: userId },
          select: { id: true, refId: true, approvalState: true },
        });
        await tx.qtTestCaseApproval.create({
          data: {
            orgId,
            caseId: params.id,
            state,
            reviewerId: userId,
            note: note ?? null,
          },
        });
        return row;
      });

      return NextResponse.json({ success: true, data: updated }, { status: 201 });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
