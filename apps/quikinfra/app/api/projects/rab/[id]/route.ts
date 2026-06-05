import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const rab = await (db as any).cnRunningAccountBill.findFirst({
    where: { id: params.id, orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true } },
      workOrder: { select: { id: true, woNumber: true } },
      lines: true,
    },
  });
  if (!rab) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: rab });
}, { permission: { resource: "construction.rab", action: "view" } });

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const rab = await (db as any).cnRunningAccountBill.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, status: true },
  });
  if (!rab) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (rab.status === "approved" || rab.status === "paid") {
    return NextResponse.json({ success: false, error: "Cannot delete an approved/paid RAB" }, { status: 400 });
  }
  // Running_account_bills has no soft-delete column; lines cascade via the
  // CnRABLine relation. Only draft/unapproved RABs reach here.
  await (db as any).cnRunningAccountBill.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}, { permission: { resource: "construction.rab", action: "delete" } });
