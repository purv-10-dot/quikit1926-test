import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { attachTestTagSchema } from "@/lib/validation/testCase";

/**
 * Labels on a test case.
 *
 *   GET    /api/test/cases/{id}/tags        — labels on this case
 *   POST   /api/test/cases/{id}/tags        — {tagId} | {name, color?} attach (creating if needed)
 *   DELETE /api/test/cases/{id}/tags?tagId= — detach
 *
 * POST accepts a NAME as well as an id so the UI can offer type-and-enter without
 * a separate "create label" step. Creating and attaching happen in one
 * transaction: a created-but-unattached label would be invisible litter in the
 * picker.
 */

type Params = { id: string };

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

const notFound = NextResponse.json(
  { success: false, error: "Test case not found" },
  { status: 404 },
);

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const ctx = await caseContext(orgId, params.id);
      if (!ctx) return notFound;
      const denied = await gateProject(orgId, userId, ctx.projectId, "TestCase", "view");
      if (denied) return denied;

      const rows = await db.qtTestCaseTag.findMany({
        where: { orgId, caseId: params.id },
        select: { tag: { select: { id: true, name: true, color: true } } },
      });

      return NextResponse.json({
        success: true,
        data: rows.map((r) => r.tag).sort((a, b) => a.name.localeCompare(b.name)),
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
      if (!ctx) return notFound;
      // Labelling edits the case, so it needs update — not create.
      const denied = await gateProject(orgId, userId, ctx.projectId, "TestCase", "update");
      if (denied) return denied;

      const parsed = attachTestTagSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }
      const { tagId, name, color } = parsed.data;

      const tag = await db.$transaction(async (tx) => {
        if (tagId) {
          // Scope the lookup to this org AND to labels usable by this project, so
          // an id from another project cannot be attached.
          const existing = await tx.qtTestTag.findFirst({
            where: {
              id: tagId,
              orgId,
              OR: [{ projectId: ctx.projectId }, { projectId: null }],
            },
            select: { id: true, name: true, color: true },
          });
          if (!existing) return null;
          await tx.qtTestCaseTag.createMany({
            data: [{ orgId, caseId: params.id, tagId: existing.id }],
            // Re-attaching an existing label is a no-op, not a 409 — the
            // composite PK would otherwise throw on a double click.
            skipDuplicates: true,
          });
          return existing;
        }

        // Name path: reuse a label of the same name rather than failing on the
        // unique index, so "smoke" typed twice attaches the same label.
        const created = await tx.qtTestTag.upsert({
          where: {
            orgId_projectId_name: {
              orgId,
              projectId: ctx.projectId,
              name: name as string,
            },
          },
          create: {
            orgId,
            projectId: ctx.projectId,
            name: name as string,
            color: color ?? null,
          },
          // Don't overwrite an existing label's colour from an attach call —
          // renaming/recolouring is not what this endpoint is for.
          update: {},
          select: { id: true, name: true, color: true },
        });
        await tx.qtTestCaseTag.createMany({
          data: [{ orgId, caseId: params.id, tagId: created.id }],
          skipDuplicates: true,
        });
        return created;
      });

      if (!tag) {
        return NextResponse.json(
          { success: false, error: "Label not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, data: tag }, { status: 201 });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          { success: false, error: "That label is already on this case." },
          { status: 409 },
        );
      }
      return serverError(error);
    }
  },
);

export const DELETE = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const ctx = await caseContext(orgId, params.id);
      if (!ctx) return notFound;
      const denied = await gateProject(orgId, userId, ctx.projectId, "TestCase", "update");
      if (denied) return denied;

      const tagId = new URL(req.url).searchParams.get("tagId");
      if (!tagId) return badRequest("tagId is required");

      // Detach only. The label itself survives for other cases — deleting the
      // QtTestTag here would silently strip it from every case that shares it.
      const result = await db.qtTestCaseTag.deleteMany({
        where: { caseId: params.id, tagId, orgId },
      });
      if (result.count === 0) {
        return NextResponse.json(
          { success: false, error: "That label is not on this case." },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, data: { tagId } });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
