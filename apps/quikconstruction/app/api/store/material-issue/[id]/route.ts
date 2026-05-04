import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const issue = await db.cnMaterialIssue.findFirst({
    where: { id: params.id, orgId },
    include: {
      project: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      lines: {
        include: {
          item: { select: { id: true, code: true, name: true } },
          uom: { select: { id: true, code: true } },
        },
      },
    },
  });
  if (!issue) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: issue });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.cnMaterialIssue.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.status === "posted") {
    return NextResponse.json(
      { success: false, error: "Posted issues cannot be deleted. Use a return." },
      { status: 400 },
    );
  }
  await db.cnMaterialIssue.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
});
