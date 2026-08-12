import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { wouldCreateCycle, type ParentMap } from "@/lib/test/sectionTree";
import { updateSectionSchema } from "@/lib/validation/testCase";

/**
 * PATCH  /api/test/sections/{id} — rename, reorder, or REPARENT
 * DELETE /api/test/sections/{id} — soft-archive the section subtree
 *
 * The reparent path is the interesting one: moving a section under its own
 * descendant would create a detached cycle that no FK or CHECK can catch, and
 * every recursive read of the tree would then hang. So the move is validated
 * against the suite's parent map first and rejected with 400 (TM-2.2).
 */

type Params = { id: string };

interface SectionContext {
  suiteId: string;
  projectId: string;
}

async function contextOf(
  orgId: string,
  sectionId: string,
): Promise<SectionContext | null> {
  const row = await db.qtTestSection.findFirst({
    where: { id: sectionId, orgId, isDeleted: false },
    select: { suiteId: true, suite: { select: { projectId: true } } },
  });
  if (!row) return null;
  return { suiteId: row.suiteId, projectId: row.suite.projectId };
}

/** All sections of one suite as an id → parentId map, for the cycle check. */
async function parentMapOf(orgId: string, suiteId: string): Promise<ParentMap> {
  const rows = await db.qtTestSection.findMany({
    where: { orgId, suiteId, isDeleted: false },
    select: { id: true, parentId: true },
  });
  return new Map(rows.map((r) => [r.id, r.parentId]));
}

export const PATCH = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const ctx = await contextOf(orgId, params.id);
      if (!ctx) {
        return NextResponse.json(
          { success: false, error: "Section not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(
        orgId,
        userId,
        ctx.projectId,
        "TestSuite",
        "update",
      );
      if (denied) return denied;

      const parsed = updateSectionSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }
      const input = parsed.data;

      if (input.parentId !== undefined) {
        // A new parent must exist in the SAME suite — moving a section across
        // suites would strand its cases under a foreign root.
        if (input.parentId !== null) {
          const parent = await db.qtTestSection.findFirst({
            where: {
              id: input.parentId,
              orgId,
              suiteId: ctx.suiteId,
              isDeleted: false,
            },
            select: { id: true },
          });
          if (!parent) {
            return badRequest("Parent section not found in this suite");
          }
        }

        const parents = await parentMapOf(orgId, ctx.suiteId);
        if (wouldCreateCycle(parents, params.id, input.parentId)) {
          return badRequest(
            "That move would nest the section inside itself. Choose a different parent.",
          );
        }
      }

      const updated = await db.qtTestSection.update({
        where: { id: params.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.orderNo !== undefined ? { orderNo: input.orderNo } : {}),
        },
        select: { id: true, name: true, parentId: true, orderNo: true },
      });

      return NextResponse.json({ success: true, data: updated });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

export const DELETE = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const ctx = await contextOf(orgId, params.id);
      if (!ctx) {
        return NextResponse.json(
          { success: false, error: "Section not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(
        orgId,
        userId,
        ctx.projectId,
        "TestSuite",
        "delete",
      );
      if (denied) return denied;

      // Soft-archive, never a hard delete: cases in this section may be
      // referenced by tests in historical runs, whose result trail is permanent.
      // The FK cascade would take those cases with it.
      await db.qtTestSection.update({
        where: { id: params.id },
        data: { isDeleted: true },
      });

      return NextResponse.json({ success: true, data: { id: params.id } });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
