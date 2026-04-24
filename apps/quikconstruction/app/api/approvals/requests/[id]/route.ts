import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("approvals");

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().optional().nullable(),
});

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const r = await db.cnApprovalRequest.findFirst({ where: { id: params.id, tenantId } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
});

export const PATCH = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  const input = decideSchema.parse(await req.json());
  const r = await db.cnApprovalRequest.findFirst({ where: { id: params.id, tenantId }, select: { id: true, approverId: true, status: true } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (r.approverId !== userId) return NextResponse.json({ success: false, error: "Only the designated approver can decide" }, { status: 403 });
  if (r.status !== "pending") return NextResponse.json({ success: false, error: `Already ${r.status}` }, { status: 400 });
  const updated = await db.cnApprovalRequest.update({
    where: { id: r.id },
    data: { status: input.decision, decisionAt: new Date(), comment: input.comment ?? null },
  });
  return NextResponse.json({ success: true, data: updated });
});
