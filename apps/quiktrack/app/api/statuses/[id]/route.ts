import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  category: z.enum(["BACKLOG", "IN_PROGRESS", "DONE"]).optional(),
  isHidden: z.boolean().optional(),
});

async function loadStatusForTenant(orgId: string, statusId: string) {
  return db.qtIssueStatus.findFirst({
    where: {
      id: statusId,
      isDeleted: false,
      project: { orgId: orgId, isDeleted: false },
    },
    include: { project: { select: { id: true, orgId: true } } },
  });
}

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId }, req, { params }) => {
    const status = await loadStatusForTenant(orgId, params.id);
    if (!status) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const updated = await db.qtIssueStatus.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json({ success: true, data: updated });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId }, req, { params }) => {
    const status = await loadStatusForTenant(orgId, params.id);
    if (!status) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const url = new URL(req.url);
    const reassignTo = url.searchParams.get("reassignTo");
    const inUse = await db.qtIssue.count({
      where: { statusId: params.id, isDeleted: false },
    });
    if (inUse > 0 && !reassignTo) {
      return NextResponse.json(
        {
          success: false,
          error: `Status has ${inUse} issue(s). Provide ?reassignTo=<otherStatusId>.`,
        },
        { status: 409 },
      );
    }

    await db.$transaction(async (tx) => {
      if (reassignTo) {
        const target = await tx.qtIssueStatus.findFirst({
          where: {
            id: reassignTo,
            projectId: status.projectId,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!target) throw new Error("reassignTo target not in same project");
        await tx.qtIssue.updateMany({
          where: { statusId: params.id },
          data: { statusId: reassignTo },
        });
      }
      await tx.qtIssueStatus.update({
        where: { id: params.id },
        data: { isDeleted: true },
      });
    });
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);
