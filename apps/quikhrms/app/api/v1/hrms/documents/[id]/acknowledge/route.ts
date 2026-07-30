import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, forbidden, internalError } from "@/lib/api-response";
import { acknowledgeDocumentSchema } from "@/lib/validations/documents";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveDocumentAccessById } from "@/lib/rbac/document-access";

export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const { id } = params;
    const body = await req.json();
    const parsed = acknowledgeDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // You can only acknowledge a document you're allowed to see.
    const access = await resolveDocumentAccessById(ctx, id);
    if (!access.doc) return notFound("Document not found");
    if (!access.allow) return forbidden("You don't have access to this document");

    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;

    const ack = await prisma.documentAcknowledgment.upsert({
      where: { orgId_documentId_employeeId: { orgId, documentId: id, employeeId: userId } },
      create: {
        orgId, documentId: id, employeeId: userId,
        status: parsed.data.action,
        acknowledgedAt: parsed.data.action === "Acknowledged" ? new Date() : null,
        signature: parsed.data.signature,
        declineReason: parsed.data.declineReason,
        ipAddress,
      },
      update: {
        status: parsed.data.action,
        acknowledgedAt: parsed.data.action === "Acknowledged" ? new Date() : null,
        signature: parsed.data.signature,
        declineReason: parsed.data.declineReason,
        ipAddress,
      },
    });

    await createAuditLog({
      orgId, userId,
      action: parsed.data.action === "Acknowledged" ? "Approve" : "Reject",
      entityType: "DocumentAcknowledgment",
      entityId: ack.id,
      metadata: { documentId: id },
    });

    void fireWorkflow({
      orgId,
      event: "document.acknowledged",
      payload: { documentId: id, employeeId: userId, action: parsed.data.action },
    });

    return successResponse(ack, undefined, 201);
  } catch (error) {
    console.error("POST /documents/[id]/acknowledge error:", error);
    return internalError();
  }
});
