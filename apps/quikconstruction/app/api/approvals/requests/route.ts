import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { notify, buildApprovalRequestedEmail } from "@/lib/notify";

const withTenantAuth = withTenantAuthForModule("approvals");

const requestSchema = z.object({
  docType: z.string().min(1),
  docId: z.string().min(1),
  docRef: z.string().min(1),
  amount: z.number().min(0).optional().nullable(),
  approverId: z.string().min(1),
  comment: z.string().optional().nullable(),
});

export const GET = withTenantAuth(async ({ tenantId, userId }, req) => {
  const inbox = req.nextUrl.searchParams.get("inbox") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const where: Record<string, unknown> = { tenantId };
  if (inbox) where.approverId = userId;
  if (status) where.status = status;
  const list = await db.cnApprovalRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const input = requestSchema.parse(await req.json());
  const reqRow = await db.cnApprovalRequest.create({
    data: {
      tenantId,
      docType: input.docType,
      docId: input.docId,
      docRef: input.docRef,
      amount: input.amount ?? null,
      approverId: input.approverId,
      requestedBy: userId,
      comment: input.comment ?? null,
      status: "pending",
    },
  });
  // Fire-and-forget notification to approver
  const tpl = buildApprovalRequestedEmail({ docType: input.docType, docRef: input.docRef, amount: input.amount ?? null, requester: userId });
  void notify({ event: "approval.requested", tenantId, toUserId: input.approverId, subject: tpl.subject, body: tpl.body, metadata: { docType: input.docType, docId: input.docId } });
  return NextResponse.json({ success: true, data: reqRow }, { status: 201 });
});
