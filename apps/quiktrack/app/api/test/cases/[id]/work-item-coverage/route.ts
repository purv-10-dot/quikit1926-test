import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * Coverage links between a test case and the requirement issues it verifies.
 *
 *   GET    /api/test/cases/{id}/work-item-coverage        — current links (+ issue detail)
 *   POST   /api/test/cases/{id}/work-item-coverage        — {issueId, type}
 *   DELETE /api/test/cases/{id}/work-item-coverage?linkId= — unlink
 *
 * This is what makes the work-item panel populate: a case that covers a Story
 * makes that Story's panel show the case's tests. Issue ids carry no FK, so
 * membership is validated here — otherwise a typo would create a link that
 * silently resolves to nothing.
 */

type Params = { id: string };

const createSchema = z.object({
  issueId: z.string().min(1),
  type: z.enum(["covers", "verifies"]).default("covers"),
});

async function caseContext(
  orgId: string,
  caseId: string,
): Promise<{ projectId: string } | null> {
  const row = await db.qtTestCase.findFirst({
    where: { id: caseId, orgId, isDeleted: false },
    select: { projectId: true },
  });
  return row ?? null;
}

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const ctx = await caseContext(orgId, params.id);
      if (!ctx) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, ctx.projectId, "TestCase", "view");
      if (denied) return denied;

      const links = await db.qtTestCaseIssueLink.findMany({
        where: { orgId, caseId: params.id },
        select: { id: true, issueId: true, type: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      // Resolve issue detail in one query rather than per link.
      const issues = links.length
        ? await db.qtIssue.findMany({
            where: { id: { in: links.map((l) => l.issueId) }, orgId },
            select: { id: true, key: true, title: true, type: true, statusId: true },
          })
        : [];
      const byId = new Map(issues.map((i) => [i.id, i]));

      return NextResponse.json({
        success: true,
        data: links.map((l) => ({ ...l, issue: byId.get(l.issueId) ?? null })),
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

export const POST = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const ctx = await caseContext(orgId, params.id);
      if (!ctx) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      // Linking coverage edits the case's relationships, so it needs update.
      const denied = await gateProject(orgId, userId, ctx.projectId, "TestCase", "update");
      if (denied) return denied;

      const parsed = createSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }

      // No FK on issueId (by design — deleting a Bug must never cascade into
      // test history), so existence and org scope are checked here.
      const issue = await db.qtIssue.findFirst({
        where: { id: parsed.data.issueId, orgId, isDeleted: false },
        select: { id: true, key: true, title: true },
      });
      if (!issue) {
        return NextResponse.json(
          { success: false, error: "Work item not found" },
          { status: 404 },
        );
      }

      const link = await db.qtTestCaseIssueLink.upsert({
        where: {
          caseId_issueId_type: {
            caseId: params.id,
            issueId: issue.id,
            type: parsed.data.type,
          },
        },
        create: {
          orgId,
          caseId: params.id,
          issueId: issue.id,
          type: parsed.data.type,
          createdBy: userId,
        },
        // Idempotent: re-linking the same pair is a no-op, not a 409. Clicking
        // "link" twice should not be an error.
        update: {},
        select: { id: true, issueId: true, type: true },
      });

      return NextResponse.json(
        { success: true, data: { ...link, issue } },
        { status: 201 },
      );
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

export const DELETE = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const ctx = await caseContext(orgId, params.id);
      if (!ctx) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, ctx.projectId, "TestCase", "update");
      if (denied) return denied;

      const linkId = new URL(req.url).searchParams.get("linkId");
      if (!linkId) return badRequest("linkId is required");

      // Scoped to this case so a linkId from another case can't be deleted.
      const result = await db.qtTestCaseIssueLink.deleteMany({
        where: { id: linkId, caseId: params.id, orgId },
      });
      if (result.count === 0) {
        return NextResponse.json(
          { success: false, error: "Link not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, data: { id: linkId } });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
